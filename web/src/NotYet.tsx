import { FooterLinks } from "./Footer";

// まだ作っていない画面の仮の画面（/account など。それぞれの項目で画面に置き換える）
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
