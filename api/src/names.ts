// 名前の決まり（REQ-009〜REQ-011）

/** 見た目の文字数（絵文字の 👨‍👩‍👧 も1文字）を数える */
export function visibleLength(s: string): number {
  return [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(s)].length;
}

/** コードポイント（SQLite の length() と同じ数え方）の数 */
function codePoints(s: string): number {
  return [...s].length;
}

/**
 * 「同じ名前」かを比べるための形にする（REQ-011）。
 * NFKC：全角の英数字・記号・空白を半角に、半角カタカナを全角にそろえる。そのあと英字を小文字に。
 * ひらがなとカタカナは別のまま（NFKC は変えない）
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim();
}

/**
 * 見えない文字・向きを変える文字（制御文字、幅のない空白など）。見た目が空の名前や、
 * 「ゆう」と見た目が同じ別の名前（なりすまし）を作れてしまうので断る。
 * ただし絵文字に使う ZWJ（U+200D、👨‍👩‍👧 をつなぐ）と、旗の絵文字に使うタグ文字（U+E0020〜U+E007F）は通す
 */
const INVISIBLE = /(?![\u200D\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}\u3164\u115F\u1160\uFFA0]/u;

export type NameCheck = { ok: true; name: string } | { ok: false };

export const MEMBER_NAME = { max: 10, storeMax: 200 } as const;
export const GROUP_NAME = { max: 20, storeMax: 400 } as const;

/**
 * 前後の空白を取り除いて、見た目で1〜max 文字かを確かめる（名前は10、グループ名は20）。
 * あわせて、データベースの保存の上限（storeMax：名前200、グループ名400）を超えないかも見る。
 * 見た目は1文字でも、記号を何百も重ねた文字があるため（超えたら、データベースのエラーではなく 400 にする）
 */
export function checkName(input: unknown, rule: { max: number; storeMax: number }): NameCheck {
  if (typeof input !== "string") return { ok: false };
  const name = input.replace(/^[\s　]+|[\s　]+$/g, "");
  if (name.length === 0 || visibleLength(name) > rule.max || INVISIBLE.test(name)) return { ok: false };
  const key = nameKey(name);
  // 比べる形が空になる名前（NFKC で消える文字だけ）や、NFKC で長くなりすぎる名前も断る
  if (key.length === 0 || codePoints(name) > rule.storeMax || codePoints(key) > rule.storeMax) return { ok: false };
  return { ok: true, name };
}
