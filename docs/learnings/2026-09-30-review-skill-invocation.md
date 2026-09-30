---
tags: [process, review, skill]
area: process
---

# review-docs・compound はユーザーが明示的に実行する必要がある

## 何が起きたか
用語集（glossary.md）を作ったあと、Claude が `/review-docs` をSkillツールで直接呼び出そうとしたが、`disable-model-invocation: true` が設定されているため失敗した。そのままユーザー自身が目視で内容を確認して「OK」と伝えたが、これは `doc-reviewer` サブエージェントによる正式なレビューとは別物だった。あとから「サブエージェントのレビューは実際にしたのか」とユーザーに確認され、混同していたことに気づいた。

## 原因
`.claude/skills/review-docs/SKILL.md` と `.claude/skills/compound/SKILL.md` は、最初の開発環境構築時から `disable-model-invocation: true` になっており、Claude が自分の判断で呼び出すことはできない。ユーザーがスラッシュコマンドを明示的に入力したときだけ動く設計。

## どうしたか
ユーザーに確認したところ、「マージはユーザーが確認してから行う」という方針と同じ考え方で、レビューやコンパウンドの実行タイミングもユーザー自身が決めたい、という理由でこの制限を維持することにした。代わりに、Claude がドキュメント作業の区切りごとに「`/review-docs` を実行しましょうか？」と必ず声をかける運用にした。

## 次にどうするか
ドキュメント作業（要件・設計・ADRの追加や変更）が一区切りついたら、Claude は黙って次に進まず `/review-docs` の実行を提案する。ユーザー自身の目視確認は、サブエージェントによる正式なレビューの代わりにならないことを踏まえ、両者を混同せずに扱う。

## 関連
- .claude/skills/review-docs/SKILL.md
- .claude/skills/compound/SKILL.md
- docs/glossary.md
