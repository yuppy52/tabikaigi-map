# 第三者のデータ

このリポジトリは、ドキュメントを含めて [MIT License](LICENSE) で公開しています。ただし、次のデータは MIT の対象外で、それぞれの配布元の条件に従います。

## 地図データ

- 対象：`tools/paths.json`（都道府県の形）と、それを埋め込んだ `index.html`・`assets/ogp.png`（配る写しの `web/public/ogp.png` も同じ）
- 出典：国土交通省国土数値情報ダウンロードサイト（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html）
- 「国土数値情報（行政区域データ）」（2025年版）を加工して作成（島ごとの形を都道府県にまとめ、小さな島を除き、線を間引いて SVG のパスに変換）
- 条件：国土数値情報の利用約款（CC BY 4.0 互換。商用利用も可）：https://nlftp.mlit.go.jp/ksj/other/agreement.html
- 選んだ理由：[ADR 0007](docs/adr/0007-map-data-n03.md)
