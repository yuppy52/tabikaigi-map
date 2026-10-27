import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { failureOf } from "../data/api";
import { checkName, GROUP_NAME_MAX } from "../data/names";
import { renameGroup } from "../data/store";
import type { GroupMember } from "../data/types";
import { settingsView } from "../group/settings";
import { BAD_NAME, GROUP_RENAMED, OWNER_ONLY, renameErrorOf, switchMemberNote } from "../messages";
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
  onToast: (text: string) => void;
  // グループ名を変えられたとき（保存した名前）。画面のグループ名を入れ替える
  onRenamed: (name: string) => void;
  // 断られて、グループを読み直すとき（403 not_allowed、画面の不具合）
  onReload: () => void;
  // グループが削除されていたとき（覚えを忘れて、エラーの画面）
  onDeleted: () => void;
  // 「ほかのメンバーに切り替える」（覚えを忘れて、参加（名前の入力）に移る：REQ-056）
  onSwitchMember: () => void;
  onClose: () => void;
};

// グループ設定のシート（screens の「グループ設定の中身」、ワイヤーフレームの 8）。メニューの「グループ設定」から開く。
// グループ名（［変更］で、その場で入力欄と［保存］［やめる］に変わる。シートは重ねない）、管理できる人（見せるだけ）、
// 自分以外のメンバーの一覧、「ほかのメンバーに切り替える」。「作成者のみ」が効いていれば［変更］を出さず「作成者だけが変えられます」。
// メンバーの削除・退出・グループの削除は 6-2 で足す。背景を押すか Esc で閉じる（入れ物は Sheet）
export function GroupSettingsSheet({
  groupId,
  groupName,
  ownerOnly,
  members,
  meId,
  myName,
  onToast,
  onRenamed,
  onReload,
  onDeleted,
  onSwitchMember,
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
              <li key={m.id}>{m.name}</li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="primary ghost" onClick={onSwitchMember}>
        ほかのメンバーに切り替える
      </button>
      <p className="note setnote">{switchMemberNote(myName)}</p>
    </Sheet>
  );
}
