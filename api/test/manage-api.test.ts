// 退出・メンバーの削除・グループ名の変更・グループの削除の API のテスト。
// 改造した画面を想定したリクエストが断られること（docs/design/permissions.md の × の欄、NFR-006 (14)）と、
// 通るべき人が通ること（断りすぎていないこと）、0行だったときの分け方（data-model.md）を確かめる
import { beforeAll, describe, expect, it } from "vitest";
import { call, create, env, join, setup } from "./helpers";

beforeAll(setup);

const putVisit = (groupId: string, memberId: number, pref: number) =>
  call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/${pref}`);
const memberRow = (id: number) => env.DB.prepare("SELECT name, group_id FROM members WHERE id = ?").bind(id).first<{ name: string }>();
const memberVisits = async (id: number) =>
  (await env.DB.prepare("SELECT pref FROM member_visits WHERE member_id = ? ORDER BY pref").bind(id).all<{ pref: number }>()).results.map(
    (r) => r.pref,
  );
const groupExists = async (id: string) => (await env.DB.prepare("SELECT 1 FROM groups WHERE id = ?").bind(id).first()) !== null;
const groupName = async (id: string) =>
  (await env.DB.prepare("SELECT name FROM groups WHERE id = ?").bind(id).first<{ name: string }>())?.name;

describe("退出（REQ-049・REQ-050）", () => {
  const leave = (groupId: string, memberId: number) => call("POST", `/api/groups/${groupId}/members/${memberId}/leave`);

  it("そのグループのメンバーなら誰でも退出させられる（信頼ベース）。「行った」も消える", async () => {
    const { groupId } = await create();
    const j = await join(groupId, "たろう");
    await putVisit(groupId, j.json.memberId, 1);
    expect(await leave(groupId, j.json.memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
    expect(await memberRow(j.json.memberId)).toBeNull();
    expect(await memberVisits(j.json.memberId)).toEqual([]);
    expect(await groupExists(groupId)).toBe(true);
  });

  it("最後の1人が退出すると、グループも消える（REQ-050）。もう一度送ると 404", async () => {
    const { groupId, memberId } = await create();
    expect(await leave(groupId, memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: true } });
    expect(await groupExists(groupId)).toBe(false);
    expect(await leave(groupId, memberId)).toEqual({ status: 404, json: { error: "group_not_found" } });
  });

  it("2回押しても成功（もういないメンバー）", async () => {
    const { groupId } = await create();
    const j = await join(groupId, "たろう");
    expect((await leave(groupId, j.json.memberId)).status).toBe(200);
    expect(await leave(groupId, j.json.memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
  });

  it("ほかのグループのメンバーの番号では退出させられない（何もせず成功：NFR-006 (14)）", async () => {
    const mine = await create();
    // 相手のグループは1人だけ（消されたら、グループまで消える場面）
    const victim = await create("じろう");
    await putVisit(victim.groupId, victim.memberId, 7);
    expect(await leave(mine.groupId, victim.memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
    expect(await memberRow(victim.memberId)).not.toBeNull();
    expect(await memberVisits(victim.memberId)).toEqual([7]);
    expect(await groupExists(victim.groupId)).toBe(true);
    expect(await groupExists(mine.groupId)).toBe(true);
  });

  it("0人のグループが残っていたら、退出の batch の2つ目の文で消える（前の文の結果を見ない。消して困るものはない）", async () => {
    const { groupId, memberId } = await create();
    await env.DB.prepare("DELETE FROM members WHERE id = ?").bind(memberId).run();
    expect(await leave(groupId, memberId)).toEqual({ status: 404, json: { error: "group_not_found" } });
    expect(await groupExists(groupId)).toBe(false);
  });

  it("メンバーの番号の形が違えば 400", async () => {
    const { groupId } = await create();
    expect(await leave(groupId, "abc" as unknown as number)).toEqual({ status: 400, json: { error: "bad_request" } });
  });
});

describe("メンバーの削除（REQ-048・REQ-050）", () => {
  const del = (groupId: string, memberId: number) => call("DELETE", `/api/groups/${groupId}/members/${memberId}`);

  it("そのグループのメンバーなら誰でも削除できる（信頼ベース）。「行った」も消える", async () => {
    const { groupId } = await create();
    const j = await join(groupId, "たろう");
    await putVisit(groupId, j.json.memberId, 2);
    expect(await del(groupId, j.json.memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
    expect(await memberRow(j.json.memberId)).toBeNull();
    expect(await memberVisits(j.json.memberId)).toEqual([]);
  });

  it("最後の1人を削除すると、グループも消える（REQ-050）", async () => {
    const { groupId, memberId } = await create();
    expect(await del(groupId, memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: true } });
    expect(await groupExists(groupId)).toBe(false);
  });

  it("ほかのグループのメンバーの番号では削除できない（何もせず成功：NFR-006 (14)）", async () => {
    const mine = await create();
    const victim = await create("じろう");
    const other = await join(victim.groupId, "さぶろう");
    for (const id of [victim.memberId, other.json.memberId]) {
      expect(await del(mine.groupId, id)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
      expect(await memberRow(id)).not.toBeNull();
    }
    expect(await groupExists(mine.groupId)).toBe(true);
  });

  it("いないメンバーの番号は成功、ないグループは 404", async () => {
    const { groupId } = await create();
    expect(await del(groupId, 999999999)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
    expect(await del("D".repeat(22), 1)).toEqual({ status: 404, json: { error: "group_not_found" } });
  });
});

describe("グループ名の変更（REQ-046）", () => {
  const rename = (groupId: string, name: unknown) => call("PUT", `/api/groups/${groupId}/name`, { body: { name } });

  it("グループIDを知っていれば変えられる（メンバーの番号は受け取らない）", async () => {
    const { groupId } = await create();
    expect(await rename(groupId, " 新しい名前 ")).toEqual({ status: 200, json: { ok: true } });
    expect(await groupName(groupId)).toBe("新しい名前");
  });

  it("同じ名前なら書かずに成功する（0行で、グループがあるとき）", async () => {
    const { groupId } = await create();
    // 名前の書き換えを断るトリガーを一時的に置き、同じ名前では書き込みに行かないことを確かめる（最後に外す）
    await env.DB.prepare(
      "CREATE TRIGGER test_block_rename BEFORE UPDATE OF name ON groups BEGIN SELECT RAISE(ABORT, 'blocked'); END",
    ).run();
    try {
      expect(await rename(groupId, "旅行部")).toEqual({ status: 200, json: { ok: true } });
      // 断りすぎの確認：違う名前なら書き込みに行く（トリガーで落ちて 503 になる）
      expect((await rename(groupId, "別の名前")).status).toBe(503);
    } finally {
      await env.DB.prepare("DROP TRIGGER test_block_rename").run();
    }
    expect(await groupName(groupId)).toBe("旅行部");
  });

  it("ないグループは、同じ名前に見えても成功にせず 404 group_not_found（0行の分け方）", async () => {
    const { groupId, memberId } = await create();
    expect((await call("POST", `/api/groups/${groupId}/members/${memberId}/leave`)).json).toEqual({ ok: true, groupDeleted: true });
    expect(await rename(groupId, "旅行部")).toEqual({ status: 404, json: { error: "group_not_found" } });
    expect(await rename("E".repeat(22), "新しい名前")).toEqual({ status: 404, json: { error: "group_not_found" } });
  });

  it("グループ名の決まりに外れれば 400（REQ-010）", async () => {
    const { groupId } = await create();
    expect(await rename(groupId, "あ".repeat(21))).toEqual({ status: 400, json: { error: "bad_name" } });
    expect(await rename(groupId, " ")).toEqual({ status: 400, json: { error: "bad_name" } });
    expect(await rename(groupId, "旅​行部")).toEqual({ status: 400, json: { error: "bad_name" } });
    expect(await rename(groupId, 123)).toEqual({ status: 400, json: { error: "bad_name" } });
    expect(await groupName(groupId)).toBe("旅行部");
  });
});

describe("グループの削除（REQ-047）", () => {
  const deleteGroup = (groupId: string) => call("DELETE", `/api/groups/${groupId}`);

  it("グループIDを知っていれば削除できる。メンバーと「行った」も消える", async () => {
    const { groupId, memberId } = await create();
    const j = await join(groupId, "たろう");
    await putVisit(groupId, memberId, 3);
    await putVisit(groupId, j.json.memberId, 4);
    expect(await deleteGroup(groupId)).toEqual({ status: 200, json: { ok: true } });
    expect(await groupExists(groupId)).toBe(false);
    expect(await memberRow(memberId)).toBeNull();
    expect(await memberVisits(memberId)).toEqual([]);
    expect(await memberVisits(j.json.memberId)).toEqual([]);
  });

  it("0行なら 404 group_not_found（2回押した・ないグループ）。ほかのグループは消えない", async () => {
    const { groupId } = await create();
    const other = await create();
    expect((await deleteGroup(groupId)).status).toBe(200);
    expect(await deleteGroup(groupId)).toEqual({ status: 404, json: { error: "group_not_found" } });
    expect(await deleteGroup("F".repeat(22))).toEqual({ status: 404, json: { error: "group_not_found" } });
    expect(await groupExists(other.groupId)).toBe(true);
  });
});
