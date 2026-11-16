import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { memberColor } from "../data/memberColors";
import { checkName, MEMBER_NAME_MAX } from "../data/names";
import { failureOf } from "../data/api";
import { joinGroup } from "../data/store";
import type { GroupMember, GroupView } from "../data/types";
import { FooterLinks } from "../Footer";
import { Avatar } from "../group/Avatar";
import { BAD_NAME, GROUP_FULL, joinedText, joinErrorOf, LOAD_FAILED, TAKEN_OTHER, takenButton, takenText, TOAST_MS } from "../messages";
import { TurnstileWidget, type TurnstileHandle } from "../turnstile/TurnstileWidget";
import { isGroupFull, takenMemberOf } from "./join";
import { NameField } from "./NameField";
import { Sheet } from "./Sheet";

type Props = {
  groupId: string;
  groupName: string;
  members: readonly GroupMember[];
  // シートの一番上に出す文。覚えていたメンバーがいなかった（REQ-025「前回の名前が見つかりませんでした」）、
  // 自分のメンバーが削除された（「行った」の付け外しで分かったとき）。なければ出さない
  notice: string | null;
  // 新しい名前で参加できたとき。番号と、出す知らせの文（グループの画面が読み直してから入る）
  onJoined: (memberId: number, toast: string) => void;
  // 一覧の名前を押した、または「（名前）さんとして入る」を押したとき。そのメンバーとして入る（API は呼ばない。読み直さない）
  onPicked: (member: GroupMember) => void;
  // 参加しようとしたらグループが削除されていたとき。グループの画面がエラーの画面に替える
  onGone: () => void;
  // グループを読み直す（グループの画面の一覧も入れ替わる）。409 name_taken で一覧にいない人が返ったとき、409 group_full のときに使う
  onReload: () => Promise<GroupView>;
  // 読み直しが失敗したとき（満員の後）の、グループの画面の読み込み失敗の扱い
  onLoadError: (e: unknown) => void;
};

// 一覧の表示か、名前の入力か（名前の入力は同じシートの中で開く。シートを重ねない：screens の「画面遷移図」の下）
type Mode = "list" | "name";

// 参加のシート（REQ-002・REQ-005・REQ-012・REQ-024、screens の「参加の画面」）。グループ名と参加中のメンバーの名前の一覧を見せる。
// 自分の名前を押せば、確かめずにそのメンバーとして入る。いなければ「＋ 新しく参加する」から名前を入れて参加する。
// 入れた名前がもういれば（409 name_taken）、その人として入るボタンを出す。名前を入れるか選ぶまで閉じられない。
// 失敗の文と行き先は messages の joinErrorOf（screens の「API の応答と画面の動き」）
export function JoinSheet({ groupId, groupName, members, notice, onJoined, onPicked, onGone, onReload, onLoadError }: Props) {
  const titleId = useId();
  const [mode, setMode] = useState<Mode>("list");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 409 name_taken で返った人（一覧の表示名を使う）。出ている間は、一覧のその人にも色を付ける
  const [taken, setTaken] = useState<GroupMember | null>(null);
  // ボット対策のトークン（取れるまで「参加する」は押せない）と、送った後に取り直すためのウィジェット。
  // 一覧に戻るとウィジェットが消え、名前の入力を開き直すと出し直されて、新しいトークンを取る
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  // 知らせ（name_taken の人が読み直してもいなかったとき）。後ろの画面は押せない（読み上げも届かない）ので、シートの中に出す
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  // 「一覧に戻る」の後に、キーボードの位置を「＋ 新しく参加する」に戻すための印とボタン
  const newJoinRef = useRef<HTMLButtonElement>(null);
  const focusNewJoin = useRef(false);

  const full = isGroupFull(members);

  // 知らせは少したったら消す。新しい知らせが出たら、そこから数え直す（グループの画面と同じ）
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // 一覧に戻ったら、「＋ 新しく参加する」にキーボードの位置を戻す（描き直した後でないとボタンがないので、描いた後に移す）
  useEffect(() => {
    if (mode !== "list" || !focusNewJoin.current) return;
    focusNewJoin.current = false;
    newJoinRef.current?.focus();
  }, [mode]);

  const showToast = (text: string) => setToast((t) => ({ text, key: (t?.key ?? 0) + 1 }));

  // 一覧の表示に戻す：入れた名前・失敗の文・「もういます」を消す
  const backToList = () => {
    setMode("list");
    setName("");
    setNameError(null);
    setFormError(null);
    setTaken(null);
    setTurnstileToken(null);
  };

  // 「＋ 新しく参加する」：同じシートの中で名前の入力を開く（入力欄にキーボードの位置を移す：NameField の autoFocus）
  const openName = () => {
    setMode("name");
    setTaken(null);
  };

  // 「一覧に戻る」
  const onBack = () => {
    focusNewJoin.current = true;
    backToList();
  };

  // 409 name_taken：一覧にその人がいれば、その人の表示名で「もういます」を出す。
  // いなければ（ほぼ同時に入った）読み直し、読み直した一覧にいれば出す。いない・読み直せないときは知らせを出して一覧に戻る
  const showTaken = (memberId: number) => {
    const found = takenMemberOf(members, memberId);
    if (found) {
      setTaken(found);
      setBusy(false);
      return;
    }
    const giveUp = () => {
      setBusy(false);
      backToList();
      showToast(LOAD_FAILED);
    };
    onReload().then((view) => {
      const again = takenMemberOf(view.members, memberId);
      if (!again) {
        giveUp();
        return;
      }
      setTaken(again);
      setBusy(false);
    }, giveUp);
  };

  // 409 group_full：読み直して、一覧（満員の一言つき）に戻す。何も覚えない。読み直せなければグループの画面の読み込み失敗の扱い
  const showFull = () => {
    onReload().then(() => {
      setBusy(false);
      backToList();
    }, onLoadError);
  };

  // 「参加する」：画面の側で長さを確かめてから送る（入力の手助け。正本は API）
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || turnstileToken === null) return;
    const mname = checkName(name, MEMBER_NAME_MAX);
    setNameError(mname === null ? BAD_NAME : null);
    setFormError(null);
    setTaken(null);
    if (mname === null) return;
    setBusy(true);
    // トークンは1回しか使えないので、送ったら（成功でも失敗でも）取り直す
    const resetTurnstile = () => turnstileRef.current?.reset();
    joinGroup(groupId, mname, turnstileToken).then(
      (result) => {
        resetTurnstile();
        if (result.status === "joined") {
          setBusy(false);
          onJoined(result.memberId, joinedText(groupName));
          return;
        }
        showTaken(result.memberId);
      },
      (err: unknown) => {
        resetTurnstile();
        const action = joinErrorOf(failureOf(err));
        if (action.kind === "full") {
          showFull();
          return;
        }
        setBusy(false);
        if (action.kind === "field") setNameError(action.text);
        else if (action.kind === "form") setFormError(action.text);
        else onGone();
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
          <small className="muted">{members.length}人が参加中</small>
        </div>
      </div>

      {/* メンバーの名前の一覧（参加した順に2列）。押すと、確かめずにそのメンバーとして入る（REQ-012・REQ-024） */}
      <h3 className="pick-title">あなたはどれ？</h3>
      <ul className="pick">
        {members.map((m) => (
          <li key={m.id}>
            <button className={taken?.id === m.id ? "taken" : undefined} type="button" disabled={busy} onClick={() => onPicked(m)}>
              <span className="swatch" style={{ background: memberColor(m.color) }} aria-hidden="true" />
              <span className="pick-name">{m.name}</span>
            </button>
          </li>
        ))}
      </ul>

      {mode === "list" ? (
        <>
          {full ? (
            <p className="fullnote">{GROUP_FULL}</p>
          ) : (
            <button className="newjoin" type="button" ref={newJoinRef} onClick={openName}>
              ＋ 新しく参加する
            </button>
          )}
          <Link className="linkbtn" to="/new">
            新しいグループを作る
          </Link>
        </>
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
              autoFocus
            />
            {taken !== null && (
              <div className="takenbox" role="alert">
                <p>{takenText(taken.name)}</p>
                <button className="primary" type="button" onClick={() => onPicked(taken)}>
                  {takenButton(taken.name)}
                </button>
                <p className="muted">{TAKEN_OTHER}</p>
              </div>
            )}
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
          <button className="linkbtn" type="button" disabled={busy} onClick={onBack}>
            一覧に戻る
          </button>
        </>
      )}
      {/* 閉じられないシートで後ろの画面が押せないので、トップへの出口と一番下のリンク（NFR-008）をシートの中にも置く */}
      <a className="linkbtn" href="/">
        トップへ
      </a>
      <FooterLinks />

      {/* 知らせ（グループの画面と同じ形。読み上げ用の入れ物はいつも置いておき、中身だけを変える） */}
      <div className="toast" aria-hidden="true" hidden={!toast}>
        {toast?.text}
      </div>
      <div className="sr-only" role="status">
        {toast?.text}
      </div>
    </Sheet>
  );
}
