// リアルタイムの共有のテスト（ADR 0003 の「リアルタイムの共有」、NFR-003）
import { applyD1Migrations, env, evictDurableObject, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createGroup, joinGroup } from "../src/db";
import { roomKey } from "../src/room";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

/** 部屋につなぎ、届いたメッセージを貯める */
async function connect(groupIdForKey: string) {
  const res = await SELF.fetch(`https://x/api/rooms/${await roomKey(groupIdForKey)}/ws`, {
    headers: { Upgrade: "websocket" },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const received: unknown[] = [];
  let closed: number | null = null;
  ws.addEventListener("message", (e) => received.push(JSON.parse(e.data as string)));
  ws.addEventListener("close", (e) => (closed = e.code));
  ws.accept();
  return {
    ws,
    received,
    closed: () => closed,
    hello: (groupId: string) => ws.send(JSON.stringify({ groupId })),
  };
}

/** 条件がそろうまで少し待つ（WebSocket のメッセージは少し遅れて届く） */
async function until(cond: () => boolean, ms = 1000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("待ちきれなかった");
    await new Promise((r) => setTimeout(r, 10));
  }
}
const pause = () => new Promise((r) => setTimeout(r, 100));

async function visit(groupId: string, memberId: number, pref: number, visited = true) {
  return SELF.fetch("https://x/api/visits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, memberId, pref, visited }),
  });
}

async function newGroup() {
  const { groupId, memberId } = await createGroup(env.DB, "旅行部", "ゆう");
  return { groupId, memberId };
}

describe("部屋につなぐ", () => {
  it("正しいグループIDを送ると ready が返り、「行った」の変更が届く", async () => {
    const { groupId, memberId } = await newGroup();
    const a = await connect(groupId);
    a.hello(groupId);
    await until(() => a.received.length === 1);
    expect(a.received[0]).toEqual({ type: "ready" });

    const res = await visit(groupId, memberId, 13);
    expect(await res.json()).toEqual({ ok: true, notified: 1 });
    await until(() => a.received.length === 2);
    expect(a.received[1]).toEqual({ type: "visit", memberId, pref: 13, visited: true });
  });

  it("同じグループの2人ともに届く（外したときも）", async () => {
    const { groupId, memberId } = await newGroup();
    const a = await connect(groupId);
    const b = await connect(groupId);
    a.hello(groupId);
    b.hello(groupId);
    await until(() => a.received.length === 1 && b.received.length === 1);
    await visit(groupId, memberId, 1, true);
    await visit(groupId, memberId, 1, false);
    await until(() => a.received.length === 3 && b.received.length === 3);
    expect(b.received[2]).toEqual({ type: "visit", memberId, pref: 1, visited: false });
  });

  it("違うグループIDを送ると切られ、何も届かない", async () => {
    const { groupId, memberId } = await newGroup();
    const a = await connect(groupId);
    a.hello("ちがうグループID0000000000");
    await until(() => a.closed() !== null);
    expect(a.closed()).toBe(1008);
    await visit(groupId, memberId, 2);
    await pause();
    expect(a.received).toEqual([]);
  });

  it("最初のメッセージを送るまでは、何も届かない", async () => {
    const { groupId, memberId } = await newGroup();
    const a = await connect(groupId);
    const res = await visit(groupId, memberId, 3);
    expect(await res.json()).toEqual({ ok: true, notified: 0 });
    await pause();
    expect(a.received).toEqual([]);
  });

  it("別のグループの変更は届かない", async () => {
    const g1 = await newGroup();
    const g2 = await newGroup();
    const a = await connect(g1.groupId);
    a.hello(g1.groupId);
    await until(() => a.received.length === 1);
    await visit(g2.groupId, g2.memberId, 4);
    await pause();
    expect(a.received).toHaveLength(1);
  });

  it("ping には部屋を起こさずに pong が返る", async () => {
    const { groupId } = await newGroup();
    const res = await SELF.fetch(`https://x/api/rooms/${await roomKey(groupId)}/ws`, { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    const got: string[] = [];
    ws.addEventListener("message", (e) => got.push(e.data as string));
    ws.accept();
    ws.send("ping");
    await until(() => got.length === 1);
    expect(got[0]).toBe("pong");
  });
});

describe("部屋が眠って起きても（Hibernation）", () => {
  it("つながりと「確かめ済み」が残り、変更が届く", async () => {
    const { groupId, memberId } = await newGroup();
    const a = await connect(groupId);
    a.hello(groupId);
    await until(() => a.received.length === 1);

    // 部屋を眠らせる（メモリは消え、WebSocket はつながったまま）
    const stub = env.GROUP_ROOM.get(env.GROUP_ROOM.idFromName(await roomKey(groupId)));
    await evictDurableObject(stub);

    await visit(groupId, memberId, 47);
    await until(() => a.received.length === 2);
    expect(a.received[1]).toEqual({ type: "visit", memberId, pref: 47, visited: true });
    expect(a.closed()).toBeNull();
  });
});

describe("「行った」の API", () => {
  it("そのグループのメンバーでなければ 404 で、誰にも配らない", async () => {
    const g1 = await newGroup();
    const g2 = await newGroup();
    const a = await connect(g1.groupId);
    a.hello(g1.groupId);
    await until(() => a.received.length === 1);
    const res = await visit(g1.groupId, g2.memberId, 5); // 別のグループのメンバー
    expect(res.status).toBe(404);
    await pause();
    expect(a.received).toHaveLength(1);
  });

  it("県の番号がおかしければ 400", async () => {
    const { groupId, memberId } = await newGroup();
    expect((await visit(groupId, memberId, 48)).status).toBe(400);
  });

  it("参加した人の変更も届く", async () => {
    const { groupId } = await newGroup();
    const b = await joinGroup(env.DB, groupId, "たろう");
    if (!b.ok) throw new Error("参加できなかった");
    const a = await connect(groupId);
    a.hello(groupId);
    await until(() => a.received.length === 1);
    await visit(groupId, b.memberId, 26);
    await until(() => a.received.length === 2);
    expect(a.received[1]).toMatchObject({ memberId: b.memberId, pref: 26 });
  });
});
