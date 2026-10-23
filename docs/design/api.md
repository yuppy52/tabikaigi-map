# API の一覧

状態：下書き（2026-10-23：Turnstile のウィジェットの作り方と鍵の置き場所を足した。2026-10-15：`/review-docs`（23件）を受けて、見えない文字のうち絵文字の部品は絵文字の中だけ通すこと、参加で満員でも同じ名前を先に返すこと、グループ一覧の `memberCount`・`isOwner`、画面の動きの対応表への参照を足した。退会の5分を Q-033 で確定した。2026-10-13：紐づけ・名前の変更・退出・管理の操作・グループ一覧・マイページ・退会の API を足した。同じ日の `access-reviewer`（11件）を受けて、同じ名前への変更は書かずに成功、権限のない人にはないメンバーの削除も断る、見えない文字に異体字の切り替えと点字の空白を足した。退会の「直前にログインし直した」は5分以内とした（推奨の仮の値）。2026-10-13：`access-reviewer`（13件）を受けて、目印のヘッダー、見えない文字の名前、413 の理由、Turnstile の `hostname`、500 と 503 の分け方を足した。2026-10-13：グループの作成・参加・開く・「行った」の API を作り、テストがローカルで通ったので書いた。紐づけ・名前の変更・退出・管理・退会は次に足す）

画面（React）が呼ぶ API（Hono）の URL と応答の一覧。SQL の形は [data-model](data-model.md)、誰が何をできるかは [権限マトリクス](permissions.md) が正本で、ここは画面と API の取り決め。コードは `api/src/app.ts`（SQL は `groups.ts`・`manage.ts`・`account.ts`）、テストは `api/test/groups-api.test.ts`・`api/test/manage-api.test.ts`。

## 共通の決まり

- URL はすべて `/api/` で始まる（Worker を通るのはここだけ：[architecture](architecture.md)）
- 画面は `X-Tabikaigi: 1` を必ず付ける。付いていなければ、D1 を読まずに `400 bad_request`（`/api/health` は除く。よそのサイトから利用者のブラウザで読ませないため：[architecture](architecture.md) の「無料枠を使い切られないために」）。リアルタイムの部屋（WebSocket）はヘッダーを付けられないので、作るときに別の守り方を決める
- 本文は JSON（4KB まで。超えたら `413 bad_request`）
- 名前とグループ名は、見た目の文字数のほかに、保存の上限（コードポイントで200・400）と、見えない文字（制御文字、幅のない空白、異体字の切り替え、点字の空白など。見えない文字は、Unicode が「表示しない」と決めている文字（Default_Ignorable_Code_Point）を含む。絵文字の部品（つなぐ ZWJ、形の切り替えの U+FE0F、旗のタグ文字）は、絵文字の中にあるときだけ通す。旗のタグ文字は、決まりのある3つの旗（イングランド、スコットランド、ウェールズ）だけ。「ゆ＋ZWJ＋う」のように絵文字の外にあれば断る。見た目の1文字に部品を10より多く重ねたものも断る（ZWJ や肌の色の記号を何十も重ねて、見た目の1文字と数えさせないため）。2026-10-15）を確かめ、外れたら `400 bad_name`（REQ-009・REQ-010）
- 設定の `FIREBASE_PROJECT_ID` が空なら `503`（全部 401 にして気づけないことを防ぐ）
- ログインしている人は `Authorization: Bearer <ID トークン>` を付ける。付いていなければログインなし
  - 付いているのに確かめられない（形の誤り、署名の誤り、期限切れ）ときは、ログインなしに落とさず `401 invalid_token`。公開鍵が取れないときは `503 unavailable`（NFR-006 (10)、[data-model](data-model.md) の「共通の決まり」）
  - 確認待ち（`email_verified` が false）の人は、ログインなしとして扱う（REQ-057）
- グループIDの形（英数字22文字）が違えば、データベースを引かずに `404 group_not_found`
- エラーは `{ "error": "<理由>" }`。画面はこの値で知らせを読み分ける（値ごとの文と行き先は [screens](screens.md) の「API の応答と画面の動き」）
- 「同じ名前」の比べ方は、NFKC にそろえ、見た目を変えない部品（絵文字の形の切り替え U+FE0E・U+FE0F、ZWJ、旗のタグ文字）を取り除き、続いた空白を1つにまとめ、小文字にした形（REQ-011。「❤」と「❤️」、「😀😀」と「😀‍😀」、「ゆ う」と「ゆ  う」は同じ名前。同じとみなしすぎても、断る側に倒れるだけ）
- 途中で落ちたとき（D1 の失敗など）は `503 { "error": "unavailable", "reason": "temporary" }`。無料枠を超えたときは `reason: "quota"` にして分ける予定だが、D1 が枠切れで返すエラーの文はまだ確かめていない（Phase 2 で確かめる〔未〕。それまでは枠切れも `temporary` になり、画面は「もう一度お試しください」を出す）
- プログラムの間違い（`TypeError` など）も、いまは `503 temporary` になる。画面が「もう一度」を出し続け、利用者のやり直しで D1 を使うので、D1 のエラーと見分けられるようになったら（上の〔未〕と一緒に）`500 internal` に分ける
- 参加で0行（グループがない・満員）のとき、ログイン済みなら `accounts` の行だけが残る（自分の行1つで害はないので受け入れる：[data-model](data-model.md) の「参加する」）
- 応答に、ほかのメンバーの `uid` を入れない（NFR-007）

## 一覧

| 操作 | メソッドと URL | 本文 | 成功 | 断るとき | 要件 |
|---|---|---|---|---|---|
| グループを作る | `POST /api/groups` | `groupName`、`name`、`turnstileToken` | `201 { groupId, memberId }` | `400 bad_name`、`403 turnstile_failed`、`409 group_limit` | REQ-001・REQ-060 |
| 参加する（新しいメンバー） | `POST /api/groups/{groupId}/members` | `name`、`turnstileToken` | `201 { memberId }` | `400 bad_name`、`403 turnstile_failed`、`404 group_not_found`、`409 group_full`・`name_taken`・`already_member`・`group_limit` | REQ-004・REQ-005・REQ-008・REQ-012・REQ-013・REQ-039・REQ-060 |
| グループを開く | `GET /api/groups/{groupId}` | — | `200`（下の「グループを開いたときの応答」） | `404 group_not_found` | REQ-002・REQ-017〜REQ-020・NFR-010 |
| ログインなしのメンバーの「行った」を付ける・外す | `PUT`・`DELETE /api/groups/{groupId}/members/{memberId}/visits/{pref}` | — | `200 { ok: true }`（付いていた・外れていたときも成功） | `400 bad_request`、`403 member_linked`、`404 group_not_found`・`member_not_found` | REQ-016・REQ-023・NFR-006 (1) |
| ログイン済みの人の「行った」を付ける・外す | `PUT`・`DELETE /api/groups/{groupId}/my-visits/{pref}` | — | `200 { ok: true }` | `400 bad_request`、`401 login_required`、`404 group_not_found`・`member_not_found` | REQ-016・REQ-030・NFR-006 (2)(10) |
| メンバーをアカウントに紐づける | `POST /api/groups/{groupId}/members/{memberId}/link` | `visits`（`merge`：合算する、`discard`：アカウントのデータを使う） | `200 { ok: true }`（自分に紐づいていたときも成功） | `400 bad_request`、`401 login_required`、`403 member_linked`（ほかの人に紐づいている）、`404 group_not_found`・`member_not_found`、`409 already_member`（REQ-039）・`group_limit` | REQ-037〜REQ-040・REQ-043・REQ-060・NFR-006 (3)(9)(10)(13) |
| 名前を変える | `PUT /api/groups/{groupId}/members/{memberId}/name` | `name` | `200 { ok: true }`（同じ名前なら書かずに成功） | `400 bad_request`・`bad_name`、`401 login_required`、`403 not_allowed`（自分に紐づいたメンバーでない）、`404 group_not_found`・`member_not_found`、`409 name_taken` | REQ-014・REQ-015・NFR-006 (1)(11) |
| 退出する | `POST /api/groups/{groupId}/members/{memberId}/leave` | — | `200 { ok: true, groupDeleted }`（最後の1人ならグループも消え `true`。もういないメンバーなら `false` で成功） | `400 bad_request`、`403 member_linked`（ほかの人に紐づいている）、`404 group_not_found` | REQ-049・REQ-050・NFR-006 (12) |
| メンバーを削除する | `DELETE /api/groups/{groupId}/members/{memberId}` | — | 退出と同じ（もういないメンバーで成功するのは、管理できる人のときだけ） | `400 bad_request`、`403 not_allowed`（管理できる人でない）、`404 group_not_found` | REQ-048・REQ-050・REQ-051・NFR-006 (5) |
| グループ名を変える | `PUT /api/groups/{groupId}/name` | `name` | `200 { ok: true }`（同じ名前なら書かずに成功） | `400 bad_name`、`403 not_allowed`、`404 group_not_found` | REQ-046・NFR-006 (5) |
| グループを削除する | `DELETE /api/groups/{groupId}` | — | `200 { ok: true }` | `403 not_allowed`、`404 group_not_found` | REQ-047・NFR-006 (5) |
| 管理できる人を変える | `PUT /api/groups/{groupId}/manage-by` | `manageBy`（`everyone`・`owner`） | `200 { ok: true }` | `400 bad_request`、`401 login_required`、`403 not_allowed`（作成者のメンバーに紐づいた本人でない。作成者がいないグループでは誰も）、`404 group_not_found` | REQ-045・NFR-006 (4)(10) |
| グループ一覧 | `GET /api/me/groups` | — | `200 { groups: [{ groupId, name, memberId, memberCount, isOwner }] }`（最近開かれた順。`memberCount` は人数、`isOwner` は自分のメンバーが作成者か。退会の確認で「グループも削除されます」「作成者がいなくなります」を出すため：screens の「確認ダイアログ」） | `401 login_required` | REQ-032・NFR-006 (7) |
| マイページの「行った」 | `GET /api/me/visits` | — | `200 { prefs: [県の番号] }` | `401 login_required` | REQ-033・NFR-006 (2) |
| 退会する | `DELETE /api/me` | — | `200 { ok: true }`（消すものがなくても成功） | `401 login_required`、`403 reauth_required` | REQ-036・REQ-050・NFR-006 (6) |

`pref` は県の番号（1〜47。`013` や `13.5` は `400`）。`memberId` は正の整数（形が違えば `400`）。

断る理由の状態コードは、「ない」が `404`、「権限がない」が `403`、「ほかと重なる・上限」が `409`。

### 誰が通るか

形の正本は [data-model](data-model.md) の「共通の決まり」「管理できる人の操作」、立場ごとの一覧は [権限マトリクス](permissions.md)。

- 紐づけ：紐づいていないメンバーを、自分のアカウントにだけ。断ったときも、自分の `accounts` の行は残る（参加と同じで害はない）。ほかの人に紐づいていれば `403`。「行った」を移す文と消す文は「自分に紐づいていること」を確かめるので、ほかの人が先に紐づけたときは何もしない
- 名前の変更：自分に紐づいたメンバーだけ（ログインなしのメンバーの名前は誰も変えられない：REQ-015）
- 退出：紐づいていないメンバーは誰でも（信頼ベース）、紐づいたメンバーは本人だけ
- メンバーの削除・グループ名の変更・グループの削除：「誰でも」なら誰でも（ログインなしでも）。「作成者のみ」が効いていれば、作成者のメンバーに紐づいた本人だけ。作成者がいなくなれば「誰でも」と同じ（REQ-051）
- 管理できる人の変更：作成者のメンバーに紐づいた本人だけ
- 退会：ID トークンの `auth_time`（最後にログインした時刻）が5分以内のときだけ（画面で「ログインし直す」を経ずに、改造した画面から呼ばせないため：[auth-flow](auth-flow.md) の 5.）。5分は推奨の仮の値（2026-10-13）

### 参加で同じ名前がいたとき

`409 { "error": "name_taken", "memberId": 番号, "linked": 紐づいているか }` を返す。画面はこれで出し分ける。満員（20人）のグループでも、同じ名前の人がいれば `group_full` より先にこれを返す（すでにいる人が戻ってくる場面。人数は増えないので REQ-005 に反しない。2026-10-15）。同じ名前の人がいなくて、自分（ログイン済み）のメンバーがいれば、満員でも `already_member` を返す
- `linked: false` でログインなし：「（名前）さんはすでに参加しています。この人として続けますか？」→ 続けるなら、その `memberId` を端末に覚えて入る（API は呼ばない。信頼ベース：REQ-012）
- `linked: false` でログイン済み：「この人はあなたですか？」→ はいなら紐づけの API（REQ-043）
- `linked: true`：別の名前を入れてもらう（REQ-013）

### グループを開いたときの応答

```json
{
  "group": { "name": "旅行部", "manageBy": "owner", "ownerOnly": true },
  "members": [
    { "id": 12, "name": "ゆう", "color": 0, "isOwner": true, "linked": true, "isMe": true },
    { "id": 13, "name": "たろう", "color": 1, "isOwner": false, "linked": false, "isMe": false }
  ],
  "visits": [{ "memberId": 12, "pref": 13 }, { "memberId": 13, "pref": 1 }]
}
```

- `ownerOnly`：「作成者のみ」が効いているか（`manageBy` が `owner` で、作成者のメンバーがいるとき。REQ-051）
- `isMe`：ログイン済みの人に紐づいたメンバーか。ログインなしの人では、いつも `false`（どのメンバーかは端末が覚えている）
- `visits`：紐づいたメンバーはアカウントの「行った」、ログインなしのメンバーはメンバーの「行った」
- 応答の後で、最後に開かれた日を今日にする（失敗しても無視する：Q-025）

## Turnstile

グループの作成と参加で確かめる（Q-031）。画面のウィジェットは、部品（npm）を入れずに Cloudflare の読み込み用のスクリプト（`challenges.cloudflare.com/turnstile/v0/api.js`）で作る。公開してよい鍵（サイトキー）は画面のコードに書く。手元では Cloudflare の試験用の鍵（いつも通る）を使い、本番の鍵は最初のデプロイの前に運営者が管理画面でウィジェットを作って差し替える（2026-10-23 にユーザーと決めた）。秘密の鍵は `wrangler secret put TURNSTILE_SECRET` で入れる（リポジトリに置かない。ローカルは `.dev.vars`）。鍵が入っていないときや Cloudflare に聞けないときは、通さずに `503`（確かめずに通すと、ボット対策が黙って外れるため）。Cloudflare には利用者の IP を送らない（任意の項目のため）。応答の `hostname`（どのサイトで解いたか）はまだ確かめていない。本番の Turnstile のウィジェットを作るときに、ドメインの制限と合わせて `hostname` も確かめるかを決める〔未〕。

## まだ作っていないもの

- リアルタイムの部屋（`/api/rooms/{room_key}`）と、書いた後の知らせ（NFR-003）：Phase 2
- 問い合わせ（NFR-018）：Phase 2
