// トップ（web/index.html）で動く小さなスクリプト。React は使わない（検索に出すページは素の HTML：ADR 0004）。
// 招待URLを貼る欄だけを受け持つ：「開く」（Enter でも同じ）で、貼られた文字からグループIDを取り出して /g/<ID>?openExternalBrowser=1 に移る。
// フォームは送信しない（GET で送ると、貼った文字がトップの URL に載るため：screens の「トップの中身」）。
// 取り出せなければ、欄の下に決まった文を出す（人が入れた文字は画面に出さない。innerHTML は使わない）
import "./page.css";
import { inviteTarget } from "./inviteUrl";

const NOT_INVITE = "招待URLの形ではありません";

// 欄・エラーの文の置き場所を見つけて、送信のときの動きを付ける。見つからなければ何もしない（HTML を直したときに壊れて止まらないように）
function setupInviteForm(): void {
  const form = document.getElementById("invite-form");
  const input = document.getElementById("invite-input");
  const error = document.getElementById("invite-error");
  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement) || !error) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const to = inviteTarget(input.value);
    if (to) {
      input.removeAttribute("aria-invalid");
      error.textContent = "";
      // 戻るボタンでトップが戻ってきたとき（ブラウザが前のページをそのまま覚えている）に、貼った招待URLが欄に残らないように空にする
      input.value = "";
      location.assign(to);
      return;
    }
    // 同じ文をもう一度出したときも読み上げられるように、いったん空にしてから入れ直す（role="alert" は中身が変わったときに読む）
    error.textContent = "";
    input.setAttribute("aria-invalid", "true");
    requestAnimationFrame(() => {
      error.textContent = NOT_INVITE;
    });
  });
}

setupInviteForm();
