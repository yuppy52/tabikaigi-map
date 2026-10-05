// テストのときだけ渡す値（vitest.config.ts で、D1 のテーブル定義を渡している）
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
