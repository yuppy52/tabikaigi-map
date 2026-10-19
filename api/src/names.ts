// 名前の決まり（REQ-009〜REQ-011）

const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** 見た目の文字数（絵文字の 👨‍👩‍👧 も1文字）を数える */
export function visibleLength(s: string): number {
  return [...segmenter.segment(s)].length;
}

/** コードポイント（SQLite の length() と同じ数え方）の数 */
function codePoints(s: string): number {
  return [...s].length;
}

/**
 * 見た目の1文字に使える部品の数の上限。決まりのある絵文字で一番長い 👩🏻‍❤️‍💋‍👨🏼 が10。
 * 絵文字をつなぐ ZWJ や肌の色の記号を何十も重ねて、見た目の1文字と数えさせ、10文字の上限を超えるのを防ぐ
 */
const MAX_PARTS_PER_CHAR = 10;

/**
 * 「同じ名前」かを比べるための形にする（REQ-011）。
 * NFKC：全角の英数字・記号・空白を半角に、半角カタカナを全角にそろえる。そのあと英字を小文字に。
 * ひらがなとカタカナは別のまま（NFKC は変えない）。
 * 見た目を変えない部品（絵文字の形の切り替え U+FE0E・U+FE0F、絵文字をつなぐ ZWJ、旗のタグ文字）は取り除き、
 * 続いた空白は1つにまとめる（画面は続いた空白を1つにして表示するため）。
 * 「❤」と「❤️」、「😀😀」と「😀‍😀」、「ゆ う」と「ゆ  う」を同じ名前とみなす（同じとみなしすぎても、断る側に倒れるだけ）
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u{FE0E}\u{FE0F}\u{200D}\u{E0020}-\u{E007F}]/gu, "")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .trim();
}

/**
 * 見えない文字・向きを変える文字。見た目が空の名前や、「ゆう」と見た目が同じ別の名前（なりすまし）を作れてしまうので断る。
 * - Unicode が「表示しない」と決めている文字（Default_Ignorable_Code_Point）：幅のない空白、ZWJ、異体字の切り替え、
 *   タグ文字、ハングルの埋め字、まだ割り当てのない「表示しない」場所など
 * - 制御文字・書式の文字・私用の文字・行と段落の区切り、点字の空白（U+2800。記号の仲間で見た目は空）
 * 絵文字の部品（ZWJ、タグ文字、U+FE0F）もここでは断る。絵文字の中で使うものは、先に EMOJI_PARTS で取り除いてから調べる
 */
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}\u{2800}]/u;

/**
 * 絵文字の中でだけ意味を持つ部品。この並びのときだけ通す（絵文字の外にあれば、見えない文字として断る）。
 * - ZWJ（U+200D）：絵文字と絵文字の間（👨‍👩‍👧、🏳️‍🌈、👩🏽‍💻）
 * - U+FE0E・U+FE0F：絵文字の直後（❤️）と、キーキャップ（1️⃣：数字・#・* ＋ U+FE0F ＋ U+20E3）
 * - タグ文字：決まりのある3つの旗（イングランド、スコットランド、ウェールズ）の並びだけ。
 *   それ以外の並びは黒い旗 🏴 だけが見え、タグ文字は見えないので、見た目が同じ別の名前を作れてしまう
 */
const EMOJI_PARTS =
  /(?<=\p{Extended_Pictographic}[\u{FE0F}\p{Emoji_Modifier}]*)\u{200D}(?=\p{Extended_Pictographic})|(?<=\p{Extended_Pictographic})[\u{FE0E}\u{FE0F}]|(?<=[0-9#*])\u{FE0F}(?=\u{20E3})|(?<=\u{1F3F4})\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}/gu;

/** 絵文字の部品を取り除いた後に、見えない文字が残っていれば true */
function hasInvisible(name: string): boolean {
  return INVISIBLE.test(name.replace(EMOJI_PARTS, ""));
}

/** 見た目の1文字が、部品を重ねすぎていれば true */
function hasOverstackedChar(name: string): boolean {
  for (const { segment } of segmenter.segment(name)) if (codePoints(segment) > MAX_PARTS_PER_CHAR) return true;
  return false;
}

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
  const name = input.replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
  if (name.length === 0 || visibleLength(name) > rule.max || hasInvisible(name) || hasOverstackedChar(name)) return { ok: false };
  const key = nameKey(name);
  // 比べる形が空になる名前（NFKC で消える文字だけ）や、NFKC で長くなりすぎる名前も断る
  if (key.length === 0 || codePoints(name) > rule.storeMax || codePoints(key) > rule.storeMax) return { ok: false };
  return { ok: true, name };
}
