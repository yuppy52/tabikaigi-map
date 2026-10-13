# API の一覧

状態：下書き（2026-10-13：`access-reviewer`（13件）を受けて、目印のヘッダー、見えない文字の名前、413 の理由、Turnstile の `hostname`、500 と 503 の分け方を足した。2026-10-13：グループの作成・参加・開く・「行った」の API を作り、テストがローカルで通ったので書いた。紐づけ・名前の変更・退出・管理・退会は次に足す）

画面（React）が呼ぶ API（Hono）の URL と応答の一覧。SQL の形は [data-model](data-model.md)、誰が何をできるかは [権限マトリクス](permissions.md) が正本で、ここは画面と API の取り決め。コードは `api/src/app.ts`、テストは `api/test/groups-api.test.ts`。

## 共通の決まり

- URL はすべて `/api/` で始まる（Worker を通るのはここだけ：[architecture](architecture.md)）
- 画面は `X-Tabikaigi: 1` を必ず付ける。付いていなければ、D1 を読まずに `400 bad_request`（`/api/health` は除く。よそのサイトから利用者のブラウザで読ませないため：[architecture](architecture.md) の「無料枠を使い切られないために」）。リアルタイムの部屋（WebSocket）はヘッダーを付けられないので、作るときに別の守り方を決める
- 本文は JSON（4KB まで。超えたら `413 bad_request`）
- 名前とグループ名は、見た目の文字数のほかに、保存の上限（コードポイントで200・400）と、見えない文字（制御文字、幅のない空白など。絵文字をつなぐ ZWJ と旗のタグ文字は通す）を確かめ、外れたら `400 bad_name`（REQ-009・REQ-010）
- 設定の `FIREBASE_PROJECT_ID` が空なら `503`（全部 401 にして気づけないことを防ぐ）
- ログインしている人は `Authorization: Bearer <ID トークン>` を付ける。付いていなければログインなし
  - 付いているのに確かめられない（形の誤り、署名の誤り、期限切れ）ときは、ログインなしに落とさず `401 invalid_token`。公開鍵が取れないときは `503 unavailable`（NFR-006 (10)、[data-model](data-model.md) の「共通の決まり」）
  - 確認待ち（`email_verified` が false）の人は、ログインなしとして扱う（REQ-057）
- グループIDの形（英数字22文字）が違えば、データベースを引かずに `404 group_not_found`
- エラーは `{ "error": "<理由>" }`。画面はこの値で知らせを読み分ける（[screens](screens.md) の「知らせ」）
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

`pref` は県の番号（1〜47。`013` や `13.5` は `400`）。

### 参加で同じ名前がいたとき

`409 { "error": "name_taken", "memberId": 番号, "linked": 紐づいているか }` を返す。画面はこれで出し分ける。
- `linked: false` でログインなし：「（名前）さんはすでに参加しています。この人として続けますか？」→ 続けるなら、その `memberId` を端末に覚えて入る（API は呼ばない。信頼ベース：REQ-012）
- `linked: false` でログイン済み：「この人はあなたですか？」→ はいなら紐づけの API（次に作る：REQ-043）
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

グループの作成と参加で確かめる（Q-031）。秘密の鍵は `wrangler secret put TURNSTILE_SECRET` で入れる（リポジトリに置かない。ローカルは `.dev.vars`）。鍵が入っていないときや Cloudflare に聞けないときは、通さずに `503`（確かめずに通すと、ボット対策が黙って外れるため）。Cloudflare には利用者の IP を送らない（任意の項目のため）。応答の `hostname`（どのサイトで解いたか）はまだ確かめていない。本番の Turnstile のウィジェットを作るときに、ドメインの制限と合わせて `hostname` も確かめるかを決める〔未〕。

## まだ作っていないもの

- 紐づけ（REQ-037〜REQ-040・REQ-043）、名前の変更（REQ-014）、退出（REQ-049・REQ-050）、メンバーの削除・グループ名の変更・グループの削除・管理できる人の変更（REQ-044〜REQ-048）、退会（REQ-036）、グループ一覧（REQ-032）：次のプルリクエストで足す
- リアルタイムの部屋（`/api/rooms/{room_key}`）と、書いた後の知らせ（NFR-003）：Phase 2
- 問い合わせ（NFR-018）：Phase 2
