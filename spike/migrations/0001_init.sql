-- 試作用のテーブル（データベースの決まりで守れるかを試すため）。本番のデータの形は基本設計で決める
--
-- 考え方：画面を改造されても破られたくない決まり（NFR-006）を、できるだけデータベース自身に持たせる。
-- API のプログラムに間違いがあっても、ここで止まる。

CREATE TABLE groups (
  -- 推測できない文字列（NFR-005）。20文字以上
  id TEXT PRIMARY KEY CHECK (length(id) >= 20),
  -- 見た目の文字数（1〜20）は API で数える。ここは少し余裕のある上限（NFR-006 (8)）
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  -- 作成者のメンバー。メンバーが消えたら自動で空（NULL）になる
  owner_member_id INTEGER REFERENCES members (id) ON DELETE SET NULL,
  manage_by TEXT NOT NULL DEFAULT 'everyone' CHECK (manage_by IN ('everyone', 'owner'))
);

CREATE TABLE members (
  -- AUTOINCREMENT：消したメンバーの番号を使い回さない（空いた枠に入った人が作成者にならないように）
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- グループが消えたら、メンバーも一緒に消える
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  -- 入力したとおりの名前（表示用）
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  -- 「同じ名前」を比べるための形（REQ-011。全角半角・大文字小文字をそろえたもの。API で作る）
  name_key TEXT NOT NULL CHECK (length(name_key) BETWEEN 1 AND 40),
  -- ログインしている人の利用者ID。ログインなしは NULL（空の文字にしない）
  uid TEXT CHECK (uid IS NULL OR length(uid) BETWEEN 1 AND 128),
  -- 1つのグループで、同じ名前は1人だけ（NFR-006 (11)）
  UNIQUE (group_id, name_key),
  -- 1つのグループで、1つのアカウントに紐づくメンバーは1人だけ（NFR-006 (9)）。NULL どうしは重複とみなされない
  UNIQUE (group_id, uid)
);

-- 「行った」：1県1行（付けるのは INSERT … ON CONFLICT DO NOTHING、外すのは DELETE）
-- INSERT OR IGNORE は CHECK の違反まで黙って無視するので使わない
CREATE TABLE visits (
  member_id INTEGER NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  pref INTEGER NOT NULL CHECK (pref BETWEEN 1 AND 47),
  PRIMARY KEY (member_id, pref)
);
