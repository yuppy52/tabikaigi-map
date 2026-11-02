// トップの「招待URLを貼る欄」で、貼られた文字からグループIDを取り出す計算のテスト（screens の「トップの中身」）
import { describe, expect, it } from "vitest";
import { extractGroupId, inviteTarget } from "./inviteUrl";

const ID = "abcdefghijABCDEFGHIJ01";
const ID2 = "0000000000000000000000";

describe("extractGroupId：取り出せる形", () => {
  it("本番の招待URL", () => {
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID}`)).toBe(ID);
  });

  it("?openExternalBrowser=1 の付いた招待URL", () => {
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID}?openExternalBrowser=1`)).toBe(ID);
  });

  it("前後の空白・改行は無視する", () => {
    expect(extractGroupId(`  \n https://tabikaigi-map.com/g/${ID}\n\t `)).toBe(ID);
    expect(extractGroupId(`\n${ID}  `)).toBe(ID);
  });

  it("手元の開発中の URL（ドメインと番号を問わない）", () => {
    expect(extractGroupId(`http://localhost:5173/g/${ID}`)).toBe(ID);
  });

  it("グループIDだけ", () => {
    expect(extractGroupId(ID)).toBe(ID);
  });

  it("# が付いていても取り出す", () => {
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID}#x`)).toBe(ID);
  });

  it("LINE のメッセージのように、ほかの文字が混ざっていても /g/<ID> が1つなら取り出す", () => {
    expect(extractGroupId(`旅会議マップに招待します\nhttps://tabikaigi-map.com/g/${ID}?openExternalBrowser=1\nよろしく`)).toBe(ID);
    expect(extractGroupId(`招待です：https://tabikaigi-map.com/g/${ID}です`)).toBe(ID);
  });

  it("末尾に / が付いた招待URL、かっこの中に書いた招待URL", () => {
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID}/`)).toBe(ID);
    expect(extractGroupId(`(https://tabikaigi-map.com/g/${ID})`)).toBe(ID);
    expect(extractGroupId(`[https://tabikaigi-map.com/g/${ID}?openExternalBrowser=1]`)).toBe(ID);
  });

  it("同じ招待URLが2回入っていても取り出す", () => {
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID} https://tabikaigi-map.com/g/${ID}?openExternalBrowser=1`)).toBe(ID);
  });
});

describe("extractGroupId：取り出さない形", () => {
  it("空文字・空白だけ", () => {
    expect(extractGroupId("")).toBeNull();
    expect(extractGroupId("  \n ")).toBeNull();
  });

  it("23文字", () => {
    expect(extractGroupId(`${ID}2`)).toBeNull();
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID}2`)).toBeNull();
  });

  it("21文字", () => {
    expect(extractGroupId(ID.slice(0, 21))).toBeNull();
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID.slice(0, 21)}`)).toBeNull();
  });

  it("記号が混ざる", () => {
    expect(extractGroupId("abcdefghijABCDEFGHIJ0-")).toBeNull();
    expect(extractGroupId("https://tabikaigi-map.com/g/abcdefghij_BCDEFGHIJ01")).toBeNull();
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID}-x`)).toBeNull();
  });

  it("違うグループIDの /g/ が2つ（どちらか分からない）", () => {
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID} https://tabikaigi-map.com/g/${ID2}`)).toBeNull();
  });

  it("パスが /g/<ID> ではない URL", () => {
    expect(extractGroupId(`https://tabikaigi-map.com/x/g/${ID}`)).toBeNull();
    expect(extractGroupId(`https://tabikaigi-map.com/g/${ID}/more`)).toBeNull();
    expect(extractGroupId(`https://tabikaigi-map.com/new?g=${ID}`)).toBeNull();
  });
});

describe("inviteTarget：開く先", () => {
  it("取り出せたら /g/<ID>?openExternalBrowser=1（貼った URL のほかのクエリは持ち込まない）", () => {
    expect(inviteTarget(`https://tabikaigi-map.com/g/${ID}?x=1`)).toBe(`/g/${ID}?openExternalBrowser=1`);
    expect(inviteTarget(ID)).toBe(`/g/${ID}?openExternalBrowser=1`);
  });

  it("よそのサイトの URL を貼っても、開く先は同じサイトの中の /g/<ID>（よそへ飛ばない）", () => {
    const to = inviteTarget(`https://evil.example/g/${ID}`);
    expect(to).toBe(`/g/${ID}?openExternalBrowser=1`);
    expect(to?.startsWith("/g/")).toBe(true);
    expect(to?.startsWith("//")).toBe(false);
    expect(inviteTarget(`//evil.example/g/${ID}x`)).toBeNull();
    expect(inviteTarget("javascript:alert(1)")).toBeNull();
    expect(inviteTarget("<script>alert(1)</script>")).toBeNull();
  });

  it("取り出せなければ null", () => {
    expect(inviteTarget("こんにちは")).toBeNull();
  });
});
