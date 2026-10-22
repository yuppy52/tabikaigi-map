// どの画面にも一番下に置く、小さなリンク（NFR-008：screens の「画面のルール」）。
// /privacy は素の HTML のページなので、アプリの中の移動ではなく、ふつうのリンクで開く
export function FooterLinks() {
  return (
    <nav className="footlinks" aria-label="このサイトについて">
      <a href="/privacy">プライバシーポリシー</a>
      <a href="/contact">お問い合わせ</a>
    </nav>
  );
}

// 地図を出す画面の一番下に書く、地図データの出典（screens の「画面のルール」、ADR 0007）
export function MapCredit() {
  return (
    <p className="credit">
      地図：「国土数値情報（行政区域データ）」（国土交通省）を加工して作成（
      <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html">国土交通省国土数値情報ダウンロードサイト</a>）
    </p>
  );
}
