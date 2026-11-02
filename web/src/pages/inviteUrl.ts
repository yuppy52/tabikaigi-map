// トップの「招待URLを貼る欄」の計算（screens の「トップの中身」）。画面（DOM）には触らず、貼られた文字だけから決める（テストできるように）。
// 考え方：貼られた文字が「グループIDだけ（英数字22文字）」か、「パスが /g/<グループID> の URL」なら、そのグループIDを取り出す。
// ドメインは問わない（手元の http://localhost:5173 でも使えるように）。LINE のメッセージをまるごと貼ったときのように、
// ほかの文字が混ざっていても、/g/<グループID> が1種類だけ含まれていれば取り出す（同じ URL が2回あってもよい）。違うグループIDが2つ以上あれば、どれか分からないので取り出さない
import { isGroupId } from "../groupId";
import { PARAM } from "../lineBrowser";

// /g/<22文字> の1か所。
// [^!-~] は「ASCII の目に見える文字（! から ~ まで）ではない文字」：空白・改行と、日本語などの ASCII でない文字。
// 前：文字の頭か [^!-~] か開きかっこ（( と [）の後に、あってもよい「http(s)://ホスト(:番号)」、続けて /g/（/foo/g/… のように、パスの途中の /g/ は取らない）
// 後ろ：あってもよい末尾の / に続けて、文字の終わり、? と #（クエリと #）、閉じかっこ（) と ]。かっこの中に書いた URL）、[^!-~] のどれか。
// 英数字や記号が続くもの（23文字、/g/<ID>/… など）は取らない
const INVITE_PATH = /(?:^|[^!-~]|[([])(?:https?:\/\/[A-Za-z0-9.-]+(?::\d+)?)?\/g\/([A-Za-z0-9]{22})(?=\/?(?:$|[?#)\]]|[^!-~]))/g;

// 貼られた文字からグループIDを取り出す。取り出せなければ null
export function extractGroupId(text: string): string | null {
  const s = text.trim();
  if (isGroupId(s)) return s;
  const ids = new Set([...s.matchAll(INVITE_PATH)].map((m) => m[1]));
  if (ids.size !== 1) return null;
  const [id] = ids;
  return id !== undefined && isGroupId(id) ? id : null;
}

// 開く先（同じサイトの中のパス）。外部ブラウザで開き直すための ?openExternalBrowser=1 を付ける（招待URLと同じ形）。取り出せなければ null
export function inviteTarget(text: string): string | null {
  const id = extractGroupId(text);
  return id === null ? null : `/g/${id}?${PARAM}=1`;
}
