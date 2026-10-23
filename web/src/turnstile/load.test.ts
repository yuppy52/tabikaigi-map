// ボット対策のスクリプトの読み込みを1回にまとめるところのテスト。読み込みを数える偽物に差し替えて、
// 2回読み込まないこと（読み込み中も、読み込めた後も）と、読み込めなかったら次に読み込み直すことを確かめる
import { describe, expect, it } from "vitest";
import { onceUntilFailed } from "./load";

// 呼ばれた回数を数え、Promise を外から終わらせられる偽物の読み込み
function fakeLoad() {
  let calls = 0;
  const settle: { resolve: (v: string) => void; reject: (e: Error) => void }[] = [];
  const load = () => {
    calls++;
    return new Promise<string>((resolve, reject) => settle.push({ resolve, reject }));
  };
  return { load, settle, calls: () => calls };
}

describe("onceUntilFailed：スクリプトを1回だけ読み込む", () => {
  it("読み込み中にもう一度呼んでも、読み込みは1回で、同じ結果を受け取る", async () => {
    const f = fakeLoad();
    const get = onceUntilFailed(f.load);
    const a = get();
    const b = get();
    expect(f.calls()).toBe(1);
    f.settle[0].resolve("turnstile");
    expect(await a).toBe("turnstile");
    expect(await b).toBe("turnstile");
  });

  it("読み込めた後に呼んでも、読み込み直さない", async () => {
    const f = fakeLoad();
    const get = onceUntilFailed(f.load);
    const first = get();
    f.settle[0].resolve("turnstile");
    await first;
    expect(await get()).toBe("turnstile");
    expect(f.calls()).toBe(1);
  });

  it("読み込めなかったら失敗で返し、次に呼んだときに読み込み直す", async () => {
    const f = fakeLoad();
    const get = onceUntilFailed(f.load);
    const first = get();
    f.settle[0].reject(new Error("turnstile_unavailable"));
    await expect(first).rejects.toThrow("turnstile_unavailable");
    const second = get();
    expect(f.calls()).toBe(2);
    f.settle[1].resolve("turnstile");
    expect(await second).toBe("turnstile");
  });
});
