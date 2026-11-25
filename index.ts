import express, { Request, Response } from "express";
import data from "./data/data.json";
import promotionData from "./data/promotions.json";
import { GroceryItem, Product, Promotions, optimizeGroceryList } from "./utils/utils";

const products = data.products as Product[];
const promotions = promotionData as Promotions;

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
});

app.get("/products", (_req: Request, res: Response) => {
    res.json(products);
});

app.get("/promotions", (_req: Request, res: Response) => {
    res.json(promotions);
});

app.get("/products/:id", (req: Request, res: Response) => {
    const product = products.find(p => p.id === Number(req.params.id));

    if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
    }

    res.json(product);
});

app.post("/optimize", (req: Request, res: Response) => {
    const items: unknown = req.body?.items;

    if (!Array.isArray(items)) {
        res.status(400).json({ error: "Body must be { items: [{ productId, quantity }] }" });
        return;
    }

    try {
        res.json(optimizeGroceryList(items as GroceryItem[], products, promotions));
    } catch (err) {
        res.status(400).json({ error: (err as Error).message });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
