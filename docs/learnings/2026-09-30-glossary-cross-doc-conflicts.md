---
tags: [docs, glossary, requirements, design, terminology]
area: design
---

# 用語集は既存ドキュメントとの突き合わせがないと矛盾が残る

## 何が起きたか
`docs/glossary.md` を新規作成し、ユーザーの目視確認では「OK」とされたが、`doc-reviewer` サブエージェントに requirements.md・design/ 以下の各ファイルと突き合わせてレビューさせたところ、22件の指摘（うち重大4件）が見つかった。「匿名」「ログイン」「アカウント」の区別、「昇格」の条件と引き継ぐ範囲、「作成者」が名前で決まるのか `uid` で決まるのか、「本人確認」ダイアログが実際には確認していないことなど、単体で読むと自然に見える説明が、他のドキュメントの記述と食い違っていた。

## 原因
用語集は、要件定義や設計書の言葉をあとからひとまとめにして書いたため、各ドキュメントの細かい条件分岐（例：未使用のメール／Googleか、既存アカウントかで「昇格」になるかどうかが変わる）まで、書き手が正確に反映できていなかった。ユーザーの目視確認も、用語の説明そのものが他のドキュメントと矛盾していないかまでは検証できていなかった。

## どうしたか
`doc-reviewer` サブエージェントに、glossary.md だけでなく requirements.md・design/ 以下・roadmap.md・.claude/rules/docs.md も渡し、突き合わせてレビューしてもらった。指摘のうち重大2件（匿名/ログイン/アカウントの定義、昇格の条件）はその場で直し、影響していた requirements.md・architecture.md の表現も合わせて直した。残り20件は glossary.md 内に一覧として記録し、後日着手できるようにした。

## 次にどうするか
用語集や設計書に新しい用語・定義を足すときは、「読んで自然に見える」ことと「他のドキュメントと矛盾していない」ことは別の基準として扱う。後者は自分の目視確認だけで済ませず、`doc-reviewer`（`/review-docs`）に実際に横断チェックさせる。`doc-reviewer` の観点には元々「整合性」「用語」の項目があり、今回もそれで機能したため、エージェント側の変更は不要。

## 関連
- docs/glossary.md
- docs/requirements.md
- docs/design/data-model.md
- docs/design/auth-flow.md
- docs/design/architecture.md
- docs/design/screens.md
- .claude/agents/doc-reviewer.md
