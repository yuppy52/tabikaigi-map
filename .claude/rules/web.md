---
paths:
  - "web/**"
  - "vite.config.ts"
---

# 画面（React＋Vite）の書き方

画面を書く・直すときのルール。決まりの正本は [docs/design/screens.md](../../docs/design/screens.md)（画面・知らせ・API の応答ごとの動き）と [docs/design/auth-flow.md](../../docs/design/auth-flow.md)（端末が覚えるもの）。作りは [ADR 0004](../../docs/adr/0004-frontend-react-typescript.md) と [ADR 0010](../../docs/adr/0010-plain-vite-with-wrangler-dev.md)。

## 書き方

- TypeScript と関数の部品（`function App() { … }`）で書く。部品とフックの頭に、考え方を日本語で一言書く（ユーザーは React に慣れていない）
- データ（行った県、メンバー、表示の切り替え）から画面を作る。画面を直接書き換えない（`document.querySelector` で中身を変える、`innerHTML` を使う、など）
- 人が入れた文字（名前、グループ名）は JSX の `{…}` で出す。`dangerouslySetInnerHTML` は使わない（名前に HTML を入れられると、ほかのメンバーの画面で動いてしまうため）
- 計算（色の濃さ、数え方、まだ誰も行っていない県など）は、部品の外の関数に切り出す。テストはこの関数にだけ書く（`web/src/**/*.test.ts`、`npm test` の `web` の組。部品の動きのテストは書かない：[architecture](../../docs/design/architecture.md) の「開発環境」）

## 守ること

- 端末に覚えるのは、グループごとの「メンバーの番号と名前」とログインの状態の目印だけ（Q-017：auth-flow の「端末が覚えるもの」）。グループ名や「行った」は覚えない（毎回 API から読む）。ログアウト・退会でも、覚えているメンバーは忘れない
- `localStorage` の読み書きは失敗することがある（Safari のプライベート、容量）。`try` で包み、読めなければ「覚えていない」として続ける
- API の応答は `error` の値で文と行き先を決める（screens の「API の応答と画面の動き」の表のとおり）。表にない値は「保存できませんでした。もう一度お試しください」にする。文を自分で考えない
- 「行った」の付け外しは、仮の表示 → 応答で確定、失敗したら最後に保存できた状態に戻す（screens の「知らせ」）
- グループID は URL（`/g/<グループID>`）にだけ置く。`console.log`、エラーの送信（Sentry）、画面の外への要求に入れない（NFR-005）

## 画面の決まり

- スマホ幅（360px 以上）を基本にし、PC でも崩れないようにする（NFR-001）。確かめるときは、アプリ内のブラウザでスマホ幅（375px）も見る
- 地図を出す画面の一番下に、地図データの出典（screens の「画面のルール」の文言とリンク）を出す
- どの画面も、一番下に「プライバシーポリシー・お問い合わせ」の小さなリンクを置く（NFR-008）
- 見た目と文言は Phase 3 で整える。いまはモック（`tools/template.html`）と screens の文言に合わせる

## 開発と確かめ

- `npm run dev` で画面（5173 番）と API（8787 番）を一緒に起こし、`http://localhost:5173/app.html` を開く。`/api` への要求は Vite が API に回す
- `/g/*` で `app.html` が出ること、`noindex` が付くことは、開発中には確かめられない。`npm run build` の後に `wrangler dev` で確かめる（ADR 0010）
