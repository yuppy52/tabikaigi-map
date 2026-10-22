// 仮の保存のグループIDの作り方のテスト。英数字22文字か（data-model の groups.id）、
// 62 で割り切れない範囲のバイト（248 以上）を捨てて引き直し、文字に偏りを出さないかを、乱数を差し替えて確かめる
import { describe, expect, it } from "vitest";
import { isGroupId } from "../group/calc";
import { newGroupId, type RandomBytes } from "./ids";

// 決まった並びのバイトを順に返す乱数（足りなくなったら最初に戻る）
function fixedBytes(seq: readonly number[]): RandomBytes {
  let i = 0;
  return (n) => Uint8Array.from({ length: n }, () => seq[i++ % seq.length]);
}

describe("newGroupId：グループIDを作る", () => {
  it("本物の乱数で、英数字22文字（グループの画面が受け付ける形）", () => {
    for (let k = 0; k < 20; k++) expect(isGroupId(newGroupId())).toBe(true);
  });

  it("バイトを 62 で割った余りで文字を選ぶ（0→A、26→a、52→0、62→A）", () => {
    expect(newGroupId(fixedBytes([0, 26, 52, 61, 62]))).toBe("Aa09AAa09AAa09AAa09AAa");
  });

  it("248 以上のバイトは捨てて引き直す（247 は使う）", () => {
    expect(newGroupId(fixedBytes([248, 255, 247]))).toBe("9".repeat(22));
  });

  it("捨てるバイトばかりの回があっても、次の回で引き直して22文字にする", () => {
    let calls = 0;
    // 1回目は全部 255（捨てる）、2回目からは全部 1（B）
    const random: RandomBytes = (n) => {
      const value = calls === 0 ? 255 : 1;
      calls++;
      return new Uint8Array(n).fill(value);
    };
    expect(newGroupId(random)).toBe("B".repeat(22));
    expect(calls).toBe(2);
  });

  it("使う範囲（0〜247）のバイトは、62文字のどれにも同じ数（4つずつ）だけ当たる", () => {
    const counts = new Map<string, number>();
    for (let b = 0; b < 248; b++) {
      const c = newGroupId(fixedBytes([b]))[0];
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    expect(counts.size).toBe(62);
    expect(new Set(counts.values())).toEqual(new Set([4]));
  });
});
