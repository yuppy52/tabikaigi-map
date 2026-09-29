# 旅会議マップ

友達グループで「今まで行ったことのある都道府県」を日本地図に塗って共有し、次の旅行先を決めるためのWebアプリ。

いまは **モック**（HTML 1ファイル）の段階。サーバーやDBはなく、データはそのブラウザの `localStorage` にだけ保存される。

## できること（モック）

- 会員登録なし。名前を入れるだけでグループに参加（同じ名前なら、その人として続きから操作）
- **わたし**: 地図か一覧をタップして「行った」を付け外し
- **みんな**: 行った人が多い県ほど濃く塗る。県をタップすると誰が行ったか見られる
- **全員まだ行っていない県**を強調表示（旅行先の候補）
- **メンバー別**: 選んだ人の行った県だけを表示
- グループ作成と招待リンク表示（リンクは仮のもの）

最初から「夏旅2026」というデモグループ（たろう・はなこ・けんじ）が入っている。

## 動かし方

`index.html` をブラウザで開くだけ。スマホ表示を前提にしている。

## ファイル構成

```
index.html            # 完成品（ビルド結果。地図データを埋め込み済み）
tools/template.html   # 画面のソース（HTML/CSS/JS）。編集するのはこっち
tools/paths.json      # 都道府県のSVGパス（gen-map.mjs で生成）
tools/gen-map.mjs     # TopoJSON から SVG パスを作るスクリプト
tools/build.mjs       # template.html に paths.json を埋め込んで index.html を作る
```

画面を直したら:

```bash
cd tools
npm install
npm run build        # index.html を作り直す
```

地図データを作り直すときだけ `npm run fetch-geo && npm run gen-map` を先に実行する。

地図データ: [dataofjapan/land](https://github.com/dataofjapan/land)

## 今後

要件・設計・ロードマップは [docs/](docs/README.md) にまとめている。
