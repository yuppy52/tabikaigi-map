import { useId } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // 入力欄の下に出す文（決まりに合わなかったとき）。なければ出さない
  error: string | null;
  autoComplete?: string;
};

// 名前・グループ名の入力欄（モックの .field）。合わなかったときの文は入力欄の下に出し、読み上げでも入力欄の説明として読ませる。
// 文字数の上限（maxlength）は付けない：ブラウザは絵文字を2つ以上と数えるため、見た目の文字数で確かめる（REQ-009）
export function NameField({ label, value, onChange, placeholder, error, autoComplete }: Props) {
  const inputId = useId();
  const errorId = useId();
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
      />
      {error !== null && (
        <p className="err" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
