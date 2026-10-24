import { useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { memberColor } from "../data/memberColors";
import { checkName, MEMBER_NAME_MAX } from "../data/names";
import { failureOf } from "../data/api";
import { joinGroup, rememberMember } from "../data/store";
import type { GroupMember } from "../data/types";
import { FooterLinks } from "../Footer";
import { Avatar } from "../group/Avatar";
import { BAD_NAME, joinErrorOf, NAME_NEEDS_LOGIN, SAVE_FAILED } from "../messages";
import { TurnstileWidget, type TurnstileHandle } from "../turnstile/TurnstileWidget";
import { NameField } from "./NameField";
import { Sheet } from "./Sheet";

type Props = {
  groupId: string;
  groupName: string;
  members: readonly GroupMember[];
  // シートの一番上に出す文。覚えていたメンバーがいなかった（REQ-025「前回の名前が見つかりませんでした」）、
  // 自分のメンバーが紐づいた・削除された（「行った」の付け外しで分かったとき）。なければ出さない
  notice: string | null;
  // 入れたとき（新しいメンバー、または同じ名前の確認で「続ける」）。番号と、出す知らせの文
  onJoined: (memberId: number, toast: string) => void;
  // 参加できないと分かったとき（グループが削除された、満員）。グループの画面がエラーの画面に替える
  onGone: (why: "deleted" | "full") => void;
};

// 同じ名前の確認の途中なら、その人（番号と名前）
type Confirm = { memberId: number; name: string } | null;

// 参加のシート（REQ-002・REQ-004・REQ-012、モックの openJoin('join')）。グループ名と参加中のメンバーの名前を見せて、名前を入れてもらう。
// 名前を入れるまで閉じられない。同じ名前の紐づいていないメンバーがいたら「この人として続けますか？」と聞き、
// 続けるならそのメンバーとして覚え（新しく作らない）、続けないなら名前の入力に戻る。
// 紐づいたメンバーと同じ名前なら「この名前で入るにはログインが必要です」（ログインへの入口は Phase 3 で置く）。
// 失敗の文と行き先は messages の joinErrorOf（screens の「API の応答と画面の動き」）
export function JoinSheet({ groupId, groupName, members, notice, onJoined, onGone }: Props) {
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
        // 紐づいたメンバーと同じ名前（REQ-013）。別の名前を入れてもらう（ログインへの入口は Phase 3）
        if (result.linked) {
          setFormError(NAME_NEEDS_LOGIN);
          return;
        }
        // 表示する名前は、すでにいるメンバーの名前（入れた名前と、全角・半角や大文字・小文字が違うことがある）
        const same = members.find((m) => m.id === result.memberId);
        setConfirm({ memberId: result.memberId, name: same?.name ?? mname });
      },
      (err: unknown) => {
        resetTurnstile();
        setBusy(false);
        const action = joinErrorOf(failureOf(err));
        if (action.kind === "field") setNameError(action.text);
        else if (action.kind === "form") setFormError(action.text);
        else onGone(action.kind);
      },
    );
  };

  // 同じ名前の確認で「続ける」：そのメンバーとして端末に覚えて入る（API は呼ばない。信頼ベース：REQ-012）
  const onContinue = () => {
    if (!confirm) return;
    const { memberId, name: sameName } = confirm;
    rememberMember(groupId, { memberId, name: sameName }).then(
      () => onJoined(memberId, `${sameName} さんとして続きから`),
      // いまの rememberMember は書けなくても成功で返す（覚えられないだけで、この間は入れる）。中身を替えて失敗が返るようになっても、黙らずに文を出す
      () => {
        setConfirm(null);
        setFormError(SAVE_FAILED);
      },
    );
  };

  return (
    <Sheet labelledBy={titleId} onClose={null}>
      {notice !== null && <p className="err">{notice}</p>}
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
