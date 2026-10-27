import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  // 見出し（「（名前）として退出します」など）
  title: string;
  // 本文（文の段落、退出では［招待URLをコピー］も）
  children: ReactNode;
  // 赤い確定のボタンの文（「削除する」「退出する」）
  confirmLabel: string;
  // 送っている途中か。途中は、どちらのボタンも押せず、Esc・背景でも閉じない（二度送らない。送った結果を待つ）
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// 消す操作の確認ダイアログ（screens の「確認ダイアログ」、ワイヤーフレームの 9。NFR-017）。退出・メンバーの削除・グループの削除で同じものを使う。
// 見出しと本文、「キャンセル」と赤い確定のボタン。シートの上に重ねるので、ページの一番外（body）に出す（シートの中だと重なりの順が崩れるため）。
// キーボードの考え方は Sheet と同じ：開いたらダイアログに移し、Esc か背景で閉じ、閉じたら開く前のボタンに戻す
export function ConfirmDialog({ title, children, confirmLabel, busy, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Esc を聞く関数の中で、いまの値を見るための写し（聞き直さずに済むように）
  const busyRef = useRef(busy);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    busyRef.current = busy;
    cancelRef.current = onCancel;
  }, [busy, onCancel]);

  // Esc で閉じる。後ろのシートも Esc で閉じるので、先に受け取って止める（ダイアログだけを閉じる）。送っている途中は閉じない
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Tab はダイアログの中だけを回る（後ろのシートや画面に移らない：消す操作の確認を飛ばして、後ろを押せないように）
      if (e.key === "Tab") {
        const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? [])];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const inside = dialogRef.current?.contains(document.activeElement) ?? false;
        if (e.shiftKey && (!inside || document.activeElement === first || document.activeElement === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busyRef.current) cancelRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // 開いたときにダイアログへキーボードの位置を移し、閉じたら元のボタンに戻す（そのボタンが消えていれば戻さない）
  useEffect(() => {
    const before = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  return createPortal(
    <>
      <div className="scrim confirm-scrim" onClick={busy ? undefined : onCancel} />
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <h2 className="disp" id={titleId}>
          {title}
        </h2>
        <div id={bodyId}>{children}</div>
        <div className="confirm-btns">
          <button type="button" className="primary ghost" onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
          <button type="button" className="primary danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
