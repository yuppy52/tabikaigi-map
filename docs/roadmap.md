# ロードマップ

モック（`index.html`）から、友達と実際に共有できるWebアプリにするまでの計画。設計の中身は [docs/README.md](README.md) の各ドキュメントを参照。

## いまどこ？

**Phase 2（MVP①）を始めた（2026-10-16）。開発運用（デプロイの方法、ステージングを作らない、マイグレーションの決まり、Phase 2 の道具）を決め、手順書を作った。2026-10-19 に道具（ESLint＋Prettier、Dependabot、`npm run deploy`、コードを書く `coder` サブエージェント）を入れた。Phase 1（基本設計）は 2026-10-16 に終わった。7. まで済み、実装の前の道具の見直しと開発環境、D1 のテーブル定義と制約のテスト（2026-10-12）、API で守るもの（グループの作成・参加・開く・「行った」、紐づけ・名前の変更・退出・管理・グループ一覧・退会。2026-10-13：[api](design/api.md)）、設計書のレビュー（2026-10-15：`/review-docs` 23件を反映）、LICENSE（MIT）と地図データの差し替え（[ADR 0007](adr/0007-map-data-n03.md)）・OGP の文言と画像・運営者の氏名・住所の出し方（2026-10-16）まで済んだ。画面はまだで、インターネットには何も出していない**。

次にやること（上から順に。推奨の順番）：
1. ~~Phase 2 を始める前に、道具を見直す~~（2026-10-16 に決めた：下の「工程ごとの道具の見直し」）。~~「デプロイとテーブル定義の変更の手順書」を作る~~（2026-10-16：[deploy](design/deploy.md)、[ADR 0008](adr/0008-deploy-from-pc-no-staging.md)）
2. ~~決めた道具を入れる~~（2026-10-19：`chore/dev-tooling`。`eslint-plugin-react-hooks` は React を入れる 3 で足す）。GitHub の設定も 2026-10-19 にユーザーに1つずつ確かめて変えた（`test` を必須のチェックにするルールセット、Dependabot の知らせと修正 PR）。中身：ESLint＋Prettier（[ADR 0009](adr/0009-lint-eslint-prettier.md)）と CI、Claude Code の hooks で Prettier、Dependabot（`.github/dependabot.yml`）、`.gitignore` に `.dev.vars*`、`npm run deploy`（コミットし忘れの確かめ → 型 → lint → テスト → 画面のビルド → デプロイ）
3. Vite＋React＋TypeScript の構成を作る（Phase 2 の2つ目の項目）。2026-10-19 に小分け（3-1〜3-5）を決め、下の Phase 2 に書いた。3-1（Vite＋React を入れる）は 2026-10-19、3-2（配信の設定）と 3-3（地図の部品）は 2026-10-21、3-4（グループの画面）と 3-5（シート）は 2026-10-22 に済み、この項目は終わった。次は Phase 2 の次の項目（API につなぐか、リアルタイムか。始めるときに順番を相談する）

あとでやってよいこと：要件IDの対応表を作り直すスクリプトを `tools/` に置き、手で書いた部分（状態の行、要件に対応しない設計）を残す作りにする（いまはリポジトリにない：[learnings](learnings/2026-10-15-regenerated-doc-drops-manual-parts.md)）。それまでは対応表を手で直す。

- 2026-10-12（終わり）：実装の前の道具の見直し（下の「工程ごとの道具の見直し」）。足したもの：`.claude/rules/api.md`、`access-reviewer`、GitHub Actions のテスト。開発環境はリポジトリの直下に1つの `package.json` で作った（[architecture](design/architecture.md) の「リポジトリの構成」）
- 要件定義は 2026-10-04 に一度確定したが、その後に足したもの（検索 NFR-019、独自ドメイン NFR-020、リアルタイム NFR-003 の見直し、名前の重複を保存先で守る NFR-006 (11)、確認メールの流れなど）があるので、requirements・use-cases・用語集は「レビュー待ち」に戻っている。小さく試した後にまとめて見直して「確定」にする
- 技術の方向：
  - 画面は React＋TypeScript＋Vite、検索に出すページは素の HTML（[ADR 0004](adr/0004-frontend-react-typescript.md)、決定）
  - バックエンドは案 C：Cloudflare Workers（API は Hono）＋D1、リアルタイムは Durable Objects＋WebSocket で「変わったこと」を配る、認証はログインする人だけ Firebase Authentication（ログインなしの人の匿名ログインはやめる）、ドメインは Cloudflare Registrar の `.com`（[ADR 0003](adr/0003-backend-selection.md)、2026-10-10 に決定。ADR 0001 を置き換え）
  - 費用：有料プランには上げない。無料枠を超えたらその日は止まるのを受け入れる。Cloudflare で有料にしない決まり（R2 を有効にしない等）は ADR 0003 にある
- 2026-10-04 に決めたこと（ユーザー）：リアルタイムは「行った」の付け外しだけ（数秒の遅れは可）、名前の重複は保存先でも防ぐ、問い合わせはアプリの中のフォーム（API＋D1＋Turnstile）、匿名ログインはやめる
- 2026-10-10（終わり）：必須の6つの残り（2：本物の証明書、4：確認メール）も済み、ADR 0003 を「決定」にした。続けて architecture・data-model・auth-flow を案 C で書き直した。ユーザーと決めたこと：作成者はメンバーの印 `is_owner` で持つ（試作の `owner_member_id` から変更）、メールアドレスは D1 に持たない。用語集の匿名・認証済み・昇格・枠は「使わない言葉」にした
- 2026-10-04（後半）：小さく試すのをローカルで始めた（[spike/](../spike/README.md)）。「通らなければ考え直す2つ」はローカルでは通った。同じ日にユーザーがドメイン `tabikaigi-map.com` を Cloudflare で取った（アカウントもできた）。Firebase のプロジェクト（ID `tabikaigi-map`）もできた。2026-10-05 に試作を `tabikaigi-spike.tabikaigi.workers.dev` に置いて測り、「通らなければ考え直す2つ」は本番でも通った（Worker を通らない招待URL、CPU は最大 7ms）。同じ日に D1 の決まり（20人、名前の重複、1アカウント1メンバー、最後の退出）もローカルで守れた。2026-10-09 にリアルタイム（Durable Objects＋WebSocket）もローカルで動いた（2つのタブで確認）。残りは ADR 0003 の「そのほか」（本物の証明書、スマホと無料枠の消費は本番で、止まったときの応答など）
- 2026-10-10（後半）：ADR 0003 の必須の6つのうち、3（止まったときの応答）と5（無料枠の見積もり）をローカルと見積もりで済ませた（試作は `feat/pre-decision-checks-1-2`）。残りは 2（本物の証明書）と 4（確認メール）で、どちらも Firebase の利用者を作るユーザーの作業が要る
- 2026-10-10：`/review-docs`（24件）を反映。ADR 0003 に「決定の基準」（必須の6つ）を決め、各項目に済・未の印を付けた。Firebase の初期設定（課金なし、アナリティクスは連携済みだが何も送られない）をユーザーが確かめた
- 経緯は git の履歴と [learnings/](learnings/) を参照。2026-10-10 の学び：試した結果は本文にも入れる。2026-10-04 の学び：前提の思い込み（SEO・JS の経験・サーバーのコード）、推奨が変わったときの反映漏れ、逃げ道の移行コスト

**次にやること（この順で）：**
1. ~~ADR 0003・0004・NFR-019 のレビューと `/compound`~~（2026-10-04 に済んだ）
2. ~~ユーザーが PR #16 を確かめてマージする~~（済んだ）
3. ~~ユーザーの作業：Cloudflare のアカウントとドメイン、Firebase のプロジェクト~~（2026-10-04 に済んだ：`tabikaigi-map.com`（期限 2027-10-04、自動更新）、Firebase `tabikaigi-map`（Spark））
4. ~~小さく試す：通らなければ考え直す2つ（招待URL、CPU）、D1 の制約、リアルタイム~~（2026-10-04〜10-09 に済んだ → [spike/](../spike/README.md)）
5. **ADR 0003 の決定の前に必須の残り4つ**（ADR 0003 の「決定の基準」）。ブランチは `feat/…`、試作は `spike/` に足す
   1. ~~止まったときの応答の形（NFR-009・NFR-012）~~（2026-10-10 にローカルで済んだ：API は JSON の 503、画面は「いまは使えない」を出して変更を送らない。本番での実際の枠切れの応答は Phase 2 で確かめる → [spike/](../spike/README.md) の 6）
   2. ~~ログインしている人の「行った」を、紐づいたメンバーがいる全グループの部屋に配る形と、無料枠の見積もり~~（2026-10-10 に見積もり済み：約5％。1人が約38グループ以上で枠に近づく。上限を置くかを Q-032 でユーザーに聞く → [spike/](../spike/README.md) の 7）
   3. ~~本物の Firebase の証明書で、Worker のログインの確認が通るか~~（2026-10-10 にローカルで済んだ：テスト用の利用者の ID トークンで 200 と `uid` → [spike/](../spike/README.md) の 8）
   4. ~~確認メールの流れ（REQ-057）~~（2026-10-10 に推奨どおり決定：確認前は紐づけを断る、確認後は元の端末でトークンを取り直して紐づける。断る処理の試しは紐づけの API を作る Phase 3 で → ADR 0003 の基準4）
   - 本番で試すときは、Cloudflare のトークンを作り直す（いまのものは 2026-10-12 に切れる。D1 の権限を足す）
6. ~~結果で ADR 0003 を「決定」にし、ADR 0001 を置き換える~~（2026-10-10 に済んだ）
7. **次はここ**：選んだ構成に合わせて ~~architecture・data-model・auth-flow を書き直し（ER 図などのデータの形はユーザーと一緒に確かめる）~~（2026-10-10 に下書きと `/review-docs`（26件）の反映。作成者の持ち方は [ADR 0005](adr/0005-owner-flag-on-member.md)、Q-018 決定、REQ-060（10グループまで）を追加、色は10色、ログインなしでも同じ名前の確認を出す）、要件IDの対応を付け、基本設計の Q を決める。~~権限マトリクス~~（2026-10-10 に下書き、2026-10-11 に `/review-docs`（14件）を反映：[permissions.md](design/permissions.md)）、~~Q-020（画面遷移の抜け）~~（2026-10-11 に決定：[screens.md](design/screens.md)）、~~Q-017（端末に覚える内容）~~（2026-10-12 に決定：[auth-flow.md](design/auth-flow.md)）、~~Q-016（トップの中身と URL）~~（2026-10-12 に決定：[screens.md](design/screens.md)）、~~残りの基本設計の Q（Q-014・Q-022・Q-025〜Q-028・Q-030・Q-031）~~（2026-10-12 に推奨案で決定：[architecture](design/architecture.md)、[privacy](design/privacy.md)）、~~要件IDの対応~~（2026-10-12：[traceability](design/traceability.md)）、~~構成図とワイヤーフレーム~~（2026-10-12：[architecture.drawio.svg](design/architecture.drawio.svg)、[wireframes.drawio.svg](design/wireframes.drawio.svg)）。~~この変更の `/review-docs` → `/compound`~~（2026-10-12 に済んだ）。続けて Phase 1 の残り（~~開発環境~~、~~保存先で守るもののテスト~~、~~OGP~~、~~LICENSE~~。2026-10-16 に済んだ）

各ステップは「作る → `/review-docs` → 直す → `/compound`」で進める。

## Phase 0：要件定義（やり直し）

たたき台の要件（本人確認、ログインあり／なし、合算・紐づけ、メンバーの管理、人数、招待URL）は決定済み → [requirements.md](requirements.md)。これを SE の要件定義の形に整える。

- [x] **用語集**を作る（メンバー、行った、紐づけ、合算 など言葉をそろえる）→ [glossary.md](glossary.md)
- [x] **ユースケース**（誰が何をするか）を洗い出す（レビュー待ち）→ [use-cases.md](use-cases.md)。図は Mermaid、清書は draw.io
- [x] **未決事項を決める**（要件定義の段階のもの：Q-001〜Q-009、Q-015）→ [open-questions.md](open-questions.md)。use-cases・requirements・用語集・design に反映した
- [x] 反映した内容を `/review-docs` でレビューし、直す（2026-10-02。残りは基本設計の Q-019〜Q-022 と、REQ を振るときの「名前の決まり」へ）。前回のユースケースのレビューの中・軽の指摘は一覧が残っていなかったため、今回のレビューで代わりにした
- [x] requirements.md を**要件ID付きの機能一覧**（REQ-001…）と非機能要件（NFR-001…）に作り直す（2026-10-02。名前の決まり REQ-009〜REQ-011 は推奨案で決定：Q-024）
- [x] 非機能要件に運用（アクセス解析、無料枠の監視、エラーの把握）を入れる（2026-10-02。NFR-008・NFR-010〜NFR-014。方法は基本設計の Q-025〜Q-028）
- [x] `/review-docs` でレビュー → 直す（2026-10-03。31件。決める項目はユーザーと決め、画面の抜けは Q-020、無料枠の対策は Q-031 へ）
- [x] **要件定義を確定**（2026-10-04。requirements・use-cases・用語集。用語集の残りの指摘は基本設計で直す）

## Phase 1：基本設計・詳細設計

たたき台の設計書（構成、データ、認証、画面）と ADR は作成済み。要件IDとの対応を付けて仕上げる。

- [x] Firebase の調査と、それを踏まえた設計の見直し
- [x] 設計書を分けて書く（要件、構成、データ、認証、画面）
- [x] **最初に**：技術選定（Q-023）を比べて決め、新しい ADR を書く（2026-10-10：[ADR 0003](adr/0003-backend-selection.md) で案 C に決定）
- [x] 設計書に要件IDの対応を付ける（2026-10-12：[design/traceability.md](design/traceability.md)）。基本設計の段階の未決事項も決めた（2026-10-12。Q-010・Q-014・Q-019 は本番で確かめるまで暫定）
- [x] **システム構成図とワイヤーフレーム**を draw.io で作る（2026-10-12：[architecture.drawio.svg](design/architecture.drawio.svg)、[wireframes.drawio.svg](design/wireframes.drawio.svg)）
- [x] **権限マトリクス**（誰が何をできるか）を表で作る（2026-10-10、[design/permissions.md](design/permissions.md)。下書き）
- [x] `/review-docs` でレビュー → 直す（2026-10-15：23件。API の変更は `access-reviewer` にも見てもらった）
- [x] 画面の作り方を決める（2026-10-04：React＋TypeScript＋Vite、検索に出すページは素の HTML。[ADR 0004](adr/0004-frontend-react-typescript.md)）
- [x] **技術選定を確定する**（[ADR 0003](adr/0003-backend-selection.md)、2026-10-10 に案 C で決定）：Cloudflare の課金の道を調べて決まりを書く → ドメインを取る → 小さく試す → 決定。Firebase が前提の設計書と Q（Q-011〜Q-014・Q-019・Q-021・Q-022）は、決めてから書き直す
- [x] 開発環境を用意する（2026-10-12：Node.js 22、wrangler、Vitest。リポジトリの直下の `package.json`、`api/`、`migrations/`。`npm test` で API と D1 のテストが動く）
- [x] 保存先で守るもの（NFR-006 の (1)〜(13)）を実装してテストする（ローカルで済んだ。本物の D1 での確かめは Phase 2 の〔未〕。API と D1 の制約を Vitest で。[権限マトリクス](design/permissions.md)の × の欄）
  - [x] D1 の制約（2026-10-12：[migrations/0001_init.sql](../migrations/0001_init.sql)、[api/test/schema.test.ts](../api/test/schema.test.ts)。トリガーと部分 `UNIQUE` はローカルで通った。本物の D1 では Phase 2 の最初に確かめる〔未〕）
  - [x] API で守るもの（ID トークンの確かめ、メンバーの番号と `uid`、「作成者のみ」、0行のときの理由。2026-10-13：[api](design/api.md)、`api/test/groups-api.test.ts`・`manage-api.test.ts`。`access-reviewer` のレビューを2回受けて直した。ローカルで確かめた。本物の D1 での確かめは下の〔未〕）
    - [x] ID トークンの確かめ、グループの作成・参加・開く・「行った」（2026-10-13：[api](design/api.md)、`api/test/groups-api.test.ts`）
    - [x] 紐づけ、名前の変更、退出、メンバーの削除・グループ名の変更・グループの削除・管理できる人の変更、退会、グループ一覧（2026-10-13：`api/test/manage-api.test.ts`）
- [x] 追加する画面を決める → [design/screens.md](design/screens.md)（2026-10-12：Q-016・Q-020 で、検索に出すページとアプリの画面、URL を決めた）
- [x] 固定の OGP 画像と文言を用意する（2026-10-16：[assets/ogp.png](../assets/ogp.png)、文言は [architecture](design/architecture.md) の「招待URLのプレビュー（OGP）」）

## 運用ルール（Phase 1 の中で決める）

- [x] 開発の道具（ルール、サブエージェント、Skill、学びの記録）
- [x] Claude の権限（deny / ask）と作業ログ（成功・失敗の両方を記録）
- [x] プルリクエストの運用と main のブランチ保護
- [x] LICENSE を決める（2026-10-16：ドキュメントを含めて MIT。地図データは対象外で、出典と条件を [NOTICE.md](../NOTICE.md) に書いた。広告を入れる予定なので、地図データを営利でも使える国土数値情報 N03 に替えた：[ADR 0007](adr/0007-map-data-n03.md)。地図データの出典は画面にも書く：[screens](design/screens.md) の「画面のルール」）
- [x] 利用状況の把握（何グループが使っているか）：方法の選定（[NFR-010](requirements.md)、Q-025）と、プライバシーポリシーへの記載（NFR-008、Q-028）（2026-10-12：D1 から数える。書く項目は [privacy](design/privacy.md)。運営者の氏名・住所は 2026-10-16 に「請求があれば遅滞なく回答する」に決めた）
- [x] 無料枠の監視（NFR-011・NFR-012、Q-026）、エラーの把握（NFR-013、Q-027）（2026-10-12：週1回の確認、Sentry の無料プラン）

## 工程ごとの道具の見直し

各 Phase を始める前に、サブエージェント・Skill・ルール・CI が足りているかを見直す。いまの見通し：

| 工程 | 追加を検討するもの |
|---|---|
| 基本設計 | 画面設計のレビューは既存の `design:design-critique` を使う（2026-10-04 に決定。新しい `ui-reviewer` は作らない）。構成図とワイヤーフレームは接続済みの draw.io のツールを試す（`.drawio.svg` で保存できるかは要確認）。技術の比較と ADR（既存の `researcher` と、Skill の `engineering:architecture` を試す）。権限マトリクスは NFR-006 の (1)〜(13) を出発点にする |
| 保存先で守るものの実装の前 | 2026-10-12 に見直した。**足した**：`access-reviewer`（API と D1 の制約を、攻撃する側の目で見る。Firestore をやめたので `rules-reviewer` から名前を変えた）、`.claude/rules/api.md`（下の行から前倒し）、GitHub Actions でプルリクエストごとに型の確かめとテストを動かす（公開リポジトリは無料。外の部品はコミットの番号で固定）。**足さない**：サンドボックス（`/sandbox`）は、いまの deny／ask と作業ログで足りており、ローカルのテストしか動かさないため。困ったら見直す |
| 実装（Phase 2）の前 | 2026-10-16 に `researcher` で1人＋AI の開発の道具を調べて決めた。**足す**：`/code-review` を push の前に毎回、ESLint＋Prettier（[ADR 0009](adr/0009-lint-eslint-prettier.md)。推奨は Biome だったがユーザーが ESLint を選んだ）と Claude Code の hooks、Dependabot（脆弱性の修正 PR と、npm は週1回・Actions は月1回の版上げ、出てから7日待つ）、`test` を必須のチェックに、`.dev.vars*` を `.gitignore` に、CLAUDE.md に「新しい部品は `npm view` で実在を確かめる」「テストを変えたら差分を先に見せる」。**公開の前**：CodeQL。**画面ができたら**：Playwright Test の E2E を入れるかを決める（それまではアプリ内のブラウザで確かめる）。**足さない**：`test-writer`（ルールで足りる）、husky などのコミット前の確かめ（CI の必須のチェックで足りる）、Renovate（外のアプリに権限を渡す）、Playwright CLI（MCP で足りなくなったら）。secret scanning と push protection はもう有効だった。**いまある道具の見直し**（2026-10-17）：`access-reviewer` の範囲に部屋（WebSocket）・問い合わせ（Turnstile）・配信の設定を足した。`.claude/rules/sql.md` にマイグレーションの決まりを足した。`doc-reviewer`・`researcher`・`/review-docs`・`/compound` はそのまま。**2026-10-19 に足した**：`coder`（決まった設計に沿ってコードとテストを書く。設計にないことは止まって報告し、テストの期待する値と docs は変えない）。チケットは使わず、項目を小分けにしてロードマップに書く。**2026-10-19 に足した（3-1）**：画面のルール `.claude/rules/web.md`（Q-017 の覚える内容、エラーの理由と知らせ、出典、スマホ幅、計算だけのテスト）。**後で**：テストのルール `.claude/rules/test.md`（画面のテストか E2E を足すとき）、`/deploy` の Skill（最初の本番のデプロイで手順を飛ばしそうなら）。画面のレビューは `design:design-critique` と `design:accessibility-review` |
| 公開（Phase 2 の終わり）の前 | **Strix**（下のメモ）。**公開から**：GitHub Issues（友達からの報告とバグの受け口。直す PR に `Closes #番号` を書く。2026-10-19 に、βテストの前から公開の時に早めた） |
| 要件定義の後 | docs の自動チェック（Markdown の書式、Mermaid の構文、リンク切れ） |

### 導入を検討している道具（メモ）

導入する前に `researcher` で最新の情報を調べ、ADR か learnings に判断を残す。

- **Playwright CLI**：Claude が実際にブラウザを動かして、画面の操作や表示を確かめる（E2E テスト、スクリーンショット）。
  - 目的：スマホ幅での表示、参加 → 塗る → 別の人の画面に反映、の流れを自動で確かめる
  - 要調査：CLI と MCP（Playwright MCP はすでに接続済み）、アプリ内蔵のブラウザとの使い分け、CI で動かす方法
- **Strix**：AI エージェントがアプリを攻撃する側の目で調べ、セキュリティの弱点を見つける。
  - 目的：API やルールの抜け道、他人のグループを読み書きできないか、などを公開前に確かめる
  - 注意：**調べてよいのは自分のアプリだけ**。本番ではなく、エミュレータかテスト用のプロジェクトに対して実行する
  - 要調査：導入方法、必要な環境（Docker、LLM の API キーなど）と費用、選んだ構成で使えるか

## Phase 2：MVP①（ログインなし）

（ADR 0003 で案 C に決まった（2026-10-10））

項目を始めるときは、プルリクエスト1つ分の大きさに分け、その項目の下に小分けのチェックリストを書く（例：Vite の空の画面がビルドできる → 地図の部品 → メンバーの一覧 → API につなぐ）。チケット（GitHub Issues）の代わりで、コードは小分けの1つずつ `coder` に任せてよい（2026-10-19、CLAUDE.md の「進め方」）

- [x] 始める前に「デプロイとテーブル定義の変更（マイグレーション）の手順書」を作る（2026-10-16：[deploy](design/deploy.md)。デプロイは PC から手で、ステージングは作らない：[ADR 0008](adr/0008-deploy-from-pc-no-staging.md)。〔未〕の確かめは最初の本番のデプロイで）
- [x] Vite＋React＋TypeScript の構成を作り、モックの画面を React の部品に書き直す（ADR 0004）。`eslint-plugin-react-hooks` を入れ、ESLint の型を使うチェックと `tsconfig` の範囲を画面にも広げる（[ADR 0009](adr/0009-lint-eslint-prettier.md) の「結果と注意」）、`npm run deploy` に画面のビルドを足す
  - 小分け（2026-10-19 にユーザーと決めた。上から順に、1つずつプルリクエストにする。画面のテストは、切り出した計算だけを Vitest で書く：[architecture](design/architecture.md) の「開発環境」）：
  - [x] 3-1 `chore/web-setup`（2026-10-19：素の Vite にした：[ADR 0010](adr/0010-plain-vite-with-wrangler-dev.md)）：Vite＋React＋TypeScript を入れ、`web/` の空の `app.html`（「旅会議マップ」と出るだけ）がビルドできる。画面用の `tsconfig`（ブラウザの型）、ESLint の型を使うチェックと `eslint-plugin-react-hooks` を `web/` に広げる、CI と `npm run deploy` に画面のビルドを足す、`.claude/rules/web.md` を書く。部品を入れるのでメインが書く。始めに、Cloudflare の Vite のプラグインを使うか（API と画面を1つの開発サーバーで動かせる）を `researcher` に調べてもらい、結果を見せて決める（[architecture](design/architecture.md) の「リポジトリの構成」の見直しの条件）
  - [x] 3-2 `feat/web-delivery`（2026-10-21。ローカルの `wrangler dev` で確かめた。本番は最初のデプロイで）：配信の設定。`wrangler.jsonc` の `assets`（`/api/*` だけ Worker が受ける）、`_redirects`（`/g/*` とアプリの URL → `app.html`）、`_headers`（`noindex`、`Referrer-Policy`）。[architecture](design/architecture.md) の「検索に出すページと出さないページ」のパスの一覧どおりにし、ローカルの `wrangler dev` で確かめる。配信の設定なので `access-reviewer` に頼む。この前に、手元の D1（`.wrangler/`）を作り直してもらう（[deploy](design/deploy.md)）
  - [x] 3-3 `feat/web-map`（2026-10-21。地図は押すだけで、キーボードと読み上げでは選べない。代わりの道は 3-4 の地方ごとの一覧）：地図の部品（`tools/paths.json` から県を描く、押した県を知らせる、塗りの色）。色の濃さの計算はモックの式のまま
  - [x] 3-4 `feat/web-group-screen`（2026-10-22。端末がメンバーを覚えていないときは「みんな」から始めて「わたし」を押せなくした（仮。参加の画面は 3-5 と本物の招待URLの項目））：グループの画面（わたし／みんな／メンバー別、まとめの数、凡例、まだ誰も行っていない県、一覧、県の詳細のシート）。データは、この項目ではモックと同じ `localStorage`（API につなぐのは次の項目）。`/g/`（グループIDがない）や形の違う ID でも `app.html` が返るので、画面で ID の形を確かめる（2026-10-21：`/code-review`）。地方ごとの一覧（REQ-055）はボタンにして、キーボードと読み上げでも県を選べる道にする（地図は押すだけのため）。メンバーの10色は data-model の「色」の表のとおり（2026-10-22 に決めた）。2026-10-22 にユーザーと決めた：URL ごとの画面の切り替えは React Router（[ADR 0011](adr/0011-routing-react-router.md)。推奨は自分で書く案だった）。画面に渡すデータは API の応答（グループを開く）と同じ形にし、端末が覚えるメンバーも本番と同じ形（グループIDごとに番号と名前：auth-flow の「端末が覚えるもの」）にする。ヘッダーはグループ名・トップへ・招待のボタン（シートは 3-5）、メニューのボタンはグループ設定の項目で足す。一番下の「プライバシーポリシー・お問い合わせ」はいま置く（ページはまだない）。形が違うグループIDの文は screens の「API の応答と画面の動き」。API につなぐまでは、形が正しい ID ならどれでも仮のグループを出す
  - [x] 3-5 `feat/web-sheets`（2026-10-22。閉じられないシートの中にも「トップへ」と一番下のリンクを置いた）：グループ作成・参加・招待のシートを、モックと同じ動きで（API・Turnstile・本物の招待URLは後の項目）
  - モックの `index.html` と `tools/template.html` は、検索に出すページを作る項目まで残す（配るのは `web/` のビルド結果だけ）
- [ ] リアルタイムの共有（NFR-003）：Durable Objects ＋ WebSocket で「行った」の変更を配る
- [ ] `localStorage` の読み書きを API（Hono＋D1）に置き換える（`web/src/data/store.ts` の中身を替える。3-4 の仮の形（どのグループIDでも仮のグループ、覚えていなければ「たろう」として参加したことにする、`tabikaigi-dev-visits:` のキー、`data/demo.ts`）は必ず消す。読めなかったときの文も決め直す。3-5 の仮の形（作成・参加の localStorage、`tabikaigi-dev-group:` のキー、`data/ids.ts`、`demoNameKey`）も消し、グループ作成から渡す作ったメンバーの番号（router の state）は API の応答で確かめる。端末が覚えるメンバーだけは `localStorage` に残す：Q-017）
  - 小分け（2026-10-23 にユーザーと決めた。上から順に、1つずつプルリクエストにする）。API は Phase 1 で作ってあり（[api](design/api.md)）、この項目は画面の側（`web/src/data/`）を替える。ログインと紐づけ（Phase 3）、リアルタイム（次の項目）は入れない
  - [ ] 4-1 `feat/web-turnstile`：ボット対策（Turnstile）のウィジェットの部品。グループ作成と参加の「作る」「参加する」の上に置き、送るたびに新しいトークンを取る（screens の「参加の画面」）。部品を入れずに Cloudflare の読み込み用のスクリプトで作る。手元では Cloudflare の試験用の鍵（いつも通る）を使う。まだ API には送らない
  - [ ] 4-2 `feat/web-api`：`web/src/data/` の中身を API に替える（開く、「行った」の付け外し、作る、参加する）。`X-Tabikaigi: 1` を付ける。応答の `error` ごとの文と行き先は screens の「API の応答と画面の動き」と「知らせ」のとおり（`404 group_not_found` で端末の覚えを忘れてエラー、`409 already_member`、`group_full`、`name_taken`、`turnstile_failed`、`429`、`503`、JSON でない応答）。3-4・3-5 の仮の形（上の括弧の中）を消す。手元の `.dev.vars` に試験用の秘密の鍵を入れてから始める（運営者が入れる）。API・配信に触れるので `access-reviewer` に頼む
  - [ ] 4-3 確かめ：手元の `wrangler dev` で、2つのブラウザ（または通常とプライベート）を使い、作る → 招待URLを開く → 参加する → 塗る → もう片方で開き直すと見える、を通す。同じ名前の確認、満員（20人）、消えたグループ（404）も。結果を roadmap に書く（コードの変更がなければプルリクエストは作らず、4-2 の中で済ませてもよい）
- [ ] iPhone の Safari と Chrome で、しばらく開かないと `localStorage` とログインの状態が消えるかを実機で確かめる（Q-017）
- [ ] 本物の招待URL（匿名認証は使わない：ADR 0003）
- [ ] グループ設定：グループ名の変更、管理できる人、メンバーの削除、グループの削除、退出（最後の1人ならグループも削除）
- [ ] 検索に出すページ（トップ、使い方、プライバシーポリシー）を素の HTML で作る。アプリの画面に `noindex`、sitemap（Google Search Console は、検索から来る人の数を知りたくなったら登録する：Q-025）（NFR-019、[architecture](design/architecture.md) の「検索に出すページと出さないページ」）
- [ ] 基本設計で Phase 2 に回した確かめ（〔未〕。どれも公開の前に必須）：
  - 〔未〕Cloudflare Web Analytics と、Firebase の Google アナリティクスの連携が切れているか（Q-025）
  - 〔未〕グループを開くときの `last_opened_on` の0行の更新が書き込みに数えられないか（`meta.rows_written`。Q-025）
  - 〔未〕Workers Logs の `invocation_logs` を切ると IP・場所・URL が残らず、自分のログは残るか（Q-027）
  - 〔未〕Sentry：アカウントを作る前の確認（試用、組織の名前、カード）、送った中身にグループID・ID トークン・ヘッダーがないか、SDK を入れた CPU 時間（Q-027・[ADR 0006](adr/0006-error-tracking-sentry.md)）
  - 〔未〕WAF のレート制限の回数と、止めたときの 429 を画面が見分けられるか（Q-031）
  - 〔未〕`not_found_handling` と `_redirects` の 200 リライトを合わせた動き、`workers.dev` を切る（Q-031）
  - 〔未〕集計用の D1 の読み取りだけの API トークンを作れるか（Q-025）
  - 〔未〕Firebase の API キーを「HTTP リファラー」で絞らない（アプリの画面は `no-referrer` なので、ログインが断られる）。「使える API」で絞り、architecture に書く。API の応答にも `X-Robots-Tag: noindex` を Hono の最初の処理で付ける（`/api/health` だけが 200 のため急がない）（2026-10-21：`access-reviewer` #4・#8）
  - 〔未〕グループを開く・グループ一覧・「行った」の付け外し・名前の変更（グループ名・メンバー）で、本物の D1 が数える `rows_read`・`rows_written`。使い切られる見積もり（[architecture](design/architecture.md) の「無料枠を使い切られないために」）を測り直し、レート制限の回数と、応答を数秒キャッシュするかを決める
  - 〔未〕Turnstile のウィジェットのドメインの制限と、応答の `hostname` を確かめるか（[api](design/api.md)）
  - 〔未〕Durable Objects の動いている時間（GB 秒）と眠れる書き方の効き方
  - 〔未〕無料枠を超えたときに API が実際に返すエラー（D1・Workers・Durable Objects）。D1 の枠切れのエラーの文が分かったら、API の 503 に `reason: "quota"` を付けて「一時的な失敗」と分ける（いまは全部 `temporary`：[api](design/api.md)）
- [ ] 最初の本番のデプロイ（[deploy](design/deploy.md) の「最初のデプロイ」）と、そこにある〔未〕の確かめ（配信の設定：GET 以外・大文字・`%61pi`・`//api/…`・`/api` で Worker が動かないか、動くなら WAF の式を `lower(…)` で広げる、独自ドメインを `wrangler.jsonc` の `routes` に書くか、管理画面のセキュリティのイベントに残るパス（architecture の「ログに残るもの」に足す）。2026-10-21 の `access-reviewer` #1・#5・#9・#10。トークンの権限、本物の D1 の書き出し、わざと失敗するマイグレーション、Time Travel の巻き戻しと取り消し、バックアップからの作り直し、`rollback` で静的アセットが戻るか、デプロイで部屋の接続が切れるか）。どれも公開の前に必須
- [ ] 公開の前に、相談・確かめ（Phase 1 で決めたことの確かめ）：
  - 〔未〕個人情報保護法相談ダイヤルに、運営者の氏名・住所を「請求があれば遅滞なく回答する」と書く形でよいかを電話で聞く（ユーザーが行う。[privacy](design/privacy.md)）
  - 〔未〕招待URLを LINE と X で実際に送り、OGP のカードの表示を確かめる。変えたら LINE の Page Poker で覚えたものを消す（[architecture](design/architecture.md) の「招待URLのプレビュー（OGP）」）
  - 〔未〕地図データの出典が、グループの画面・トップ・使い方の一番下に出ているか（[screens](design/screens.md)）。N03 のページにある「測量法に基づく国土地理院長承認（複製）」が、加工した形を使うときにも手続きを求めるかを、国土数値情報の問い合わせ窓口で確かめる（要確認：[ADR 0007](adr/0007-map-data-n03.md)）
- [ ] 公開の前に、試作の Worker（`tabikaigi-spike.tabikaigi.workers.dev`）と試作の D1 を消す（本番と同じアカウントの無料枠を使い、公開されたままのため）
- [ ] 独自ドメインで公開し（NFR-020）、友達グループで使ってもらう。友達に最初の招待URLを渡した日を「公開」とし、ここに日付を書く（公開の前と後でマイグレーションの決まりが変わる：[deploy](design/deploy.md)）

## Phase 3：MVP②（ログインあり）

- [ ] メール＋パスワード（パスワードの再設定を含む）、Googleログイン
- [ ] グループの切り替え、アカウントの「行った」の同期、合算、紐づけ
- [ ] マイページ、ログアウト、退会、自分の名前の変更
- [ ] ログインなしのメンバーを、ログインしたアカウントに API で紐づける（匿名からの昇格 Q-013 は使わない）

## Phase 4：βテスト → 拡張

- [ ] 実際の友達グループで試す
- [ ] 運営者用の管理画面を作る（多くの人に使ってもらえるかを確かめるため。MVP の次に優先して作る：Q-030）
- 拡張の候補：広告（友達以外にも使われ始めてから。Q-029）、行き先の投票、訪問のレベル分け（通過・宿泊・住んだ）、市区町村単位、グループごとの OGP
