---
tags: [security, claude-code, permissions, hono, test, mutation]
area: process
---

# 守りの効く範囲は、何に効いて何に効かないかまで確かめてから書く

## 何が起きたか
このセッションで、守りの範囲を思い込みで決めていたことが2回あった。
1. **Claude の deny**：手順書の「鍵」の節に、最初は「Claude は `.env` を読めない」と書いた。実際の `.claude/settings.json` の deny は `Read(./.env)` で、止めるのは Read の道具だけ。Bash の `cat .env` は止まらない。言い過ぎていたので、「Read の道具では読めない。ただし Bash の `cat` などは止まらないので、中身を出させる指示を出さない」に直した
2. **API のルートの守り**（2026-10-19）：グループIDの形を確かめる守りは、`/groups/:groupId/*` と `/groups/:groupId` の2つに登録している。`access-reviewer` は「`/groups/:groupId` の登録が消えると、`GET`・`DELETE /groups/:groupId` が守りなしになる」と指摘した。そこで登録を1つずつわざと外してテストを流した。`/groups/:groupId` を外してもテストは落ちず、Hono の `/groups/:groupId/*` は `/groups/abc` そのものにも当たると分かった（`/*` の側を外すと、足したテストが落ちた）

## 原因
- 守りの名前（「deny」「ミドルウェア」）から効き目を推し量り、実際に何の操作・どの URL に効くかを確かめていなかった
- 守りの範囲は道具ごとに違い、見た目の書き方からは分からないことがある（Claude Code の権限は道具ごと、Hono の `/*` は空のパスにも当たる）

## どうしたか
- 手順書の書き方を、効く範囲と効かない範囲の両方に直した
- グループIDの守りは、グループIDを持つすべての API（11個）を表にしたテストで確かめ、Hono の振る舞いをコードのコメントに書いた。2つの登録は、念のための重ねとして残した

## 次にどうするか
- 安全装置（Claude の deny／ask、ブランチ保護、トークンの権限、API の守り）の効き目を文書やユーザーへの説明に書くときは、「何の操作に効くか」と「何には効かないか」を両方書く。確かめていなければ「（要確認）」と書く
- URL のパターンや権限のパターンで守るものは、守りを1つずつ外してテストが落ちるかで、範囲を確かめる（[2026-10-13](2026-10-13-assert-the-rejection-reason.md) の「守りの条件をわざと1つ消す」を、ルートの登録にも使う）

2026-10-19：ユーザーの OK をもらい、.claude/rules/docs.md の「未確認のこと」に反映した。

## 関連
- docs/design/deploy.md の「鍵」
- .claude/settings.json
- api/src/app.ts の `checkGroupId`、api/test/groups-api.test.ts の「形の違うグループIDは、D1 を引かずに 404」
