# デプロイとテーブル定義の変更の手順書

状態：下書き（2026-10-16：作った。決めたことは [ADR 0008](../adr/0008-deploy-from-pc-no-staging.md)。本番ではまだ1度も動かしていないので、最初のデプロイで〔未〕を確かめて直す）

- 関係する要件：NFR-004（費用の上限）、NFR-014（運営者1人で回せる）、NFR-017（バックアップ）、NFR-008（消したデータの残り方）
- 本番の構成は [architecture](architecture.md) の「環境」。設定は `wrangler.jsonc`

## 前提の仕組み

- **デプロイ**（`wrangler deploy`）：コードと設定と静的アセットを「版」として出し、すぐに全部の利用者をその版に切り替える（古い版と新しい版が割合で混ざるのは、段階的なデプロイを自分で使ったときだけ）。直近の100版は `wrangler rollback` で戻せる
- **戻らないもの**：`wrangler rollback` は D1 のテーブルとデータ、Durable Objects の中身を戻さない。Durable Objects のクラスを足す・変える版をまたいでは、戻せない
- **テーブル定義の変更**（マイグレーション）：`migrations/NNNN_名前.sql` を足して `wrangler d1 migrations apply DB --remote` を実行すると、まだ当てていないファイルが番号の順に当たる。当てたファイルの名前は D1 の `d1_migrations` 表に残る。**元に戻す仕組みはない**。1つのファイルが途中で失敗したら、そのファイルは巻き戻り、前のファイルまでは当たったまま残る
- **Time Travel**：D1 は過去7日間の状態を自動で持っていて（Free）、時刻か「ブックマーク」を指定して巻き戻せる。巻き戻すと**その時刻より後の書き込みも消える**。巻き戻しを取り消すには、巻き戻したときに表示される、直前のブックマークへもう一度巻き戻す
- **書き出し**（`wrangler d1 export --remote`）：テーブル定義とデータを SQL のファイルにする。**書き出している間は、ほかの読み書きが止まる**（グループを開けない）

## マイグレーションの決まり

表の変更とコードのデプロイは別々のコマンドなので、間に数十秒〜数分のずれがあり、その間は古いコードが新しい表に対して動く。決まりはこのずれから来ている（2026-10-16 にユーザーと決めた）。

| 変更 | 決まり | 守らないと |
|---|---|---|
| 足す（列・表・インデックス） | **表 → コード**の順。足す列には `DEFAULT` を付けるか、空を許す（古いコードは新しい列に値を入れないため） | 先にコードを出すと、表ができるまで「そんな列はない」でグループを開けない |
| 消す・名前を変える | **デプロイを2回に分ける**。1回目でその列を使わないコードを出し、2回目（数日後）で列を消すファイルを当てる。名前を変えるのは「足す＋消す」として扱う | 先に列を消すと、古いコードが書き込むたびに失敗する |
| 制約を強める（`CHECK`、`UNIQUE`、トリガー） | 当てる前に、いまのデータに違反がないかを SQL で数える。違反があれば先に直す | 当てたときに失敗するか、古いコードの書き込みが断られ続ける |
| 表を作り直す（SQLite で列の型や制約を変えるとき） | 先頭に `PRAGMA defer_foreign_keys = true;` を書く。作り直した表には、トリガーとインデックスを**もう一度作る**（表を消すと一緒に消える） | 外部キーの違反で失敗する。トリガーが消えたまま、保存先で守るもの（NFR-006）が効かなくなる |

どの変更でも：
- 当てる直前に、バックアップと Time Travel のブックマークを控える（下の手順）
- **本番に当てたファイルは書き換えない**。直したいときは新しい番号のファイルを足す。D1 は当てたファイルを名前で覚えているので、中身を書き換えても二度と当たらず、手元と本番の表が気づかないうちに違う形になる（2026-10-16 に手元で起きた：下の「確かめたこと」）
- マイグレーションのファイルに `BEGIN TRANSACTION` と `COMMIT` を書かない（D1 はファイルを丸ごと1つの処理で動かす）
- テーブル定義を変えたら、[data-model](data-model.md) と `api/test/schema.test.ts` も同じプルリクエストで直す（`.claude/rules/sql.md`）
- **公開の前**は利用者のデータがないので、失敗したら D1 を作り直してよい（作り直すときは、`wrangler.jsonc` の `database_id` を新しいものに替える）

## 鍵（Cloudflare の API トークン）

`wrangler login` は使わない（アカウント全体の広い権限が付くため）。デプロイ用に、要る権限だけのトークンを手で作る（CLAUDE.md の「鍵と初期設定」）。

1. Cloudflare のダッシュボードの「API トークン」→「カスタム トークンを作成」（テンプレートの「Edit Cloudflare Workers」は使わない）
2. 権限（最初はこれだけで作り、足りなければエラーの文を見て1つずつ足す。〔未〕要確認：wrangler が要る権限の公式の一覧がない）
   - アカウント：Workers Scripts 編集、D1 編集
   - ゾーン（`tabikaigi-map.com` だけ）：Workers Routes 編集、DNS 編集（独自ドメインの DNS レコードを Cloudflare が作るため。要るかは要確認）
   - お金に関わる権限（請求、Registrar）は選ばない。アカウントとゾーンは、このアプリのものだけに絞る
3. 期限（TTL）を付ける（90日）。IP の制限は、家の IP が変わることがあるので付けない
4. 運営者の PC の、リポジトリの直下の `.env` に置く（`.gitignore` 済み。Claude は読めない：`.claude/settings.json` の deny）

   ```
   CLOUDFLARE_API_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   ```

   wrangler は `.env` を読む（公式は `.env` に置くのを推奨している。〔未〕最初に `npx wrangler whoami` で読めるかを確かめる）。`.env` の値は `wrangler dev` の Worker からも見えるので、Worker のコードで `env` を丸ごとログに出さない
5. 作ったら、権限と期限を [learnings](../learnings/) か、この節に書き足す（次に作り直すときのため）。期限が切れたら同じ権限で作り直す

**鍵が漏れたら**（リポジトリに入れた、画面に出した）：すぐにダッシュボードでトークンを消し、作り直す。履歴から消しても、一度公開した鍵は使われうる前提で扱う。

## ふだんのデプロイ（表を変えないとき）

1. プルリクエストを main にマージした後、手元を main の最新にする（`git switch main && git pull`）
2. Claude が `npm run deploy` を実行する（中で型の確かめ → テスト → `wrangler deploy`。`ask` で OK をもらってから）
3. 本番の画面を開き、変えたところとグループを開けることを確かめる。`wrangler tail` かダッシュボードのログでエラーが出ていないかを見る
4. おかしければ、下の「戻し方」

## 表を変えるデプロイ

1. 手元を main の最新にし、`npx wrangler d1 migrations list DB --remote` で、当てるファイルがこれから当てるものだけかを見る
2. 利用者が少ない時間（深夜・早朝）を選ぶ（3 の書き出しの間、グループを開けないため）
3. **バックアップ**：`npx wrangler d1 export DB --remote --output <バックアップの置き場>/tabikaigi-YYYYMMDD-HHMM.sql`
   - 置き場は、リポジトリの外の運営者の PC のフォルダ（名前が入っているので、リポジトリやクラウドの共有フォルダに置かない）
   - 古いバックアップは、新しいほうから3つを残して消す（消したデータがバックアップにいつまでも残らないように。プライバシーポリシーの保存期間に合わせる：NFR-008。〔未〕privacy に書く）
4. **ブックマークを控える**：`npx wrangler d1 time-travel info DB` の出力（いまのブックマーク）を、作業のメモ（プルリクエストのコメントなど）に残す
5. **公開の後は**、下の「手元で練習する」を済ませてから進む
6. `npx wrangler d1 migrations apply DB --remote`（当てるファイルの一覧が出て、確認を求められる）
7. 足す変更なら、ここで `npm run deploy`。消す変更の2回目なら、コードは1回目で出し済み
8. 本番の画面で確かめる。おかしければ「戻し方」

## 手元で練習する（公開の後、表を変える前に）

ステージングの代わり（[ADR 0008](../adr/0008-deploy-from-pc-no-staging.md)）。本番のデータの写しに当てて、いまのデータで失敗しないかを見る。

1. 上の手順の 3 のバックアップを使う
2. 練習用のフォルダを、リポジトリの外に作り、`wrangler.jsonc` と `migrations/` を写す（普段の `wrangler dev` のデータと混ぜないため）
3. そのフォルダで `npx wrangler d1 execute DB --local --file <バックアップ>`（**`--local` を付け忘れると本番に向かう**。本番への `execute --remote` は `ask` で止まる）。書き出しの中の `d1_migrations` も入るので、当て済みのファイルは当て済みとして読み込まれる
4. 新しいマイグレーションのファイルを写し、`npx wrangler d1 migrations apply DB --local`
5. `npx wrangler dev` で画面を開き、グループを開く・「行った」を付け外す・参加するを試す
6. 終わったら練習用のフォルダを消す（本番のデータの写しが残らないように）

## 戻し方

| 何が悪いか | どうするか | 注意 |
|---|---|---|
| コードだけ（表は変えていない） | `npx wrangler rollback`（直前の版に戻す。`ask` で止まるようにする） | 数秒で戻る。D1 は戻らない |
| 表の変更（データは壊れていない） | 直すためのマイグレーションを新しい番号で足して当てる | 当てたファイルは書き換えない |
| 表の変更でデータが壊れた | `npx wrangler d1 time-travel restore DB --bookmark=<控えたブックマーク>`。続けて、表に合うコードの版に `rollback` する | **控えた時刻より後に友達が書いたもの（「行った」など）も消える**。巻き戻したときに表示される「直前のブックマーク」を控える（巻き戻しの取り消しに使う）。7日より前には戻せないので、そのときはバックアップから作り直す |
| Durable Objects のクラスを変えた版 | `rollback` できない。直す版を新しく出す | クラスを消すと中身ごと消える。クラスの追加・名前の変更・削除は、それだけのプルリクエストにする（名前の変更は公式が3回に分けるよう勧めている） |

## 秘密の値（`wrangler secret put`）

- `wrangler secret put` は、新しい版を作って**すぐにデプロイする**。コードを変えていなくても版が1つ増える
- `wrangler deploy` は、秘密の値を消さない。ダッシュボードで足した普通の変数は、次の `wrangler deploy` で `wrangler.jsonc` の値に上書きされる（ダッシュボードで変数を足さない）
- 手元で使う秘密の値は `.dev.vars` に置く（`.gitignore` に入れる）

## 確かめたこと

- 〔済：ローカル、2026-10-16〕まっさらな手元の D1 に `0001_init.sql` を当てて `wrangler d1 export --local` で書き出すと、トリガー6つ、部分インデックス（`members_one_owner`）、`d1_migrations` が入っていた。その書き出しを別の手元の D1 に `execute --local --file` で読み込むと、トリガー6つがそろっていた
- 〔済：ローカル、2026-10-16〕いつもの `wrangler dev` 用の手元の D1（`.wrangler/`）は、`0001_init.sql` を書き換える前の古い形のままだった（トリガー4つで、名前も違う）。`migrations apply --local` は「当てるものはない」と答えた。当てたファイルを書き換えても二度と当たらない、の実例。テスト（Vitest）は毎回まっさらな D1 で動くので影響はない
- 〔未〕最初の本番のデプロイで確かめること（公開の前に必須）：
  - トークンの権限が足りるか（足したものを上の「鍵」に書く）。wrangler が `.env` を読むか
  - 本物の D1 で、書き出しにトリガーと部分インデックスが入るか。書き出しにかかる時間（その間はグループを開けない）
  - `d1 migrations apply --remote` で、失敗するファイルを当てたときに、前のファイルまで残り、`d1_migrations` に失敗したファイルが入らないか（公開の前に、わざと失敗するファイルで試し、D1 を作り直す）
  - Time Travel の巻き戻しと、その取り消し（公開の前に試す）。巻き戻しの回数の制限
  - `rollback` で静的アセットも前の版に戻るか

## 出典

https://developers.cloudflare.com/workers/configuration/versions-and-deployments/ 、https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/ 、https://developers.cloudflare.com/workers/configuration/secrets/ 、https://developers.cloudflare.com/workers/wrangler/system-environment-variables/ 、https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ 、https://developers.cloudflare.com/fundamentals/api/reference/permissions/ 、https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/ 、https://developers.cloudflare.com/d1/best-practices/import-export-data/ 、https://developers.cloudflare.com/d1/reference/time-travel/ 、https://developers.cloudflare.com/d1/reference/migrations/ 、https://developers.cloudflare.com/d1/sql-api/foreign-keys/ 、https://developers.cloudflare.com/d1/wrangler-commands/
