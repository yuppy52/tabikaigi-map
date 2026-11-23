# 旅会議マップ

友達グループで「今まで行ったことのある都道府県」を日本地図に塗って共有し、次の旅行先を決めるためのWebアプリ。ログインはなく、招待URLと名前だけで使う。

いまは公開の準備中（[ロードマップ](docs/roadmap.md)）。

## できること

- グループを作り、招待URLを LINE などで送る。受け取った人は名前を選ぶか入れるだけで参加できる（会員登録なし）
- **わたし**：地図か一覧をタップして「行った」を付け外し。ほかのメンバーの画面にすぐ出る
- **みんな**：行った人が多い県ほど濃く塗る。県をタップすると誰が行ったか見られる
- **全員まだ行っていない県**を強調表示（旅行先の候補）
- **メンバー別**：選んだ人の行った県だけを表示

## 構成

```
web/        画面（React＋Vite）。トップ・使い方・プライバシーポリシーは素の HTML
api/        API（Cloudflare Workers の Hono）とテスト
migrations/ データベース（D1）の表の定義
tools/      地図データ（paths.json）と OGP の画像の生成、draw.io の図の描き直し
docs/       要件、設計、ADR、ロードマップ
```

## 動かし方

```bash
npm install
npm run dev          # 画面と API を一緒に起こす。http://localhost:5173/app.html を開く
npm test             # API と D1 の制約、画面の計算のテスト
npm run typecheck
npm run lint
npm run build        # dist/ にビルド
```

地図データを作り直すときだけ、`tools/` で `npm install` の後に `npm run fetch-n03 && npm run gen-n03 && npm run gen-map` を実行する（国土数値情報の全国のデータ、約600MB を落とす。`tools/n03/` に置き、リポジトリには入れない）。OGP の画像（招待URLを送ったときのカード）を作り直すときは、`tools/` で `npm run ogp`（Mac の Chrome とヒラギノを使う）。

## ライセンス

[MIT License](LICENSE)（ドキュメントを含む）。地図データは対象外で、配布元の条件に従う（[NOTICE.md](NOTICE.md)）。

地図データ：「国土数値情報（行政区域データ）」（国土交通省）を加工して作成。出典：[国土交通省国土数値情報ダウンロードサイト](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html)

## 今後

要件・設計・ロードマップは [docs/](docs/README.md) にまとめている。
