# デプロイとテーブル定義の変更の手順書

状態：下書き（2026-10-26：手元の D1 が読み取りだけになったときの直し方を「確かめたこと」に足した。2026-10-19：`npm run deploy` に画面のビルドを足した。2026-10-17：`/review-docs`（26件）を受けて、バックアップを NFR-017 のとおり「毎回取り、1つだけ残す」に戻し、表の作り直しの決まり（子の表、番号の続き、トリガーの順番）を手元で試した結果で書き、戻す順番、ブックマークを控える時機、最初のデプロイ、バックアップからの作り直し、「公開」の意味を足した。2026-10-16：作った。決めたことは [ADR 0008](../adr/0008-deploy-from-pc-no-staging.md)。本番ではまだ1度も動かしていないので、最初のデプロイで〔未〕を確かめて直す）

- 関係する要件：NFR-004（費用の上限）、NFR-014（運営者1人で回せる）、NFR-017（バックアップ）、NFR-008（消したデータの残り方）、NFR-006（保存先で守るもの）
- 本番の構成は [architecture](architecture.md) の「環境」。設定は `wrangler.jsonc`

## 前提の仕組み

- **デプロイ**（`wrangler deploy`）：コードと設定と静的アセットを「版」として出し、すぐに全部の利用者をその版に切り替える（古い版と新しい版が割合で混ざるのは、段階的なデプロイ `wrangler versions deploy` を使ったときだけ。使わない）。直近の100版は `wrangler rollback` で戻せる
- **戻らないもの**：`wrangler rollback` は D1 のテーブルとデータ、Durable Objects の中身を戻さない。Durable Objects のクラスを足す・変える版をまたいでは、戻せない
- **テーブル定義の変更**（マイグレーション）：`migrations/NNNN_名前.sql` を足して `wrangler d1 migrations apply DB --remote` を実行すると、まだ当てていないファイルが番号の順に当たる。当てたファイルの名前は D1 の `d1_migrations` 表に残る。**元に戻す仕組みはない**。1つのファイルが途中で失敗したら、そのファイルは巻き戻り、前のファイルまでは当たったまま残る（公式。本番では〔未〕）
- **Time Travel**：D1 は過去7日間の状態を自動で持っていて（Free）、時刻か「ブックマーク」を指定して巻き戻せる。巻き戻すと**その時刻より後の書き込みも消える**。巻き戻しを取り消すには、巻き戻したときに表示される、直前のブックマークへもう一度巻き戻す。巻き戻しは10分に10回まで（architecture の「運用」に書いた値。2026-10-16 の調査では公式のページで見つからず、出典の再確認は〔未〕）
- **書き出し**（`wrangler d1 export --remote`）：テーブル定義とデータを SQL のファイルにする。**書き出している間は、ほかの読み書きが止まる**（グループを開けない。公式）。データは数千行の見込みなので数秒で終わるはず（〔未〕最初のデプロイで測る）
- **公開**：友達に最初の招待URLを渡した日を「公開」とする（2026-10-17 にユーザーと決めた）。独自ドメインに出しただけでは、まだ公開の前。公開した日を roadmap に書く。公開の前と後で、下の決まりが変わる

## マイグレーションの決まり

表の変更とコードのデプロイは別々のコマンドなので、間に数十秒〜数分のずれがあり、その間は古いコードが新しい表に対して動く。決まりはこのずれから来ている（2026-10-16 にユーザーと決めた。2026-10-17：`/review-docs` で制約を強める変更と、表の作り直しを足した）。

| 変更 | 決まり | 守らないと |
|---|---|---|
| 足す（列・表・インデックス） | **表 → コード**の順。足す列には `DEFAULT` を付けるか、空を許す（古いコードは新しい列に値を入れないため） | 先にコードを出すと、表ができるまで「そんな列はない」でグループを開けない |
| 消す・名前を変える | **デプロイを2回に分ける**。1回目でその列を使わないコードを出し、2回目（数日後）で列を消すファイルを当てる。名前を変えるのは「足す＋消す」として扱う | 先に列を消すと、古いコードが書き込むたびに失敗する |
| 制約を強める（`CHECK`、`UNIQUE`、トリガー） | **① いまのデータの違反を SQL で数え、あれば直す → ② 違反を書かないコードを先にデプロイ → ③ 制約を当てる**（2026-10-17 にユーザーと決めた） | 古いコードが動いているうちに当てると、その書き込みが断られ続ける。違反が残っていると、当てたときに失敗する |
| 表を作り直す（SQLite で列の型や制約を変えるとき） | 下の「表を作り直すとき」 | 子の表の行が全部消える。トリガーと番号の続きが消える |

### 表を作り直すとき

SQLite は列の型や制約をあとから変えられないので、「新しい表を作ってデータを写し、古い表を消して名前を替える」で作り直す。**2026-10-17 に手元の D1 で試したところ、親の表（`groups`）を消すと、`PRAGMA defer_foreign_keys = true` を付けても `PRAGMA foreign_keys = OFF` にしても、`ON DELETE CASCADE` で子の表（`members`・`member_visits`）の行が全部消えた**（下の「確かめたこと」）。そのため次を守る。

1. 先頭に `PRAGMA defer_foreign_keys = true;` を書く
2. **親の表を作り直すときは、その子・孫の表（`groups` なら `members` と `member_visits`、`accounts` なら `members` と `account_visits`、`members` なら `member_visits`）も同じファイルで作り直す**
3. 新しい表は、元の定義と同じ `CREATE TABLE`（`CHECK`、`UNIQUE`、`AUTOINCREMENT`、外部キー）で作る。`CREATE TABLE … AS SELECT` は使わない（制約も `AUTOINCREMENT` も写らない）
4. データを写す（`INSERT INTO 新しい表 SELECT … FROM 古い表`）
5. 古い表を**子から先に**消す（孫 → 子 → 親）。名前を替える
6. **データを写した後で**、インデックス（部分 `UNIQUE` を含む）とトリガーを作る（先に作ると、`members_owner_first_only` などが写すときの `INSERT` を断ることがある）
7. **番号の続きを元に戻す**：`UPDATE sqlite_sequence SET seq = <作り直す前の値> WHERE name = 'members';`（行がなければ `INSERT`）。戻さないと、消したメンバーの番号を後から入った人がもらい、その番号を覚えている古い端末が、後から入った人として操作できてしまう（[learnings](../learnings/2026-10-13-guard-every-path-to-protected-value.md)）
8. 手元の練習で、当てる前と後に、表ごとの行数、トリガーの数（`SELECT count(*) FROM sqlite_master WHERE type = 'trigger'`）、`sqlite_sequence` の値を比べる

### どの変更でも

- 当てる直前に、ブックマークを控える（下の手順）
- **本番に当てたファイルは書き換えない**。直したいときは新しい番号のファイルを足す。D1 は当てたファイルを名前で覚えているので、中身を書き換えても二度と当たらず、手元と本番の表が気づかないうちに違う形になる（2026-10-16 に手元で起きた：下の「確かめたこと」）
- マイグレーションのファイルに `BEGIN TRANSACTION` と `COMMIT` を書かない（D1 はファイルを丸ごと1つの処理で動かす）
- テーブル定義を変えたら、[data-model](data-model.md) と `api/test/schema.test.ts` も同じプルリクエストで直し、`access-reviewer` に見てもらう
- **公開の前**は利用者のデータがないので、失敗したら D1 を作り直してよい（下の「最初のデプロイ」の 1 からやり直す。`wrangler.jsonc` の `database_id` を新しいものに替える）

## 鍵（Cloudflare の API トークン）

`wrangler login` は使わない（アカウント全体の広い権限が付くため。`.claude/settings.json` の deny に入れた）。デプロイ用に、要る権限だけのトークンを手で作る（CLAUDE.md の「鍵と初期設定」）。

1. Cloudflare のダッシュボードの「API トークン」→「カスタム トークンを作成」（テンプレートの「Edit Cloudflare Workers」は使わない。R2 の書き込みが入っている：[learnings](../learnings/2026-10-05-check-service-defaults.md)）
2. 権限（最初はこれで作り、足りなければエラーの文を見て1つずつ足す。〔未〕wrangler が要る権限の公式の一覧はない）
   - アカウント：Workers の Admin（初めて Worker を作るのに要った。2026-10-05 の試作で通った形）、Account Settings の読み取り（同じ）、D1 の編集
   - ゾーン（`tabikaigi-map.com` だけ）：Workers Routes の編集、DNS の編集（独自ドメインの DNS レコードを Cloudflare が作るため。要るかは〔未〕）
   - お金に関わる権限（請求、Registrar、R2）は選ばない。アカウントとゾーンは、このアプリのものだけに絞る
3. 期限（TTL）を付ける（90日）。期限の日を控え、切れる前に同じ権限で作り直す（切れると D1 の巻き戻しもできなくなる。コードの戻しだけはダッシュボードからもできる）。IP の制限は、家の IP が変わることがあるので付けない
4. 運営者の PC の、リポジトリの直下の `.env` に置く（`.gitignore` 済み）

   ```
   CLOUDFLARE_API_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   ```

   - Claude は Read の道具では `.env` を読めない（`.claude/settings.json` の deny）。ただし Bash の `cat` などは止まらないので、Claude に `.env` の中身を出させる指示を出さない
   - wrangler は `.env` を読む（公式は `.env` に置くのを推奨している。〔未〕最初に `npx wrangler whoami` で読めるかを確かめる）。`.env` の値は `wrangler dev` の Worker からも見えるので、Worker のコードで `env` を丸ごとログに出さない
5. 作ったら、実際に要った権限と期限の日をこの節に書き足す（次に作り直すときのため）

**鍵が漏れたら**（リポジトリに入れた、画面に出した）：すぐにダッシュボードでトークンを消し、作り直す。履歴から消しても、一度公開した鍵は使われうる前提で扱う。

## 最初のデプロイ（一度だけ）

公開の前に行う。roadmap の Phase 2 の〔未〕の確かめも、ここで済ませる。

1. 本番の D1 を作る：`npx wrangler d1 create tabikaigi-map --location apac`（場所は後から変えられない：architecture の「運用」。指定の名前と値は〔未〕作るときに公式で確かめる）。出てきた `database_id` で `wrangler.jsonc` を差し替え、プルリクエストでマージする
2. `npx wrangler d1 migrations apply DB --remote` で、テーブル定義を当てる。`sqlite_master` でトリガーが6つあるかを数える
3. 独自ドメインを `wrangler.jsonc` の `routes`（`custom_domain: true`）に足してマージし、`npm run deploy`
4. 確かめる：独自ドメインで開ける、`*.workers.dev` とプレビューの URL で開けない（Q-031）、アプリの画面と API に `noindex` と `Referrer-Policy: no-referrer` が付いている
5. WAF のレート制限のルールを作る（architecture の「無料枠を使い切られないために」）
6. 下の「確かめたこと」の〔未〕と、roadmap の Phase 2 の〔未〕を済ませる。わざと失敗するマイグレーション、Time Travel の巻き戻しと取り消し、バックアップからの作り直しは、利用者のいないこの時期に試す
7. 試作の Worker（`tabikaigi-spike.tabikaigi.workers.dev`）と試作の D1 を消す（roadmap の Phase 2。消すのは `ask` で止まる）

## ふだんのデプロイ（表を変えないとき）

1. プルリクエストを main にマージした後、手元を main の最新にする（`git switch main && git pull`）
2. 利用者が少ない時間（深夜・早朝）を選ぶ（3 の書き出しの間、グループを開けないため）
3. **バックアップ**（NFR-017：新しい版を出す前に毎回）：`npx wrangler d1 export DB --remote --output <バックアップの置き場>/tabikaigi-YYYYMMDD-HHMM.sql`
   - 置き場は、リポジトリの外の運営者の PC のフォルダ（名前が入っているので、リポジトリやクラウドの共有フォルダに置かない）
   - **新しいバックアップを取ったら、古いものは消す**（直近の1つだけ残す。消したデータが手元に残り続けないため：NFR-017・NFR-008、[privacy](privacy.md) の保存期間）。消すのは運営者が手で行う（Claude の `rm -rf` は deny）
4. Claude が `npm run deploy` を実行する（`ask` で OK をもらってから）。中身（`scripts/deploy.sh`）は、main の最新か（GitHub の main と同じか）→ 手元にコミットしていない変更がないか（`git status`）→ 型の確かめ → lint → テスト → 画面のビルド（`npm run build`、2026-10-19 に足した）→ `wrangler deploy`。どれかが失敗したら、そこで止まる
5. 本番の画面を開き、変えたところとグループを開けることを確かめる。`wrangler tail` かダッシュボードのログでエラーが出ていないかを見る
6. おかしければ、下の「戻し方」

## 表を変えるデプロイ

1. 手元を main の最新にし、`npx wrangler d1 migrations list DB --remote` で、当てるファイルがこれから当てるものだけかを見る
2. 利用者が少ない時間を選ぶ
3. **バックアップ**：「ふだんのデプロイ」の 3 と同じ（古いものは消す）
4. **公開の後は**、下の「手元で練習する」を済ませてから進む
5. **ブックマークを控える**（当てる直前。練習の後に控えるのは、練習の間に友達が書いたものまで巻き戻しで消さないため）：`npx wrangler d1 time-travel info DB` の出力（いまのブックマーク）を、作業のメモ（プルリクエストのコメントなど）に残す
6. `npx wrangler d1 migrations apply DB --remote`（当てるファイルの一覧が出て、確認を求められる）
7. 足す変更なら、ここで `npm run deploy`。消す変更の2回目と、制約を強める変更の ③ なら、コードは先に出し済み
8. 本番の画面で確かめる。おかしければ「戻し方」

## 手元で練習する（公開の後、表を変える前に）

ステージングの代わり（[ADR 0008](../adr/0008-deploy-from-pc-no-staging.md)）。本番のデータの写しに新しいマイグレーションを当て、**新しいコード**で動かして、いまのデータで失敗しないかを見る。

1. 上の手順の 3 のバックアップを使う
2. 練習用のデータの置き場を、リポジトリの外に決める（例：`~/tabikaigi-practice`。普段の `wrangler dev` のデータ（`.wrangler/`）と混ぜないため）
3. リポジトリの中で、新しいマイグレーションを足す前の main のまま、`npx wrangler d1 execute DB --local --persist-to <練習用の置き場> --file <バックアップ>`（**`--local` を付け忘れると本番に向かう**。本番への `execute --remote` は `ask` で止まる）
   - 書き出しには `d1_migrations` と `sqlite_sequence` も入る（〔済：ローカル〕）。読み込んだ後に `migrations apply` が当て済みのファイルを飛ばすかは〔未〕（最初に練習するときに `migrations list --local --persist-to …` で見る）
4. 新しいマイグレーションのブランチに替え、`npx wrangler d1 migrations apply DB --local --persist-to <練習用の置き場>`
5. 表を作り直す変更なら、「表を作り直すとき」の 8 の比べ方をする
6. `npx wrangler dev --persist-to <練習用の置き場>` で画面を開き、グループを開く・「行った」を付け外す・参加するを試す（〔未〕`wrangler dev` の `--persist-to` で読めるかを、最初の練習で確かめる）
7. 終わったら練習用の置き場を運営者が手で消す（本番のデータの写しが残らないように）

## 戻し方

**戻す順番は「コード → 表」**（先に表を巻き戻すと、その間は新しいコードが古い表に向かって動き、グループを開けない）。

| 何が悪いか | どうするか | 注意 |
|---|---|---|
| コードだけ（表は変えていない） | `npx wrangler rollback`（直前の版に戻す。`ask` で止まる）。急ぐときはダッシュボードからも戻せる | 数秒で戻る。D1 は戻らない。**戻してよいのは、いまの表で動く版だけ**（消す変更の2回目より後に、1回目より前の版へ戻すと、消えた列を使うコードが動く） |
| 表の変更（データは壊れていない） | 直すためのマイグレーションを新しい番号で足して当てる | 当てたファイルは書き換えない |
| 表の変更でデータが壊れた | ① 表に合うコードの版に `rollback` する → ② `npx wrangler d1 time-travel restore DB --bookmark=<控えたブックマーク>` | **控えた時刻より後に友達が書いたもの（「行った」など）も消える**。巻き戻したときに表示される「直前のブックマーク」を控える（巻き戻しの取り消しに使う）。7日より前には戻せないので、そのときは下の「バックアップから作り直す」 |
| Durable Objects のクラスを変えた版 | `rollback` できない。直す版を新しく出す | クラスを消すと中身ごと消える。クラスの追加・名前の変更・削除は、それだけのプルリクエストにする（名前の変更は公式が3回に分けるよう勧めている） |

巻き戻した後も、開いている画面は古い地図のまま（部屋は巻き戻しを知らせない）。消えたメンバーで操作すると 404 になり、画面は取り直す（[screens](screens.md) の「API の応答と画面の動き」）。部屋の接続が切れてつなぎ直したときに全体を取り直すかは、リアルタイムを作るとき（Phase 2）に決める〔未〕。

### バックアップから作り直す（7日より前に戻すとき、D1 そのものを失ったとき）

〔未〕公開の前に一度試してから、ここを書き直す。いまの見込み：
1. 新しい D1 を作る（「最初のデプロイ」の 1）
2. `npx wrangler d1 execute DB --remote --file <バックアップ>`（書き出しは、表 → データ → インデックス・トリガー → `sqlite_sequence` の順に入っている見込みで、写すときにトリガーで断られないか、番号の続きが元に戻るかを試す）
3. `wrangler.jsonc` の `database_id` を替えてデプロイする

## 秘密の値（`wrangler secret put`）

- `wrangler secret put` は、新しい版を作って**すぐにデプロイする**。コードを変えていなくても版が1つ増える（`ask` で止まる）
- `wrangler deploy` は、秘密の値を消さない。ダッシュボードで足した普通の変数は、次の `wrangler deploy` で `wrangler.jsonc` の値に上書きされる（ダッシュボードで変数を足さない）
- 手元で使う秘密の値は `.dev.vars` に置く（`.gitignore` と deny に入れる）

## 確かめたこと

- 〔済：ローカル、2026-10-16〕まっさらな手元の D1 に `0001_init.sql` を当てて `wrangler d1 export --local` で書き出すと、トリガー6つ、部分インデックス（`members_one_owner`）、`d1_migrations` が入っていた。その書き出しを別の手元の D1 に `execute --local --file` で読み込むと、トリガー6つがそろっていた
- 〔済：ローカル、2026-10-16〕いつもの `wrangler dev` 用の手元の D1（`.wrangler/`）は、`0001_init.sql` を書き換える前の古い形のままだった（トリガー4つで、名前も違う）。`migrations apply --local` は「当てるものはない」と答えた。当てたファイルを書き換えても二度と当たらない、の実例。テスト（Vitest）は毎回まっさらな D1 で動くので影響はない。`wrangler dev` で画面を試す前に、手元の D1 を作り直す（`.wrangler/state` の D1 を運営者が手で消し、`npm run db:migrate:local`）
- 〔済：ローカル、2026-10-26〕手元の D1 が、`wrangler dev` からの書き込みで `SQLITE_READONLY`（読み取りだけ）を返した（2026-10-23）。本体のファイルが 4KB のままで、表の中身は書きかけの記録（`-wal`、111KB）に入ったままだった。`sqlite3` でファイルを1回開いて閉じると（`BEGIN IMMEDIATE; ROLLBACK;`）書きかけの記録が本体に移り、`wrangler dev` から書けるようになった。〔推測〕`wrangler dev` を強制終了（`pkill`）したことで書きかけの記録が残り、`wrangler dev` がそれを片付けられなかった。原因は確かめきれていない。同じことが起きたら、まず `sqlite3` で開いて閉じる。直らなければ手元の D1 を作り直す（`.wrangler/state/v3/d1` を運営者が消し、`npm run db:migrate:local`）。開発サーバーは強制終了せずに止める
- 〔済：ローカル、2026-10-17〕メンバーを3人入れて3人目を消すと、`sqlite_sequence` の `members` は 3 のまま。書き出しに `sqlite_sequence` の行が入り、別の手元の D1 に読み込むと、次のメンバーの番号は 4 だった（使い回されない）
- 〔済：ローカル、2026-10-17〕`groups` を作り直す SQL（新しい表に写す → `DROP TABLE groups` → 名前を替える）を当てると、`PRAGMA defer_foreign_keys = true` でも `PRAGMA foreign_keys = OFF` でも、`members` と `member_visits` が全部消えた（2行 → 0行）。子の表を先に写して消し、親を最後に消すと行は残った。ただし `CREATE TABLE … AS SELECT` で作った表には、トリガー（0個になった）と `sqlite_sequence` の値が残らなかった
- 〔未〕最初の本番のデプロイで確かめること（公開の前に必須。roadmap の Phase 2 の〔未〕の一覧にもある）：
  - トークンの権限が足りるか（足したものを上の「鍵」に書く）。wrangler が `.env` を読むか
  - 本物の D1 で、書き出しにトリガー・部分インデックス・`sqlite_sequence` が入るか。書き出しにかかる時間（その間はグループを開けない）
  - `d1 migrations apply --remote` で、失敗するファイルを当てたときに、前のファイルまで残り、`d1_migrations` に失敗したファイルが入らないか（わざと失敗するファイルで試し、D1 を作り直す）
  - Time Travel の巻き戻しと、その取り消し
  - バックアップから新しい D1 を作って、画面が動くか（上の「バックアップから作り直す」）
  - `rollback` で静的アセットも前の版に戻るか
  - デプロイしたときに、部屋の WebSocket の接続が切れるか

## 出典

https://developers.cloudflare.com/workers/configuration/versions-and-deployments/ 、https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/ 、https://developers.cloudflare.com/workers/configuration/secrets/ 、https://developers.cloudflare.com/workers/wrangler/system-environment-variables/ 、https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ 、https://developers.cloudflare.com/fundamentals/api/reference/permissions/ 、https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/ 、https://developers.cloudflare.com/d1/best-practices/import-export-data/ 、https://developers.cloudflare.com/d1/reference/time-travel/ 、https://developers.cloudflare.com/d1/reference/migrations/ 、https://developers.cloudflare.com/d1/sql-api/foreign-keys/ 、https://developers.cloudflare.com/d1/platform/limits/ 、https://developers.cloudflare.com/d1/wrangler-commands/
