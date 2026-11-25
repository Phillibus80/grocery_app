
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

export type ShoppingItem = {
    productId: number;
    name: string;
    category: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
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

export function optimizeGroceryList(
    groceryList: GroceryItem[],
    products: Product[]
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

        // Determine the cheapest store.
        const cheapestStore = STORES.reduce((best, current) =>
            product.prices[current] < product.prices[best]
                ? current
                : best
        );

        const cheapestPrice = product.prices[cheapestStore];

        // Calculate the price at every store.
        for (const store of STORES) {
            singleStoreComparison[store] +=
                product.prices[store] * quantity;
        }

        // Calculate savings compared to the most expensive store.
        const highestPrice = Math.max(
            ...STORES.map(store => product.prices[store])
        );

        const item: ShoppingItem = {
            productId: product.id,
            name: product.name,
            category: product.category,
            unit: product.unit,
            quantity,
            unitPrice: cheapestPrice,
            totalPrice: cheapestPrice * quantity,
            savings: (highestPrice - cheapestPrice) * quantity
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
