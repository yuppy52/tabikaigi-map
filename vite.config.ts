import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { parseRedirects, rewriteToApp } from "./web/src/dev/redirects.ts";

// このファイルの場所から見たパスにする（開発中とビルドで、相対パスの起点が違うため）
const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// 開発中だけ効くプラグイン。web/public/_redirects の 200 の行（行き先 /app）に合う URL（/g/… など）を、
// 本番の Cloudflare と同じように app.html で返す（URL の一覧は _redirects が正本。ここに3か所目を書かない）。
// _redirects はサーバーを起こしたときに1回読む（書き換えたら npm run dev を起こし直す）
function appRewrite(): Plugin {
  return {
    name: "tabikaigi-app-rewrite",
    apply: "serve",
    configureServer(server) {
      const rules = parseRedirects(readFileSync(fromHere("./web/public/_redirects"), "utf8"));
      server.middlewares.use((req, _res, next) => {
        const to = req.url ? rewriteToApp(req.url, rules) : null;
        if (to) req.url = to;
        next();
      });
    },
  };
}

// 画面（web/）のビルドと開発用のサーバー（ADR 0010）。
// API は Vite では動かさず、wrangler dev（8787 番）に回す。開発中は画面と API を別々に動かす（npm run dev で両方）
export default defineConfig({
  root: fromHere("./web"),
  plugins: [react(), appRewrite()],
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
    // 5173 番が使われていたら、別の番号に移らずに止まる（古いサーバーを見て確かめた気にならないように）
    port: 5173,
    strictPort: true,
    // /api への要求は wrangler dev に回す。部屋（WebSocket）も通す
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
