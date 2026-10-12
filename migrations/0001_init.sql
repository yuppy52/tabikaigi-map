-- 旅会議マップのテーブル定義（正本の説明は docs/design/data-model.md）
--
-- 考え方：画面を改造されても破られたくない決まり（NFR-006）を、できるだけデータベース自身に持たせる。
-- API のプログラムに間違いがあっても、ここで止まる。
-- 列はすべて NOT NULL（members.uid だけは除く）。SQLite では CHECK に NULL を入れても違反にならないため。

CREATE TABLE groups (
  -- 推測できない文字列（英数字22文字。NFR-005）。招待URLにも使う
  id TEXT PRIMARY KEY NOT NULL CHECK (typeof(id) = 'text' AND length(id) BETWEEN 20 AND 64),
  -- 見た目の1〜20文字は API で数える。ここは大量に書かれないための余裕のある上限（NFR-006 (8)）
  name TEXT NOT NULL CHECK (typeof(name) = 'text' AND length(name) BETWEEN 1 AND 400),
  -- 管理できる人（REQ-044）
  manage_by TEXT NOT NULL DEFAULT 'everyone' CHECK (manage_by IN ('everyone', 'owner')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- 最後に開かれた日（日本時間の YYYY-MM-DD。NFR-010・Q-025）。作るときに今日の日付を入れる
  last_opened_on TEXT NOT NULL CHECK (last_opened_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- 部屋の URL に使う、グループIDの SHA-256（16進。Q-031）
  room_key TEXT NOT NULL UNIQUE CHECK (length(room_key) = 64)
);

-- アカウント（Firebase Authentication の uid）。メールアドレスは持たない
CREATE TABLE accounts (
  uid TEXT PRIMARY KEY NOT NULL CHECK (typeof(uid) = 'text' AND length(uid) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE members (
  -- AUTOINCREMENT：消したメンバーの番号を使い回さない（後から入った人が作成者にならないように）
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- グループが消えたら、メンバーも一緒に消える
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  -- 入力したとおりの名前（表示用）。見た目の1〜10文字は API で数える
  name TEXT NOT NULL CHECK (typeof(name) = 'text' AND length(name) BETWEEN 1 AND 200),
  -- 「同じ名前」を比べる形（REQ-011。API で NFKC にそろえて小文字にする）
  name_key TEXT NOT NULL CHECK (typeof(name_key) = 'text' AND length(name_key) BETWEEN 1 AND 200),
  -- 色の番号（10色。REQ-021）
  color INTEGER NOT NULL CHECK (typeof(color) = 'integer' AND color BETWEEN 0 AND 9),
  -- 作成者のメンバーなら 1（ADR 0005）
  is_owner INTEGER NOT NULL DEFAULT 0 CHECK (typeof(is_owner) = 'integer' AND is_owner IN (0, 1)),
  -- 紐づいたアカウント。ログインなしは NULL（空の文字にしない）。退会したらメンバーも消える
  uid TEXT REFERENCES accounts (uid) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- 1つのグループで、同じ名前は1人だけ（NFR-006 (11)）
  UNIQUE (group_id, name_key),
  -- 1つのグループで、1つのアカウントに紐づくメンバーは1人だけ（NFR-006 (9)）。NULL どうしは重複とみなされない
  UNIQUE (group_id, uid)
);

-- 作成者のメンバーは1グループに1人まで（NFR-006 (4)）
CREATE UNIQUE INDEX members_one_owner ON members (group_id) WHERE is_owner = 1;

-- アカウントからメンバーを引く（10グループの上限、グループ一覧、退会）
CREATE INDEX members_uid ON members (uid);

-- メンバーの番号・グループ・作成者の印・参加日時は後から変えられない（NFR-006 (4)、REQ-051）。
-- 作成者の印を付け外ししたり、作成者のメンバーを別のグループに移して作成者を作り直したりさせない
CREATE TRIGGER members_fixed
BEFORE UPDATE OF id, group_id, is_owner, created_at ON members
BEGIN
  SELECT RAISE(ABORT, 'member_fixed');
END;

-- 紐づいたメンバーを、別のアカウントに付け替えたり、紐づけを外したりできない（NFR-006 (3)）。
-- 紐づけを外す操作はなく、退会では行ごと消える（CASCADE）ので、正しい流れは断らない
CREATE TRIGGER members_uid_fixed
BEFORE UPDATE OF uid ON members
WHEN OLD.uid IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'uid_fixed');
END;

-- 1グループ20人まで（NFR-006 (8)、REQ-005）。API の参加の SQL でも確かめる。これは API に間違いがあったときの最後の守り
CREATE TRIGGER members_group_full
BEFORE INSERT ON members
WHEN (SELECT count(*) FROM members WHERE group_id = NEW.group_id) >= 20
BEGIN
  SELECT RAISE(ABORT, 'group_full');
END;

-- 作成者の印が付くのは、グループを作るときの最初のメンバーだけ（作成者がいなくなった後に復活させない）。
-- 「誰もいないグループ」を作るときとみなすので、0人のグループが残らないこと（退出・退会の batch で消す）が前提
CREATE TRIGGER members_owner_first_only
BEFORE INSERT ON members
WHEN NEW.is_owner = 1 AND EXISTS (SELECT 1 FROM members WHERE group_id = NEW.group_id)
BEGIN
  SELECT RAISE(ABORT, 'owner_first_only');
END;

-- アカウントに紐づくメンバーは10グループまで（NFR-006 (13)、REQ-060）。
-- 紐づいたメンバーを入れるときと、紐づけるときだけ数える（名前の変更などで自分の行を数えて断らないように）
CREATE TRIGGER members_group_limit_insert
BEFORE INSERT ON members
WHEN NEW.uid IS NOT NULL AND (SELECT count(*) FROM members WHERE uid = NEW.uid) >= 10
BEGIN
  SELECT RAISE(ABORT, 'group_limit');
END;

CREATE TRIGGER members_group_limit_link
BEFORE UPDATE OF uid ON members
WHEN OLD.uid IS NULL AND NEW.uid IS NOT NULL AND (SELECT count(*) FROM members WHERE uid = NEW.uid) >= 10
BEGIN
  SELECT RAISE(ABORT, 'group_limit');
END;

-- ログインなしのメンバーの「行った」：1県1行（付けるのは INSERT … ON CONFLICT DO NOTHING、外すのは DELETE）
CREATE TABLE member_visits (
  member_id INTEGER NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  -- 県の番号 1〜47（JIS X 0401）
  pref INTEGER NOT NULL CHECK (typeof(pref) = 'integer' AND pref BETWEEN 1 AND 47),
  PRIMARY KEY (member_id, pref)
);

-- アカウントの「行った」：全グループで共有する（REQ-030）
CREATE TABLE account_visits (
  uid TEXT NOT NULL REFERENCES accounts (uid) ON DELETE CASCADE,
  pref INTEGER NOT NULL CHECK (typeof(pref) = 'integer' AND pref BETWEEN 1 AND 47),
  PRIMARY KEY (uid, pref)
);
