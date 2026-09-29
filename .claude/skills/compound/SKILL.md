---
name: compound
description: 作業の区切りで、次回に効く学びを docs/learnings/ に1件ずつ記録し、CLAUDE.md・ルール・レビュー観点の更新案を出す。
disable-model-invocation: true
---

# 学びを残す（compound）

作業をするたびに、次の作業が楽になるようにするための手順。考え方は Every の compound engineering（https://every.to/guides/compound-engineering）を参考にしている。

## 1. 候補を挙げる
このセッションから、次のものを挙げる。
- 解決して、確認までできた問題（ハマったこと、原因）
- ユーザーに直された判断や、ユーザーが示した方針
- レビューで出た指摘のうち、ほかのドキュメントでも起きそうなもの

**除くもの**：docs やコードを読めば分かること、今回かぎりの事情、確認できていない推測。

## 2. 残す価値を判断する
残す価値のあるものがなければ「今回は記録なし」と理由を一言添えて終わる。無理に書かない。

## 3. 書く
1件につき1ファイル、`docs/learnings/YYYY-MM-DD-<英小文字のslug>.md` を日本語で書く。
同じ内容の学びがすでにあれば、新しく作らずにそのファイルへ追記する。

```markdown
---
tags: [firebase, auth]          # 検索用
area: design                    # requirements | design | adr | impl | process
---

# <一行で言うと>

## 何が起きたか
## 原因
## どうしたか
## 次にどうするか
## 関連
- docs/design/xxx.md
```

## 4. 仕組みに反映する案を出す
学びが「今後ずっと守るべきこと」なら、反映先の案を**差分で**示す。
- CLAUDE.md（プロジェクト全体の前提）
- `.claude/rules/*.md`（書き方・作り方のルール）
- `.claude/agents/doc-reviewer.md` の観点（レビューで毎回見るべきこと）

**ユーザーの OK をもらってから反映する。勝手に書き換えない。**

## 5. 設計への影響を確認する
学びによって要件・設計・ADR の判断が変わるなら、どのドキュメントを直す必要があるかを指摘する。
