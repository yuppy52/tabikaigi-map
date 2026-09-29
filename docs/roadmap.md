# ロードマップ

モック（`index.html`）から、友達と実際に共有できるWebアプリにするまでの計画。設計の中身は [docs/README.md](README.md) の各ドキュメントを参照。

## いまどこ？

**Phase 1：設計** の途中。設計書を一通り書いたので、レビューと技術選定の確定を待っている。

## Phase 0：要件を決める ✅

- [x] 本人確認、ログインあり／なし、合算・紐づけ、メンバーの管理、人数、招待URL を決める → [requirements.md](requirements.md)

## Phase 1：設計

- [x] Firebase の調査と、それを踏まえた設計の見直し
- [x] 設計書を分けて書く（要件、構成、データ、認証、画面）
- [ ] **設計書のレビュー**
- [ ] **技術選定を確定する** → [adr/0001](adr/0001-backend-firebase.md)、[adr/0002](adr/0002-frontend-vanilla-vite.md)
- [ ] 開発環境を用意する（JDK 21、Node.js 20、firebase-tools）
- [ ] Firestore のルールを書き、エミュレータでテストする
- [ ] 追加する画面をモックに足す → [design/screens.md](design/screens.md)
- [ ] 固定の OGP 画像と文言を用意する

## 運用ルール（Phase 1 の中で決める）

- [x] 開発の道具（ルール、サブエージェント、Skill、学びの記録）
- [x] Claude の権限（deny / ask）と作業ログ（`.claude/settings.json`）
- [ ] 利用状況の把握（何グループが使っているか）：アクセス解析の選定と、プライバシーポリシーへの記載（外部送信）
- [ ] 無料枠の監視、エラーの把握

## Phase 2：MVP①（ログインなし）

- [ ] Vite の構成に移し、`localStorage` の読み書きを Firestore に置き換える
- [ ] 匿名認証、本物の招待URL
- [ ] Firebase Hosting にデプロイし、友達グループで使ってもらう

## Phase 3：MVP②（ログインあり）

- [ ] メール＋パスワード（パスワードの再設定を含む）、Googleログイン
- [ ] グループの切り替え、アカウントの「行った」の同期、合算、紐づけ
- [ ] 要確認：匿名からメール＋パスワードへの昇格が SDK v12 で動くか（[auth-flow.md](design/auth-flow.md) 参照）

## Phase 4：βテスト → 拡張

- [ ] 実際の友達グループで試す
- 拡張の候補：行き先の投票、訪問のレベル分け（通過・宿泊・住んだ）、市区町村単位、グループごとの OGP
