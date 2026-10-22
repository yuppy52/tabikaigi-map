import { FooterLinks } from "./Footer";

// まだ作っていない画面の仮の画面（/new・/account など。3-5 以降でそれぞれの画面に置き換える）
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
