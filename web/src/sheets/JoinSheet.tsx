import { useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { memberColor } from "../data/memberColors";
import { checkName, MEMBER_NAME_MAX } from "../data/names";
import { joinGroup, rememberMember } from "../data/store";
import type { GroupMember } from "../data/types";
import { FooterLinks } from "../Footer";
import { Avatar } from "../group/Avatar";
import { BAD_NAME, errorText, SAVE_FAILED } from "../messages";
import { TurnstileWidget, type TurnstileHandle } from "../turnstile/TurnstileWidget";
import { NameField } from "./NameField";
import { Sheet } from "./Sheet";

type Props = {
  groupId: string;
  groupName: string;
  members: readonly GroupMember[];
  // 端末が覚えていたメンバーがグループにいなかった（REQ-025）。そのときは「前回の名前が見つかりませんでした」を出す
  lostMember: boolean;
  // 入れたとき（新しいメンバー、または同じ名前の確認で「続ける」）。番号と、出す知らせの文
  onJoined: (memberId: number, toast: string) => void;
};

// 同じ名前の確認の途中なら、その人（番号と名前）
type Confirm = { memberId: number; name: string } | null;

// 参加のシート（REQ-002・REQ-004・REQ-012、モックの openJoin('join')）。グループ名と参加中のメンバーの名前を見せて、名前を入れてもらう。
// 名前を入れるまで閉じられない。同じ名前の紐づいていないメンバーがいたら「この人として続けますか？」と聞き、
// 続けるならそのメンバーとして覚え（新しく作らない）、続けないなら名前の入力に戻る
export function JoinSheet({ groupId, groupName, members, lostMember, onJoined }: Props) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  // ボット対策のトークン（取れるまで「参加する」は押せない）と、送った後に取り直すためのウィジェット。
  // 同じ名前の確認の間はウィジェットが消え、「別の名前にする」で戻ると出し直されて、新しいトークンを取る
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // 「参加する」：画面の側で長さを確かめてから送る（入力の手助け。正本は API）
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || turnstileToken === null) return;
    const mname = checkName(name, MEMBER_NAME_MAX);
    setNameError(mname === null ? BAD_NAME : null);
    setFormError(null);
    if (mname === null) return;
    setBusy(true);
    // トークンは1回しか使えないので、送ったら（成功でも失敗でも）取り直す
    const resetTurnstile = () => turnstileRef.current?.reset();
    joinGroup(groupId, mname, turnstileToken).then(
      (result) => {
        resetTurnstile();
        setBusy(false);
        if (result.status === "joined") {
          onJoined(result.memberId, `${groupName} に参加しました`);
          return;
        }
        // 紐づいたメンバーと同じ名前（REQ-013）は、ログインの項目で作る。それまでは表にない失敗として扱う
        if (result.linked) {
          setFormError(SAVE_FAILED);
          return;
        }
        // 表示する名前は、すでにいるメンバーの名前（入れた名前と、全角・半角や大文字・小文字が違うことがある）
        const same = members.find((m) => m.id === result.memberId);
        setConfirm({ memberId: result.memberId, name: same?.name ?? mname });
      },
      (err: unknown) => {
        resetTurnstile();
        setBusy(false);
        const text = errorText(err);
        if (text === BAD_NAME) setNameError(text);
        else setFormError(text);
      },
    );
  };

  // 同じ名前の確認で「続ける」：そのメンバーとして端末に覚えて入る（API は呼ばない。信頼ベース：REQ-012）
  const onContinue = () => {
    if (!confirm) return;
    const { memberId, name: sameName } = confirm;
    rememberMember(groupId, { memberId, name: sameName }).then(
      () => onJoined(memberId, `${sameName} さんとして続きから`),
      // 覚えられなかったら、確認を閉じて文を出す（シートは閉じられないので、黙っていると何もできなくなる）
      () => {
        setConfirm(null);
        setFormError(SAVE_FAILED);
      },
    );
  };

  return (
    <Sheet labelledBy={titleId} onClose={null}>
      {lostMember && <p className="err">前回の名前が見つかりませんでした</p>}
      <p className="sub" style={{ margin: "0 0 6px" }}>
        招待リンクから開きました
      </p>
      <div className="invite">
        <div className="avs">
          {members.slice(0, 4).map((m) => (
            <Avatar key={m.id} name={m.name} color={memberColor(m.color)} size={30} />
          ))}
        </div>
        <div>
          <b className="disp" id={titleId} style={{ fontSize: 17 }}>
            {groupName}
          </b>
          <br />
          <small className="muted">{members.map((m) => m.name).join("・")} が参加中</small>
        </div>
      </div>
      {confirm ? (
        <div>
          <p role="alert">{confirm.name}さんはすでに参加しています。この人として続けますか？</p>
          {/* 入力欄が消えるので、キーボードの位置を「続ける」に移す */}
          <button className="primary" type="button" onClick={onContinue} autoFocus>
            続ける
          </button>
          <button className="linkbtn" type="button" onClick={() => setConfirm(null)}>
            別の名前にする
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={onSubmit} noValidate>
            <NameField
              label="あなたの名前"
              value={name}
              onChange={setName}
              placeholder="例：さくら"
              error={nameError}
              autoComplete="nickname"
            />
            <p className="note">あなたの名前は、招待URLを知っている人に表示されます。本名でなくてもかまいません</p>
            <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />
            {formError !== null && (
              <p className="err" role="alert">
                {formError}
              </p>
            )}
            <button className="primary" type="submit" disabled={busy || turnstileToken === null}>
              参加する
            </button>
          </form>
          <Link className="linkbtn" to="/new">
            新しいグループを作る
          </Link>
        </>
      )}
      {/* 閉じられないシートで後ろの画面が押せないので、トップへの出口と一番下のリンク（NFR-008）をシートの中にも置く */}
      <a className="linkbtn" href="/">
        トップへ
      </a>
      <FooterLinks />
    </Sheet>
  );
}
