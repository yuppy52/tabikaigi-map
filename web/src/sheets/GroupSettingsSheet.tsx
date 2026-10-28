import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { failureOf } from "../data/api";
import { checkName, GROUP_NAME_MAX } from "../data/names";
import { deleteGroup, deleteMember, leaveGroup, renameGroup } from "../data/store";
import type { GroupMember } from "../data/types";
import { deleteGroupConfirm, deleteMemberConfirm, leaveConfirm, settingsView, type ConfirmText } from "../group/settings";
import {
  BAD_NAME,
  deleteGroupErrorOf,
  deleteMemberErrorOf,
  GROUP_RENAMED,
  leaveErrorOf,
  memberDeletedText,
  OWNER_ONLY,
  renameErrorOf,
  switchMemberNote,
  type RemoveErrorAction,
} from "../messages";
import type { Failure } from "../data/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { copyUrl } from "./copyUrl";
import { NameField } from "./NameField";
import { Sheet } from "./Sheet";

type Props = {
  groupId: string;
  groupName: string;
  // API の ownerOnly（「作成者のみ」が効いているか。manageBy ではなくこれで出し分ける：REQ-051）
  ownerOnly: boolean;
  members: readonly GroupMember[];
  meId: number;
  myName: string;
  // 招待URL（退出の確認の［招待URLをコピー］で使う）
  inviteUrl: string;
  onToast: (text: string) => void;
  // グループ名を変えられたとき（保存した名前）。画面のグループ名を入れ替える
  onRenamed: (name: string) => void;
  // 断られて、グループを読み直すとき（403 not_allowed、画面の不具合）
  onReload: () => void;
  // グループが削除されていたとき（覚えを忘れて、エラーの画面）
  onDeleted: () => void;
  // 「ほかのメンバーに切り替える」（覚えを忘れて、参加（名前の入力）に移る：REQ-056）
  onSwitchMember: () => void;
  // 退出・グループの削除ができたとき（覚えを忘れて、トップに移る：screens の「操作の後に開く画面」）
  onLeftGroup: () => void;
  // ほかのメンバーを削除できたとき（画面の一覧から消す。グループ設定のまま）
  onMemberDeleted: (memberId: number) => void;
  // 退出で、自分のメンバーがほかの端末で紐づいていたとき（覚えを忘れて、参加のシートに text を出す）
  onRejoin: (text: string) => void;
  onClose: () => void;
};

// グループ設定のシート（screens の「グループ設定の中身」、ワイヤーフレームの 8）。メニューの「グループ設定」から開く。
// グループ名（［変更］で、その場で入力欄と［保存］［やめる］に変わる。シートは重ねない）、管理できる人（見せるだけ）、
// 自分以外のメンバーの一覧（各行に「削除」）、「ほかのメンバーに切り替える」、「退出する」「グループを削除する」（赤）。
// 「作成者のみ」が効いていれば［変更］・「削除」・「グループを削除する」を出さず「作成者だけが変えられます」。
// 消す操作は確認ダイアログ（ConfirmDialog）を出してから送る。背景を押すか Esc で閉じる（入れ物は Sheet）
export function GroupSettingsSheet({
  groupId,
  groupName,
  ownerOnly,
  members,
  meId,
  myName,
  inviteUrl,
  onToast,
  onRenamed,
  onReload,
  onDeleted,
  onSwitchMember,
  onLeftGroup,
  onMemberDeleted,
  onRejoin,
  onClose,
}: Props) {
  const titleId = useId();
  const { canManage, manageByLabel, others } = settingsView(ownerOnly, members, meId);
  // グループ名を入れ直しているか、入力欄の中身、入力欄の下の文、送っている途中か
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 入力欄に変わったときに入力欄へ、やめたら［変更］へ、キーボードの位置を移す
  const editRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const backToChange = useRef(false);
  // 開いている確認ダイアログ（退出、メンバーの削除（相手）、グループの削除）と、確定を送っている途中か。
  // 途中かは、描き直しを待たずに二度押しを断るために、描画とは別にも持つ
  const [confirm, setConfirm] = useState<Removal | null>(null);
  const [removing, setRemoving] = useState(false);
  const sendingRef = useRef(false);
  const inviteUrlRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (editing) editRef.current?.querySelector("input")?.focus();
    else if (backToChange.current) {
      backToChange.current = false;
      changeRef.current?.focus();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(groupName);
    setNameError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    backToChange.current = true;
    setEditing(false);
  };

  // ［保存］：画面の側で長さを確かめてから送る（入力の手助け。正本は API）。失敗の文と行き先は messages の renameErrorOf
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (checkName(draft, GROUP_NAME_MAX) === null) {
      setNameError(BAD_NAME);
      return;
    }
    setNameError(null);
    setBusy(true);
    renameGroup(groupId, draft).then(
      (name) => {
        setBusy(false);
        backToChange.current = true;
        setEditing(false);
        onRenamed(name);
        onToast(GROUP_RENAMED);
      },
      (err: unknown) => {
        setBusy(false);
        const action = renameErrorOf(failureOf(err));
        if (action.kind === "field") {
          setNameError(action.text);
        } else if (action.kind === "toast") {
          onToast(action.text);
          if (action.reload) onReload();
        } else {
          onDeleted();
        }
      },
    );
  };

  // 確認ダイアログの「削除する」「退出する」：送って、成功したら・失敗したら、それぞれの行き先へ（文と行き先は messages の …ErrorOf）
  const onConfirmRemove = () => {
    if (!confirm || sendingRef.current) return;
    const target = confirm;
    sendingRef.current = true;
    setRemoving(true);
    const finish = () => {
      sendingRef.current = false;
      setRemoving(false);
    };
    // 成功したとき：メンバーの削除はグループ設定のまま知らせを出して一覧から消す。退出・グループの削除はトップへ（知らせは出さない。
    // ページが移るまでの間に二度送らないように、送っている途中のままにしておく）
    const succeeded = () => {
      if (target.kind === "member") {
        finish();
        setConfirm(null);
        onMemberDeleted(target.member.id);
        onToast(memberDeletedText(target.member.name));
      } else {
        onLeftGroup();
      }
    };
    const request =
      target.kind === "leave"
        ? leaveGroup(groupId, meId)
        : target.kind === "member"
          ? deleteMember(groupId, target.member.id)
          : deleteGroup(groupId);
    request.then(succeeded, (err: unknown) => {
      const action = removeErrorFor(target, failureOf(err), myName);
      if (action.kind !== "done") finish();
      if (action.kind === "done") {
        // 退出・グループの削除で、グループがもうなかった：成功と同じにトップへ（仮の動き 2026-10-28）
        succeeded();
      } else if (action.kind === "toast") {
        onToast(action.text);
        // 読み直すときは閉じる（設定が途中で変わっていて、ボタンが消えることがあるため）。やり直せる失敗は開いたまま
        if (action.reload) {
          setConfirm(null);
          onReload();
        }
      } else if (action.kind === "rejoin") {
        onRejoin(action.text);
      } else {
        onDeleted();
      }
    });
  };

  const confirmText: ConfirmText | null =
    confirm === null
      ? null
      : confirm.kind === "leave"
        ? leaveConfirm(ownerOnly, members, meId)
        : confirm.kind === "member"
          ? deleteMemberConfirm(confirm.member)
          : deleteGroupConfirm(groupName, members.length);

  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      <h2 className="disp" id={titleId}>
        グループ設定
      </h2>

      {editing && canManage ? (
        <div ref={editRef}>
          <form onSubmit={onSubmit} noValidate>
            <NameField label="グループ名" value={draft} onChange={setDraft} placeholder="例：卒業旅行" error={nameError} />
            <div className="setbtns">
              <button className="primary" type="submit" disabled={busy}>
                保存
              </button>
              <button className="primary ghost" type="button" onClick={cancelEdit} disabled={busy}>
                やめる
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="setrow">
          <span className="setval">グループ名：{groupName}</span>
          {canManage && (
            <button type="button" className="iconbtn" ref={changeRef} onClick={startEdit}>
              変更
            </button>
          )}
        </div>
      )}
      <div className="setrow">
        <span className="setval">管理できる人：{manageByLabel}</span>
      </div>
      {!canManage && <p className="note">{OWNER_ONLY}</p>}

      {others.length > 0 && (
        <section className="setmembers" aria-labelledby={`${titleId}-members`}>
          <h3 id={`${titleId}-members`}>メンバー</h3>
          <ul>
            {others.map((m) => (
              <li key={m.id} className="setrow">
                <span className="setval" id={`${titleId}-m${m.id}`}>
                  {m.name}
                </span>
                {canManage && (
                  <button
                    type="button"
                    className="iconbtn danger-line"
                    aria-describedby={`${titleId}-m${m.id}`}
                    onClick={() => setConfirm({ kind: "member", member: m })}
                  >
                    削除
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="primary ghost" onClick={onSwitchMember}>
        ほかのメンバーに切り替える
      </button>
      <p className="note setnote">{switchMemberNote(myName)}</p>

      {/* 消す操作（赤：NFR-017）。退出はいつも、グループの削除は管理できるときだけ */}
      <div className="setdanger">
        <button type="button" className="primary danger-line" onClick={() => setConfirm({ kind: "leave" })}>
          退出する
        </button>
        {canManage && (
          <button type="button" className="primary danger-line" onClick={() => setConfirm({ kind: "group" })}>
            グループを削除する
          </button>
        )}
      </div>

      {confirm && confirmText && (
        <ConfirmDialog
          title={confirmText.title}
          confirmLabel={confirm.kind === "leave" ? "退出する" : "削除する"}
          busy={removing}
          onConfirm={onConfirmRemove}
          onCancel={() => setConfirm(null)}
        >
          {confirmText.body.map((text) => (
            <p key={text} className="sub">
              {text}
            </p>
          ))}
          {/* 退出の確認には、本文の中に［招待URLをコピー］（招待のシートと同じ動き。コピーできなければ URL の文字を選ぶ） */}
          {confirm.kind === "leave" && (
            <div className="urlbox">
              <code ref={inviteUrlRef}>{inviteUrl}</code>
              <button type="button" className="iconbtn" onClick={() => copyUrl(inviteUrl, inviteUrlRef.current, onToast)}>
                招待URLをコピー
              </button>
            </div>
          )}
          {confirmText.warnings.map((text) => (
            <p key={text} className="sub">
              {text}
            </p>
          ))}
        </ConfirmDialog>
      )}
    </Sheet>
  );
}

// 確認ダイアログで確かめている操作。メンバーの削除は、押した行のメンバー
type Removal = { kind: "leave" } | { kind: "member"; member: GroupMember } | { kind: "group" };

// 操作ごとに、失敗の種類から動きを選ぶ（messages の leaveErrorOf・deleteMemberErrorOf・deleteGroupErrorOf）
function removeErrorFor(target: Removal, f: Failure, myName: string): RemoveErrorAction {
  if (target.kind === "leave") return leaveErrorOf(f, myName);
  if (target.kind === "member") return deleteMemberErrorOf(f);
  return deleteGroupErrorOf(f);
}
