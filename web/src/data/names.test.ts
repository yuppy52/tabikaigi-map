// 名前・グループ名の入力の確かめのテスト（画面の側：REQ-009・REQ-010）。
// 前後の空白（全角も）を取ってから、見た目の文字数で 1〜10（グループ名は 1〜20）か
import { describe, expect, it } from "vitest";
import { checkName, GROUP_NAME_MAX, MEMBER_NAME_MAX, trimName, visibleLength } from "./names";

describe("trimName：前後の空白を取る", () => {
  it("半角・全角の空白、タブ、改行を前後から取る。間の空白は残す", () => {
    expect(trimName(" \u3000ゆう\t\n")).toBe("ゆう");
    expect(trimName("\u3000ゆ う\u3000")).toBe("ゆ う");
  });
});

describe("visibleLength：見た目の文字数", () => {
  it("絵文字（つないだもの、旗、肌の色）も1文字と数える", () => {
    expect(visibleLength("👨‍👩‍👧")).toBe(1);
    expect(visibleLength("🇯🇵")).toBe(1);
    expect(visibleLength("👍🏽")).toBe(1);
    expect(visibleLength("ゆう😀")).toBe(3);
  });
});

describe("checkName：長さの確かめ", () => {
  it("1〜10文字の名前は、前後の空白を取った名前を返す", () => {
    expect(checkName("  さくら\u3000", MEMBER_NAME_MAX)).toBe("さくら");
    expect(checkName("あ", MEMBER_NAME_MAX)).toBe("あ");
    expect(checkName("あいうえおかきくけこ", MEMBER_NAME_MAX)).toBe("あいうえおかきくけこ");
  });

  it("11文字は外れる", () => {
    expect(checkName("あいうえおかきくけこさ", MEMBER_NAME_MAX)).toBeNull();
  });

  it("前後の空白は数えない（10文字＋全角の空白は通る）", () => {
    expect(checkName("\u3000あいうえおかきくけこ\u3000", MEMBER_NAME_MAX)).toBe("あいうえおかきくけこ");
  });

  it("空、空白だけ（全角の空白も）は外れる", () => {
    expect(checkName("", MEMBER_NAME_MAX)).toBeNull();
    expect(checkName("   ", MEMBER_NAME_MAX)).toBeNull();
    expect(checkName("\u3000\u3000", MEMBER_NAME_MAX)).toBeNull();
  });

  it("絵文字は1文字と数える（つないだ絵文字10個は通り、11個は外れる）", () => {
    expect(checkName("👨‍👩‍👧".repeat(10), MEMBER_NAME_MAX)).toBe("👨‍👩‍👧".repeat(10));
    expect(checkName("👨‍👩‍👧".repeat(11), MEMBER_NAME_MAX)).toBeNull();
  });

  it("グループ名は20文字まで", () => {
    expect(checkName("あ".repeat(20), GROUP_NAME_MAX)).toBe("あ".repeat(20));
    expect(checkName("あ".repeat(21), GROUP_NAME_MAX)).toBeNull();
  });
});
