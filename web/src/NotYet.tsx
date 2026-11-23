import { FooterLinks } from "./Footer";

// app.html を直接開いたとき（/app など）に出す仮の画面。アプリの画面は /g/… と /new だけ
export function NotYet() {
  return (
    <main className="wrap">
      <p className="message">この画面はまだありません</p>
      <p>
        <a href="/">トップへ</a>
      </p>
      <FooterLinks />
    </main>
  );
}
