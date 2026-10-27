// グループ設定の出し分けのテスト（screens の「グループ設定の中身」）。
// 「作成者のみ」（ownerOnly）でグループ名の［変更］を出すか、管理できる人の文、メンバーの一覧に自分を出さないかを確かめる。
// 確認ダイアログの文（screens の「確認ダイアログ」）：最後の1人、作成者、紐づき、人数で文が変わるかも確かめる
import { describe, expect, it } from "vitest";
import type { GroupMember } from "../data/types";
import { deleteGroupConfirm, deleteMemberConfirm, leaveConfirm, settingsView } from "./settings";

const member = (id: number, name: string, extra: Partial<GroupMember> = {}): GroupMember => ({
  id,
  name,
  color: id % 10,
  isOwner: false,
  linked: false,
  isMe: false,
  ...extra,
});

const A = member(1, "あゆ");
const B = member(2, "けん");
const C = member(3, "みか");

describe("settingsView：管理の操作を出すか、管理できる人の文", () => {
  it("「誰でも」（ownerOnly が false）なら、ログインなしの人にも［変更］を出し、文は「誰でも」", () => {
    expect(settingsView(false, [A, B], 1)).toMatchObject({ canManage: true, manageByLabel: "誰でも" });
  });

  it("「作成者のみ」が効いていれば、ログインなしの人には出さず、文は「作成者のみ」（作成者のメンバーを覚えていても、紐づいた本人でなければ出さない）", () => {
    const owner = member(1, "あゆ", { isOwner: true, linked: true });
    expect(settingsView(true, [owner, B], 2)).toMatchObject({ canManage: false, manageByLabel: "作成者のみ" });
    expect(settingsView(true, [owner, B], 1)).toMatchObject({ canManage: false, manageByLabel: "作成者のみ" });
  });

  it("「作成者のみ」でも、作成者のメンバーに紐づいた本人（isOwner かつ isMe）には出す（ログイン済み：Phase 3）", () => {
    const owner = member(1, "あゆ", { isOwner: true, linked: true, isMe: true });
    expect(settingsView(true, [owner, B], 1).canManage).toBe(true);
  });

  it("紐づいた本人でも、作成者でなければ「作成者のみ」では出さない", () => {
    const linkedMe = member(2, "けん", { linked: true, isMe: true });
    expect(settingsView(true, [A, linkedMe], 2).canManage).toBe(false);
  });

  it("自分のメンバーが決まっていない（null）ときは、「作成者のみ」なら出さない", () => {
    expect(settingsView(true, [A, B], null).canManage).toBe(false);
    expect(settingsView(false, [A, B], null).canManage).toBe(true);
  });
});

describe("settingsView：メンバーの一覧（自分以外）", () => {
  it("自分を除いて、グループの並びのまま返す", () => {
    expect(settingsView(false, [A, B, C], 2).others.map((m) => m.id)).toEqual([1, 3]);
  });

  it("自分しかいなければ空", () => {
    expect(settingsView(false, [A], 1).others).toEqual([]);
  });

  it("自分がグループにいない番号なら、全員を返す", () => {
    expect(settingsView(false, [A, B], 9).others.map((m) => m.id)).toEqual([1, 2]);
  });
});

describe("leaveConfirm：退出の確認の文（REQ-049〜REQ-051）", () => {
  const BODY = ["このグループでの「行った」は消えます。もう一度入るには招待URLが要ります。"];

  it("ほかにメンバーがいて、作成者でなければ、見出しと本文だけ（注意はない）", () => {
    expect(leaveConfirm(false, [A, B], 2)).toEqual({ title: "けんとして退出します", body: BODY, warnings: [] });
  });

  it("最後の1人なら「あなたが最後のメンバーです。グループも削除されます」", () => {
    expect(leaveConfirm(false, [A], 1).warnings).toEqual(["あなたが最後のメンバーです。グループも削除されます。"]);
  });

  it("最後の1人なら、作成者でも作成者の注意は出さない", () => {
    const owner = member(1, "あゆ", { isOwner: true });
    expect(leaveConfirm(false, [owner], 1).warnings).toEqual(["あなたが最後のメンバーです。グループも削除されます。"]);
  });

  it("最後の1人でない作成者のメンバーなら「このグループの作成者はいなくなり、戻せません」", () => {
    const owner = member(1, "あゆ", { isOwner: true });
    expect(leaveConfirm(false, [owner, B], 1).warnings).toEqual(["このグループの作成者はいなくなり、戻せません。"]);
  });

  it("「作成者のみ」が効いていれば、管理できる人が「誰でも」に変わることも足す", () => {
    const owner = member(1, "あゆ", { isOwner: true });
    expect(leaveConfirm(true, [owner, B], 1).warnings).toEqual([
      "このグループの作成者はいなくなり、戻せません。管理できる人は「誰でも」に変わります。",
    ]);
  });

  it("ほかのメンバーが作成者でも、自分が作成者でなければ注意は出さない", () => {
    const owner = member(1, "あゆ", { isOwner: true });
    expect(leaveConfirm(true, [owner, B], 2).warnings).toEqual([]);
  });
});

describe("deleteMemberConfirm：メンバーの削除の確認の文（REQ-048・REQ-051）", () => {
  it("紐づいていないメンバーは、その人の「行った」が消える文と、また参加できる文", () => {
    expect(deleteMemberConfirm(B)).toEqual({
      title: "けんさんを削除します",
      body: ["その人のこのグループでの「行った」は消えます。招待URLを知っていれば、また参加できます。"],
      warnings: [],
    });
  });

  it("紐づいたメンバーは、アカウントの「行った」が残る文", () => {
    expect(deleteMemberConfirm(member(2, "けん", { linked: true })).body).toEqual([
      "その人のアカウントの「行った」は残ります。招待URLを知っていれば、また参加できます。",
    ]);
  });

  it("作成者のメンバーなら「このグループの作成者はいなくなり、戻せません」を足す", () => {
    expect(deleteMemberConfirm(member(1, "あゆ", { isOwner: true, linked: true })).warnings).toEqual([
      "このグループの作成者はいなくなり、戻せません。",
    ]);
  });
});

describe("deleteGroupConfirm：グループの削除の確認の文（REQ-047）", () => {
  it("グループ名と、全員の人数を入れる（ワイヤーフレームの 9）", () => {
    expect(deleteGroupConfirm("大学の友達", 4)).toEqual({
      title: "大学の友達を削除します",
      body: ["全員（4人）のこのグループでの「行った」が消え、戻せません。ログインしているメンバーのアカウントの「行った」は残ります。"],
      warnings: [],
    });
  });
});
