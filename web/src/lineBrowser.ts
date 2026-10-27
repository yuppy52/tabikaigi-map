// LINE のアプリ内ブラウザから外部ブラウザへ移す計算（screens の「画面のルール」、auth-flow の「LINE のアプリ内ブラウザ」）。
// 端末が覚えるものはブラウザごとに別なので、アプリの画面は外部ブラウザで使ってもらう。
// 考え方：LINE は URL に ?openExternalBrowser=1 が付いていると外部ブラウザで開き直す。付いていなければ足した URL を返す。
// 画面（location）には触らず、URL の文字と名乗り（User-Agent）だけから決める（テストできるように）

// 招待URL（group/calc.ts の inviteUrl）も同じ名前を使う
export const PARAM = "openExternalBrowser";

// LINE のアプリ内ブラウザか。名乗りに「 Line/」（前に空白、大文字小文字もこのとおり）があるかで見分ける
export function isLineInAppBrowser(userAgent: string): boolean {
  return userAgent.includes(" Line/");
}

// 開き直す先の URL。LINE の中で、まだ ?openExternalBrowser=1 が付いていなければ、それを足した URL。
// それ以外（LINE ではない、もう付いている：外に出られなかった LINE なのでそのまま使ってもらう）は null（何もしない）。
// パス・ほかのクエリ・# はそのまま残す（クエリは並べ直さず、後ろに足すだけ）
// triedBefore：このタブでもう1回開き直したか（下の reopenOnce）。開き直した後に URL から引数が落ちても（転送や LINE が取り除く）、くり返さないための守り
export function externalBrowserUrl(href: string, userAgent: string, triedBefore = false): string | null {
  if (triedBefore || !isLineInAppBrowser(userAgent)) return null;
  const url = new URL(href);
  if (url.searchParams.getAll(PARAM).includes("1")) return null;
  url.search = url.search && url.search !== "?" ? `${url.search}&${PARAM}=1` : `?${PARAM}=1`;
  return url.href;
}

// 開き直しを、このタブで1回に限るための印（sessionStorage はタブを閉じると消える。外部ブラウザでは別に持つので、外に出た先には効かない）
const TRIED_KEY = "tabikaigi-line-reopen";

// 開き直す先を決めて、開き直すなら印を書く。印が読めない・書けないときは「開き直さない」に倒す（くり返すより、LINE の中でそのまま使ってもらう）
export function reopenOnce(href: string, userAgent: string, storage: Pick<Storage, "getItem" | "setItem">): string | null {
  let tried: boolean;
  try {
    tried = storage.getItem(TRIED_KEY) !== null;
  } catch {
    return null;
  }
  const url = externalBrowserUrl(href, userAgent, tried);
  if (!url) return null;
  try {
    storage.setItem(TRIED_KEY, "1");
  } catch {
    return null;
  }
  return url;
}
