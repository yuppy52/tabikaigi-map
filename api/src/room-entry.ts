// 部屋への WebSocket の入口（/api/rooms/{room_key}）。Hono を通さずに受ける。
// Hono の API は目印のヘッダー（X-Tabikaigi）を求めるが、ブラウザの WebSocket はヘッダーを付けられないため、
// 代わりに Origin で「この画面からの接続か」を見る（architecture の「目印のヘッダー」と同じ目的）。
// 確かめの順番：URL の形 → WebSocket か → Origin → D1 にグループがあるか。D1 を読むのは最後だけ（無料枠を使い切られないため）

import { roomKey } from "./ids";
import type { RoomMessage } from "./room";

/** 部屋の URL の頭。ここで始まる URL は、すべてこの入口で受ける */
export const ROOM_PREFIX = "/api/rooms/";

/** 部屋の URL（room_key はグループIDの SHA-256、16進64文字。data-model の groups.room_key） */
const ROOM_PATH = /^\/api\/rooms\/([0-9a-f]{64})$/;

/** API と同じ形のエラー（{ error }）。WebSocket のブラウザには本文は見えないが、形をそろえておく */
function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

/** 部屋への接続の要求を確かめて、部屋に回す */
export async function connectRoom(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const m = ROOM_PATH.exec(url.pathname);
  if (!m) return fail(404, "group_not_found");
  const key = m[1];
  // WebSocket の切り替えの要求（GET＋Upgrade: websocket）でなければ部屋に回さない
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return fail(426, "bad_request");
  // よそのサイトから、利用者のブラウザでつながせない（Origin がない要求も断る）。D1 を読む前に断る
  if (request.headers.get("Origin") !== url.origin) return fail(403, "not_allowed");
  // グループがあるか（room_key は UNIQUE。読み取り1行程度：architecture の「部屋への接続の確かめ」）
  let found: unknown;
  try {
    found = await env.DB.prepare("SELECT 1 FROM groups WHERE room_key = ?").bind(key).first();
  } catch (e) {
    console.error("room lookup error", e instanceof Error ? e.message : String(e));
    return fail(503, "unavailable", { reason: "temporary" });
  }
  if (found === null) return fail(404, "group_not_found");
  // 部屋に回す。部屋が使えない（Durable Objects の枠切れなど）ときは 503
  try {
    return await env.GROUP_ROOM.get(env.GROUP_ROOM.idFromName(key)).fetch(request);
  } catch (e) {
    console.error("room connect error", e instanceof Error ? e.message : String(e));
    return fail(503, "unavailable", { reason: "temporary" });
  }
}

/**
 * API が D1 に書けた後に、そのグループの部屋に知らせる。room_key はグループIDから計算する（D1 を読み直さない）。
 * 応答の後で流し（waitUntil）、失敗は無視する（書き込みは成功のまま。画面は開き直せば正しくなる：ADR 0003）
 */
export function notifyRoom(ctx: Pick<ExecutionContext, "waitUntil">, env: Env, groupId: string, msg: RoomMessage): void {
  const send = async () => {
    const ns = env.GROUP_ROOM;
    await ns.get(ns.idFromName(await roomKey(groupId))).broadcast(msg);
  };
  ctx.waitUntil(send().catch((e) => console.warn("部屋への知らせに失敗（無視する）", e instanceof Error ? e.message : String(e))));
}
