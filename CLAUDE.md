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
- `docs/`：要件、設計、ADR、ロードマップ
- `docs/learnings/`：過去の失敗や判断の記録（tags 付き）。設計やレビューの前に、関係するものを探して読む
- `.claude/rules/docs.md`：ドキュメントの書き方（要件ID、状態、図の使い分け）
- `.claude/agents/`：`researcher`（調査）、`doc-reviewer`（設計書のレビュー）
- `.claude/skills/`：`/review-docs`（設計書のレビュー）、`/compound`（学びを残す）

## 決まっている技術

- Firebase（Hosting、Authentication、Firestore）の無料 Spark プランの範囲で作る。Blaze が必要になる機能（Cloud Functions、Cloud Storage など）は、入れる前に相談する
- 画面は素の JavaScript ＋ Vite（Phase 2 から）
- Firestore のアクセス制御はセキュリティルールで行い、ルールを変えたらエミュレータのテストも更新する

## 進め方

- ドキュメントと画面の文言は日本語で書く
- Firebase などの技術調査は、`researcher` サブエージェントに任せて結果を受け取る
- 計画 → 作業 → レビュー（`/review-docs`）→ 学びを残す（`/compound`）の順で回す。作業の区切りでは `/compound` を提案する
- 工程（ロードマップの Phase）を始める前に、サブエージェント・Skill・ルールが足りているかを見直す

## Git の運用

- main には直接 push できない（ブランチ保護）。作業ごとにブランチを切り、プルリクエストでマージする
- ブランチ名：`docs/…`（ドキュメント）、`feat/…`（機能）、`fix/…`（修正）、`chore/…`（道具・設定）
- Claude はコミット、push、プルリクエストの作成まで行う。**マージはユーザーが内容を確認してから行う**
- 秘密情報（`.env`、サービスアカウントの鍵）はリポジトリに置かない
