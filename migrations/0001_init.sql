-- 旅会議マップのテーブル定義（正本の説明は docs/design/data-model.md）
--
-- 考え方：画面を改造されても破られたくない決まり（NFR-006）を、できるだけデータベース自身に持たせる。
-- API のプログラムに間違いがあっても、ここで止まる。
-- 列はすべて NOT NULL。SQLite では CHECK に NULL を入れても違反にならないため。
-- ログインはない（ADR 0013）。アカウント・作成者・管理できる人の列と表は持たない。

CREATE TABLE groups (
  -- 推測できない文字列（英数字22文字。NFR-005）。招待URLにも使う
  id TEXT PRIMARY KEY NOT NULL CHECK (typeof(id) = 'text' AND length(id) BETWEEN 20 AND 64),
  -- 見た目の1〜20文字は API で数える。ここは大量に書かれないための余裕のある上限（NFR-006 (8)）
  name TEXT NOT NULL CHECK (typeof(name) = 'text' AND length(name) BETWEEN 1 AND 400),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- 最後に開かれた日（日本時間の YYYY-MM-DD。NFR-010・Q-025）。作るときに今日の日付を入れる
  last_opened_on TEXT NOT NULL CHECK (last_opened_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- 部屋の URL に使う、グループIDの SHA-256（16進。Q-031）
  room_key TEXT NOT NULL UNIQUE CHECK (length(room_key) = 64)
);

-- グループID・room_key・作った日時は後から変えられない（書き換える正しい操作がない列は断る：rules/sql.md）。
-- room_key がグループIDの SHA-256 とずれると、部屋の入口（room_key で引く）と、API が知らせる部屋（グループIDから作る）がずれる。
-- name（グループ名の変更）と last_opened_on（開いた日の更新）は書き換える正しい操作があるので断らない
CREATE TRIGGER groups_fixed
BEFORE UPDATE OF id, room_key, created_at ON groups
BEGIN
  SELECT RAISE(ABORT, 'group_fixed');
END;

CREATE TABLE members (
  -- AUTOINCREMENT：消したメンバーの番号を使い回さない（端末が覚えている番号が、後から入った別の人を指さないように。REQ-025）
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- グループが消えたら、メンバーも一緒に消える
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  -- 入力したとおりの名前（表示用）。見た目の1〜10文字は API で数える
  name TEXT NOT NULL CHECK (typeof(name) = 'text' AND length(name) BETWEEN 1 AND 200),
  -- 「同じ名前」を比べる形（REQ-011。API で NFKC にそろえて小文字にする）
  name_key TEXT NOT NULL CHECK (typeof(name_key) = 'text' AND length(name_key) BETWEEN 1 AND 200),
  -- 色の番号（10色。REQ-021）
  color INTEGER NOT NULL CHECK (typeof(color) = 'integer' AND color BETWEEN 0 AND 9),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- 1つのグループで、同じ名前は1人だけ（NFR-006 (11)）
  UNIQUE (group_id, name_key)
);

-- メンバーの番号・グループ・参加日時は後から変えられない。
-- メンバーを別のグループに移して、20人の上限をすり抜けさせない（NFR-006 (8)）。
-- 名前は断らない（API に名前を変える文はないが、運営者が削除の依頼で手で直すことがあるため：data-model.md）
CREATE TRIGGER members_fixed
BEFORE UPDATE OF id, group_id, created_at ON members
BEGIN
  SELECT RAISE(ABORT, 'member_fixed');
END;

-- 1グループ20人まで（NFR-006 (8)、REQ-005）。API の参加の SQL でも確かめる。これは API に間違いがあったときの最後の守り
CREATE TRIGGER members_group_full
BEFORE INSERT ON members
WHEN (SELECT count(*) FROM members WHERE group_id = NEW.group_id) >= 20
BEGIN
  SELECT RAISE(ABORT, 'group_full');
END;

-- メンバーの「行った」：1県1行（付けるのは INSERT … ON CONFLICT DO NOTHING、外すのは DELETE）
CREATE TABLE member_visits (
  member_id INTEGER NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  -- 県の番号 1〜47（JIS X 0401）
  pref INTEGER NOT NULL CHECK (typeof(pref) = 'integer' AND pref BETWEEN 1 AND 47),
  PRIMARY KEY (member_id, pref)
);
