// 仮の保存（API につなぐまで）で使う、グループIDの作り方。形は data-model の groups.id と api/src/ids.ts と同じ。
// API につないだら、グループIDは API が作るので使わない

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 22;
// 62 の倍数のうち 256 より小さい一番大きい数（62×4）。これ以上のバイトは捨てる
const LIMIT = 248;

// 乱数のバイトを n 個くれる関数。テストでは決まった並びに差し替える
export type RandomBytes = (n: number) => Uint8Array;

const cryptoBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

// 英数字22文字のグループID。1バイト（0〜255）を62で割った余りにすると前の方の文字が出やすくなるので、
// 248 以上のバイトは捨てて引き直し、どの文字も同じ確率にする
export function newGroupId(randomBytes: RandomBytes = cryptoBytes): string {
  let id = "";
  while (id.length < ID_LENGTH) {
    for (const b of randomBytes(32)) {
      if (b < LIMIT && id.length < ID_LENGTH) id += CHARS[b % CHARS.length];
    }
  }
  return id;
}
