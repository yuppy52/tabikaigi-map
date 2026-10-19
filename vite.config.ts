import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// このファイルの場所から見たパスにする（開発中とビルドで、相対パスの起点が違うため）
const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// 画面（web/）のビルドと開発用のサーバー（ADR 0010）。
// API は Vite では動かさず、wrangler dev（8787 番）に回す。開発中は画面と API を別々に動かす（npm run dev で両方）
export default defineConfig({
  root: fromHere("./web"),
  plugins: [react()],
  build: {
    // ビルド結果は dist/ に出す（3-2 で wrangler.jsonc の assets がここを配る）
    outDir: fromHere("./dist"),
    emptyOutDir: true,
    rolldownOptions: {
      // アプリの画面の入口。検索に出すページ（web/pages/）は、その項目で足す
      input: { app: fromHere("./web/app.html") },
    },
  },
  server: {
    // /api への要求は wrangler dev に回す。部屋（WebSocket）も通す
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
