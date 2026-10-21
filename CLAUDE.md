# 旅会議マップ

友達グループで行ったことのある都道府県を日本地図に塗って共有し、次の旅行先を決めるWebアプリ。いまはモック（HTML 1ファイル、`localStorage` 保存）から、Firebase を使った本番版を設計している段階。

## まず読むもの

- 進み具合と次にやること：[docs/roadmap.md](docs/roadmap.md)
- 設計書の目次と書き分けのルール：[docs/README.md](docs/README.md)

要件・設計を変える判断をしたら、該当する docs を更新する。技術の選択肢を比べて決めたときは `docs/adr/` に ADR を足す（確定した ADR は書き換えず、新しい ADR で覆す）。

## 構成

- `index.html`：ビルド結果。直接編集しない
- `tools/template.html`：モックの画面のソース
- `tools/`：地図データの生成とビルド（`npm run build` で `index.html` を作り直す）
- `web/`：画面（Vite＋React。`npm run dev` で画面と API を一緒に起こし、`http://localhost:5173/app.html` を開く。`npm run build` で `dist/` にビルド：[ADR 0010](docs/adr/0010-plain-vite-with-wrangler-dev.md)）
- `api/`：API（Hono）とそのテスト。`migrations/`：D1 のテーブル定義。リポジトリの直下で `npm test`（API と D1 の制約、画面の計算のテスト）、`npm run typecheck`、`npm run lint`（ESLint）、`npm run format:check`（Prettier）。プルリクエストごとに GitHub Actions でも動く（`test` が通らないとマージできない）
- `docs/`：要件、設計、ADR、ロードマップ
- `docs/learnings/`：過去の失敗や判断の記録（tags 付き）。設計やレビューの前に、関係するものを探して読む
- `.claude/rules/docs.md`：ドキュメントの書き方（要件ID、状態、図の使い分け）
- `.claude/rules/sql.md`：SQL（D1）の書き方
- `.claude/rules/api.md`：API（Hono）の書き方
- `.claude/rules/web.md`：画面（React）の書き方
- `.claude/agents/`：`researcher`（調査）、`doc-reviewer`（設計書のレビュー）、`access-reviewer`（API・D1 の制約・部屋・配信の設定を攻撃する側の目でレビュー）、`coder`（決まった設計に沿ってコードとテストを書く）
- `.claude/hooks/`：作業ログ、Claude が書いたファイルに Prettier を当てる
- `.claude/skills/`：`/review-docs`（設計書のレビュー）、`/compound`（学びを残す）

## 技術の前提

- **費用**：使った分だけ上限なく請求が来る構成にはしない（個人開発で費用を見積もれないため）。サービスを比べるときは、無料枠だけでなく、費用に上限があるか（超えたら止まるか、請求の上限を設定できるか）を必ず比べる。有料プランや、課金を有効にしないと使えない機能は、入れる前に相談する。月額固定や年額のドメイン代など、決まった額の費用は相談の上で使ってよい
- **鍵と初期設定**：外部サービスの鍵（API トークン、OAuth の許可）は、テンプレートや「おすすめ」を使わず、要る権限だけを選び、期限を付ける。作る前に、お金に関わる権限が入っていないか、自動で付く名前や URL に個人の情報が使われていないかを確かめる（[docs/learnings/2026-10-05-check-service-defaults.md](docs/learnings/2026-10-05-check-service-defaults.md)）
- **部品（npm）**：入れたり上げたりしたら、警告（非推奨、改名）と `npm audit` を見る。high 以上が残るなら、直った版があるかを確かめてから進む。試作の版はそのまま写さない（[docs/learnings/2026-10-13-check-package-renames-and-audit.md](docs/learnings/2026-10-13-check-package-renames-and-audit.md)）
  - 大きな道具を足す前に、元のデータの中身と、いま入っている部品でできないかを先に見る
  - 新しい部品を入れる前に、`npm view <名前>` で実在するか、公開者、公開日、リポジトリの URL を見る。AI は存在しない名前を出すことがあり、その名前で偽の部品が置かれることがある（2026-10-16）
  - 手で入れるときも、公開から7日たった版を選ぶ（新しい版にするなら理由を確かめて書く）。npm 自体が不具合で止まったら、新しい npm（7日たった版）を1回だけ使い、CI と同じ npm の `npm ci` とテストで確かめる（[learnings](docs/learnings/2026-10-13-check-package-renames-and-audit.md)）
- **借りるデータ**（地図、画像、フォントなど）：入れるときに条件を見る。配布元の README だけでなく、元のデータを出しているところの公式の条件を確かめ、商用でよいか・出典の書き方・報告や申請・加工と再配布の4つで比べる。出典は NOTICE.md と画面に書く（[learnings](docs/learnings/2026-10-16-check-upstream-data-terms.md)）
- **バックエンド**：2026-10-04 に、第一候補を Firebase 一式から「Cloudflare Workers（API は Hono）＋ D1、認証だけ Firebase Authentication（Spark）」に見直し、小さく試した結果で 2026-10-10 に決定した（[ADR 0003](docs/adr/0003-backend-selection.md)、ADR 0001 を置き換え）。有料プランには上げない。要件は特定のサービスに依存させない
- コードは TypeScript で書く。アプリの画面は React ＋ Vite、検索に出すページ（トップ、使い方、プライバシーポリシー）は素の HTML（[ADR 0004](docs/adr/0004-frontend-react-typescript.md)、Phase 2 から）。ユーザーは JavaScript／TypeScript に慣れていないので、コードを見せるときは考え方を一言添える
- アクセス制御（requirements の NFR-006）は保存先の側で守る。API（Hono）と D1 の制約で行い、変えたらテストも更新する

## 進め方

- ドキュメントと画面の文言は日本語で書く
- Firebase などの技術調査は、`researcher` サブエージェントに任せて結果を受け取る
- 調査を頼む前に、結論を左右する前提（お金を得るか、規模、扱う情報、ユーザーの経験や好み）をユーザーに確かめる。確かめられないものは、依頼文と記録の両方に「仮定」と書く
  - 条件（ライセンス、法律、料金）を調べるときは、いまの状態ではなく、決まっている予定まで含めた一番重い場合で前提を書く（例：広告は MVP では入れないが、入れる予定なので営利として調べる：Q-029）（[learnings](docs/learnings/2026-10-03-confirm-premises-before-research.md)）
- ユーザーに論点を決めてもらうときは、関係の深い論点をまとめ、前提の仕組みと具体的な場面を説明し、推奨案と理由を添えてから聞く
  - 「なぜそうなるか」（判断の順番など）と場面の手順（1. 2. 3.）を最初から書く。推奨しない案は、手間を具体的に（表・SQL・テストがいくつ増えるか）書き、推奨の理由は手間ではなく本当の理由で書く（[learnings](docs/learnings/2026-10-02-explain-context-before-decisions.md)）
  - 道具やサービスの設定を決めてもらうときは、まず「それは何か」を一言で書き、たとえで仕組みを書く。案の違いの前に「できあがりの使い勝手が同じか」を書く。HTTP の言葉や応答の番号（PUT、404）は、決めてもらう文に入れない（[learnings](docs/learnings/2026-10-02-explain-context-before-decisions.md)）
- 計画 → 作業 → レビュー（`/review-docs`）→ 学びを残す（`/compound`）の順で回す。作業の区切りでは `/compound` を提案する
- ロードマップの項目を始めるときは、プルリクエスト1つ分の大きさに分け、項目の下に小分けのチェックリストを書く。チケット（GitHub Issues）は使わない。公開の後に、友達からの報告やバグを受けるときから使う（2026-10-19）
  - 小分けを書くときに、各項目が頼る設計書の節で、先送りの書き方（「画面が持つ」「〜で決める」「作るときに書く」「仮の値」）を探す。要る値が決まっていなければ、その項目を始める前にユーザーと決める（[learnings](docs/learnings/2026-10-22-find-undecided-values-before-implementation.md)）
- コードは、小分けの1項目ずつ `coder` サブエージェントに任せてよい（小さな設定の変更はメインが直接書く）。頼む前にメインがブランチを切り、依頼文には、ブランチ名、読む設計書の節と、決まっていること・終わりの条件を書く（[learnings](docs/learnings/2026-10-22-coder-brief-names-the-branch.md)）。`coder` が「決まっていない」と止まったら、メインがユーザーに聞いてから続きを頼む。戻ってきた差分はメインが読み、レビューに回し、考え方をユーザーに説明する（2026-10-19）
- コードを変えたら、push の前に `/code-review` を回す。API・D1 の制約・部屋（WebSocket）・配信の設定（`wrangler.jsonc` のヘッダーやリライト）を変えたら、加えて `access-reviewer` にレビューを頼む
- テストを変えたら（期待する値を直した、テストを消した・飛ばした）、その差分を先にユーザーに見せる。AI は、コードではなくテストの側を直して通すことがある（2026-10-16）
- 工程（ロードマップの Phase）を始める前に、サブエージェント・Skill・ルールが足りているかを見直す
- ロードマップの先の Phase の作業に手を付けるとき（前倒し、項目を広く読むとき）は、始める前に伝えて、理由と推奨を添えて確かめる。作業の報告では、いまどの Phase のどの項目か、何がまだかを一言添える（[learnings](docs/learnings/2026-10-14-say-when-work-jumps-phase.md)）
- API や D1 の変更を確かめてもらうときは、観点（認可・認証・入力・同時に起きたら・失敗したら・漏れるもの・費用・テスト）を説明しながら1つずつ見せる（ユーザーはフロントの経験だけで、バックエンドのレビューを学びたい）

## Git の運用

- main には直接 push できない（ブランチ保護）。作業ごとにブランチを切り、プルリクエストでマージする
- ブランチ名：`docs/…`（ドキュメント）、`feat/…`（機能）、`fix/…`（修正）、`chore/…`（道具・設定）
- **確認は push の前に行う**（2026-10-04 に変更。それまではユーザーがプルリクエストを見てマージしていた）。Claude は作業をコミットしたら、push する前に、何を変えたか（コミットの一覧と、変えたファイルごとの要点）をユーザーに見せる。`git push` の許可の確認（`ask`）で OK をもらったら、それを「マージしてよい」の確認として扱い、Claude が push → プルリクエストの作成 → マージ（`gh pr merge --squash --delete-branch`）まで続けて行う
- push の許可で断られたら、直す点を聞いて、コミットを足してからもう一度見せる
- ブランチ保護はそのまま使う（main への直接の push はしない。必ずプルリクエストを通す）。CI の `test` が通らないとマージできない（ルールセット。2026-10-19）。GitHub の設定は2か所（Branches と Rules）にあり、中身は [architecture](docs/design/architecture.md) の「開発環境」。変えるときは1つずつユーザーに確かめ、ブランチ保護を丸ごと送り直さない
- デプロイと表の変更（マイグレーション）は、マージした後に運営者の PC から [docs/design/deploy.md](docs/design/deploy.md) の手順で行う（[ADR 0008](docs/adr/0008-deploy-from-pc-no-staging.md)）。`wrangler deploy` などの `ask` の OK は、その1回のデプロイの OK として扱う
- 秘密情報（`.env`、`.dev.vars`、サービスアカウントの鍵）はリポジトリに置かない
