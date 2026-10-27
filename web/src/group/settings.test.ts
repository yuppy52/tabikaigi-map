// グループ設定の出し分けのテスト（screens の「グループ設定の中身」）。
// 「作成者のみ」（ownerOnly）でグループ名の［変更］を出すか、管理できる人の文、メンバーの一覧に自分を出さないかを確かめる
import { describe, expect, it } from "vitest";
import type { GroupMember } from "../data/types";
import { settingsView } from "./settings";

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
