// リアルタイムの部屋のテスト（NFR-003、architecture の「部屋が配るもの」「部屋への接続の確かめ」、ADR 0012）。
// 部屋への接続は Worker の入口（index.ts）を通し、書き込みは API（createApp）を通す。どちらも同じ D1 と部屋を使う
import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { roomKey } from "../src/ids";
import { CLOSE_NOT_ALLOWED, HELLO_TIMEOUT_MS, MAX_CONNECTIONS, MAX_HELLO_LENGTH } from "../src/room";
import { connectRoom } from "../src/room-entry";
import { call, create, join, setup, token } from "./helpers";

beforeAll(setup);

const ORIGIN = "https://example.com";

let n = 0;
/** テストごとに別の uid を使う（テストどうしでデータベースを共有しているため） */
const newUid = () => `uid-r-${++n}-${Date.now()}`;

/** 部屋のスタブ（テストから部屋の中を覗く・眠らせる・アラームを動かす） */
const stubOf = async (groupId: string) => env.GROUP_ROOM.get(env.GROUP_ROOM.idFromName(await roomKey(groupId)));

/** 部屋につなぎ、届いたメッセージと閉じた番号を貯める */
async function connect(groupIdForKey: string) {
  const res = await SELF.fetch(`${ORIGIN}/api/rooms/${await roomKey(groupIdForKey)}`, {
    headers: { Upgrade: "websocket", Origin: ORIGIN },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const received: unknown[] = [];
  const raw: string[] = [];
  let closed: number | null = null;
  ws.addEventListener("message", (e) => {
    const text = e.data as string;
    raw.push(text);
    if (text !== "pong") received.push(JSON.parse(text));
  });
  ws.addEventListener("close", (e) => {
    closed = e.code;
  });
  ws.accept();
  return {
    ws,
    received,
    raw,
    closed: () => closed,
    hello: (groupId: string) => ws.send(JSON.stringify({ groupId })),
  };
}

/** つないで、確かめ済み（ready が届いた）にする */
async function connectReady(groupId: string) {
  const a = await connect(groupId);
  a.hello(groupId);
  await until(() => a.received.length === 1);
  expect(a.received[0]).toEqual({ type: "ready" });
  return a;
}

/** 条件がそろうまで少し待つ（WebSocket のメッセージは少し遅れて届く） */
async function until(cond: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("待ちきれなかった");
    await new Promise((r) => setTimeout(r, 10));
  }
}
/** 「届かない」ことを確かめるときに、届くはずの時間だけ待つ */
const pause = () => new Promise((r) => setTimeout(r, 150));

const putVisit = (groupId: string, memberId: number, pref: number, opts: Parameters<typeof call>[2] = {}) =>
  call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/${pref}`, opts);
const deleteVisit = (groupId: string, memberId: number, pref: number) =>
  call("DELETE", `/api/groups/${groupId}/members/${memberId}/visits/${pref}`);

/** 入口に渡す env を包み、D1 と部屋が何回使われたかを数える（「D1 を読まずに断る」「部屋に回さない」の確かめ） */
function countingEnv() {
  const used = { db: 0, room: 0 };
  const wrap = <T extends object>(target: T, key: "db" | "room"): T =>
    new Proxy(target, {
      get(t, p) {
        used[key]++;
        const v: unknown = Reflect.get(t, p);
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
  return { used, env: { ...env, DB: wrap(env.DB, "db"), GROUP_ROOM: wrap(env.GROUP_ROOM, "room") } as Env };
}
const roomRequest = (path: string, headers: Record<string, string>, method = "GET") => new Request(`${ORIGIN}${path}`, { method, headers });

describe("部屋への入口（architecture の「部屋への接続の確かめ」）", () => {
  it("グループがあれば、部屋に回って 101 になる（断りすぎの確認）", async () => {
    const { groupId } = await create();
    const c = countingEnv();
    const res = await connectRoom(roomRequest(`/api/rooms/${await roomKey(groupId)}`, { Upgrade: "websocket", Origin: ORIGIN }), c.env);
    expect(res.status).toBe(101);
    expect(c.used.db).toBeGreaterThan(0);
    expect(c.used.room).toBeGreaterThan(0);
    res.webSocket!.accept();
    res.webSocket!.close(1000);
  });

  it("room_key が D1 にない → 404 group_not_found（D1 は引くが、部屋に回さない）", async () => {
    const c = countingEnv();
    const res = await connectRoom(
      roomRequest(`/api/rooms/${await roomKey("ないグループのID0000000")}`, { Upgrade: "websocket", Origin: ORIGIN }),
      c.env,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "group_not_found" });
    expect(c.used.db).toBeGreaterThan(0);
    expect(c.used.room).toBe(0);
  });

  it("room_key の形が違う → 404 group_not_found（D1 も部屋も使わない）", async () => {
    const { groupId } = await create();
    const key = await roomKey(groupId);
    for (const path of [
      `/api/rooms/${key.toUpperCase()}`,
      `/api/rooms/${key.slice(1)}`,
      `/api/rooms/${key}0`,
      `/api/rooms/${key}/ws`,
      `/api/rooms/${groupId}`,
      `/api/rooms/`,
    ]) {
      const c = countingEnv();
      const res = await connectRoom(roomRequest(path, { Upgrade: "websocket", Origin: ORIGIN }), c.env);
      expect(res.status, path).toBe(404);
      expect(await res.json()).toEqual({ error: "group_not_found" });
      expect(c.used, path).toEqual({ db: 0, room: 0 });
    }
  });

  it("WebSocket の切り替えの要求でない → 426（D1 も部屋も使わない）", async () => {
    const { groupId } = await create();
    const path = `/api/rooms/${await roomKey(groupId)}`;
    for (const [headers, method] of [
      [{ Origin: ORIGIN }, "GET"],
      [{ Upgrade: "h2c", Origin: ORIGIN }, "GET"],
      [{ Upgrade: "websocket", Origin: ORIGIN }, "POST"],
    ] as const) {
      const c = countingEnv();
      const res = await connectRoom(roomRequest(path, headers, method), c.env);
      expect(res.status).toBe(426);
      expect(await res.json()).toEqual({ error: "bad_request" });
      expect(c.used).toEqual({ db: 0, room: 0 });
    }
  });

  it("Origin が要求の URL と違う・ない → 403 not_allowed（よそのサイトからつながせない。D1 も部屋も使わない）", async () => {
    const { groupId } = await create();
    const path = `/api/rooms/${await roomKey(groupId)}`;
    for (const headers of [
      { Upgrade: "websocket", Origin: "https://evil.example" },
      { Upgrade: "websocket", Origin: "http://example.com" },
      { Upgrade: "websocket", Origin: "https://example.com.evil.example" },
      { Upgrade: "websocket", Origin: "null" },
      { Upgrade: "websocket" },
      // あと一歩の値：ポートだけ違う、末尾に /、大文字
      { Upgrade: "websocket", Origin: "https://example.com:8443" },
      { Upgrade: "websocket", Origin: "https://example.com/" },
      { Upgrade: "websocket", Origin: "https://EXAMPLE.com" },
    ] as Record<string, string>[]) {
      const c = countingEnv();
      const res = await connectRoom(roomRequest(path, headers), c.env);
      expect(res.status, JSON.stringify(headers)).toBe(403);
      expect(await res.json()).toEqual({ error: "not_allowed" });
      expect(c.used).toEqual({ db: 0, room: 0 });
    }
  });

  it("消したグループの room_key でつなぐと 404 group_not_found（前はあったグループ）", async () => {
    const { groupId } = await create();
    const path = `/api/rooms/${await roomKey(groupId)}`;
    expect((await call("DELETE", `/api/groups/${groupId}`)).status).toBe(200);
    const c = countingEnv();
    const res = await connectRoom(roomRequest(path, { Upgrade: "websocket", Origin: ORIGIN }), c.env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "group_not_found" });
    expect(c.used.room).toBe(0);
  });

  it("部屋に回すところで失敗したら 503 unavailable（temporary）", async () => {
    const { groupId } = await create();
    const broken = {
      idFromName() {
        throw new Error("部屋が使えない");
      },
      get() {
        throw new Error("部屋が使えない");
      },
    } as unknown as Env["GROUP_ROOM"];
    const res = await connectRoom(roomRequest(`/api/rooms/${await roomKey(groupId)}`, { Upgrade: "websocket", Origin: ORIGIN }), {
      ...env,
      GROUP_ROOM: broken,
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable", reason: "temporary" });
  });

  it("1つの部屋につなげるのは100本まで。101本目は受け入れずに 429 room_full（仮の値 2026-10-26）", async () => {
    const { groupId } = await create();
    const url = `${ORIGIN}/api/rooms/${await roomKey(groupId)}`;
    const opened: WebSocket[] = [];
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const res = await SELF.fetch(url, { headers: { Upgrade: "websocket", Origin: ORIGIN } });
      expect(res.status).toBe(101);
      res.webSocket!.accept();
      opened.push(res.webSocket!);
    }
    const full = await SELF.fetch(url, { headers: { Upgrade: "websocket", Origin: ORIGIN } });
    expect(full.status).toBe(429);
    expect(await full.json()).toEqual({ error: "room_full" });
    expect(full.webSocket).toBeNull();
    expect(await runInDurableObject(await stubOf(groupId), (_room, state) => state.getWebSockets().length)).toBe(MAX_CONNECTIONS);
    for (const ws of opened) ws.close(1000);
  });

  it("Worker の入口（index.ts）も同じ確かめを通る：Origin が違えば 403、目印のヘッダーがなくても部屋の URL は Hono に回らない", async () => {
    const { groupId } = await create();
    const url = `${ORIGIN}/api/rooms/${await roomKey(groupId)}`;
    const bad = await SELF.fetch(url, { headers: { Upgrade: "websocket", Origin: "https://evil.example" } });
    expect(bad.status).toBe(403);
    expect(await bad.json()).toEqual({ error: "not_allowed" });
    const notWs = await SELF.fetch(url, { headers: { Origin: ORIGIN } });
    expect(notWs.status).toBe(426);
    // 部屋の外の API は、いままでどおり目印のヘッダーが要る
    expect((await SELF.fetch(`${ORIGIN}/api/groups/${groupId}`)).status).toBe(400);
  });
});

describe("部屋につなぐ（最初のメッセージで確かめる）", () => {
  it("正しいグループIDを送ると ready が届き、「行った」の付け外しが同じグループの全員に届く（NFR-003）", async () => {
    const { groupId, memberId } = await create();
    const a = await connectReady(groupId);
    const b = await connectReady(groupId);
    expect((await putVisit(groupId, memberId, 13)).json).toEqual({ ok: true });
    expect((await deleteVisit(groupId, memberId, 13)).json).toEqual({ ok: true });
    await until(() => a.received.length === 3 && b.received.length === 3);
    for (const x of [a, b]) {
      expect(x.received.slice(1)).toEqual([
        { type: "visit", memberId, pref: 13, visited: true },
        { type: "visit", memberId, pref: 13, visited: false },
      ]);
    }
  });

  it("付いていた・外れていたときも成功なので配る", async () => {
    const { groupId, memberId } = await create();
    const a = await connectReady(groupId);
    await putVisit(groupId, memberId, 1);
    await putVisit(groupId, memberId, 1);
    await deleteVisit(groupId, memberId, 2);
    await until(() => a.received.length === 4);
    expect(a.received[3]).toEqual({ type: "visit", memberId, pref: 2, visited: false });
  });

  it("別のグループの変更は届かない", async () => {
    const g1 = await create();
    const g2 = await create();
    const a = await connectReady(g1.groupId);
    expect((await putVisit(g2.groupId, g2.memberId, 4)).status).toBe(200);
    await pause();
    expect(a.received).toEqual([{ type: "ready" }]);
  });

  it("確かめ前の接続には届かない", async () => {
    const { groupId, memberId } = await create();
    const a = await connect(groupId);
    const b = await connectReady(groupId);
    await putVisit(groupId, memberId, 3);
    await until(() => b.received.length === 2);
    await pause();
    expect(a.received).toEqual([]);
    expect(a.closed()).toBeNull();
  });

  it("違うグループIDを送ると 1008 で切れ、その後も何も届かない", async () => {
    const { groupId, memberId } = await create();
    const other = await create();
    for (const hello of [JSON.stringify({ groupId: other.groupId }), JSON.stringify({ groupId: 1 }), "{", "null", JSON.stringify({})]) {
      const a = await connect(groupId);
      a.ws.send(hello);
      await until(() => a.closed() !== null);
      expect(a.closed(), hello).toBe(CLOSE_NOT_ALLOWED);
      await putVisit(groupId, memberId, 5);
      await pause();
      expect(a.received, hello).toEqual([]);
    }
  });

  it("確かめ済みの接続から ping 以外が届いたら 1008 で切り、その後は配らない", async () => {
    const { groupId, memberId } = await create();
    const other = await create();
    for (const text of [JSON.stringify({ groupId: other.groupId }), JSON.stringify({ groupId }), "hello"]) {
      const a = await connectReady(groupId);
      a.ws.send(text);
      await until(() => a.closed() !== null);
      expect(a.closed(), text).toBe(CLOSE_NOT_ALLOWED);
      await putVisit(groupId, memberId, 7);
      await pause();
      expect(a.received, text).toEqual([{ type: "ready" }]);
    }
  });

  it("最初のメッセージが長すぎる（200文字を超える）・文字でないなら、読まずに 1008", async () => {
    const { groupId } = await create();
    // 中身は正しいグループIDでも、長さで断る（空白で200文字を超えさせる）
    const long = JSON.stringify({ groupId }) + " ".repeat(MAX_HELLO_LENGTH);
    const justFits = JSON.stringify({ groupId }).padEnd(MAX_HELLO_LENGTH, " ");
    const a = await connect(groupId);
    a.ws.send(long);
    await until(() => a.closed() !== null);
    expect(a.closed()).toBe(CLOSE_NOT_ALLOWED);
    expect(a.received).toEqual([]);
    const b = await connect(groupId);
    b.ws.send(new TextEncoder().encode(JSON.stringify({ groupId })));
    await until(() => b.closed() !== null);
    expect(b.closed()).toBe(CLOSE_NOT_ALLOWED);
    // 断りすぎの確認：ちょうど200文字なら通る
    const c = await connect(groupId);
    c.ws.send(justFits);
    await until(() => c.received.length === 1);
    expect(c.received[0]).toEqual({ type: "ready" });
  });

  it("グループIDの形が違えば、ハッシュが合う部屋でも 1008（ハッシュを計算せずに断る）", async () => {
    // 形の違う ID のハッシュの部屋に、入口を通さずに直接つなぐ（ハッシュが合うので、形の確かめだけで断られることを見る）
    const badId = "short-id";
    const stub = env.GROUP_ROOM.get(env.GROUP_ROOM.idFromName(await roomKey(badId)));
    const res = await stub.fetch(`${ORIGIN}/`, { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    const got: string[] = [];
    let closed: number | null = null;
    ws.addEventListener("message", (e) => {
      got.push(e.data as string);
    });
    ws.addEventListener("close", (e) => {
      closed = e.code;
    });
    ws.accept();
    ws.send(JSON.stringify({ groupId: badId }));
    await until(() => closed !== null);
    expect(closed).toBe(CLOSE_NOT_ALLOWED);
    expect(got).toEqual([]);
  });

  it("つないでから10秒を過ぎて届いた最初のメッセージは 1008（アラームが遅れたとき用）", async () => {
    const { groupId } = await create();
    const a = await connect(groupId);
    await runInDurableObject(await stubOf(groupId), (_room, state) => {
      for (const ws of state.getWebSockets()) {
        const att = ws.deserializeAttachment() as { authed: boolean; connectedAt: number };
        ws.serializeAttachment({ ...att, connectedAt: att.connectedAt - HELLO_TIMEOUT_MS - 1 });
      }
    });
    a.hello(groupId);
    await until(() => a.closed() !== null);
    expect(a.closed()).toBe(CLOSE_NOT_ALLOWED);
    expect(a.received).toEqual([]);
  });

  it("画面が閉じたら、部屋が同じ番号で閉じ返す", async () => {
    const { groupId } = await create();
    const a = await connectReady(groupId);
    a.ws.close(4000);
    await until(() => a.closed() !== null);
    expect(a.closed()).toBe(4000);
  });

  it("ping には pong が返る（確かめの前でも後でも、部屋が眠っていても）", async () => {
    const { groupId } = await create();
    const a = await connect(groupId);
    a.ws.send("ping");
    await until(() => a.raw.length === 1);
    expect(a.raw[0]).toBe("pong");
    a.hello(groupId);
    await until(() => a.received.length === 1);
    await evictDurableObject(await stubOf(groupId));
    a.ws.send("ping");
    await until(() => a.raw.length === 3);
    expect(a.raw[2]).toBe("pong");
    expect(a.closed()).toBeNull();
  });
});

describe("部屋が眠って起きても（Hibernation）", () => {
  it("つながりと「確かめ済み」が残り、変更が届く", async () => {
    const { groupId, memberId } = await create();
    const a = await connectReady(groupId);
    // 部屋を眠らせる（メモリは消え、WebSocket はつながったまま）
    await evictDurableObject(await stubOf(groupId));
    await putVisit(groupId, memberId, 47);
    await until(() => a.received.length === 2);
    expect(a.received[1]).toEqual({ type: "visit", memberId, pref: 47, visited: true });
    expect(a.closed()).toBeNull();
  });

  it("眠った後でも、確かめ前の接続には届かず、後から確かめられる", async () => {
    const { groupId, memberId } = await create();
    const a = await connect(groupId);
    await evictDurableObject(await stubOf(groupId));
    await putVisit(groupId, memberId, 6);
    await pause();
    expect(a.received).toEqual([]);
    a.hello(groupId);
    await until(() => a.received.length === 1);
    expect(a.received[0]).toEqual({ type: "ready" });
  });
});

describe("最初のメッセージを送らない接続は10秒で切る（ADR 0012）", () => {
  it("つないだときに10秒後のアラームを掛け、期限の前は切らず、期限を過ぎた確かめ前の接続だけを 1008 で切る", async () => {
    const { groupId, memberId } = await create();
    const stub = await stubOf(groupId);
    const waiting = await connect(groupId);
    const ready = await connectReady(groupId);

    // アラームは、確かめ前の接続のつないだ時刻＋10秒
    const before = await runInDurableObject(stub, async (_room, state) => ({
      alarm: await state.storage.getAlarm(),
      connectedAt: state.getWebSockets().map((ws) => (ws.deserializeAttachment() as { connectedAt: number }).connectedAt),
    }));
    expect(before.alarm).toBe(Math.min(...before.connectedAt) + HELLO_TIMEOUT_MS);

    // 期限の前にアラームが動いても切らず、まだ待っている接続のために掛け直す
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await pause();
    expect(waiting.closed()).toBeNull();
    expect(await runInDurableObject(stub, (_room, state) => state.storage.getAlarm())).not.toBeNull();

    // 時間を進める代わりに、つないだ時刻を10秒と少し前にずらす（確かめ済みの接続もずらす：確かめ済みは切らないことを見る）
    await runInDurableObject(stub, (_room, state) => {
      for (const ws of state.getWebSockets()) {
        const att = ws.deserializeAttachment() as { authed: boolean; connectedAt: number };
        ws.serializeAttachment({ ...att, connectedAt: att.connectedAt - HELLO_TIMEOUT_MS - 1 });
      }
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await until(() => waiting.closed() !== null);
    expect(waiting.closed()).toBe(CLOSE_NOT_ALLOWED);
    // 待っている接続がなくなったので、アラームは掛け直さない
    expect(await runInDurableObject(stub, (_room, state) => state.storage.getAlarm())).toBeNull();

    // 確かめ済みの接続は残り、届く
    await putVisit(groupId, memberId, 8);
    await until(() => ready.received.length === 2);
    expect(ready.closed()).toBeNull();
  });

  it("続けて何本つないでもアラームは1つ。鳴ったときに確かめ前が残っていれば、いまから10秒後に掛け直す（仮の値 2026-10-26）", async () => {
    const { groupId } = await create();
    const stub = await stubOf(groupId);
    const clients = [await connect(groupId), await connect(groupId), await connect(groupId)];
    const first = await runInDurableObject(stub, async (_room, state) => ({
      alarm: await state.storage.getAlarm(),
      connectedAt: state.getWebSockets().map((ws) => (ws.deserializeAttachment() as { connectedAt: number }).connectedAt),
    }));
    // 一番早くつないだときに掛けたアラームのまま（後からつないでも動かない）
    expect(first.connectedAt).toHaveLength(3);
    expect(first.alarm).toBe(Math.min(...first.connectedAt) + HELLO_TIMEOUT_MS);

    // どれか1本は期限切れ、残りは期限まで5秒（部屋の中の接続の並びは、つないだ順とは限らない）
    const now = Date.now();
    await runInDurableObject(stub, (_room, state) => {
      state.getWebSockets().forEach((ws, i) => {
        ws.serializeAttachment({ authed: false, connectedAt: i === 0 ? now - HELLO_TIMEOUT_MS - 1 : now - 5_000 });
      });
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await until(() => clients.some((c) => c.closed() !== null));
    await pause();
    expect(clients.map((c) => c.closed()).sort()).toEqual([CLOSE_NOT_ALLOWED, null, null]);
    // 掛け直しは「いまから10秒後」。一番早い期限（残りの接続の5秒後）には合わせない
    const next = await runInDurableObject(stub, (_room, state) => state.storage.getAlarm());
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThanOrEqual(now + HELLO_TIMEOUT_MS);
    expect(next!).toBeLessThan(now + HELLO_TIMEOUT_MS + 5_000);
  });

  it("眠っている間に期限が来ても、アラームで起きて切る", async () => {
    const { groupId } = await create();
    const stub = await stubOf(groupId);
    const waiting = await connect(groupId);
    await runInDurableObject(stub, (_room, state) => {
      for (const ws of state.getWebSockets()) {
        const att = ws.deserializeAttachment() as { authed: boolean; connectedAt: number };
        ws.serializeAttachment({ ...att, connectedAt: att.connectedAt - HELLO_TIMEOUT_MS - 1 });
      }
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await until(() => waiting.closed() !== null);
    expect(waiting.closed()).toBe(CLOSE_NOT_ALLOWED);
  });
});

describe("書けた後に部屋へ知らせる（architecture の「部屋が配るもの」）", () => {
  it("メンバーの削除で refetch が届く（Q-020）", async () => {
    const { groupId } = await create();
    const j = await join(groupId, "たろう");
    const a = await connectReady(groupId);
    expect((await call("DELETE", `/api/groups/${groupId}/members/${j.json.memberId}`)).status).toBe(200);
    await until(() => a.received.length === 2);
    expect(a.received[1]).toEqual({ type: "refetch" });
  });

  it("グループの削除で refetch が届く（Q-020）", async () => {
    const { groupId } = await create();
    const a = await connectReady(groupId);
    expect((await call("DELETE", `/api/groups/${groupId}`)).status).toBe(200);
    await until(() => a.received.length === 2);
    expect(a.received[1]).toEqual({ type: "refetch" });
  });

  it("紐づけで refetch が届く（「行った」がアカウントのものに入れ替わるため）", async () => {
    const { groupId, memberId } = await create();
    const a = await connectReady(groupId);
    const r = await call("POST", `/api/groups/${groupId}/members/${memberId}/link`, {
      token: await token(newUid()),
      body: { visits: "merge" },
    });
    expect(r.status).toBe(200);
    await until(() => a.received.length === 2);
    expect(a.received[1]).toEqual({ type: "refetch" });
  });

  it("参加・退出・名前の変更・グループ名の変更・ログイン済みの人の「行った」では配らない", async () => {
    const { groupId } = await create();
    const uid = newUid();
    const t = await token(uid);
    const a = await connectReady(groupId);
    const j = await join(groupId, "はなこ", t);
    expect(j.status).toBe(201);
    expect((await call("PUT", `/api/groups/${groupId}/members/${j.json.memberId}/name`, { token: t, body: { name: "はな" } })).status).toBe(
      200,
    );
    expect((await call("PUT", `/api/groups/${groupId}/my-visits/9`, { token: t })).status).toBe(200);
    expect((await call("PUT", `/api/groups/${groupId}/name`, { body: { name: "旅の会" } })).status).toBe(200);
    expect((await call("POST", `/api/groups/${groupId}/members/${j.json.memberId}/leave`, { token: t })).status).toBe(200);
    await pause();
    expect(a.received).toEqual([{ type: "ready" }]);
  });

  it("断られた書き込み（403・404）では配らない（NFR-006 (1)(5)）", async () => {
    // 「作成者のみ」のグループ
    const owner = await token(newUid());
    const g = await create("ゆう", { token: owner });
    expect((await call("PUT", `/api/groups/${g.groupId}/manage-by`, { token: owner, body: { manageBy: "owner" } })).status).toBe(200);
    const linked = await join(g.groupId, "じろう", await token(newUid()));
    const free = await join(g.groupId, "さぶろう");
    const other = await create();
    const a = await connectReady(g.groupId);

    // 紐づいたメンバーの「行った」を、ログインなしで付ける → 403
    expect(await putVisit(g.groupId, linked.json.memberId, 10)).toEqual({ status: 403, json: { error: "member_linked" } });
    // 紐づいたメンバーの「行った」を、ログインなしで外す → 403
    expect(await call("DELETE", `/api/groups/${g.groupId}/members/${linked.json.memberId}/visits/10`)).toEqual({
      status: 403,
      json: { error: "member_linked" },
    });
    // よそのグループのメンバーの番号 → 404
    expect(await putVisit(g.groupId, other.memberId, 10)).toEqual({ status: 404, json: { error: "member_not_found" } });
    // 県の番号が範囲の外 → 400
    expect(await putVisit(g.groupId, free.json.memberId, 48)).toEqual({ status: 400, json: { error: "bad_request" } });
    // 管理できる人でない人がメンバー・グループを消す → 403
    expect(await call("DELETE", `/api/groups/${g.groupId}/members/${free.json.memberId}`)).toEqual({
      status: 403,
      json: { error: "not_allowed" },
    });
    expect(await call("DELETE", `/api/groups/${g.groupId}`)).toEqual({ status: 403, json: { error: "not_allowed" } });
    // ほかの人に紐づいたメンバーを紐づける → 403
    expect(
      await call("POST", `/api/groups/${g.groupId}/members/${linked.json.memberId}/link`, {
        token: await token(newUid()),
        body: { visits: "merge" },
      }),
    ).toEqual({ status: 403, json: { error: "member_linked" } });
    await pause();
    expect(a.received).toEqual([{ type: "ready" }]);

    // 断りすぎの確認：通る書き込みなら届く
    expect((await putVisit(g.groupId, free.json.memberId, 10)).status).toBe(200);
    await until(() => a.received.length === 2);
    expect(a.received[1]).toEqual({ type: "visit", memberId: free.json.memberId, pref: 10, visited: true });
  });

  it("部屋に知らせるのに失敗しても、書き込みは成功で返り、D1 に残る（ADR 0003）", async () => {
    const { groupId, memberId } = await create();
    const broken = {
      idFromName() {
        throw new Error("部屋が使えない");
      },
      get() {
        throw new Error("部屋が使えない");
      },
    } as unknown as Env["GROUP_ROOM"];
    expect(await putVisit(groupId, memberId, 11, { env: { GROUP_ROOM: broken } })).toEqual({ status: 200, json: { ok: true } });
    const row = await env.DB.prepare("SELECT 1 AS x FROM member_visits WHERE member_id = ? AND pref = 11").bind(memberId).first();
    expect(row).toEqual({ x: 1 });
    expect(await call("DELETE", `/api/groups/${groupId}`, { env: { GROUP_ROOM: broken } })).toEqual({ status: 200, json: { ok: true } });
  });

  it("部屋の broadcast が後から失敗しても（非同期の拒否）、書き込みは成功のまま", async () => {
    const { groupId, memberId } = await create();
    const rejecting = {
      idFromName: (name: string) => env.GROUP_ROOM.idFromName(name),
      get: () => ({
        broadcast: async () => {
          await Promise.resolve();
          throw new Error("部屋が使えない");
        },
      }),
    } as unknown as Env["GROUP_ROOM"];
    expect(await putVisit(groupId, memberId, 12, { env: { GROUP_ROOM: rejecting } })).toEqual({ status: 200, json: { ok: true } });
    const row = await env.DB.prepare("SELECT 1 AS x FROM member_visits WHERE member_id = ? AND pref = 12").bind(memberId).first();
    expect(row).toEqual({ x: 1 });
  });
});
