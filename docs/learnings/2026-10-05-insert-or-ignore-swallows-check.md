---
tags: [d1, sqlite, sql, constraints, nfr-006, impl, test]
area: impl
---

# 「重複なら何もしない」に INSERT OR IGNORE を使うと、CHECK の違反まで黙って消える

## 何が起きたか

ADR 0003 の「C で書き直すときの方針」で、「行った」を付ける処理を `INSERT OR IGNORE`（押し直しても結果が変わらないように）と決めていた。試作（`spike/`）で「県の番号は1〜47だけ」のテストを書いたら、県48を入れてもエラーにならず、テストが失敗した。データは入らないが、API は成功を返し、ログにも残らない。

## 原因

SQLite（D1）の `OR IGNORE` は、重複（`UNIQUE`・`PRIMARY KEY`）だけでなく、`CHECK` と `NOT NULL` の違反も「飛ばす」対象にする（外部キーの違反は飛ばさない）。「重複を無視したい」という目的より、効く範囲が広い。データベースで守るつもりの決まり（NFR-006 (8) など）が、黙って素通りになる。

## どうしたか

- `INSERT … ON CONFLICT (member_id, pref) DO NOTHING` に変えた。飛ばすのは、その列の重複だけになる
- 落とし穴をテストに残した（`test/db.test.ts` の「（落とし穴の記録）」）
- ADR 0003 の方針を書き換えた

## 次にどうするか

- 「重複なら何もしない」は、`ON CONFLICT (列) DO NOTHING` と書く。`INSERT OR IGNORE`・`OR REPLACE` は使わない（`OR REPLACE` は、重複した行を消して入れ直すので、`ON DELETE CASCADE` の先も消える）
- データベースの制約を足したら、「違反がエラーになる」テストを1つ書く。制約を書いただけでは、効いているか分からない
- 本番のコードのレビュー（`/code-review`）で、`OR IGNORE`・`OR REPLACE` を探す

## 仕組みへの反映

2026-10-06 に `.claude/rules/sql.md` を作って反映した。

## 関連

- docs/adr/0003-backend-selection.md（C で書き直すときの方針）
- spike/README.md（3. D1 の決まり）
- spike/src/db.ts、spike/test/db.test.ts
