# API の一覧

状態：下書き（2026-11-09：参加で同じ名前がいたときの画面の文を、名前を選ぶ形（REQ-012）に合わせた。L-1 の `/review-docs` を受けて、グループ名の変更・削除はグループIDだけで通すこと、`not_allowed` は部屋の入口で使うこと、コードが追いつくのは L-2・L-3 であることを書いた。2026-11-06：ログインをやめた（[ADR 0013](../adr/0013-drop-login.md)）。ID トークン、ログインの入口8つ（自分の「行った」、紐づけ、名前の変更、管理できる人、グループ一覧、マイページ、退会）、応答の `manageBy`・`ownerOnly`・`isOwner`・`linked`・`isMe`、`403 member_linked` と管理の操作の `403 not_allowed` をなくした。2026-10-26：部屋への接続（Origin の確かめ、最初のメッセージ、つなげる数の上限、アラームのまとめ方）を足した。2026-10-23：Turnstile のウィジェットの作り方と鍵の置き場所を足した。2026-10-15：`/review-docs`（23件）を受けて、見えない文字のうち絵文字の部品は絵文字の中だけ通すこと、参加で満員でも同じ名前を先に返すこと、グループ一覧の `memberCount`・`isOwner`、画面の動きの対応表への参照を足した。退会の5分を Q-033 で確定した。2026-10-13：紐づけ・名前の変更・退出・管理の操作・グループ一覧・マイページ・退会の API を足した。同じ日の `access-reviewer`（11件）を受けて、同じ名前への変更は書かずに成功、権限のない人にはないメンバーの削除も断る、見えない文字に異体字の切り替えと点字の空白を足した。退会の「直前にログインし直した」は5分以内とした（推奨の仮の値）。2026-10-13：`access-reviewer`（13件）を受けて、目印のヘッダー、見えない文字の名前、413 の理由、Turnstile の `hostname`、500 と 503 の分け方を足した。2026-10-13：グループの作成・参加・開く・「行った」の API を作り、テストがローカルで通ったので書いた。紐づけ・名前の変更・退出・管理・退会は次に足す）

画面（React）が呼ぶ API（Hono）の URL と応答の一覧。SQL の形は [data-model](data-model.md)、誰が何をできるかは [権限マトリクス](permissions.md) が正本で、ここは画面と API の取り決め。コードは `api/src/app.ts`（SQL は `groups.ts`・`manage.ts`）、テストは `api/test/groups-api.test.ts`・`api/test/manage-api.test.ts`。

2026-11-06 の時点で、この一覧はログインのない形。コードとテストは、ロードマップの L-2 で合わせるまで、ログインの入口と `Authorization` の扱いが残っている。

## 共通の決まり

- URL はすべて `/api/` で始まる（Worker を通るのはここだけ：[architecture](architecture.md)）
- 画面は `X-Tabikaigi: 1` を必ず付ける。付いていなければ、D1 を読まずに `400 bad_request`（`/api/health` は除く。よそのサイトから利用者のブラウザで読ませないため：[architecture](architecture.md) の「無料枠を使い切られないために」）。リアルタイムの部屋（WebSocket）はヘッダーを付けられないので、Hono を通さずに受け、代わりに `Origin` が同じサイトでなければ D1 を読まずに断る（仮の値 2026-10-26。下の「部屋への接続」）
- 本文は JSON（4KB まで。超えたら `413 bad_request`）
- 名前とグループ名は、見た目の文字数のほかに、保存の上限（コードポイントで200・400）と、見えない文字（制御文字、幅のない空白、異体字の切り替え、点字の空白など。見えない文字は、Unicode が「表示しない」と決めている文字（Default_Ignorable_Code_Point）を含む。絵文字の部品（つなぐ ZWJ、形の切り替えの U+FE0F、旗のタグ文字）は、絵文字の中にあるときだけ通す。旗のタグ文字は、決まりのある3つの旗（イングランド、スコットランド、ウェールズ）だけ。「ゆ＋ZWJ＋う」のように絵文字の外にあれば断る。見た目の1文字に部品を10より多く重ねたものも断る（ZWJ や肌の色の記号を何十も重ねて、見た目の1文字と数えさせないため）。2026-10-15）を確かめ、外れたら `400 bad_name`（REQ-009・REQ-010）
- グループIDの形（英数字22文字）が違えば、データベースを引かずに `404 group_not_found`
- エラーは `{ "error": "<理由>" }`。画面はこの値で知らせを読み分ける（値ごとの文と行き先は [screens](screens.md) の「API の応答と画面の動き」）
- 「同じ名前」の比べ方は、NFKC にそろえ、見た目を変えない部品（絵文字の形の切り替え U+FE0E・U+FE0F、ZWJ、旗のタグ文字）を取り除き、続いた空白を1つにまとめ、小文字にした形（REQ-011。「❤」と「❤️」、「😀😀」と「😀‍😀」、「ゆ う」と「ゆ  う」は同じ名前。同じとみなしすぎても、断る側に倒れるだけ）
- 途中で落ちたとき（D1 の失敗など）は `503 { "error": "unavailable", "reason": "temporary" }`。無料枠を超えたときは `reason: "quota"` にして分ける予定だが、D1 が枠切れで返すエラーの文はまだ確かめていない（Phase 2 で確かめる〔未〕。それまでは枠切れも `temporary` になり、画面は「もう一度お試しください」を出す）
- プログラムの間違い（`TypeError` など）も、いまは `503 temporary` になる。画面が「もう一度」を出し続け、利用者のやり直しで D1 を使うので、D1 のエラーと見分けられるようになったら（上の〔未〕と一緒に）`500 internal` に分ける

## 一覧

| 操作 | メソッドと URL | 本文 | 成功 | 断るとき | 要件 |
|---|---|---|---|---|---|
| グループを作る | `POST /api/groups` | `groupName`、`name`、`turnstileToken` | `201 { groupId, memberId }` | `400 bad_name`、`403 turnstile_failed` | REQ-001 |
| 参加する（新しいメンバー） | `POST /api/groups/{groupId}/members` | `name`、`turnstileToken` | `201 { memberId }` | `400 bad_name`、`403 turnstile_failed`、`404 group_not_found`、`409 group_full`・`name_taken` | REQ-004・REQ-005・REQ-008・REQ-012 |
| グループを開く | `GET /api/groups/{groupId}` | — | `200`（下の「グループを開いたときの応答」） | `404 group_not_found` | REQ-002・REQ-017〜REQ-020・NFR-010 |
| 「行った」を付ける・外す | `PUT`・`DELETE /api/groups/{groupId}/members/{memberId}/visits/{pref}` | — | `200 { ok: true }`（付いていた・外れていたときも成功） | `400 bad_request`、`404 group_not_found`・`member_not_found` | REQ-016・REQ-023 |
| 退出する | `POST /api/groups/{groupId}/members/{memberId}/leave` | — | `200 { ok: true, groupDeleted }`（最後の1人ならグループも消え `true`。もういないメンバーなら `false` で成功） | `400 bad_request`、`404 group_not_found` | REQ-049・REQ-050 |
| メンバーを削除する | `DELETE /api/groups/{groupId}/members/{memberId}` | — | 退出と同じ | `400 bad_request`、`404 group_not_found` | REQ-048・REQ-050 |
| グループ名を変える | `PUT /api/groups/{groupId}/name` | `name` | `200 { ok: true }`（同じ名前なら書かずに成功） | `400 bad_name`、`404 group_not_found` | REQ-046 |
| グループを削除する | `DELETE /api/groups/{groupId}` | — | `200 { ok: true }` | `404 group_not_found` | REQ-047 |

`pref` は県の番号（1〜47。`013` や `13.5` は `400`）。`memberId` は正の整数（形が違えば `400`）。

断る理由の状態コードは、「ない」が `404`、「ほかと重なる・上限」が `409`。2026-11-06 に、ログインの入口（自分の「行った」、紐づけ、名前の変更、管理できる人の変更、グループ一覧、マイページ、退会）と、権限がないときの `403 member_linked` と、管理の操作の `403 not_allowed` をなくした。`not_allowed` は、部屋の入口で `Origin` が違うときには今も使う（下の「部屋への接続」）。

### 誰が通るか

形の正本は [data-model](data-model.md) の「メンバーの番号で操作する API の共通の決まり」、立場ごとの一覧は [権限マトリクス](permissions.md)。

- グループIDを知っている人なら誰でも、そのグループのメンバーの番号で、「行った」の付け外し・退出・削除ができる。グループ名の変更とグループの削除は、メンバーの番号を受け取らず、グループIDだけで通す（信頼ベース。0行のときの分け方は [data-model](data-model.md) の「グループ名の変更・グループの削除」）
- ほかのグループのメンバーの番号を送っても、何もしない（`404 member_not_found`。退出と削除は「もういない」と同じに成功）

### 参加で同じ名前がいたとき

`409 { "error": "name_taken", "memberId": 番号 }` を返す。満員（20人）のグループでも、同じ名前の人がいれば `group_full` より先にこれを返す（すでにいる人が戻ってくる場面。人数は増えないので REQ-005 に反しない。2026-10-15）。

画面は「（名前）さんはもういます」と「（名前）さんとして入る」のボタンを出し、押したら、その `memberId` を端末に覚えて入る（API は呼ばない。信頼ベース：REQ-012）。ふだんは、すでにいる人は参加の画面で名前を選んで入るので、この API は呼ばない。満員のグループでは画面が「新しく参加する」を出さないので、満員で同じ名前が来るのは改造した画面か、ほぼ同時に入ったときだけ（2026-11-09）。

### グループを開いたときの応答

```json
{
  "group": { "name": "旅行部" },
  "members": [
    { "id": 12, "name": "ゆう", "color": 0 },
    { "id": 13, "name": "たろう", "color": 1 }
  ],
  "visits": [{ "memberId": 12, "pref": 13 }, { "memberId": 13, "pref": 1 }]
}
```

- どのメンバーが自分かは、端末が覚えている（[auth-flow](auth-flow.md) の「端末が覚えるもの」）
- 応答の後で、最後に開かれた日を今日にする（失敗しても無視する：Q-025）

## Turnstile

グループの作成と参加で確かめる（Q-031）。画面のウィジェットは、部品（npm）を入れずに Cloudflare の読み込み用のスクリプト（`challenges.cloudflare.com/turnstile/v0/api.js`）で作る。公開してよい鍵（サイトキー）は画面のコードに書く。手元では Cloudflare の試験用の鍵（いつも通る）を使い、本番の鍵は最初のデプロイの前に運営者が管理画面でウィジェットを作って差し替える（2026-10-23 にユーザーと決めた）。読み込み用のスクリプトは Cloudflare がその場で更新するので、中身の改ざんを確かめる印（SRI）は付けられない（Turnstile を使う以上、Cloudflare の配る中身を信じる。2026-10-23：`/code-review`）。秘密の鍵は `wrangler secret put TURNSTILE_SECRET` で入れる（リポジトリに置かない。ローカルは `.dev.vars`）。鍵が入っていないときや Cloudflare に聞けないときは、通さずに `503`（確かめずに通すと、ボット対策が黙って外れるため）。Cloudflare には利用者の IP を送らない（任意の項目のため）。応答の `hostname`（どのサイトで解いたか）はまだ確かめていない。本番の Turnstile のウィジェットを作るときに、ドメインの制限と合わせて `hostname` も確かめるかを決める〔未〕。

## 部屋への接続

`GET /api/rooms/{room_key}`（WebSocket。`room_key` はグループIDの SHA-256 の16進64文字）。コードは `api/src/room-entry.ts`（入口）と `api/src/room.ts`（部屋）。Hono を通さないので、目印のヘッダーの代わりに `Origin` を見る（2026-10-26）。

入口は安い確かめから順に見て、D1 を読むのは最後だけにする。ブラウザの WebSocket には応答の本文が見えないが、形は API にそろえる。

| 順 | 確かめ | 断るとき |
|---|---|---|
| 1 | URL の形（16進64文字） | `404 group_not_found` |
| 2 | WebSocket の切り替えの要求か（GET と `Upgrade: websocket`） | `426 bad_request` |
| 3 | `Origin` が、要求の URL と同じサイトか（ないときも断る。仮の値 2026-10-26） | `403 not_allowed` |
| 4 | D1 に `room_key` のグループがあるか | `404 group_not_found`（D1 が失敗したら `503 unavailable` の `temporary`） |
| 5 | 部屋につながっている数が100本より少ないか（仮の値 2026-10-26。20人が5台ずつ開いても足りる） | `429 room_full` |

部屋に回すところが失敗したときも `503 unavailable` の `temporary`。

`Origin` の確かめは、よそのサイトから利用者のブラウザでつながせないためのもので、認証ではない。ブラウザ以外からは `Origin` を偽れる。グループIDを知らない人がつないでも何も届かないのは、次の確かめのため。

- つないだ後の最初のメッセージで `{ "groupId": "…" }` を送ってもらい、そのグループIDから作った部屋が自分かを部屋が確かめる。済むと `{ "type": "ready" }` を返す。済むまでは何も配らない
- 形の違うグループID、違うグループID、200文字を超える文、バイナリは、番号 1008 で切る。確かめが済んだ接続から、ほかの文が届いたときも切る（画面は `ping` しか送らない）
- 最初のメッセージを送らない接続は、10〜20秒で切る（部屋のアラーム。アラームを1部屋で10秒に1回までにするため、鳴ったら10秒後に1回だけ掛け直す：2026-10-26。[ADR 0012](../adr/0012-realtime-reconnect-and-no-polling-fallback.md)）。10秒を過ぎて届いた最初のメッセージも切る
- `ping` には、部屋を起こさずに `pong` を返す

部屋が配るもの（`{ "type": "visit", memberId, pref, visited }` と `{ "type": "refetch" }`）と、いつ配るかは [architecture](architecture.md) の「部屋が配るもの」。API は D1 に書けたときだけ、応答の後で（`waitUntil`）部屋に知らせ、失敗は無視する（書き込みは成功のまま）。

## まだ作っていないもの

- 問い合わせ（NFR-018）：Phase 2
