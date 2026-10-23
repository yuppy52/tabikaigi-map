// ボット対策（Turnstile）の読み込み用のスクリプトを読み込むところ。部品（npm）は入れず、Cloudflare のスクリプトを使う（api の「Turnstile」）。
// スクリプトは、ウィジェットを出す画面で初めて要るときに1回だけ読み込む（2回読み込まない）。読み込みはここだけで行う

// 使うものだけの型（Cloudflare の説明の turnstile.render・reset・remove とその設定）
export type TurnstileOptions = {
  sitekey: string;
  // 解けたとき。トークンは1回しか使えず、5分で期限が切れる
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: (errorCode: string) => void;
  // 確認が時間切れになった（トークンは出ていない。ウィジェットが自分で出し直す）
  "timeout-callback"?: () => void;
  // このブラウザでは動かない
  "unsupported-callback"?: () => void;
  size?: "normal" | "compact" | "flexible";
  language?: string;
  theme?: "auto" | "light" | "dark";
};

export type Turnstile = {
  // ウィジェットを出して、その番号（widgetId）を返す
  render: (container: HTMLElement, options: TurnstileOptions) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

// render=explicit：読み込んだだけではウィジェットを出さず、部品が turnstile.render を呼んで出す
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// 読み込みを1回にまとめる。読み込み中・読み込めた後は同じ Promise を返す。
// 読み込めなかったとき（広告ブロッカー、通信）は覚えを消し、次にウィジェットを出すときに読み込み直せるようにする
export function onceUntilFailed<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch((e: unknown) => {
      pending = null;
      throw e;
    });
    return pending;
  };
}

// script を1つ足して、読み込めたら window.turnstile を返す。読み込めなければ（error イベント）、足した script を外して失敗で返す
function injectScript(): Promise<Turnstile> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile_unavailable"));
    });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error("turnstile_unavailable"));
    });
    document.head.appendChild(script);
  });
}

// ウィジェットを出す部品が呼ぶ。スクリプトは1回だけ読み込む
export const loadTurnstile = onceUntilFailed(injectScript);
