---
tags: [npm, dependencies, security, setup, test, process]
area: process
---

# 部品を入れたら、非推奨の警告と npm audit を見て、改名や直った版を確かめる

## 何が起きたか
2026-10-12 に開発環境を作るとき、試作（`spike/`）と同じ `@cloudflare/vitest-pool-workers` を入れた。テストは通ったが、実行のたびに「`@cloudflare/vitest-plugin` に名前が変わった。この名前には今後更新が来ない」という警告が出ていた。`npm audit` では high が4件あり、古い名前の部品が、直っていない古い `miniflare`・`sharp`・`undici` を抱えていた。

## 原因
- 試作の版をそのまま写した。試作から2か月の間に、部品の名前が変わっていた
- インストールの最後の行（「found 0 vulnerabilities」）だけを見て、別の時点の `npm audit` の結果と取り違えかけた

## どうしたか
- `@cloudflare/vitest-plugin` に入れ替え、high が残る版（1.3.7）から直った版（1.4.0）に上げて、`npm audit` が0件になったことを確かめた
- `wrangler` も直った版（4.149）に上げた
- `npm ci` でロックファイルだけから入れ直して、テストが通ることを確かめた（GitHub Actions と同じ手順）

## 次にどうするか
- 部品を入れたり上げたりしたら、テストの出力の警告（非推奨、改名）と `npm audit` を見る。high 以上が残るなら、直った版があるかを確かめてから進む
- 試作の設定や版を写すときは、そのまま使わず、今の版と名前を確かめる
- 新しく作ったサブエージェントは、作ったセッションでは呼べない（次のセッションから）。同じセッションで使うときは、汎用のエージェントにその定義ファイルを読ませて代わりにする

2026-10-13：ユーザーの OK をもらい、CLAUDE.md の「技術の前提」に反映した。

## 関連
- package.json、.github/workflows/test.yml
- docs/design/architecture.md の「開発環境」
