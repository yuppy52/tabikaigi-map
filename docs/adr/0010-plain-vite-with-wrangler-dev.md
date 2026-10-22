# ADR 0010：画面は素の Vite でビルドし、API は wrangler dev で動かす（Cloudflare の Vite のプラグインは使わない）

状態：決定（2026-10-19）

- 関係する要件：NFR-014（運営者1人で回せる）、NFR-019（アプリの画面は検索に出さない）
- 関係する ADR：[ADR 0004](0004-frontend-react-typescript.md)（画面は React＋TypeScript＋Vite）、[ADR 0008](0008-deploy-from-pc-no-staging.md)（デプロイは PC から手で）

## 背景

Phase 2 で画面（`web/`）を足す。Vite（画面のビルドと開発用のサーバー）と、API を動かす `wrangler` を、どうつなぐかを決める。[architecture](../design/architecture.md) の「リポジトリの構成」に、「Cloudflare の Vite のプラグインで1つにまとまらないと分かったら見直す」と書いていた論点。2026-10-19 に `researcher` で公式の情報を調べた（出典は下）。

## 選択肢

| | A：素の Vite | B：Cloudflare の Vite のプラグイン（`@cloudflare/vite-plugin`） |
|---|---|---|
| 開発で動かすもの | 2つ（画面の Vite と、API の `wrangler dev`）。`npm run dev` で両方を起こす。画面から `/api` への要求は、Vite が `wrangler dev` に回す | 1つ（Vite の中で Worker も動く） |
| `_redirects`・`_headers`（`/g/*` で `app.html` を返す、`noindex`）を開発中に確かめる | できない。ビルドしてから `wrangler dev` で確かめる | 既定ではできない（試験中の設定を除く）。ビルドしてから `vite preview` で確かめる |
| いまの設定（`wrangler.jsonc`、`scripts/deploy.sh`） | ほぼそのまま | 使えるが、ビルドのたびに `dist/` に設定の写し（`wrangler.json`）が作られ、デプロイはそれを読む |
| これから先 | 影響なし | 次の版（2.0、2026-10-19 は試作の段階）で設定が `cloudflare.config.ts` に移り、デプロイは `wrangler` ではなく `cf deploy` を勧める方向。上げる日に手順書と `deploy.sh` の見直しが要る |
| 費用 | 変わらない（開発とビルドの道具なので） | 同左 |

## 決定

**A（素の Vite）**。2026-10-19 にユーザーが推奨どおりに選んだ。

- B の一番の利点は「本番に近い配信の動きを開発中に見られる」ことだが、このアプリで大事な `_redirects` と `_headers` は B でも開発中には効かない。どちらも「ビルドしてから動かす」確かめが要るので、B の利点は小さい
- いまの `wrangler.jsonc`・`scripts/deploy.sh`・手順書を変えずに済み、覚えることが少ない（NFR-014）
- 後から B に替えるのは小さな変更で済む（`wrangler.jsonc` はそのまま B の入力になる）ので、行き止まりにならない

## 結果と注意

- `npm run dev`：`concurrently` で `wrangler dev`（API、8787 番）と `vite`（画面、5173 番。使われていたら止まる）を一緒に起こし、片方が止まったらもう片方も止める。起こす前に1回 `vite build` する（`wrangler.jsonc` の `assets` が `dist/` を指していて、`dist/` がないと `wrangler dev` が起きないため。2026-10-21）。画面は `http://localhost:5173/app.html` で開く。API だけなら `npm run dev:api`（これも先にビルドする）
- `npm run build`：`web/` を `dist/` にビルドする。CI と `npm run deploy` でも動かす。`dist/` は `.gitignore` に入れる
- `/g/*` で `app.html` を返すことと `noindex` は、開発中の Vite では確かめられない。ビルドしてから `wrangler dev` で確かめる（配信の設定を書く roadmap の 3-2 で）。2026-10-22 の追記：開発中の Vite でも `/g/…` を開けるように、`vite.config.ts` に開発中だけ効くプラグインを足した（`web/public/_redirects` を読み、行き先が `/app` の 200 の行に合う URL を `app.html` で返す。URL の一覧は `_redirects` の1か所のまま）。`_headers` は今も開発中の Vite では効かない
- `vite.config.ts` の設定はテストには効かない（`vitest.config.ts` があるとそちらだけを読む）。テストは `vitest.config.ts` の2組（`api`：Workers の実行環境、`web`：画面から切り出した計算）
- 型の設定は2つ：`tsconfig.json`（API）と `web/tsconfig.json`（画面。ブラウザの型と JSX）。`npm run typecheck` は両方を見る
- 入れた部品（2026-10-19、どれも `npm view` で公開者とリポジトリを確かめた。`npm audit` は 0 件）：`vite` 8.3.4、`@vitejs/plugin-react` 6.1.2、`react`・`react-dom` 19.3.0、`@types/react`・`@types/react-dom` 19.3.0、`eslint-plugin-react-hooks` 7.1.1、`concurrently` 10.0.6
  - React は、出てから7日たっていない 19.3.1（Server Components の修正で、このアプリは使わない）を避けて 19.3.0 にした。Dependabot が7日の後に上げる
  - 手元の npm 10.9.7（Node 22 に付いてくるもの）は、`vite` を足すときに npm 自身の不具合（`Cannot read properties of null (reading 'edgesOut')`）で止まった。10.9.9 でも同じだった。npm 11.21.0 を1回だけ使って（`npx npm@11.21.0 install`）入れた。作った `package-lock.json` は npm 10 の `npm ci` で入れ直せ、テストも通ることを確かめた（CI は npm 10 のまま）

## 出典

- https://developers.cloudflare.com/workers/vite-plugin/get-started/
- https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/
- https://developers.cloudflare.com/workers/vite-plugin/reference/migrating-from-wrangler-dev/
- https://github.com/cloudflare/workers-sdk/releases?q=vite-plugin-cloudflare （2.0 の beta の変更）
- https://vitest.dev/config/ （`vitest.config.*` があると `vite.config.*` を読まない）
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
