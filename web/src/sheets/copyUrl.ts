// 招待URLのコピー（招待のシートと、退出の確認の［招待URLをコピー］で同じ動きにする。モックの selectUrl）。
// コピーできない（navigator.clipboard がない、断られた）ときは、URL の文字を選んで、自分でコピーしてもらう

// el の文字を選ぶ（中身は変えない。選んだ範囲だけを変える）
function selectText(el: HTMLElement | null, onToast: (text: string) => void): void {
  const selection = window.getSelection();
  if (el && selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  onToast("リンクを選択しました");
}

// url をコピーする。使えなければ（http の画面や古いブラウザでは clipboard がない）el の文字を選ぶ
export function copyUrl(url: string, el: HTMLElement | null, onToast: (text: string) => void): void {
  if (!navigator.clipboard) {
    selectText(el, onToast);
    return;
  }
  navigator.clipboard.writeText(url).then(
    () => onToast("リンクをコピーしました"),
    () => selectText(el, onToast),
  );
}
