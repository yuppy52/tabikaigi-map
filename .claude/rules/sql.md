---
paths:
  - "**/*.sql"
  - "**/*.ts"
---

# SQL（D1）の書き方

- 「重複なら何もしない」は `INSERT … ON CONFLICT (列) DO NOTHING` と書く。`INSERT OR IGNORE`・`OR REPLACE` は使わない（OR IGNORE は CHECK の違反まで黙って無視し、OR REPLACE は行を消して入れ直すので CASCADE の先も消える。[docs/learnings/2026-10-05-insert-or-ignore-swallows-check.md](../../docs/learnings/2026-10-05-insert-or-ignore-swallows-check.md)）
- データベースの制約（CHECK・UNIQUE・外部キー）を足したら、違反がエラーになるテストを1つ書く
