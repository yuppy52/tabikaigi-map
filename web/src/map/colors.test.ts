// 地図の塗りの計算のテスト。濃さの境目（1/3、2/3 ちょうど）と、人数が少ないグループ、
// 全員まだの県の数え方を確かめる（REQ-017・REQ-018・REQ-054）
import { describe, expect, it } from "vitest";
import { everyoneFills, gapPrefIds, heatFill, PREF_IDS } from "./colors";

describe("heatFill：行った人数と全員の人数から濃さ", () => {
  it("0人は塗らない", () => {
    expect(heatFill(0, 3)).toBe("var(--land)");
  });

  it("全員が行ったら一番濃い h4", () => {
    expect(heatFill(3, 3)).toBe("var(--h4)");
    expect(heatFill(6, 6)).toBe("var(--h4)");
  });

  it("1/3 ちょうどは h1、それより少し上は h2", () => {
    expect(heatFill(1, 3)).toBe("var(--h1)");
    expect(heatFill(2, 6)).toBe("var(--h1)");
    expect(heatFill(3, 8)).toBe("var(--h2)");
  });

  it("2/3 ちょうどは h2、それより少し上は h3", () => {
    expect(heatFill(2, 3)).toBe("var(--h2)");
    expect(heatFill(4, 6)).toBe("var(--h2)");
    expect(heatFill(5, 7)).toBe("var(--h3)");
  });

  it("全員の人数が0（メンバーがいない）なら塗らない", () => {
    expect(heatFill(0, 0)).toBe("var(--land)");
  });

  it("1人のグループは、行ったら h4、まだなら塗らない", () => {
    expect(heatFill(1, 1)).toBe("var(--h4)");
    expect(heatFill(0, 1)).toBe("var(--land)");
  });

  it("2人のグループは、1人なら h2（1/2）、2人なら h4", () => {
    expect(heatFill(1, 2)).toBe("var(--h2)");
    expect(heatFill(2, 2)).toBe("var(--h4)");
  });
});

describe("everyoneFills：「みんな」のときの県ごとの塗り", () => {
  const members = [
    [1, 2, 3],
    [1, 2],
    [1, 13],
  ];

  it("47県すべてに色が付き、行った人数で濃さが決まる", () => {
    const fills = everyoneFills(members, false);
    expect(Object.keys(fills).map(Number)).toEqual(PREF_IDS);
    expect(fills[1]).toBe("var(--h4)");
    expect(fills[2]).toBe("var(--h2)");
    expect(fills[3]).toBe("var(--h1)");
    expect(fills[13]).toBe("var(--h1)");
  });

  it("誰も行っていない県は、強調するときは --gap-fill、しないときは --land", () => {
    expect(everyoneFills(members, true)[47]).toBe("var(--gap-fill)");
    expect(everyoneFills(members, false)[47]).toBe("var(--land)");
  });

  it("強調しても、誰かが行った県の色は変わらない", () => {
    const on = everyoneFills(members, true);
    const off = everyoneFills(members, false);
    for (const id of [1, 2, 3, 13]) expect(on[id]).toBe(off[id]);
  });

  it("同じ人が同じ県を2回持っていても1人と数える", () => {
    expect(everyoneFills([[5, 5], [], []], false)[5]).toBe("var(--h1)");
  });

  it("メンバーがいないグループは、強調しなければどの県も塗らない", () => {
    const fills = everyoneFills([], false);
    expect(PREF_IDS.every((id) => fills[id] === "var(--land)")).toBe(true);
  });
});

describe("gapPrefIds：全員まだの県", () => {
  it("誰も行っていない県を 1〜47 の順に返す", () => {
    const ids = gapPrefIds([[47, 2], [1]]);
    expect(ids).toEqual(PREF_IDS.filter((id) => ![1, 2, 47].includes(id)));
    expect(ids[0]).toBe(3);
    expect(ids.at(-1)).toBe(46);
  });

  it("全県だれかが行っていれば0件", () => {
    expect(gapPrefIds([PREF_IDS.slice(0, 20), PREF_IDS.slice(20)])).toEqual([]);
  });

  it("メンバーがいなければ47県すべて", () => {
    expect(gapPrefIds([])).toEqual(PREF_IDS);
  });
});
