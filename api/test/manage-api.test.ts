// 紐づけ・名前の変更・退出・管理の操作・グループ一覧・退会の API のテスト。
// 改造した画面を想定したリクエストが断られること（docs/design/permissions.md の × の欄）と、
// 通るべき人が通ること（断りすぎていないこと）を確かめる
import { beforeAll, describe, expect, it } from "vitest";
import { call, create, env, join, setup, token } from "./helpers";

beforeAll(setup);

let n = 0;
/** テストごとに別の uid を使う（テストどうしでデータベースを共有しているため） */
const newUid = () => `uid-m-${++n}-${Date.now()}`;

const putVisit = (groupId: string, memberId: number, pref: number) =>
  call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/${pref}`);
const link = (groupId: string, memberId: number, t: string | undefined, visits: unknown = "merge") =>
  call("POST", `/api/groups/${groupId}/members/${memberId}/link`, { token: t, body: { visits } });
const memberRow = (id: number) =>
  env.DB.prepare("SELECT name, uid FROM members WHERE id = ?").bind(id).first<{ name: string; uid: string | null }>();
const memberVisits = async (id: number) =>
  (await env.DB.prepare("SELECT pref FROM member_visits WHERE member_id = ? ORDER BY pref").bind(id).all<{ pref: number }>()).results.map(
    (r) => r.pref,
  );
const accountVisits = async (uid: string) =>
  (await env.DB.prepare("SELECT pref FROM account_visits WHERE uid = ? ORDER BY pref").bind(uid).all<{ pref: number }>()).results.map(
    (r) => r.pref,
  );
const groupExists = async (id: string) => (await env.DB.prepare("SELECT 1 FROM groups WHERE id = ?").bind(id).first()) !== null;

/** ログイン済みの作成者が作り、「作成者のみ」にしたグループ */
async function ownerOnlyGroup() {
  const ownerUid = newUid();
  const owner = await token(ownerUid);
  const g = await create("ゆう", { token: owner });
  expect((await call("PUT", `/api/groups/${g.groupId}/manage-by`, { token: owner, body: { manageBy: "owner" } })).status).toBe(200);
  return { ...g, owner, ownerUid };
}

/** トリガーを一時的に外して fn を動かし、必ず元に戻す（後ろの守りを外して、前の守りで断られたことを確かめる） */
async function withoutTrigger(name: string, fn: () => Promise<void>) {
  const row = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?").bind(name).first<{ sql: string }>();
  await env.DB.prepare(`DROP TRIGGER ${name}`).run();
  try {
    await fn();
  } finally {
    await env.DB.prepare(row!.sql).run();
  }
}

describe("紐づけ（REQ-037〜REQ-040・REQ-043）", () => {
  it("ログインしていない・確認待ちの人は 401 login_required（NFR-006 (10)）", async () => {
    const { groupId, memberId } = await create();
    expect(await link(groupId, memberId, undefined)).toEqual({ status: 401, json: { error: "login_required" } });
    const r = await link(groupId, memberId, await token(newUid(), { email_verified: false }));
    expect(r).toEqual({ status: 401, json: { error: "login_required" } });
    expect((await memberRow(memberId))!.uid).toBeNull();
  });

  it("合算：メンバーの「行った」をアカウントに足し、メンバーの行は消える。地図では自分になる（REQ-038）", async () => {
    const uid = newUid();
    const t = await token(uid);
    const { groupId, memberId } = await create();
    await putVisit(groupId, memberId, 1);
    await putVisit(groupId, memberId, 13);
    // 先にアカウントの「行った」を別のグループで作っておく
    const other = await create("べつ", { token: t });
    await call("PUT", `/api/groups/${other.groupId}/my-visits/47`, { token: t });

    expect(await link(groupId, memberId, t)).toEqual({ status: 200, json: { ok: true } });
    expect((await memberRow(memberId))!.uid).toBe(uid);
    expect(await memberVisits(memberId)).toEqual([]);
    expect(await accountVisits(uid)).toEqual([1, 13, 47]);
    const view = (await call("GET", `/api/groups/${groupId}`, { token: t })).json;
    expect(view.members[0]).toMatchObject({ id: memberId, linked: true, isMe: true });
    expect(view.visits).toEqual([1, 13, 47].map((pref) => ({ memberId, pref })));
  });

  it("捨てる：メンバーの「行った」は消え、アカウントの「行った」はそのまま（REQ-038）", async () => {
    const uid = newUid();
    const t = await token(uid);
    const other = await create("べつ", { token: t });
    await call("PUT", `/api/groups/${other.groupId}/my-visits/47`, { token: t });
    const { groupId, memberId } = await create();
    await putVisit(groupId, memberId, 1);
    expect((await link(groupId, memberId, t, "discard")).status).toBe(200);
    expect(await memberVisits(memberId)).toEqual([]);
    expect(await accountVisits(uid)).toEqual([47]);
  });

  it("2回送っても成功（自分に紐づいていれば ok）", async () => {
    const t = await token(newUid());
    const { groupId, memberId } = await create();
    expect((await link(groupId, memberId, t)).status).toBe(200);
    expect(await link(groupId, memberId, t)).toEqual({ status: 200, json: { ok: true } });
  });

  it("ほかの人に紐づいたメンバーは、自分に付け替えられない（NFR-006 (3)）。前の守り（WHERE uid IS NULL）だけでも断る", async () => {
    const aUid = newUid();
    const { groupId, memberId } = await create("ゆう", { token: await token(aUid) });
    const bUid = newUid();
    const b = await token(bUid);
    expect(await link(groupId, memberId, b)).toEqual({ status: 403, json: { error: "member_linked" } });
    // 後ろの守り（紐づいた uid を変えさせないトリガー）を外しても、SQL の WHERE で断られる
    await withoutTrigger("members_uid_fixed", async () => {
      expect(await link(groupId, memberId, b)).toEqual({ status: 403, json: { error: "member_linked" } });
    });
    expect((await memberRow(memberId))!.uid).toBe(aUid);
  });

  it("紐づける文が0行のとき、「行った」を移す文と消す文は何もしない（batch の0行）", async () => {
    const aUid = newUid();
    const { groupId, memberId } = await create("ゆう", { token: await token(aUid) });
    // 起きないはずの状態（紐づいたメンバーに member_visits が残っている）を作り、ほかの人の紐づけで動かないことを見る
    await env.DB.prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 5)").bind(memberId).run();
    const bUid = newUid();
    expect((await link(groupId, memberId, await token(bUid))).status).toBe(403);
    expect(await accountVisits(bUid)).toEqual([]);
    expect(await memberVisits(memberId)).toEqual([5]);
    await env.DB.prepare("DELETE FROM member_visits WHERE member_id = ?").bind(memberId).run();
  });

  it("同じグループに自分のメンバーがすでにいれば 409 already_member で、何も変わらない（REQ-039・NFR-006 (9)）", async () => {
    const uid = newUid();
    const t = await token(uid);
    const { groupId, memberId } = await create();
    await putVisit(groupId, memberId, 3);
    expect((await join(groupId, "たろう", t)).status).toBe(201);
    expect(await link(groupId, memberId, t)).toEqual({ status: 409, json: { error: "already_member" } });
    expect((await memberRow(memberId))!.uid).toBeNull();
    expect(await memberVisits(memberId)).toEqual([3]);
    expect(await accountVisits(uid)).toEqual([]);
  });

  it("10グループに入っている人は、11グループ目のメンバーに紐づけられない（REQ-060・NFR-006 (13)）", async () => {
    const uid = newUid();
    const t = await token(uid);
    for (let i = 0; i < 10; i++) await create("ゆう", { token: t });
    const { groupId, memberId } = await create();
    await putVisit(groupId, memberId, 3);
    expect(await link(groupId, memberId, t)).toEqual({ status: 409, json: { error: "group_limit" } });
    expect((await memberRow(memberId))!.uid).toBeNull();
    expect(await memberVisits(memberId)).toEqual([3]);
  });

  it("別のグループのメンバーの番号・ないグループは 404、visits の値が違えば 400", async () => {
    const t = await token(newUid());
    const a = await create();
    const b = await create();
    expect(await link(a.groupId, b.memberId, t)).toEqual({ status: 404, json: { error: "member_not_found" } });
    expect((await memberRow(b.memberId))!.uid).toBeNull();
    expect(await link("A".repeat(22), a.memberId, t)).toEqual({ status: 404, json: { error: "group_not_found" } });
    expect(await link(a.groupId, a.memberId, t, "all")).toEqual({ status: 400, json: { error: "bad_request" } });
  });
});

describe("名前の変更（REQ-014・REQ-015・NFR-006 (1)）", () => {
  const rename = (groupId: string, memberId: number, t: string | undefined, name: unknown) =>
    call("PUT", `/api/groups/${groupId}/members/${memberId}/name`, { token: t, body: { name } });

  it("紐づいた本人は変えられる。大文字小文字だけの変更もできる", async () => {
    const t = await token(newUid());
    const { groupId, memberId } = await create("Yu", { token: t });
    expect(await rename(groupId, memberId, t, "yu")).toEqual({ status: 200, json: { ok: true } });
    expect(await rename(groupId, memberId, t, " ゆうき ")).toEqual({ status: 200, json: { ok: true } });
    // 同じ名前なら書かずに成功（無料枠）
    expect(await rename(groupId, memberId, t, "ゆうき")).toEqual({ status: 200, json: { ok: true } });
    expect((await memberRow(memberId))!.name).toBe("ゆうき");
  });

  it("ログインなしのメンバーの名前は、誰も変えられない（REQ-015）", async () => {
    const { groupId, memberId } = await create();
    expect(await rename(groupId, memberId, undefined, "かえた")).toEqual({ status: 401, json: { error: "login_required" } });
    expect(await rename(groupId, memberId, await token(newUid()), "かえた")).toEqual({ status: 403, json: { error: "not_allowed" } });
    expect((await memberRow(memberId))!.name).toBe("ゆう");
  });

  it("ほかの人に紐づいたメンバーの名前は変えられない（NFR-006 (1)）", async () => {
    const { groupId, memberId } = await create("ゆう", { token: await token(newUid()) });
    expect(await rename(groupId, memberId, await token(newUid()), "かえた")).toEqual({ status: 403, json: { error: "not_allowed" } });
    expect((await memberRow(memberId))!.name).toBe("ゆう");
  });

  it("同じグループの同じ名前（紐づいていないメンバーも）には変えられない（REQ-014・NFR-006 (11)）", async () => {
    const t = await token(newUid());
    const { groupId, memberId } = await create("ゆう", { token: t });
    await join(groupId, "たろう");
    expect(await rename(groupId, memberId, t, "タロウ")).toEqual({ status: 200, json: { ok: true } });
    expect(await rename(groupId, memberId, t, "たろう")).toEqual({ status: 409, json: { error: "name_taken" } });
    // 見た目が同じ名前（絵文字の形の切り替えだけが違う）にも変えられない
    await join(groupId, "\u2764");
    expect(await rename(groupId, memberId, t, "\u2764\uFE0F")).toEqual({ status: 409, json: { error: "name_taken" } });
  });

  it("10グループに入っている人も名前を変えられる（10グループのトリガーが自分を数えない）", async () => {
    const t = await token(newUid());
    let last = { groupId: "", memberId: 0 };
    for (let i = 0; i < 10; i++) last = await create("ゆう", { token: t });
    expect((await rename(last.groupId, last.memberId, t, "ゆうき")).status).toBe(200);
  });

  it("名前の決まりに外れれば 400、ないメンバーは 404", async () => {
    const t = await token(newUid());
    const { groupId, memberId } = await create("ゆう", { token: t });
    expect(await rename(groupId, memberId, t, "あ".repeat(11))).toEqual({ status: 400, json: { error: "bad_name" } });
    expect(await rename(groupId, memberId, t, "ゆ​う")).toEqual({ status: 400, json: { error: "bad_name" } });
    expect(await rename(groupId, memberId + 100000, t, "ゆうき")).toEqual({ status: 404, json: { error: "member_not_found" } });
  });
});

describe("退出（REQ-049・REQ-050・NFR-006 (12)）", () => {
  const leave = (groupId: string, memberId: number, t?: string) =>
    call("POST", `/api/groups/${groupId}/members/${memberId}/leave`, { token: t });

  it("ログインなしのメンバーは誰でも退出させられる（信頼ベース）。「行った」も消える", async () => {
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

  it("紐づいたメンバーは、ログインなしでもほかの人でも退出させられない。本人はできて、アカウントの「行った」は残る", async () => {
    const uid = newUid();
    const t = await token(uid);
    const { groupId, memberId } = await create("ゆう", { token: t });
    await join(groupId, "たろう");
    await call("PUT", `/api/groups/${groupId}/my-visits/13`, { token: t });
    expect(await leave(groupId, memberId)).toEqual({ status: 403, json: { error: "member_linked" } });
    expect(await leave(groupId, memberId, await token(newUid()))).toEqual({ status: 403, json: { error: "member_linked" } });
    // 本人の uid でも、確認待ちのトークンでは退出させられない（NFR-006 (10)）
    expect(await leave(groupId, memberId, await token(uid, { email_verified: false }))).toEqual({
      status: 403,
      json: { error: "member_linked" },
    });
    expect(await memberRow(memberId)).not.toBeNull();
    expect(await leave(groupId, memberId, t)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
    expect(await accountVisits(uid)).toEqual([13]);
  });

  it("2回押しても成功（もういないメンバー）。別のグループのメンバーは退出させられない", async () => {
    const a = await create();
    const j = await join(a.groupId, "たろう");
    expect((await leave(a.groupId, j.json.memberId)).status).toBe(200);
    expect(await leave(a.groupId, j.json.memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
    const b = await create();
    await join(b.groupId, "じろう");
    expect((await leave(a.groupId, b.memberId)).json).toEqual({ ok: true, groupDeleted: false });
    expect(await memberRow(b.memberId)).not.toBeNull();
  });

  it("0人のグループが残っていたら、退出の batch の2つ目の文で消える（前の文の結果を見ない。消して困るものはない）", async () => {
    const { groupId, memberId } = await create();
    await env.DB.prepare("DELETE FROM members WHERE id = ?").bind(memberId).run();
    expect(await leave(groupId, memberId)).toEqual({ status: 404, json: { error: "group_not_found" } });
    expect(await groupExists(groupId)).toBe(false);
  });

  it("作成者が退出すると、「作成者のみ」は効かなくなる（REQ-051）", async () => {
    const { groupId, memberId, owner } = await ownerOnlyGroup();
    await join(groupId, "たろう");
    expect((await leave(groupId, memberId, owner)).status).toBe(200);
    expect((await call("GET", `/api/groups/${groupId}`)).json.group).toMatchObject({ manageBy: "owner", ownerOnly: false });
  });
});

describe("管理の操作（REQ-044〜REQ-048・REQ-051・NFR-006 (5)）", () => {
  const del = (groupId: string, memberId: number, t?: string) => call("DELETE", `/api/groups/${groupId}/members/${memberId}`, { token: t });
  const renameGroup = (groupId: string, t: string | undefined, name: unknown) =>
    call("PUT", `/api/groups/${groupId}/name`, { token: t, body: { name } });
  const deleteGroup = (groupId: string, t?: string) => call("DELETE", `/api/groups/${groupId}`, { token: t });

  it("「誰でも」なら、ログインなしでも紐づいたメンバーを削除できる（REQ-048）", async () => {
    const { groupId } = await create();
    const j = await join(groupId, "たろう", await token(newUid()));
    expect(await del(groupId, j.json.memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
    expect(await memberRow(j.json.memberId)).toBeNull();
  });

  it("「誰でも」なら、グループ名を変えられ、グループを削除できる。アカウントの「行った」は残る（REQ-046・REQ-047）", async () => {
    const uid = newUid();
    const t = await token(uid);
    const { groupId } = await create();
    await join(groupId, "たろう", t);
    await call("PUT", `/api/groups/${groupId}/my-visits/13`, { token: t });
    expect(await renameGroup(groupId, undefined, "新しい名前")).toEqual({ status: 200, json: { ok: true } });
    expect((await call("GET", `/api/groups/${groupId}`)).json.group.name).toBe("新しい名前");
    expect(await deleteGroup(groupId)).toEqual({ status: 200, json: { ok: true } });
    expect(await groupExists(groupId)).toBe(false);
    expect(await accountVisits(uid)).toEqual([13]);
    expect(await deleteGroup(groupId)).toEqual({ status: 404, json: { error: "group_not_found" } });
  });

  it("「作成者のみ」なら、作成者に紐づいた本人のほかは、削除・名前の変更ができない（NFR-006 (5)(10)）", async () => {
    const { groupId, memberId, ownerUid } = await ownerOnlyGroup();
    const j = await join(groupId, "たろう");
    // 同じグループで紐づいた、作成者でないメンバー
    const member = await token(newUid());
    await join(groupId, "じろう", member);
    // 別のグループの、紐づいた作成者（作成者かを確かめる SQL がグループを見ていなければ通ってしまう）
    const otherOwner = (await ownerOnlyGroup()).owner;
    // 作成者本人の uid でも、確認待ち（メールアドレスを変えた後など）ならログインなしとして扱う
    const unverifiedOwner = await token(ownerUid, { email_verified: false });
    const denied = { status: 403, json: { error: "not_allowed" } };
    for (const t of [undefined, await token(newUid()), member, otherOwner, unverifiedOwner]) {
      expect(await del(groupId, j.json.memberId, t)).toEqual(denied);
      expect(await del(groupId, memberId, t)).toEqual(denied);
      expect(await renameGroup(groupId, t, "乗っ取り")).toEqual(denied);
      expect(await deleteGroup(groupId, t)).toEqual(denied);
    }
    expect(await memberRow(j.json.memberId)).not.toBeNull();
    expect((await call("GET", `/api/groups/${groupId}`)).json.group.name).toBe("旅行部");
    expect(await groupExists(groupId)).toBe(true);
  });

  it("「作成者のみ」でも、作成者に紐づいた本人はできる", async () => {
    const { groupId, owner } = await ownerOnlyGroup();
    const j = await join(groupId, "たろう");
    expect((await del(groupId, j.json.memberId, owner)).status).toBe(200);
    expect((await renameGroup(groupId, owner, "新しい名前")).status).toBe(200);
    expect((await deleteGroup(groupId, owner)).status).toBe(200);
  });

  it("作成者がいなくなったら、「作成者のみ」のままでも誰でもできる（REQ-051）", async () => {
    const { groupId, memberId, owner } = await ownerOnlyGroup();
    const j = await join(groupId, "たろう");
    await join(groupId, "じろう");
    expect((await call("POST", `/api/groups/${groupId}/members/${memberId}/leave`, { token: owner })).status).toBe(200);
    expect((await del(groupId, j.json.memberId)).status).toBe(200);
    expect((await renameGroup(groupId, undefined, "新しい名前")).status).toBe(200);
  });

  it("よそのグループのメンバーの番号は、自分の「誰でも」のグループからは削除できない（紐づいたメンバーも作成者も）", async () => {
    const mine = await create();
    const victim = await ownerOnlyGroup();
    const linked = await join(victim.groupId, "たろう", await token(newUid()));
    for (const id of [victim.memberId, linked.json.memberId]) {
      expect((await del(mine.groupId, id)).status).toBe(200);
      expect(await memberRow(id)).not.toBeNull();
    }
  });

  it("「作成者のみ」のグループでは、ないメンバーの番号でも、権限のない人には成功を返さない", async () => {
    const { groupId, owner } = await ownerOnlyGroup();
    expect(await del(groupId, 999999999)).toEqual({ status: 403, json: { error: "not_allowed" } });
    expect(await del(groupId, 999999999, owner)).toEqual({ status: 200, json: { ok: true, groupDeleted: false } });
  });

  it("同じグループ名に変えても成功し、書き込まない（無料枠）。権限のない人には同じ名前でも断る", async () => {
    const { groupId, owner } = await ownerOnlyGroup();
    expect(await renameGroup(groupId, owner, "旅行部")).toEqual({ status: 200, json: { ok: true } });
    expect(await renameGroup(groupId, undefined, "旅行部")).toEqual({ status: 403, json: { error: "not_allowed" } });
    const res = await env.DB.prepare("UPDATE groups SET name = ?1 WHERE id = ?2 AND name IS NOT ?1").bind("旅行部", groupId).run();
    expect(res.meta.changes).toBe(0);
  });

  it("最後の1人を削除すると、グループも消える（REQ-050）", async () => {
    const { groupId, memberId } = await create();
    expect(await del(groupId, memberId)).toEqual({ status: 200, json: { ok: true, groupDeleted: true } });
    expect(await groupExists(groupId)).toBe(false);
  });

  it("グループ名の決まりに外れれば 400（REQ-010）", async () => {
    const { groupId } = await create();
    expect(await renameGroup(groupId, undefined, "あ".repeat(21))).toEqual({ status: 400, json: { error: "bad_name" } });
    expect(await renameGroup(groupId, undefined, " ")).toEqual({ status: 400, json: { error: "bad_name" } });
  });
});

describe("管理できる人を変える（REQ-045・NFR-006 (4)(10)）", () => {
  const setManageBy = (groupId: string, t: string | undefined, manageBy: unknown) =>
    call("PUT", `/api/groups/${groupId}/manage-by`, { token: t, body: { manageBy } });

  it("ログインしていなければ 401、確認待ちも 401", async () => {
    const { groupId } = await create();
    expect(await setManageBy(groupId, undefined, "owner")).toEqual({ status: 401, json: { error: "login_required" } });
    expect(await setManageBy(groupId, await token(newUid(), { email_verified: false }), "owner")).toEqual({
      status: 401,
      json: { error: "login_required" },
    });
  });

  it("作成者でないメンバーに紐づいた人は変えられない", async () => {
    const { groupId } = await create("ゆう", { token: await token(newUid()) });
    const t = await token(newUid());
    await join(groupId, "たろう", t);
    expect(await setManageBy(groupId, t, "owner")).toEqual({ status: 403, json: { error: "not_allowed" } });
  });

  it("別のグループの作成者・確認待ちの作成者本人は変えられない（NFR-006 (4)(10)）", async () => {
    const ownerUid = newUid();
    const { groupId } = await create("ゆう", { token: await token(ownerUid) });
    const otherOwner = (await ownerOnlyGroup()).owner;
    expect(await setManageBy(groupId, otherOwner, "owner")).toEqual({ status: 403, json: { error: "not_allowed" } });
    expect(await setManageBy(groupId, await token(ownerUid, { email_verified: false }), "owner")).toEqual({
      status: 401,
      json: { error: "login_required" },
    });
    expect((await call("GET", `/api/groups/${groupId}`)).json.group.manageBy).toBe("everyone");
  });

  it("作成者のメンバーが紐づいていなければ、誰も変えられない（ログインなしの作成者の名前で入っても：REQ-052）", async () => {
    const { groupId } = await create();
    expect(await setManageBy(groupId, await token(newUid()), "owner")).toEqual({ status: 403, json: { error: "not_allowed" } });
  });

  it("作成者に紐づけた人は変えられる（REQ-037）。戻すこともできる", async () => {
    const t = await token(newUid());
    const { groupId, memberId } = await create();
    expect((await link(groupId, memberId, t)).status).toBe(200);
    expect(await setManageBy(groupId, t, "owner")).toEqual({ status: 200, json: { ok: true } });
    expect((await call("GET", `/api/groups/${groupId}`)).json.group).toMatchObject({ manageBy: "owner", ownerOnly: true });
    expect((await setManageBy(groupId, t, "everyone")).status).toBe(200);
  });

  it("作成者がいなくなったグループでは、誰も変えられない（REQ-045）", async () => {
    const { groupId, memberId, owner } = await ownerOnlyGroup();
    await join(groupId, "たろう");
    await call("POST", `/api/groups/${groupId}/members/${memberId}/leave`, { token: owner });
    expect(await setManageBy(groupId, owner, "everyone")).toEqual({ status: 403, json: { error: "not_allowed" } });
  });

  it("値が違えば 400、ないグループは 404", async () => {
    const t = await token(newUid());
    const { groupId } = await create("ゆう", { token: t });
    expect(await setManageBy(groupId, t, "admin")).toEqual({ status: 400, json: { error: "bad_request" } });
    expect(await setManageBy("A".repeat(22), t, "owner")).toEqual({ status: 404, json: { error: "group_not_found" } });
  });
});

describe("グループ一覧とマイページ（REQ-032・REQ-033）", () => {
  it("ログインしていなければ 401", async () => {
    expect(await call("GET", "/api/me/groups")).toEqual({ status: 401, json: { error: "login_required" } });
    expect(await call("GET", "/api/me/visits")).toEqual({ status: 401, json: { error: "login_required" } });
  });

  it("自分に紐づいたメンバーがいるグループだけを返す（NFR-006 (7)）", async () => {
    const t = await token(newUid());
    const mine = await create("ゆう", { token: t, groupName: "自分の" });
    const notLinked = await create("ゆう", { groupName: "ログインなしで入った" });
    await create("ゆう", { token: await token(newUid()), groupName: "ほかの人の" });
    const r = await call("GET", "/api/me/groups", { token: t });
    expect(r).toEqual({
      status: 200,
      json: { groups: [{ groupId: mine.groupId, name: "自分の", memberId: mine.memberId, memberCount: 1, isOwner: true }] },
    });
    expect(JSON.stringify(r.json)).not.toContain(notLinked.groupId);
  });

  it("一覧に人数と、自分が作成者かを返す（退会の確認に使う：screens の「確認ダイアログ」）", async () => {
    const t = await token(newUid());
    const other = await create("ゆう");
    await join(other.groupId, "たろう");
    const j = await join(other.groupId, "わたし", t);
    const r = await call("GET", "/api/me/groups", { token: t });
    expect(r.json.groups).toEqual([{ groupId: other.groupId, name: "旅行部", memberId: j.json.memberId, memberCount: 3, isOwner: false }]);
  });

  it("マイページは自分のアカウントの「行った」だけ（NFR-006 (2)）", async () => {
    const t = await token(newUid());
    const { groupId } = await create("ゆう", { token: t });
    await call("PUT", `/api/groups/${groupId}/my-visits/13`, { token: t });
    const other = await token(newUid());
    const o = await create("ゆう", { token: other });
    await call("PUT", `/api/groups/${o.groupId}/my-visits/1`, { token: other });
    expect(await call("GET", "/api/me/visits", { token: t })).toEqual({ status: 200, json: { prefs: [13] } });
  });
});

describe("退会（REQ-036・NFR-006 (6)）", () => {
  const withdraw = (t?: string) => call("DELETE", "/api/me", { token: t });
  const old = () => Math.floor(Date.now() / 1000) - 10 * 60;

  it("ログインしていない・確認待ちは 401", async () => {
    expect(await withdraw()).toEqual({ status: 401, json: { error: "login_required" } });
    expect(await withdraw(await token(newUid(), { email_verified: false }))).toEqual({ status: 401, json: { error: "login_required" } });
  });

  it("直前にログインし直していなければ 403 reauth_required で、何も消えない", async () => {
    const uid = newUid();
    const { groupId } = await create("ゆう", { token: await token(uid) });
    expect(await withdraw(await token(uid, { auth_time: old() }))).toEqual({ status: 403, json: { error: "reauth_required" } });
    expect(await groupExists(groupId)).toBe(true);
  });

  it("アカウント・アカウントの「行った」・紐づいたメンバーを消す。自分しかいないグループは消え、ほかの人がいるグループは残る（REQ-050・REQ-051）", async () => {
    const uid = newUid();
    const t = await token(uid);
    const alone = await create("ゆう", { token: t });
    await call("PUT", `/api/groups/${alone.groupId}/my-visits/13`, { token: t });
    const shared = await ownerOnlyGroup();
    const j = await join(shared.groupId, "わたし", t);
    const owned = await create("ゆう", { token: t });
    await join(owned.groupId, "たろう");
    await call("PUT", `/api/groups/${owned.groupId}/manage-by`, { token: t, body: { manageBy: "owner" } });
    // ほかの人のアカウントは消えない
    const keep = await create("ゆう", { token: shared.owner });

    expect(await withdraw(t)).toEqual({ status: 200, json: { ok: true } });
    expect(await groupExists(alone.groupId)).toBe(false);
    expect(await groupExists(shared.groupId)).toBe(true);
    expect(await memberRow(j.json.memberId)).toBeNull();
    expect(await accountVisits(uid)).toEqual([]);
    expect(await env.DB.prepare("SELECT 1 FROM accounts WHERE uid = ?").bind(uid).first()).toBeNull();
    expect((await call("GET", `/api/groups/${owned.groupId}`)).json.group).toMatchObject({ ownerOnly: false });
    expect(await groupExists(keep.groupId)).toBe(true);
    // やり直し（Firebase のアカウントの削除に失敗した後）も成功
    expect(await withdraw(t)).toEqual({ status: 200, json: { ok: true } });
  });
});
