// グループごとの「部屋」（Durable Object）。「行った」が変わったことなどを、画面を開いている全員に配るだけ。
// データの正本は D1。部屋はデータを持たない（architecture の「部屋が配るもの」、ADR 0003 の「リアルタイムの共有」）。
//
// 考え方：
// - URL にはグループIDを入れず、グループIDの SHA-256（room_key）だけを入れる（ログに残っても、グループは開けない）
// - つないだ後の最初のメッセージでグループIDを送ってもらい、「そのグループIDから作った部屋が自分か」を確かめる。済むまで何も配らない
// - 最初のメッセージを10秒送らない接続は、アラームで切る（ADR 0012）
// - 眠れる書き方（Hibernation API）：つながったまま部屋が眠れる。起きたときにメモリは消えているので、
//   接続ごとの状態（確かめ済みか、つないだ時刻）は serializeAttachment で接続に付けておく

import { DurableObject } from "cloudflare:workers";
import { isGroupId, roomKey } from "./ids";

/** 最初のメッセージ（グループID）を待つ時間（ミリ秒。ADR 0012） */
export const HELLO_TIMEOUT_MS = 10_000;

/** 確かめに失敗したときの閉じる番号（1008：決まりに反した） */
export const CLOSE_NOT_ALLOWED = 1008;

/** 1つの部屋につなげる数の上限（仮の値 2026-10-26。確かめ前の接続も数える） */
export const MAX_CONNECTIONS = 100;

/** 最初のメッセージの長さの上限（文字）。グループID（22文字）を JSON で包んでも十分に収まる。超えたら読まずに切る */
export const MAX_HELLO_LENGTH = 200;

/** 接続に付けておく状態（部屋が眠っても残る） */
type Attachment = { authed: boolean; connectedAt: number };

/** 部屋が配るもの（architecture の「部屋が配るもの」）。ready は確かめが済んだ印で、その接続にだけ送る */
export type RoomMessage = { type: "visit"; memberId: number; pref: number; visited: boolean } | { type: "refetch" };

/** 接続の状態を読む（付いていなければ、確かめていない接続として扱う） */
function attachmentOf(ws: WebSocket): Attachment | null {
  return ws.deserializeAttachment() as Attachment | null;
}

export class GroupRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 生きているかの確認（ping）には、部屋を起こさずに自動で pong を返す（起こすと回数に数えられる）
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** Worker の入口（index.ts）から、グループがあると確かめた後にだけ回ってくる。WebSocket を受けて、確かめ待ちにする */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response(null, { status: 426 });
    // つなげる数の上限（仮の値 2026-10-26。error の値も仮の値）。受け入れる前に断る
    if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS) return Response.json({ error: "room_full" }, { status: 429 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server); // 眠れる書き方。server.accept() ではなくこちら
    const connectedAt = Date.now();
    server.serializeAttachment({ authed: false, connectedAt } satisfies Attachment);
    // 確かめ待ちを切るアラーム。もう掛かっていれば、続けて何本つないでもそのまま1つにまとめる（仮の値 2026-10-26）
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(connectedAt + HELLO_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * 最初のメッセージでグループIDを受け取り、この部屋のグループかを確かめる。
   * 画面は確かめの後に ping（自動応答で、ここには来ない）しか送らないので、確かめ済みの接続から届いたら切る。
   * 確かめは安いものから順に：長さ・種類 → 期限 → グループIDの形 → ハッシュの比べ
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = attachmentOf(ws);
    if (att?.authed) return this.refuse(ws);
    // 文字でない・長すぎるものは読まない
    if (typeof message !== "string" || message.length > MAX_HELLO_LENGTH) return this.refuse(ws);
    // 10秒を過ぎて届いた最初のメッセージは断る（アラームが遅れたとき用）
    if (Date.now() > (att?.connectedAt ?? 0) + HELLO_TIMEOUT_MS) return this.refuse(ws);
    let groupId: unknown;
    try {
      groupId = (JSON.parse(message) as { groupId?: unknown } | null)?.groupId;
    } catch {
      groupId = undefined;
    }
    // グループIDの形が違えば、ハッシュを計算せずに断る
    if (typeof groupId !== "string" || !isGroupId(groupId)) return this.refuse(ws);
    // 送られたグループIDから作った部屋が、この部屋と同じか
    if (!this.env.GROUP_ROOM.idFromName(await roomKey(groupId)).equals(this.ctx.id)) return this.refuse(ws);
    ws.serializeAttachment({ authed: true, connectedAt: att?.connectedAt ?? Date.now() } satisfies Attachment);
    ws.send(JSON.stringify({ type: "ready" }));
  }

  /** 決まりに反した接続を 1008 で切る（もう閉じていれば何もしない） */
  private refuse(ws: WebSocket): void {
    try {
      ws.close(CLOSE_NOT_ALLOWED);
    } catch {
      // もう閉じていれば何もしない
    }
  }

  /**
   * 相手が閉じたら、こちらも閉じ返す。1005・1006 は「番号なし」「異常に切れた」の印で、送り返せない（送ると例外になる）。
   * 互換フラグ web_socket_auto_reply_to_close（閉じ返しを自動で送る）は、手元のテスト（vitest-plugin 1.4.0、compatibility_date 2026-08-15）では
   * 効いていなかった：ここを消すと画面の側に閉じ返しが届かない（2026-10-26 に確かめた。room.test.ts の「画面が閉じたら」）。そのため手で返す
   */
  webSocketClose(ws: WebSocket, code: number): void {
    if (code === 1005 || code === 1006) return;
    try {
      ws.close(code);
    } catch {
      // もう閉じていれば何もしない
    }
  }

  /**
   * アラーム：10秒たっても確かめが済まない接続を切る。まだ確かめ前の接続が残っていれば、いまから10秒後に1回だけ掛け直す
   * （一番早い期限には合わせず、掛ける回数を減らす。切れるまでは10〜20秒になる：仮の値 2026-10-26）
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    let waiting = false;
    for (const ws of this.ctx.getWebSockets()) {
      const att = attachmentOf(ws);
      if (att?.authed) continue;
      if ((att?.connectedAt ?? 0) + HELLO_TIMEOUT_MS <= now) this.refuse(ws);
      else waiting = true;
    }
    if (waiting) await this.ctx.storage.setAlarm(now + HELLO_TIMEOUT_MS);
  }

  /** API から呼ぶ：確かめ済みの接続にだけ配る。配った数を返す（テストで確かめる用） */
  broadcast(msg: RoomMessage): number {
    const text = JSON.stringify(msg);
    let sent = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (!attachmentOf(ws)?.authed) continue;
      try {
        ws.send(text);
        sent++;
      } catch {
        // 閉じかけの接続は飛ばす（ほかの人には配る）
      }
    }
    return sent;
  }
}
