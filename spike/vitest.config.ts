import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// テストを本物と同じ Workers の実行環境（ローカル）で動かす
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
});
