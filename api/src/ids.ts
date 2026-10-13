// グループID・部屋の鍵・日付を作る

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 22;

/**
 * 推測できないグループID（NFR-005）。英数字22文字 ≒ 128ビット。
 * 乱数の1バイト（0〜255）を62で割った余りにすると、前の方の文字が少し出やすくなる。
 * そこで 248（62×4）以上のバイトは捨てて引き直し、どの文字も同じ確率にする
 */
export function newGroupId(): string {
  let id = "";
  while (id.length < ID_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < 248 && id.length < ID_LENGTH) id += CHARS[b % 62];
    }
  }
  return id;
}

/** URL から来たグループIDの形を確かめる（形が違えば、データベースを引かずに「ない」と返す） */
export function isGroupId(s: string): boolean {
  return /^[A-Za-z0-9]{22}$/.test(s);
}

/** 部屋の URL に使う、グループIDの SHA-256（16進64文字。Q-031） */
export async function roomKey(groupId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(groupId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 日本時間の今日の日付（YYYY-MM-DD）。最後に開かれた日に使う（Q-025） */
export function jstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
