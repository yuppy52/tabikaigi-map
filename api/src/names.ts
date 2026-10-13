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
 * ただし絵文字に使う ZWJ（U+200D、👨‍👩‍👧 をつなぐ）と、旗の絵文字に使うタグ文字（U+E0020〜U+E007F）は通す。
 * 結合文字の仲間（NFKC でも消えない）で見えないもの：組み合わせを表す記号（U+034F）、モンゴル文字の切り替え（U+180B〜U+180F）、
 * 異体字の切り替え（U+FE00〜U+FE0F、U+E0100〜U+E01EF）。記号の仲間で見えないもの：点字の空白（U+2800）。
 * 異体字の切り替えのうち、絵文字の形を選ぶ U+FE0E・U+FE0F（❤️ など）だけは、絵文字の直後なら通す
 */
const INVISIBLE =
  /(?![\u200D\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}\u3164\u115F\u1160\uFFA0\u034F\u180B-\u180F\u2800\uFE00-\uFE0D\u{E0100}-\u{E01EF}]|(?<!\p{Emoji})[\uFE0E\uFE0F]/u;

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
