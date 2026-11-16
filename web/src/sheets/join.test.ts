// 参加のシートの計算のテスト（screens の「参加の画面」と、API の 409 name_taken・409 group_full の行）。
// 満員の境目（20人）と、name_taken の番号から一覧の表示名を引く（いなければ読み直しが要る）かを確かめる
import { describe, expect, it } from "vitest";
import type { GroupMember } from "../data/types";
import { isGroupFull, MEMBER_LIMIT, takenMemberOf } from "./join";

const member = (id: number, name: string): GroupMember => ({ id, name, color: id % 10 });
const many = (n: number): GroupMember[] => Array.from({ length: n }, (_, i) => member(i + 1, `人${i + 1}`));

describe("isGroupFull：満員か（REQ-005）", () => {
  it("上限は20人", () => {
    expect(MEMBER_LIMIT).toBe(20);
  });

  it("19人までは満員ではない（「＋ 新しく参加する」を出す）", () => {
    expect(isGroupFull([])).toBe(false);
    expect(isGroupFull(many(19))).toBe(false);
  });

  it("20人で満員（読み直して人数が上限を超えていても満員）", () => {
    expect(isGroupFull(many(20))).toBe(true);
    expect(isGroupFull(many(21))).toBe(true);
  });
});

describe("takenMemberOf：409 name_taken の番号から一覧の人を引く（REQ-012・REQ-011）", () => {
  const members = [member(1, "ＡＹＵ"), member(2, "けん")];

  it("一覧にいれば、その人（文と覚える名前は一覧の表示名。入れた文字ではない）", () => {
    expect(takenMemberOf(members, 1)).toEqual({ id: 1, name: "ＡＹＵ", color: 1 });
  });

  it("一覧にいなければ null（ほぼ同時に入った人なので、グループを読み直す）", () => {
    expect(takenMemberOf(members, 3)).toBeNull();
    expect(takenMemberOf([], 1)).toBeNull();
  });
});
