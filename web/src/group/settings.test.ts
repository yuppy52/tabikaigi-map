// グループ設定の出し分けのテスト（screens の「グループ設定の中身」）。
// メンバーの一覧に自分を出さないかを確かめる（管理の操作は誰でもできるので、出し分けはない：permissions）。
// 確認ダイアログの文（screens の「確認ダイアログ」）：最後の1人、人数で文が変わるか、ログインをやめた後の文になっているかも確かめる
import { describe, expect, it } from "vitest";
import type { GroupMember } from "../data/types";
import { deleteGroupConfirm, deleteMemberConfirm, leaveConfirm, settingsView } from "./settings";

const member = (id: number, name: string): GroupMember => ({ id, name, color: id % 10 });

const A = member(1, "あゆ");
const B = member(2, "けん");
const C = member(3, "みか");

describe("settingsView：メンバーの一覧（自分以外）", () => {
  it("自分を除いて、グループの並びのまま返す", () => {
    expect(settingsView([A, B, C], 2).others.map((m) => m.id)).toEqual([1, 3]);
  });

  it("自分しかいなければ空", () => {
    expect(settingsView([A], 1).others).toEqual([]);
  });

  it("自分がグループにいない番号なら、全員を返す", () => {
    expect(settingsView([A, B], 9).others.map((m) => m.id)).toEqual([1, 2]);
  });
});

describe("leaveConfirm：退出の確認の文（REQ-049・REQ-050）", () => {
  const BODY = ["このグループでの「行った」は消えます。もう一度入るには招待URLが要ります。"];

  it("ほかにメンバーがいれば、見出しと本文だけ（注意はない）", () => {
    expect(leaveConfirm([A, B], 2)).toEqual({ title: "けんとして退出します", body: BODY, warnings: [] });
  });

  it("最後の1人なら「あなたが最後のメンバーです。グループも削除されます」", () => {
    expect(leaveConfirm([A], 1)).toEqual({
      title: "あゆとして退出します",
      body: BODY,
      warnings: ["あなたが最後のメンバーです。グループも削除されます。"],
    });
  });

  it("API が古い形の値（isOwner など）を付けて返しても、作成者の注意は出さない", () => {
    const old = { ...A, isOwner: true, linked: true } as GroupMember;
    expect(leaveConfirm([old, B], 1).warnings).toEqual([]);
  });
});

describe("deleteMemberConfirm：メンバーの削除の確認の文（REQ-048）", () => {
  const EXPECTED = {
    title: "けんさんを削除します",
    body: ["その人のこのグループでの「行った」は消えます。招待URLを知っていれば、また参加できます。"],
    warnings: [],
  };

  it("その人の「行った」が消える文と、また参加できる文", () => {
    expect(deleteMemberConfirm(B)).toEqual(EXPECTED);
  });

  it("API が古い形の値（isOwner・linked）を付けて返しても、同じ文（アカウントの文や作成者の注意は出さない）", () => {
    expect(deleteMemberConfirm({ ...B, isOwner: true, linked: true } as GroupMember)).toEqual(EXPECTED);
  });
});

describe("deleteGroupConfirm：グループの削除の確認の文（REQ-047）", () => {
  it("グループ名と、全員の人数を入れる（ワイヤーフレームの 9）", () => {
    expect(deleteGroupConfirm("大学の友達", 4)).toEqual({
      title: "大学の友達を削除します",
      body: ["全員（4人）のこのグループでの「行った」が消え、戻せません。"],
      warnings: [],
    });
  });
});
