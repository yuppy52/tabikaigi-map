# ADR 0011：アプリの画面の切り替え（URL ごとの画面）に React Router を使う

状態：決定（2026-10-22）

- 関係する要件：REQ-001・REQ-002（招待URL `/g/{groupId}`）、NFR-014（運営者1人で回せる）
- 関係する設計：[screens](../design/screens.md) の「トップと URL」、[ADR 0004](0004-frontend-react-typescript.md)、[ADR 0010](0010-plain-vite-with-wrangler-dev.md)

## 背景

アプリの画面（`app.html`）は、7つの URL（`/g/{groupId}`、`/new`、`/account`、`/login`、`/groups`、`/me`、`/contact`）で同じファイルを返す（`_redirects` の 200 リライト）。画面の側で URL を読み、出す画面を選ぶ仕組みが要る。Phase 2 の 3-4（グループの画面）で `/g/{groupId}` を読むところから使う。

## 選択肢

| | A：自分で書く | B：React Router（`react-router`） |
|---|---|---|
| 中身 | `location.pathname` を読んで画面を選ぶ十数行。移るときは `history.pushState` を自分で呼ぶ | URL の形（`/g/:groupId`）を並べると、合う画面を出す。移る（`navigate`）、履歴に残さずに移る（`replace`）、URL の部分を読む（`useParams`）がそろっている |
| 部品 | 増えない | 1つ（と、それが使う小さな部品2つ） |
| 覚えること | 少ない | 部品の使い方（ルートの書き方、フック） |
| 調べたときの情報 | 少ない | 非常に多い |
| 費用 | 変わらない | 変わらない |

## 決定

**B（React Router）**。2026-10-22 にユーザーが選んだ。

- 推奨は A だった。理由は、URL が7つと少なく形も決まっているので、部品を足さずに十数行で足りること
- B を選んだことで A と比べて変わること：
  - 得るもの：URL の形と画面の対応が1か所に並び、読みやすい。「ログイン済みでないのに `/groups` を開いたら、`/account` に履歴に残さずに移る」（screens の「トップと URL」）を `replace` でそのまま書ける。調べたときの情報が多い
  - 増えるもの：部品が1つ増え、版上げ（Dependabot）のときに組み合わせを確かめる。使い方を覚える

## 結果と注意

- 入れたもの：`react-router` 8.4.0（2026-10-22。最新の 8.5.0 は公開から3日だったので、7日たった版にした。公開者とリポジトリ（remix-run/react-router）は `npm view` で確かめた）。v7 から `react-router-dom` は `react-router` にまとまったので、`react-router-dom` は入れない
- 使い方は、ブラウザだけで動く形（`createBrowserRouter` と `RouterProvider`）にする。サーバーで画面を作る機能（フレームワークとしての使い方）は使わない（ADR 0004：画面は静的なファイルで配る）
- URL の一覧は screens の「トップと URL」が正本。足すときは `_redirects`・`_headers`（architecture の「検索に出すページと出さないページ」）にも同じ変更の中で足す
- 2026-10-22 の `npm audit` に出た2件（moderate）は vitest 4.1.11 のもので、この部品とは関係ない
