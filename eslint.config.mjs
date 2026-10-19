// ESLint の設定（ADR 0009）。書き方の間違い（await のし忘れなど）を見つける。
// 見た目（字下げや改行）は Prettier に任せるので、それとぶつかる規則は最後に切る
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 見ないもの：ビルド結果、モックの道具、試作、部品
  {
    ignores: ["index.html", "tools/", "spike/", "node_modules/", ".wrangler/", "api/src/worker-configuration.d.ts"],
  },
  js.configs.recommended,
  // 型を使うチェック。tsconfig.json の範囲（いまは api/）にだけ効く
  {
    files: ["api/**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // テスト：応答の JSON は型を決めずに読む（値そのものを expect で確かめる）。
  // 差し替えの部品は本物と同じ async の形にそろえる。await のし忘れ（no-floating-promises）は見続ける
  {
    files: ["api/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  // 名前の決まり（api/src/names.ts）は、見えない部品を \u{…} で書いて文字の組から外している
  {
    rules: { "no-misleading-character-class": ["error", { allowEscape: true }] },
  },
  // 設定ファイル（vitest.config.ts など）は型を使わない規則だけ
  {
    files: ["*.ts"],
    extends: [tseslint.configs.recommended],
  },
  prettier,
);
