import { createBrowserRouter, useParams } from "react-router";
import { isGroupId } from "./group/calc";
import { GroupScreen } from "./group/GroupScreen";
import { FooterLinks } from "./Footer";
import { NotYet } from "./NotYet";
import { CreateGroupScreen } from "./sheets/CreateGroupScreen";

// URL ごとに出す画面の一覧（ADR 0011。URL の正本は screens の「トップと URL」）。
// /g/ の後ろは「/g/*」で受け、グループIDの形かどうかは画面の側で確かめる（/g/ だけや、形の違う ID でも app.html が返るため）。
// /new はグループ作成の画面。ほかのアプリの URL（/account・/login・/groups・/me・/contact）と、
// それ以外（/app、開発中の /app.html など）は、まだ仮の画面
export const router = createBrowserRouter([
  { path: "/g/*", element: <GroupRoute /> },
  { path: "/new", element: <CreateGroupScreen /> },
  { path: "*", element: <NotYet /> },
]);

// /g/ の後ろを読み、グループIDの形なら グループの画面、違えば API を呼ばずにエラーを出す（screens の「API の応答と画面の動き」）。
// key にグループIDを渡すのは、別のグループに移ったときに、前のグループの表示（タブや読み込んだデータ）を持ち越さないため
function GroupRoute() {
  const groupId = useParams()["*"] ?? "";
  if (!isGroupId(groupId)) return <GroupNotFound />;
  return <GroupScreen key={groupId} groupId={groupId} />;
}

// 形の違うグループIDのときのエラー（2026-10-22 にユーザーと決めた仮の文。Phase 3 で整える）
function GroupNotFound() {
  return (
    <main className="wrap">
      <p className="message">グループが見つかりません。招待URLをもう一度確かめてください</p>
      <p>
        <a href="/">トップへ</a>
      </p>
      <FooterLinks />
    </main>
  );
}
