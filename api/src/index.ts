// Worker の入口。/api/* だけがここに来る（画面の配信は Phase 2 で足す）
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

// 動いているかを確かめるだけの API
app.get("/health", (c) => c.json({ ok: true }));

// 決まった形の JSON で「ない」を返す（画面が理由を読み分けられるように）
app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
