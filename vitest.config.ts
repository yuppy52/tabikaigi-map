import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// テストは2組。npm test で両方を動かす（vite.config.ts の設定はテストには効かない）
// - api：本物と同じ Workers の実行環境（ローカル）で動かす。D1 のテーブル定義（migrations/）を読んで、テストの中で当てられるように渡す
// - web：画面から切り出した計算だけ（ブラウザの部品は使わない：architecture の「開発環境」）
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: { name: "api", include: ["api/test/**/*.test.ts"] },
        },
        { test: { name: "web", include: ["web/src/**/*.test.ts"], environment: "node" } },
      ],
    },
  };
});
