// グループごとの「部屋」（Durable Object）。「行った」が変わったことを、画面を開いている全員に配るだけ。
// データの正本は D1。部屋はデータを持たない。
//
// 考え方：
// - URL にはグループIDを入れず、グループIDから作ったハッシュ（roomKey）だけを入れる（ログに残っても、グループは開けない）
// - つないだ後の最初のメッセージでグループIDを送ってもらい、「このハッシュの元か」を部屋が確かめる。済むまで何も配らない
// - 眠れる書き方（Hibernation API）：つながったまま部屋が眠れる。眠っている間は無料枠をほぼ使わない。
//   起きたときにメモリは消えているので、接続ごとの状態は serializeAttachment で接続に付けておく

import { DurableObject } from "cloudflare:workers";

type Attachment = { authed: boolean; connectedAt: number };
export type RoomMessage = { type: "visit"; memberId: number; pref: number; visited: boolean };

/** グループIDから部屋の名前（SHA-256 の16進）を作る */
export async function roomKey(groupId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(groupId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class GroupRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 生きているかの確認（ping）には、部屋を起こさずに自動で pong を返す（起こすと受信の回数に数えられる）
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server); // ← 眠れる書き方。server.accept() ではなくこちら
    server.serializeAttachment({ authed: false, connectedAt: Date.now() } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    if (att.authed) return; // 確かめ済みの接続から受け取るものは、いまはない
    let groupId: unknown;
    try {
      groupId = JSON.parse(typeof message === "string" ? message : "").groupId;
    } catch {
      groupId = undefined;
    }
    // 送られたグループIDから作った部屋が、この部屋と同じか
    const ok =
      typeof groupId === "string" &&
      this.env.GROUP_ROOM.idFromName(await roomKey(groupId)).equals(this.ctx.id);
    if (!ok) {
      ws.close(1008, "not a member");
      return;
    }
    ws.serializeAttachment({ ...att, authed: true } satisfies Attachment);
    ws.send(JSON.stringify({ type: "ready" }));
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "bye");
  }

  /** API から呼ぶ：確かめ済みの接続にだけ配る。配った数を返す */
  async broadcast(msg: RoomMessage): Promise<number> {
    const text = JSON.stringify(msg);
    let sent = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment | null)?.authed) {
        ws.send(text);
        sent++;
      }
    }
    return sent;
  }
}
