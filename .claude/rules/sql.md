---
paths:
  - "**/*.sql"
  - "**/*.ts"
---

# SQL（D1）の書き方

- 「重複なら何もしない」は `INSERT … ON CONFLICT (列) DO NOTHING` と書く。`INSERT OR IGNORE`・`OR REPLACE` は使わない（OR IGNORE は CHECK の違反まで黙って無視し、OR REPLACE は行を消して入れ直すので CASCADE の先も消える。[docs/learnings/2026-10-05-insert-or-ignore-swallows-check.md](../../docs/learnings/2026-10-05-insert-or-ignore-swallows-check.md)）
- データベースの制約（CHECK・UNIQUE・外部キー）を足したら、違反がエラーになるテストを1つ書く
- batch（`db.batch()`）が取り消されるのはエラーのときだけ。条件付きの `UPDATE`・`INSERT … SELECT … WHERE` が0行でも、batch の残りは実行される。後ろの文には前の文の成功を確かめる条件（`WHERE EXISTS …`）を付けるか、断る場面を制約・トリガーでエラーにする。「0行のとき残りが何もしない」テストを書く（[docs/learnings/2026-10-10-d1-batch-zero-rows.md](../../docs/learnings/2026-10-10-d1-batch-zero-rows.md)）
- 制約やトリガーで守る値は、その値の列だけでなく、組になっている列（`group_id`、`uid` など）の書き換えでも破れないかを見る。書き換える正しい操作がない列は、トリガーで `UPDATE` を断る。整数・文字の列の `CHECK` には `typeof(…) = 'integer'`・`'text'` を入れる（SQLite は型を厳しく見ない）。2つの守りが重なるときは、後ろの守りも単独で効くことをテストする（[docs/learnings/2026-10-13-guard-every-path-to-protected-value.md](../../docs/learnings/2026-10-13-guard-every-path-to-protected-value.md)）
