---
paths:
  - "api/**"
  - "migrations/**"
---

# API（Hono）の書き方

API とそのテストを書く・直すときのルール。決まりの正本は [docs/design/data-model.md](../../docs/design/data-model.md)（SQL の形）と [docs/design/permissions.md](../../docs/design/permissions.md)（誰が何をできるか）。SQL そのものの書き方は [sql.md](sql.md)。

## 守ること（NFR-006）

- 権限の判断は、書き込む SQL の `WHERE`（条件付きの `UPDATE`、`INSERT … SELECT … WHERE EXISTS`）か、データベースの制約に入れる。「確かめる SQL」と「書く SQL」を分けない（間に別の人の操作が入ると抜け道になる）
- ログインはない（2026-11-06：[ADR 0013](../../docs/adr/0013-drop-login.md)）。証明書を受け取る入口や、ログインした人だけの分岐を足さない。足したくなったら、先に新しい ADR で決める
- メンバーの番号で操作する API は、`id = ? AND group_id = ?` で、そのグループのメンバーであることを書き込む SQL の中で確かめる（ほかのグループの番号を通さない：data-model の「メンバーの番号で操作する API の共通の決まり」）
- 起きないはずの分岐を通す道を作らない
- 画面から来た値はすべて疑う：型、整数か、範囲（県は 1〜47）、名前の長さ（見た目の文字数）を API の入口で確かめ、外れたら 400
- 文字の決まり（見えない文字など）は、自分で一覧を作る前に、Unicode が決めている性質（`Default_Ignorable_Code_Point`、`Extended_Pictographic` など）を使う。守りに例外を作るときは「どの並びの中でなら通すか」まで決め、その外では断る。例外の境目（頭・終わり・2つ続く・違う相手の後ろ）をテストに並べる（[learnings](../../docs/learnings/2026-10-13-invisible-characters-in-names.md)）
- Hono を通さない入口（部屋の WebSocket など）を作るときは、`app.use`・`app.onError`・`app.notFound` の守りを全部並べ、1つずつ「置き換える」か「要らない（理由）」かを決めて、置き換えたものにテストを書く（[learnings](../../docs/learnings/2026-10-26-bypassing-framework-drops-shared-guards.md)）

## 応答の形

- エラーは `{ "error": "<理由>" }` の JSON で返す。画面は `error` の値で知らせを読み分ける（[docs/design/screens.md](../../docs/design/screens.md) の「知らせ」）
- 条件付きの書き込みが0行だったときは、読み直して理由を返す（グループがない 404、メンバーがいない 404）。黙って成功にしない
- 無料枠を超えたとき（D1 のエラー）は 503 に「枠切れ」の理由を付け、「一時的な失敗」の 503 と分ける

## 本来の処理と、記録のための処理を分ける

- 最後に開かれた日の更新、エラーの送信など、記録・計測のための書き込みは、読み取りや本来の書き込みと同じ batch に入れない。応答を返した後（`ctx.waitUntil`）で流し、失敗は無視する（[learnings](../../docs/learnings/2026-10-12-side-write-must-not-block-main.md)）

## テスト

- [権限マトリクス](../../docs/design/permissions.md)の × の欄（×画は除く）ごとに、改造した画面を想定したリクエストが断られるテストを書く。テストの名前に NFR-006 の番号か REQ を入れる
- 断られる側だけでなく、通るべき人が通ることも1つ確かめる（断りすぎの確認）
- 断られるテストは、`status` だけでなく `error` の値まで確かめる（D1 の制約なら制約の列やトリガーの名前まで）。守りが重なっているときは、後ろの守りを外したり壊したりして、狙った守りで断られたことを確かめる（[learnings](../../docs/learnings/2026-10-13-assert-the-rejection-reason.md)）
- 断られる人は、守りの条件（どこの・何人目か・どんな文字か）を1つだけ外した「あと一歩で通りそうな人」で選ぶ（よそのグループの番号、21人目、見た目が同じ名前）。守りの条件をわざと1つ消して、テストが落ちることを確かめる（[learnings](../../docs/learnings/2026-10-13-assert-the-rejection-reason.md)）
- 権限や制約を変えたら、テストも同じプルリクエストで直す

## コードの書き方

- TypeScript で書く。関数やまとまりの頭に、考え方を日本語で一言書く（ユーザーは TypeScript に慣れていない）
- 秘密の値（API トークン、鍵）はコードにも `wrangler.jsonc` にも書かない。要るなら `wrangler secret` で入れる
