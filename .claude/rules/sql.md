---
paths:
  - "**/*.sql"
  - "**/*.ts"
---

# SQL（D1）の書き方

- 「重複なら何もしない」は `INSERT … ON CONFLICT (列) DO NOTHING` と書く。`INSERT OR IGNORE`・`OR REPLACE` は使わない（OR IGNORE は CHECK の違反まで黙って無視し、OR REPLACE は行を消して入れ直すので CASCADE の先も消える。[docs/learnings/2026-10-05-insert-or-ignore-swallows-check.md](../../docs/learnings/2026-10-05-insert-or-ignore-swallows-check.md)）
- データベースの制約（CHECK・UNIQUE・外部キー）を足したら、違反がエラーになるテストを1つ書く
- batch（`db.batch()`）が取り消されるのはエラーのときだけ。条件付きの `UPDATE`・`INSERT … SELECT … WHERE` が0行でも、batch の残りは実行される。後ろの文には前の文の成功を確かめる条件（`WHERE EXISTS …`）を付けるか、断る場面を制約・トリガーでエラーにする。「0行のとき残りが何もしない」テストを書く（[docs/learnings/2026-10-10-d1-batch-zero-rows.md](../../docs/learnings/2026-10-10-d1-batch-zero-rows.md)）
