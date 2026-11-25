
export type Store = "HEB" | "Walmart" | "Whole Foods";

export type Product = {
    id: number;
    name: string;
    category: string;
    unit: string;
    prices: Record<Store, number>;
};

export type GroceryItem = {
    productId: number;
    quantity: number;
};

type PromotionDates = {
    startDate?: string;
    endDate?: string;
};

export type Sale = {
    id: string;
    productId: number;
    store: Store;
} & PromotionDates & (
    | { type: "percentOff" | "amountOff"; value: number }
    | { type: "buyXGetY"; buyQuantity: number; getQuantity: number }
);

export type Coupon = {
    id: string;
    productId: number;
    store: Store | null;
    minQuantity?: number;
    limit?: number;
} & PromotionDates & {
    type: "percentOff" | "amountOff";
    value: number;
};

export type Promotions = {
    sales: Sale[];
    coupons: Coupon[];
};

export type AppliedPromotion = {
    id: string;
    type: "sale" | "coupon";
    discount: number;
};

export type ShoppingItem = {
    productId: number;
    name: string;
    category: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    regularTotal: number;
    discount: number;
    appliedPromotions: AppliedPromotion[];
    savings: number;
};

export type StoreResult = {
    items: ShoppingItem[];
    total: number;
};

export type ShoppingResult = {
    stores: Record<Store, StoreResult>;
    optimizedTotal: number;
    singleStoreComparison: Record<Store, number>;
    cheapestSingleStore: Store;
    singleStoreTotal: number;
    totalSavings: number;
    missingProducts: number[];
};

export const STORES: Store[] = [
    "HEB",
    "Walmart",
    "Whole Foods"
];

const EMPTY_PROMOTIONS: Promotions = { sales: [], coupons: [] };

function isPromotionActive(
    promotion: PromotionDates,
    date: Date
): boolean {
    const timestamp = date.getTime();
    const start = promotion.startDate
        ? Date.parse(promotion.startDate)
        : undefined;
    const end = promotion.endDate
        ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(promotion.endDate)
            ? `${promotion.endDate}T23:59:59.999Z`
            : promotion.endDate)
        : undefined;

    return (
        Number.isFinite(timestamp) &&
        (start === undefined || (Number.isFinite(start) && timestamp >= start)) &&
        (end === undefined || (Number.isFinite(end) && timestamp <= end))
    );
}

function getSaleTotal(sale: Sale, unitPrice: number, quantity: number): number {
    switch (sale.type) {
        case "percentOff": {
            const percentOff = Math.min(100, Math.max(0, sale.value));
            const discountedUnitPrice = Math.max(
                0,
                Math.round(unitPrice * (100 - percentOff) / 100)
            );

            return discountedUnitPrice * quantity;
        }
        case "amountOff": {
            const amountOff = Math.max(0, Math.round(sale.value));
            return Math.max(0, unitPrice - amountOff) * quantity;
        }
        case "buyXGetY": {
            if (sale.buyQuantity <= 0 || sale.getQuantity <= 0) {
                return unitPrice * quantity;
            }

            const groupSize = sale.buyQuantity + sale.getQuantity;
            const freeQuantity = Math.floor(quantity / groupSize) * sale.getQuantity;
            return unitPrice * (quantity - freeQuantity);
        }
    }
}

function getCouponApplications(coupon: Coupon, quantity: number): number {
    const minQuantity = coupon.minQuantity ?? 1;

    if (!Number.isInteger(minQuantity) || minQuantity <= 0) {
        return 0;
    }

    const possibleApplications = Math.floor(quantity / minQuantity);
    const applicationLimit = coupon.limit === undefined
        ? possibleApplications
        : Math.max(0, Math.floor(coupon.limit));

    return Math.min(possibleApplications, applicationLimit);
}

function getCouponDiscount(
    coupon: Coupon,
    quantity: number,
    currentTotal: number,
    applications: number
): number {
    if (applications <= 0) {
        return 0;
    }

    if (coupon.type === "amountOff") {
        return Math.min(
            currentTotal,
            Math.max(0, Math.round(coupon.value)) * applications
        );
    }

    const coveredQuantity = applications * (coupon.minQuantity ?? 1);
    const percentOff = Math.min(100, Math.max(0, coupon.value));

    return Math.min(
        currentTotal,
        Math.round(currentTotal * coveredQuantity / quantity * percentOff / 100)
    );
}

function getStorePrice(
    product: Product,
    store: Store,
    quantity: number,
    promotions: Promotions,
    date: Date
): { regularTotal: number; total: number; appliedPromotions: AppliedPromotion[] } {
    const unitPrice = Math.round(product.prices[store]);
    const regularTotal = unitPrice * quantity;
    let total = regularTotal;
    const appliedPromotions: AppliedPromotion[] = [];

    for (const sale of promotions.sales) {
        if (
            sale.productId !== product.id ||
            sale.store !== store ||
            !isPromotionActive(sale, date)
        ) {
            continue;
        }

        const saleTotal = Math.min(regularTotal, getSaleTotal(sale, unitPrice, quantity));

        if (saleTotal < total) {
            total = saleTotal;
            appliedPromotions.length = 0;
            appliedPromotions.push({
                id: sale.id,
                type: "sale",
                discount: regularTotal - saleTotal
            });
        }
    }

    const applicableCoupons = promotions.coupons
        .filter(coupon =>
            coupon.productId === product.id &&
            (coupon.store === null || coupon.store === store) &&
            isPromotionActive(coupon, date)
        )
        .map(coupon => ({
            coupon,
            applications: getCouponApplications(coupon, quantity)
        }))
        .filter(({ applications }) => applications > 0)
        .sort((left, right) =>
            getCouponDiscount(
                right.coupon,
                quantity,
                total,
                right.applications
            ) - getCouponDiscount(
                left.coupon,
                quantity,
                total,
                left.applications
            )
        );

    for (const { coupon, applications } of applicableCoupons) {
        const discount = getCouponDiscount(coupon, quantity, total, applications);

        if (discount > 0) {
            total -= discount;
            appliedPromotions.push({ id: coupon.id, type: "coupon", discount });
        }
    }

    return { regularTotal, total, appliedPromotions };
}

export function optimizeGroceryList(
    groceryList: GroceryItem[],
    products: Product[],
    promotions: Promotions = EMPTY_PROMOTIONS,
    date: Date = new Date()
): ShoppingResult {
    const productMap = new Map(
        products.map(product => [product.id, product])
    );

    const stores: Record<Store, StoreResult> = {
        HEB: { items: [], total: 0 },
        Walmart: { items: [], total: 0 },
        "Whole Foods": { items: [], total: 0 }
    };

    const singleStoreComparison: Record<Store, number> = {
        HEB: 0,
        Walmart: 0,
        "Whole Foods": 0
    };

    const missingProducts: number[] = [];
    let optimizedTotal = 0;

    // Aggregate duplicate grocery list entries.
    const quantities = new Map<number, number>();

    for (const item of groceryList) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new Error(
                `Invalid quantity for product ${item.productId}`
            );
        }

        quantities.set(
            item.productId,
            (quantities.get(item.productId) ?? 0) + item.quantity
        );
    }

    for (const [productId, quantity] of quantities) {
        const product = productMap.get(productId);

        if (!product) {
            missingProducts.push(productId);
            continue;
        }

        const storePrices = Object.fromEntries(STORES.map(store => [
            store,
            getStorePrice(product, store, quantity, promotions, date)
        ])) as Record<Store, ReturnType<typeof getStorePrice>>;

        const cheapestStore = STORES.reduce((best, current) =>
            storePrices[current].total < storePrices[best].total
                ? current
                : best
        );
        const cheapestPrice = storePrices[cheapestStore];

        for (const store of STORES) {
            singleStoreComparison[store] += storePrices[store].total;
        }

        const highestPrice = Math.max(
            ...STORES.map(store => product.prices[store])
        );

        const item: ShoppingItem = {
            productId: product.id,
            name: product.name,
            category: product.category,
            unit: product.unit,
            quantity,
            unitPrice: product.prices[cheapestStore],
            totalPrice: cheapestPrice.total,
            regularTotal: cheapestPrice.regularTotal,
            discount: cheapestPrice.regularTotal - cheapestPrice.total,
            appliedPromotions: cheapestPrice.appliedPromotions,
            savings: Math.max(0, highestPrice * quantity - cheapestPrice.total)
        };

        stores[cheapestStore].items.push(item);
        stores[cheapestStore].total += item.totalPrice;

        optimizedTotal += item.totalPrice;
    }

    // Find the cheapest single store for the entire list.
    const cheapestSingleStore = STORES.reduce(
        (best, current) =>
            singleStoreComparison[current] <
            singleStoreComparison[best]
                ? current
                : best
    );

    const singleStoreTotal =
        singleStoreComparison[cheapestSingleStore];

    return {
        stores,
        optimizedTotal,
        singleStoreComparison,
        cheapestSingleStore,
        singleStoreTotal,
        totalSavings: singleStoreTotal - optimizedTotal,
        missingProducts
    };
}
