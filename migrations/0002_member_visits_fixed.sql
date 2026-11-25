-- メンバーの「行った」の行は書き換えさせない（正本の説明は docs/design/data-model.md の member_visits）。
--
-- 付けるのは INSERT、外すのは DELETE で、書き換える正しい操作がない（書き換える正しい操作がない列は断る：rules/sql.md）。
-- member_id を書き換えられると、「行った」をほかのグループの人に付け替えさせることになる（そのグループのメンバーかの確かめは、
-- API の INSERT・DELETE の WHERE にしかないため）。pref の書き換えも、付け外しの API を通らない変更になるので断る。
-- メンバーやグループを消したときの外部キー（ON DELETE CASCADE）の削除は UPDATE ではないので、ここでは止まらない
CREATE TRIGGER member_visits_fixed
BEFORE UPDATE ON member_visits
BEGIN
  SELECT RAISE(ABORT, 'visit_fixed');
END;
