---
tags: [api, hono, websocket, durable-objects, security, impl]
area: impl
---

# 道具（Hono）の外で受ける URL を作ったら、道具が全部の API にかけていた守りを1つずつ数え直す

## 何が起きたか
2026-10-26 にリアルタイムの部屋（5-1）を作った。ブラウザの WebSocket は目印のヘッダー（`X-Tabikaigi`）を付けられないので、`/api/rooms/` で始まる URL は Hono に渡さず、Worker の入口で直接受けた。目印のヘッダーの代わりの守り（Origin の確かめ）は依頼文に書いてあったので入った。しかし `access-reviewer` に、`onError`（途中で落ちたら決まった形の 503 にする）も外れていると指摘された。部屋に回すところで例外が出ると、Cloudflare の HTML のエラーページになり、画面が決まった形で読めず、ログにも自分の文が残らない。

## 原因
- Hono の `app.use` と `app.onError` で、全部の API に一度にかけていた守りは、ふだん意識しない。外に出す URL を決めたとき、目立つ守り（目印のヘッダー）の代わりだけを考え、ほかを数えなかった

## どうしたか
- 部屋に回すところを `try` で包み、失敗したら `503 unavailable`（`temporary`）を返すようにして、テストを足した
- Hono の外に出したことで外れた守りを並べた：目印のヘッダー（→ Origin に置き換え）、本文の大きさの上限・ログイン（部屋の接続には要らない）、`onError`（→ `try` で置き換え）

## 次にどうするか
- 道具（Hono、ミドルウェア）を通さない入口を作るときは、`app.use`・`app.onError`・`app.notFound` に書いてある守りを全部並べ、1つずつ「置き換える」「要らない（理由）」を決めて、依頼文に書く
- 置き換えた守りには、外の入口でもテストを書く

## 関連
- api/src/app.ts（`app.use`、`app.onError`）、api/src/room-entry.ts
- docs/design/api.md の「部屋への接続」
- docs/learnings/2026-10-13-unguarded-api-can-be-called-from-other-sites.md
- 反映した：`.claude/rules/api.md` の「守ること」（2026-10-27）
