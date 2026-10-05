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

- 本番（2026-10-05）：**数えられなかった**。14:37 UTC の1分間に `/g/…` を50回、`/nothing` を5回、`/api/health` を10回、`/api/me` を20回送り、Worker の回数（GraphQL の `workersInvocationsAdaptive`）はちょうど35回。`/g/…` の50回は入っていない。応答もローカルと同じ（`/g/…` は 200＋`noindex`、`/app.html` は `/app` へ 307）
- 置いた直後の十数秒は、同じ形の URL でも 404 が混ざった（反映の途中）
- 残り：ファイルがない URL が Worker に回るのは、Worker の枠を使う（いたずらで叩かれると減る）ので、`not_found_handling` で静的な 404 にできるかを試す

### 2. ログインの確認と CPU → ローカルでは「収まる見込み」

- テスト16件が通った：正しい証明書は通し、別のプロジェクト向け（`aud`・`iss`）、期限切れ、発行時刻が未来、`auth_time` なし、`sub` が空、別の鍵の署名、知らない `kid`、中身の書き換え、`alg: none` は 401。公開鍵が取れないときは 503
- 時間の目安（このパソコンの Node.js）：1回 **約0.03ms**、鍵の読み込みから毎回やっても **約0.04ms**。Workers 無料の CPU 10ms に対して十分小さい
- 本番（2026-10-05）：**収まった**。`scripts/probe-cpu.ts` で、Google の本物の `kid` を付けて自分の鍵で署名した証明書を20回送った（Worker は公開鍵を取り、署名を確かめて 401 で断る。計算は正しい証明書とほぼ同じ）。Workers Logs の `cpuTimeMs`（1ms 単位）：

| URL | CPU 時間（ms、送った順） |
|---|---|
| `/api/me`（ログインの確認） | 7, 4, 5, 5, 0, 1, 0, 1, 0, 0, 1, 0, … （22回。最初の2回は証明書なし） |
| `/api/health`（確認なし） | 1, 5, 3, 0, 2, 0, 0, … （12回） |
| `/nothing` | すべて 0 |

- ふだんは 0〜1ms。最初の数回だけ 3〜7ms になるのは、確認をしない `/api/health` でも同じなので、Worker が起きた直後の準備（プログラムの読み込みと最適化）の分と見られる。一番大きい 7ms でも上限の 10ms に収まるが、余裕は大きくない。本番のアプリはプログラムが大きくなるので、起きた直後の値を見続ける（Workers の無料の上限が、起きた直後の分をどう扱うかは要確認）
- Google の公開鍵の取得は、Worker が起きるごとに1回（集計の `subrequests` が2）
- 残り：本物の Firebase の証明書で通るか（ログインの画面を作るときに）

### 3. ログに残るもの（2026-10-05、本番）

Workers Logs（`observability`）には、1回ごとに次が残る。プライバシーポリシー（NFR-008）と、ログに招待URLを残さない（NFR-010・NFR-013）に関係する。
- URL の全体（パスとクエリ）。グループIDを API の URL に入れないという ADR 0003 の方針で正しい。`/g/…` は Worker を通らないので、Workers Logs には残らない
- 接続元の IP アドレス（`cf-connecting-ip`、`x-real-ip`）、おおよその場所（市、郵便番号、緯度・経度、回線の会社）
- `Authorization` ヘッダーは名前だけが残り、証明書の値は見つからなかった（JWT の形の文字列なし）
- 本番では、ログを有効にするか、残すなら何を残すかを決める（Q-027）

## 本番の環境で試すのに必要なもの（ユーザーの作業）

- ~~Cloudflare のアカウント~~（2026-10-04 にできた。ドメイン `tabikaigi-map.com` も取った。試すのは `*.workers.dev` でよい）
- ~~Firebase のプロジェクト（Spark）~~（2026-10-04 にできた。プロジェクトID `tabikaigi-map` を `wrangler.jsonc` に入れた）

`wrangler deploy` などの本番に触る操作は、`.claude/settings.json` で毎回確認を求める設定にしてある。

### 本番に置く鍵（2026-10-05）

- Account API Token `tabikaigi-spike-deploy`：Workers の Admin と Account Settings の Read だけ。期限7日（2026-10-12 まで）。IP の制限なし。値はユーザーが `spike/.env` に書いた（Git に入らない）
- `Workers Scripts`（Legacy）は新しい「Workers」の役割に置き換わる途中。初めて Worker を作るには Admin が要る（Editor は既存の更新だけ）
- Cloudflare の MCP（plugin `cloudflare@cloudflare`）は使用量とログを読むのに使う（読み取りの権限にする方針。絞れたかは未確認）
- workers.dev の名前は、最初はメールアドレスから自動で付いていたので `tabikaigi` に変えた。URL は `https://tabikaigi-spike.tabikaigi.workers.dev`
