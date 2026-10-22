// メンバーの10色のテスト。番号と色が data-model の「色」の表のとおりか（REQ-021）、範囲の外の番号でも画面が止まらないかを確かめる
import { describe, expect, it } from "vitest";
import { MEMBER_COLORS, memberColor } from "./memberColors";

describe("memberColor：10色の番号 → 色", () => {
  it("0〜9 は data-model の表の色", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(memberColor)).toEqual([
      "#2F7FD1",
      "#E0692F",
      "#2A9D6E",
      "#9B5BD0",
      "#D2497A",
      "#7B8A1E",
      "#C93C3C",
      "#1A9BB0",
      "#8C5A3C",
      "#4A5D8A",
    ]);
  });

  it("10色で、同じ色は2つない", () => {
    expect(MEMBER_COLORS).toHaveLength(10);
    expect(new Set(MEMBER_COLORS).size).toBe(10);
  });

  it("範囲の外（-1、10）や整数でない値（1.5、NaN）は0番の色", () => {
    for (const n of [-1, 10, 1.5, Number.NaN]) expect(memberColor(n)).toBe("#2F7FD1");
  });
});
