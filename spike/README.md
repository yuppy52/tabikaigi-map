# 小さく試す（案 C：Cloudflare Workers＋Hono）

[ADR 0003](../docs/adr/0003-backend-selection.md) の「決定の前に確かめること」を試すための試作。本番のアプリのコードではない（決定した後、Phase 2 で作り直す）。

## 動かし方

```bash
npm install      # 初回だけ
npm test         # テスト（ローカルの Workers の実行環境で動く）
npm run dev      # ローカルのサーバー（http://localhost:8787）。先に画面（demo/）を public/demo.js に変換する
npx wrangler d1 migrations apply tabikaigi-spike --local   # 初回だけ：ローカルの D1 にテーブルを作る
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
| `migrations/0001_init.sql` | 試作用のテーブル（グループ、メンバー、「行った」）。本番のデータの形は基本設計で決める |
| `src/db.ts`・`src/names.ts` | 参加・退出・「行った」の操作と、名前の決まり（REQ-009〜REQ-011） |
| `test/db.test.ts` | D1 の決まりのテスト（ローカルの D1） |
| `src/room.ts` | グループごとの部屋（Durable Object）。「行った」の変更を配るだけ |
| `test/realtime.test.ts` | リアルタイムのテスト |
| `demo/main.ts`・`public/app.html` | 2つのタブで動きを見る小さな画面（`/g/<グループID>`）。本番の画面は Phase 2 で React で作る |

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

### 3. D1 の決まり（2026-10-05、ローカル） → 守れる

テスト23件が通った（`test/db.test.ts`。ログインの確認と合わせて39件）。

| 確かめたこと | 方法 | 結果 |
|---|---|---|
| 20人まで（REQ-005） | `INSERT … SELECT … WHERE (人数) < 20` の1文 | 同時に20人が参加しても、ちょうど20人で止まる |
| 名前の重複（REQ-011、NFR-006 (11)） | 比べる形（`name_key`：NFKC＋小文字）に `UNIQUE` | `Yu` と `ｙｕ`、`ｶﾀｶﾅ` と `カタカナ` は重複。`ゆう` と `ユウ` は別 |
| 1アカウント1メンバー（NFR-006 (9)） | `UNIQUE(group_id, uid)`、ログインなしは `NULL` | `NULL` は何人でも可。同じ `uid` の2人目は断る。空の文字は `CHECK` で入らない |
| 最後の退出（Q-010） | 退出と「0人ならグループを消す」を同じ batch に | 最後の2人が同時に退出しても0人のグループは残らない。退出と参加が同時でも親のないメンバーは残らない（10回） |
| 作成者が消えたとき | `owner_member_id` に `ON DELETE SET NULL`、メンバーの番号は `AUTOINCREMENT` | 作成者が退出すると空になる。同じ名前で入り直しても作成者に戻らない |
| batch の途中の失敗 | 2文目で重複 | 1文目も取り消される |
| 長さ・県の番号 | `CHECK` | API を通さずに書いても入らない |

- **落とし穴**：`INSERT OR IGNORE` は、重複だけでなく `CHECK` の違反（県の番号48など）まで黙って無視する（エラーにならず0行）。「行った」を付けるのは `INSERT … ON CONFLICT (member_id, pref) DO NOTHING` にした。ADR 0003 の「C で書き直すときの方針」にあった `INSERT OR IGNORE` は使わない
- 同時の操作：ローカルの D1 も本番の D1 も、1つのデータベースへの書き込みは1つずつ順に実行される（batch は1つのまとまり）。なので「判断を1つの SQL か batch に収める」ことで守れる。ただし、本番の D1 で同時に送ったときの確認はまだ（要確認）
- 残り：同じ名前の既存メンバーとして入る（REQ-012）、紐づいたメンバーの名前（REQ-013）は、API で「読む → 分ける」ので、API を作るときに試す
- `wrangler.jsonc` の `database_id` は仮の値。本番に D1 を作るまで `wrangler deploy` は通らない（トークンにも D1 の権限がない）

### 4. リアルタイムの共有（2026-10-09、ローカル） → できる

テスト10件が通った（`test/realtime.test.ts`。全体で49件）。仕組み：API が D1 に書く → 部屋（Durable Object）に知らせる → 部屋がつながっている全員に WebSocket で配る。

| 確かめたこと | 結果 |
|---|---|
| グループIDを URL に入れない | URL はグループIDの SHA-256（`/api/rooms/<64桁>/ws`）。グループIDは最初のメッセージで送り、部屋が `idFromName(ハッシュ)` が自分と同じかで確かめる |
| 確かめる前・違うIDの接続 | 確かめる前は何も届かない。違うIDは 1008 で切る |
| 届く範囲 | 同じグループの全員に届く。別のグループには届かない。メンバーでない `memberId` の書き込みは 404 で、誰にも配らない |
| 部屋が眠って起きても（Hibernation） | `evictDurableObject` で眠らせても、つながりと「確かめ済み」（`serializeAttachment`）が残り、変更が届く |
| 生きているかの確認 | `ping` に、部屋を起こさずに `pong` が返る（`setWebSocketAutoResponse`） |

内蔵のブラウザの2つのタブ（`wrangler dev`）でも確かめた：
- 片方で東京を付けると、もう片方にすぐ届く
- サーバーを止めると「切れた（1006）」。画面が見えていない間はつなぎ直さず、見えたとき（`visibilitychange`）に全体を取り直してつなぎ直した
- 参加は配らない（NFR-003）ので、あとから参加した人の変更が届くと、届いた側は名前を知らない。**知らないメンバーの変更が届いたら全体を取り直す**ようにした（本番の画面でも要る）

残り：
- ログインしている人の証明書を、つなぐときに確かめる（いまはグループIDを知っていればつなげる。NFR-005 の「グループIDを知っていれば読める」と同じ強さ）
- 最初のメッセージを送らない接続を、時間で切る（アラームで。いまはつながったまま残る）
- スマホで画面を消して戻ったとき、無料枠の消費、`partysocket` を使うか：本番の環境（`https`）で試す。`crypto.subtle` は `https` か `localhost` でしか使えないので、スマホから家の中の `http` のアドレスでは試せない。本番に置くには D1 を作る必要があり、トークンに D1 の権限を足す

### 5. ログに残るもの（2026-10-05、本番）

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
