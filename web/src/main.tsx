import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./App";
import { reopenOnce } from "./lineBrowser";
import "./styles.css";

// LINE のアプリ内ブラウザで開いたら、画面を描く前に ?openExternalBrowser=1 を足して開き直す（screens の「画面のルール」）。
// replace は履歴に増やさない（戻るで LINE の中の同じ画面に戻らないように）。開き直すのはこのタブで1回だけ（lineBrowser.ts の reopenOnce）。
// URL にはグループIDがあるので console には出さない。
// この判断より先に動く処理（取り込むファイルの一番外側での通信、Firebase・Sentry の初期化、router の loader）を足さない。足すなら render() の中で
let reopen: string | null = null;
try {
  reopen = reopenOnce(location.href, navigator.userAgent, sessionStorage);
} catch {
  // sessionStorage そのものに触れない（使えないブラウザ）ときは開き直さない
}
if (reopen) {
  location.replace(reopen);
} else {
  render();
}

// app.html の <div id="root"> に、URL に合った画面を描く（どの URL でどの画面かは App.tsx の router）。
// StrictMode は開発中だけ、副作用の書き忘れを見つけやすくするために部品を2回描く（本番では1回）
function render() {
  const root = document.getElementById("root");
  if (!root) throw new Error("app.html に #root がありません");
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
