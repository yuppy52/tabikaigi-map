import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { TURNSTILE_SITE_KEY } from "../config";
import { TURNSTILE_FAILED } from "../messages";
import { loadTurnstile, type Turnstile } from "./load";

// 親から呼べるもの。送った後に「取り直す」（トークンは1回しか使えないため）
export type TurnstileHandle = { reset: () => void };

type Props = {
  // いま使えるトークンを知らせる。期限切れ・エラー・取り直しのときは null
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
};

// ボット対策（Turnstile）のウィジェット（screens の「参加の画面」、api の「Turnstile」）。グループ作成の「作る」、参加の「参加する」の上に置く。
// 出たときにスクリプトを読み込んで（1回だけ）ウィジェットを描き、解けたらトークンを親に知らせる。消えるときはウィジェットを片付ける。
// スクリプトが読み込めない・ウィジェットがエラーになったときは、下に「確認に失敗しました」を出す（screens の turnstile_failed）
export function TurnstileWidget({ onToken, ref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 描いたウィジェット（片付けと取り直しに使う）
  const widgetRef = useRef<{ api: Turnstile; id: string } | null>(null);
  const [failed, setFailed] = useState(false);

  // ウィジェットのコールバックからは、いちばん新しい onToken を呼ぶ（描き直さずに済むように、ref に入れておく）
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  // 出たときに1回だけ描き、消えるときに片付ける
  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(
      (api) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        try {
          const id = api.render(container, {
            sitekey: TURNSTILE_SITE_KEY,
            size: "flexible",
            language: "ja",
            theme: "auto",
            callback: (token) => {
              setFailed(false);
              onTokenRef.current(token);
            },
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => {
              onTokenRef.current(null);
              setFailed(true);
            },
            "timeout-callback": () => onTokenRef.current(null),
            // 動かないブラウザでは、文を出さないとボタンが押せないまま理由も分からないので、失敗の文を出す
            "unsupported-callback": () => {
              onTokenRef.current(null);
              setFailed(true);
            },
          });
          if (id === undefined) setFailed(true);
          else widgetRef.current = { api, id };
        } catch {
          setFailed(true);
        }
      },
      // スクリプトが読み込めなかった（広告ブロッカー、通信）
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget) widget.api.remove(widget.id);
    };
  }, []);

  // 取り直す：トークンを null に戻し、ウィジェットに新しいトークンを取らせる
  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        onTokenRef.current(null);
        const widget = widgetRef.current;
        if (widget) widget.api.reset(widget.id);
      },
    }),
    [],
  );

  return (
    <>
      <div ref={containerRef} />
      {failed && (
        <p className="err" role="alert">
          {TURNSTILE_FAILED}
        </p>
      )}
    </>
  );
}
