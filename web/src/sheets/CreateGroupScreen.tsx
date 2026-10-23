import { useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { checkName, GROUP_NAME_MAX, MEMBER_NAME_MAX } from "../data/names";
import { failureOf } from "../data/api";
import { createGroup } from "../data/store";
import { FooterLinks } from "../Footer";
import { BAD_NAME, createErrorText } from "../messages";
import { TurnstileWidget, type TurnstileHandle } from "../turnstile/TurnstileWidget";
import { NameField } from "./NameField";
import { Sheet } from "./Sheet";

// 作ったグループを開くときに、グループの画面へ渡すもの（作ったメンバーの番号。招待のシートを「グループができました」で開く）
export type CreatedState = { createdMemberId: number };

// グループ作成の画面（/new。REQ-001、モックの openJoin('create')）。背景にグループはなく、シートは閉じられない。
// 作れたら、端末が作ったメンバーを覚え（store の createGroup の中）、グループの画面に移って招待のシートを開く
export function CreateGroupScreen() {
  const titleId = useId();
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [name, setName] = useState("");
  // 入力欄ごとの、合わなかったときの文
  const [groupNameError, setGroupNameError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  // 送った後の失敗の文（API が断った bad_name も、どちらの欄かは分からないのでここに出す。文は messages の createErrorText）
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ボット対策のトークン（取れるまで「作る」は押せない）と、送った後に取り直すためのウィジェット
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // 「作る」：画面の側で長さを確かめてから送る（入力の手助け。正本は API）
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || turnstileToken === null) return;
    const gname = checkName(groupName, GROUP_NAME_MAX);
    const mname = checkName(name, MEMBER_NAME_MAX);
    setGroupNameError(gname === null ? BAD_NAME : null);
    setNameError(mname === null ? BAD_NAME : null);
    setFormError(null);
    if (gname === null || mname === null) return;
    setBusy(true);
    // トークンは1回しか使えないので、送ったら（成功でも失敗でも）取り直す
    const resetTurnstile = () => turnstileRef.current?.reset();
    createGroup(gname, mname, turnstileToken).then(
      ({ groupId, memberId }) => {
        resetTurnstile();
        const state: CreatedState = { createdMemberId: memberId };
        void navigate(`/g/${groupId}`, { state });
      },
      (err: unknown) => {
        resetTurnstile();
        setBusy(false);
        setFormError(createErrorText(failureOf(err)));
      },
    );
  };

  return (
    <main className="wrap">
      <Sheet labelledBy={titleId} onClose={null}>
        <h2 className="disp" id={titleId}>
          新しいグループを作る
        </h2>
        <p className="sub">作ったあとに招待リンクを友達に送ります。</p>
        <form onSubmit={onSubmit} noValidate>
          <NameField label="グループ名" value={groupName} onChange={setGroupName} placeholder="例：卒業旅行" error={groupNameError} />
          <NameField
            label="あなたの名前"
            value={name}
            onChange={setName}
            placeholder="例：さくら"
            error={nameError}
            autoComplete="nickname"
          />
          <p className="note">グループ名とあなたの名前は、招待URLを知っている人に表示されます。本名でなくてもかまいません</p>
          <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />
          {formError !== null && (
            <p className="err" role="alert">
              {formError}
            </p>
          )}
          <button className="primary" type="submit" disabled={busy || turnstileToken === null}>
            作る
          </button>
        </form>
        {/* 閉じられないシートなので、トップへの出口と一番下のリンク（NFR-008）をシートの中に置く */}
        <a className="linkbtn" href="/">
          トップへ
        </a>
        <FooterLinks />
      </Sheet>
    </main>
  );
}
