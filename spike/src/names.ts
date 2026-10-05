// 名前の決まり（REQ-009〜REQ-011）

/** 見た目の文字数（絵文字の 👨‍👩‍👧 も1文字）を数える */
export function visibleLength(s: string): number {
  return [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(s)].length;
}

/**
 * 「同じ名前」かを比べるための形にする（REQ-011）。
 * NFKC：全角の英数字・記号・空白を半角に、半角カタカナを全角にそろえる。そのあと英字を小文字に。
 * ひらがなとカタカナは別のまま（NFKC は変えない）
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim();
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: "empty" | "too_long" };

/** 前後の空白を取り除いて、1〜max 文字かを確かめる（REQ-009 は10、REQ-010 は20） */
export function checkName(input: string, max: number): NameCheck {
  const name = input.replace(/^[\s　]+|[\s　]+$/g, "");
  if (name.length === 0) return { ok: false, reason: "empty" };
  if (visibleLength(name) > max) return { ok: false, reason: "too_long" };
  return { ok: true, name };
}
