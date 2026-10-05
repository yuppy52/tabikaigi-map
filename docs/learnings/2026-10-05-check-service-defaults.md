---
tags: [cloudflare, security, permissions, privacy, setup, process]
area: process
---

# クラウドの初期設定は「おすすめ」のまま使わず、権限と自動で付く名前を確かめる

## 何が起きたか

Cloudflare に試作を置く準備で、次のことが続いた。
- 案内の手順（`wrangler login`、MCP の許可）のままだと、広い権限が付く。ユーザーは MCP に「全部の権限」を渡していた
- API トークンのテンプレート「Edit Cloudflare Workers」に、R2（有効にすると上限なく請求されうる）の書き込み権限が入っていた
- workers.dev の名前が、メールアドレスの @ の前から自動で付いていた。そのまま置くと、公開の URL にメールアドレスの手がかりが出る
- AI が `wrangler deploy` すると、workers.dev の名前が確認なしで自動で決まる（`researcher` がコードで確認）
- 権限の名前が新しい役割（Workers の Editor／Admin）に変わる途中で、Legacy の表示があった。初めて Worker を作るには Admin が要る

## 原因

サービスの「おすすめ」や初期値は、すぐ動くことを優先していて、このプロジェクトの前提（費用に上限がない操作をしない、個人の情報を出さない、AI に渡す鍵を最小にする）とは合わない。

## どうしたか

- 置く操作は、自分で権限を選んだ API トークン（Workers の Admin と Account Settings の Read、期限7日）にした。MCP は読み取りだけにする方針にした
- workers.dev の名前を、置く前にユーザーが `tabikaigi` に変えた
- 権限の名前は、公式の説明（Workers roles and permissions）で確かめてから案内した

## 次にどうするか

新しいサービスのアカウントや鍵を作るとき（Firebase の本番の設定、Google Search Console、メールの送信など）は、作る前に次を確かめて、手順に入れる。
- テンプレートや「おすすめ」の権限の中身。お金に関わる権限（有効化すると課金されるもの）が入っていないか
- 自動で付く名前・URL・表示名に、個人の情報（メールアドレス、本名）が使われていないか
- AI が操作すると、確認なしで決まってしまうものがないか
- 鍵の期限と、権限を確かめる方法（AI が書き込んで試すのは、Claude Code の安全装置で止まることがある。画面で確かめてもらう）

## 仕組みへの反映

2026-10-06 に CLAUDE.md の「技術の前提」に「鍵と初期設定」として反映した。

## 関連

- docs/adr/0003-backend-selection.md（C で Cloudflare 側を守る決まり）
- spike/README.md（本番に置く鍵）
- [2026-10-03-confirm-premises-before-research](2026-10-03-confirm-premises-before-research.md)
