# 小さく試す（案 C：Cloudflare Workers＋Hono）

[ADR 0003](../docs/adr/0003-backend-selection.md) の「決定の前に確かめること」を試すための試作。本番のアプリのコードではない（決定した後、Phase 2 で作り直す）。

## 動かし方

```bash
npm install      # 初回だけ
npm test         # テスト（ローカルの Workers の実行環境で動く）
npm run dev      # ローカルのサーバー（http://localhost:8787）
npm run bench    # ログインの確認にかかる時間の目安（このパソコンで）
```

- `.npmrc` の `legacy-peer-deps=true`：npm 10 が `@cloudflare/vitest-pool-workers` の入れ方で落ちる不具合（`Cannot read properties of null (reading 'edgesOut')`）を避けるため
- `compatibility_date` はローカルの実行環境が対応する日付まで（2026-10-04 時点で 2026-08-22 まで）

## ファイル

| ファイル | 役割 |
|---|---|
| `wrangler.jsonc` | Worker の設定。`/api/*` だけ Worker を通す（`run_worker_first`） |
| `public/_redirects` | 招待URL `/g/*` をアプリの画面（`app.html`）にリライト（URL はそのまま） |
| `public/_headers` | アプリの画面に `X-Robots-Tag: noindex` |
| `src/firebase-auth.ts` | Firebase の ID トークンの確認（公開鍵は Google から取り、`Cache-Control` の間だけメモリに置く） |
| `src/app.ts` | API（Hono）。`/api/health`、`/api/me`（ログインが必要） |
| `test/auth.test.ts` | ログインの確認のテスト（テスト用の鍵で自分で署名した証明書を使う） |

## 結果（2026-10-04、ローカル）

### 1. 招待URLを Worker を通さずに返せるか → ローカルでは「できる」

`wrangler dev` で確かめた（Worker に来たら 418 を返すようにして見分けた）。

| URL | 結果 |
|---|---|
| `/` | トップ（`index.html`）、`noindex` なし |
| `/g/abc123XYZ`、`/g/abc?ref=line`、`/g/` | アプリの画面、`X-Robots-Tag: noindex`、**Worker を通らない** |
| `/app` | アプリの画面、`noindex` |
| `/app.html` | `/app` へ 307（自動で拡張子を外す。リライト先は `/app` にした） |
| `/api/*` | Worker（Hono） |
| `/nothing`、`/G/abc`（大文字） | **Worker を通る**（ファイルがない URL は Worker に回る） |

- 残り：本番の環境でも Worker の回数に数えられないか（Cloudflare の管理画面で見る）。ファイルがない URL が Worker に回るのは、Worker の枠を使う（いたずらで叩かれると減る）ので、`not_found_handling` で静的な 404 にできるかを試す

### 2. ログインの確認と CPU → ローカルでは「収まる見込み」

- テスト16件が通った：正しい証明書は通し、別のプロジェクト向け（`aud`・`iss`）、期限切れ、発行時刻が未来、`auth_time` なし、`sub` が空、別の鍵の署名、知らない `kid`、中身の書き換え、`alg: none` は 401。公開鍵が取れないときは 503
- 時間の目安（このパソコンの Node.js）：1回 **約0.03ms**、鍵の読み込みから毎回やっても **約0.04ms**。Workers 無料の CPU 10ms に対して十分小さい
- 残り：本番の環境で Cloudflare の計測（CPU 時間）を見る。Google の公開鍵を取りに行く時間は「待ち」で CPU には数えない見込み（要確認）。本物の Firebase の証明書で通るか

## 本番の環境で試すのに必要なもの（ユーザーの作業）

- Cloudflare のアカウント（`*.workers.dev` に置けばドメインがなくても測れる）
- Firebase のプロジェクト（Spark）。プロジェクトIDを `wrangler.jsonc` の `FIREBASE_PROJECT_ID` に入れる

`wrangler deploy` などの本番に触る操作は、`.claude/settings.json` で毎回確認を求める設定にしてある。
