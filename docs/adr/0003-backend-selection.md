# ADR 0003：バックエンドの選び直し（Q-023）

- 状態：**提案中**（2026-10-03 に `researcher` で4つのサービスを調べ、比較と推奨案を書いた。`doc-reviewer` のレビュー（15件）を受けて、Firebase の追加調査をして書き直した。ユーザーが決め、下の「決定の前に確かめること」を済ませたら「決定」にし、[ADR 0001](0001-backend-firebase.md) を確定するか、この ADR で置き換えるかを書く）
- 日付：2026-10-03
- 関係する要件：NFR-004（費用の上限）、NFR-006（保存先で守るもの）、NFR-007・NFR-008（外部に送る情報）、NFR-010〜NFR-014（運用）、NFR-015（想定規模）、NFR-016（表示の速さ）、NFR-017（バックアップ）、NFR-018（問い合わせのフォーム）、REQ-027〜REQ-029・REQ-057〜REQ-059（ログインの方法、確認メール、パスワード）、REQ-036（退会のときのログインし直し）、REQ-037〜REQ-043（匿名からログインへ）、Q-029（広告）、Q-031（無料枠を使い切られる）

## 背景

[ADR 0001](0001-backend-firebase.md) で Firebase を提案したが、ユーザーから「従量課金で、見積もれない金額の請求が来るのが怖い」と出た（2026-10-02）。NFR-004 で「使った分だけ上限なく請求が来る構成は不可。無料枠を超えたら止まる構成にする」と決めたので、その観点で Firebase・Supabase・Cloudflare・Vercel を比べ直す。

### 調査の前提と仮定

[learnings](../learnings/2026-10-03-confirm-premises-before-research.md) にならい、調査の前提を書いておく。**仮定**は、ユーザーに確かめていないもの（調査の時点でユーザーがいなかった）。下の「ユーザーに決めてもらうこと」で確かめる。

- 確かな前提：MVP は数グループ。想定規模は NFR-015（100グループ、平均6人、1日500回開かれる）。ログインなしでも使え、あとからログインに移る。広告は MVP では入れないが、使われ始めたら入れる予定（Q-029）＝将来は商用利用になりうる
- 仮定1：クレジットカードの登録は、上限なく請求されないなら許容かもしれない → **2026-10-04 に確認**：有料プランには上げず、無料でやる。いま Firebase にだけカードを登録しているが、それも無料の範囲で使う
- 仮定2：独自ドメインはまだ持っていない。最初はサービスのサブドメイン（`*.web.app` など）で始める → **2026-10-04 に確認**：年1,000〜2,000円程度なら取る（費用は調査中）
- 仮定3：サーバーのプログラムは、なるべく書きたくない（1人で開発・運用するため） → **2026-10-04 に訂正**：書いたことはないが、書きたくないわけではない（Django は触ったことがある）。C（API を書く案）を欠点の少ない案として比べ直す
- 2026-10-04：使用量を週1回、サービスの Web の管理画面（コンソール）で確かめる運用でよい（ユーザー。最初は「黒い画面」と勘違いしていた）
- 2026-10-04：Firebase のプロジェクトはまだ作っていない。独自ドメインは、下の「独自ドメインの費用」の推奨（Cloudflare Registrar の `.com`）で取る（購入はユーザーが行う）
- 2026-10-04：ユーザーから「画面は Next.js で作るべきか（Cloudflare Workers で動かせるのでは）」「認証は Firebase 以外の方がよいのでは」と出た。調べた結果、Next.js は選ばず、認証は Firebase Authentication のまま（下の「画面の作り方と認証の組み合わせ」）
- 2026-10-04：ユーザーは JavaScript に慣れておらず、TypeScript で書く。画面は React＋TypeScript＋Vite、検索に出すページは素の HTML にした（[ADR 0004](0004-frontend-react-typescript.md)、決定）。あわせて、検索で見つけてほしい（SEO）と分かった（NFR-019）。それまで「SEO は不要」としていたのは、確かめていない思い込みだった

## 選択肢

| 案 | 中身 |
|---|---|
| A | **Firebase 一式**（Spark：Hosting・Authentication・Firestore）。いまの設計のまま |
| B | **画面の配信だけ Cloudflare**（Workers の静的アセット）、認証とデータは Firebase（Spark） |
| C | **Cloudflare Workers ＋ D1**（SQL のデータベース）。認証だけ Firebase Authentication（Spark） |
| D | **Supabase**（Free：Auth・Postgres）。画面の配信は別のサービス |
| E | **Vercel**（Hobby）＋ Marketplace のデータベース（Neon など）と認証 |

## 比較

確かさ：特に書いていないものは公式の情報で確認した。（ブログ）は二次情報、（要確認）は確かめきれなかったもの、（見積もり）は調査担当や筆者の計算。出典は末尾。

### 費用と止まり方（NFR-004）

| 観点 | A Firebase | B Cloudflare 配信＋Firebase | C Cloudflare＋D1 | D Supabase | E Vercel |
|---|---|---|---|---|---|
| カードの登録 | 不要 | 不要（Cloudflare は公式の明記なし。要確認）。ただし Cloudflare でドメインを買うなら登録する | 同左 | 不要（公式の明記なし。要確認） | Hobby は要確認 |
| 無料枠を超えたら | **止まる**。Hosting は短い猶予のあと**サイトが無効になり、翌月の初めまで戻らない**。Firestore は「毎日太平洋時間の0時に戻る」と「その月の残りは止まる」の両方の書き方が公式にある（要確認） | 止まる。Firestore は A と同じ。**画面の配信は無料・無制限** | 止まる。API は**日ごと**（日本時間9時）に戻る。画面の配信は無料・無制限 | 通知 → 猶予 → 制限（402、読み取り専用、一時停止）。2回目以降は猶予なし。止まる時期が読みにくい | 止まる。**30日**たつまで使えない（画面ごと止まるかは要確認） |
| 有料にしたときの上限 | Blaze は**上限なし**（予算アラートは知らせるだけ。Firestore を止める手段はない） | 同左（Firebase 側） | Workers Paid（月$5）は**上限なし**（従量課金） | **Pro（月$25）は Spend Cap で上限あり**（独自ドメインなど一部は対象外） | Pro（月$20）は Spend Management で止められる（数分の遅れ。座席・Marketplace は対象外） |

→ **5案とも、無料プランのままなら請求は来ない**。違いは「有料に上げたとき上限を付けられるか」で、上限を付けられるのは D・E だけ。A・B・C は「有料には上げない」ことが前提になる。

**A・B・C で「有料に上げない」を守る具体的な決まり**：Firebase のプロジェクトに Cloud Billing の課金アカウントをつながない。コンソールの案内（Blaze へのアップグレード、Identity Platform へのアップグレード、App Check のスコアを11段階にする、など）に従わない。Identity Platform にアップグレードすると、Spark のままでも匿名を含む利用者が **1日3,000人まで**になる（公式）。

**C で Cloudflare 側を守る決まり**：ドメインを買うために Cloudflare のアカウントにカードを登録する。そのアカウントで、知らずに従量の製品や有料プラン（Workers Paid など）を有効にしてしまう道があるかを調べている（2026-10-04、`researcher`）。結果を見て、ここに具体的な決まりを書く。**ドメインを買うのは、この決まりを書いてから**にする。

### 想定規模（NFR-015）に収まるか

1回開くごとの見積もり（見積もり。設計が変わったらこの式で計算し直す）：

| 操作 | 読み取り | 書き込み | 回数/日（NFR-015） |
|---|---|---|---|
| グループを開く | グループ1＋メンバー（平均6、最大20）＋自分の `users` 1（ログインあり）＝ 約8（最大22） | 最後に使った日時（NFR-010 で持つなら）1 | 500 |
| 「行った」の付け外し | ルールの中の `get()` 1〜2 | ログインなし：メンバー1。ログインあり：`users` 1＋紐づいた全グループのメンバー（平均2と仮定）＝3 | 1回開くごとに5と仮定 → 2,500 |
| 参加・改名 | 名前の重複を確かめる20枠（Q-011） | メンバー1 | 少ない（20と仮定） |

- A・B（Firestore）：読み取り 約4,000〜11,000＋付け外しのルールの `get()` 約2,500〜5,000＋参加 約400 ＝ **約7,000〜16,000/日**（枠5万の14〜32%）。書き込み 約500＋2,500〜7,500 ＝ **約3,000〜8,000/日**（枠2万の15〜40%）
- C（D1）：読み取り 約10万行/日（枠500万行の2%）。Workers のリクエスト 約5,000/日（枠10万の5%）（調査担当の見積もり）
- D：DB 数MB（枠500MB）、通信量 約300MB/月（枠5GB）（調査担当の見積もり）
- E：関数 約15万/月（枠100万）（調査担当の見積もり）

**画面の配信（A だけの問題）**：Hosting の無料枠は、料金ページでは「360MB/日」、使用量のページでは「10GB/月」で、日ごとに効くのかは公式の説明がない（要確認）。いまのモックは gzip で約42KB。Firebase の SDK（Auth と Firestore）を足して1回150KB と仮定すると（SDK の大きさは要確認。Phase 2 でビルドして測る）、日ごとなら1日約2,400回、月ごとなら月約6万6千回まで。NFR-015（1日500回）に対して約4.8倍の余裕。ブラウザのキャッシュが効けば2回目以降はもっと小さい。LINE のクローラーが OGP の画像を取りに来る分も足される（要確認）。

→ どれも NFR-015 に収まる。A で最初に危なくなるのは **Hosting の転送量**で、超えると翌月まで画面が出ない（NFR-012 の対象外になる）。

### 使われないと止まるか（Q-014）

- A・B・C（Firebase・Cloudflare）：使われないと止まる・消える、という公式の記載は見つからなかった（「ない」の証明ではない。要確認）
- **D Supabase：7日間ほとんど使われないと一時停止**（公式）。データは残り、運営者がダッシュボードから戻す。MVP の数グループでは、止まる可能性が高い。止まると、友達が招待URLを開いても動かない
- E：Neon は5分使われないと眠るが、データは消えず、次のアクセスで起きる（削除の方針は記載なし。要確認）

### 匿名からログインへ（REQ-037〜REQ-043）

- A・B・C：Firebase Authentication の `linkWithCredential`・`linkWithPopup` で、**匿名の `uid` がそのままアカウントになる**（メールの確認の前でも `uid` は変わらない）。[auth-flow](../design/auth-flow.md) がそのまま使える。SDK v12 で動くかは実機で試す（Q-013。過去に、メールの列挙保護がオンだと失敗し、10.6.0 で直ったという報告がある：ブログ）
- C：Worker の側で Firebase の ID トークンを検証する（公式ではなく GitHub のライブラリと解説。要確認）
- D：メールは `updateUser`、Google は `linkIdentity`（**手動の紐づけはベータの設定**）
- E：匿名ログインに対応した仕組みが乏しい（Clerk は匿名の記載なし、Neon Auth は限定的）。自前で Better Auth を組むと `uid` が変わる前提になり、auth-flow を作り直す

### メールの確認・パスワード（REQ-029・REQ-057〜REQ-059）

| 観点 | A・B・C（Firebase Authentication） | D Supabase | E |
|---|---|---|---|
| 送れる数 | 確認メール **1日1,000通**、パスワードの再設定 **1日150通** | 内蔵は1時間2通・チームのメンバー宛だけ → **自分でメール送信のサービスを用意する** | 認証の仕組みしだい（Better Auth なら自前で送る） |
| 届きやすさ | 送信元は既定で `firebaseapp.com`。迷惑メールに入りやすい、iCloud に届かない、という報告がある（ブログ）。**独自ドメインを送信元にできる**（DNS の設定。Spark で使えるかは公式の明記なし、ブログでは可）。日本の携帯キャリアのメールは要確認 | 送信サービスしだい | 同左 |
| 確認が済むまで使えない（REQ-057） | ルールで `request.auth.token.email_verified` を見られる。確認した後、画面でトークンを取り直さないとルールに反映されない（ブログ） | `is_anonymous` などで区別 | 自前 |
| パスワード8文字以上（REQ-059） | パスワードのポリシー（6〜30文字、満たさなければ登録できない）を設定できる。Spark で使えるかは公式の明記がない（使える可能性が高い。コンソールで試す：要確認） | 設定できる（要確認） | 自前 |

### 保存先で守るもの（NFR-006）

A・B（Firestore のルール）と C（API のプログラムとデータベースの制約）で、NFR-006 の8つと、それに準じる REQ-039・REQ-057 を書けるか。

| NFR-006 | A・B：Firestore のルール | C：Worker ＋ D1 |
|---|---|---|
| (1) 紐づいたメンバーの「行った」と名前は本人だけ | 書ける（`resource.data.uid == request.auth.uid`） | 書ける（API で `uid` を比べる） |
| (2) アカウントの「行った」とメールは本人だけが書ける | 書ける | 書ける |
| (3) 紐づいたメンバーを付け替えられない | 書ける見込み（変更の前後の `uid` を比べる）。エミュレータで確かめる | 書ける |
| (4) 管理できる人を変えられるのはログインしている作成者だけ。作成者を勝手に変えられない | **要確認（Q-012・Q-019）**。`ownerUid` を紐づけと同時にだけ更新する（`getAfter`）か、作成者のメンバーから引くか | 書ける（API で作成者のメンバーを引く） |
| (5) 「作成者のみ」のときの変更・削除 | (4) と同じ | 書ける |
| (6) 自分のアカウントは自分だけが消せる | 書ける（Authentication は本人だけ、`users` はルール） | 書ける |
| (7) 参加していないグループを探せない | **一番素直に書ける**（`allow list` を禁止） | 一覧の API を作らなければ守れる |
| (8) 20人まで、名前の長さの上限 | 20人はメンバーIDを `s0`〜`s19` に限って守る。長さはルールの `size()` が見た目の文字数か要確認なので、余裕のある上限で守る | `CHECK` 制約と、API で数える |
| REQ-039 1グループ1アカウント1メンバー | **要確認（Q-019）**。ルールでは他のメンバーを全部見られないので、書けない可能性がある → 書けなければ「分かっている限界」へ | `UNIQUE(group_id, uid)` で**データベースが守る** |
| REQ-057 確認が済むまでログインなし扱い | 書ける（`email_verified`） | 書ける（トークンの中身を見る） |
| ほぼ同時の参加で同じ枠に2人 | トランザクションで防げる（同じIDの作成は失敗する） | `UNIQUE(group_id, slot)` |

→ A で**決まらないのは (4)(5) と REQ-039**。これらはルールを書いて試すまで分からないので、「決定の前に確かめること」に入れる。書けないと分かったら、推奨を見直す（C が有利になる）。

ルールの制約：`get()`・`exists()`・`getAfter()` は1回の書き込みで10回、バッチ・トランザクションで20回まで。退会でメンバーの多いグループを一度に消すと当たりうる。

### 作るもの・続ける作業

| | A Firebase | C Cloudflare＋D1 |
|---|---|---|
| 画面の外で書くもの | Firestore のルール（数百行の見込み）とそのテスト。全データの書き出しのスクリプト（NFR-017）。利用状況の集計のスクリプト（NFR-010）。どちらも管理用の鍵を使い、鍵はリポジトリに置かない | API（10本前後、数百行：調査担当の見積もり）とそのテスト。テーブルの定義（SQL）。書き出しは `wrangler d1 export` の1行。集計は SQL |
| ふだんの作業（NFR-011・NFR-014） | 週1回、Firebase のコンソールで使用量を見る（Spark では自動の知らせを作れない） | 週1回、Cloudflare と Firebase（認証）の2か所で使用量を見る |
| テストの道具 | エミュレータ（JDK 21 以上）、`@firebase/rules-unit-testing` | Vitest（JDK も Docker も要らない）。認証を Firebase のエミュレータで試すなら JDK が要る |
| 確かめる場所の数 | 1つ（Firebase） | 2つ（Cloudflare・Firebase） |

B は A とほぼ同じで、確かめる場所が Cloudflare と Firebase の2つになる。

### 運用（NFR-010〜NFR-013、NFR-017、Q-031）

| 観点 | A | B | C | D | E |
|---|---|---|---|---|---|
| 使用量の知らせ（NFR-011） | 予算アラートは Blaze の機能 → **手で確かめる**（Cloud Monitoring が Spark で使えないことの公式の明記は見つからない） | 同左 | Free では自動の知らせなし → 手で確かめる | 超えたら通知（事前の知らせは要確認） | 近づくと通知（一部確認） |
| 止まったときの画面（NFR-012） | Firestore は `RESOURCE_EXHAUSTED` で判別できる。Hosting が止まると画面ごと出ない | **画面は出続け、保存だけ止まる** | **画面は出続け、API だけ止まる** | HTTP 402。一時停止中はつながらない | 画面ごと止まる可能性（要確認） |
| 全データの書き出し（NFR-017） | 公式の書き出しは課金が要る → **自前のスクリプト** | 同左 | `wrangler d1 export` で1行。過去7日に戻せる機能も無料 | `pg_dump` | `pg_dump`（未確認） |
| 利用状況の集計（NFR-010） | 苦手（`count()` と自前のスクリプト） | 同左 | SQL で簡単 | SQL で簡単 | SQL で簡単 |
| エラーの把握（NFR-013） | 別に考える（Q-027） | 同左 | Workers のログ（1日20万件、3日保存） | 別に考える | ログ1時間分のみ |
| 使い切られる対策（Q-031） | App Check（reCAPTCHA Enterprise）は課金アカウントなしで使えるが、無料は**月1万回**の評価まで。トークンは既定で1時間に2回取り直すので、1日500回開かれると月1.5万〜3万回になり超えるおそれ（見積もり）。超えたときの Spark の挙動は要確認。入れるなら「強制しない（見るだけ）」か、トークンの有効時間を長くする | 同左 | **Turnstile（無料・回数無制限）を参加・作成の API に付けられる** | CAPTCHA は認証にだけ効く | WAF のレート制限1つ |
| 匿名アカウントを作る回数 | **IP ごとに1時間100件**（公式）。携帯回線は多くの人で同じ IP を使うことがあり、当たると参加できない（一般知識。超えたときのエラー名は要確認） | 同左 | 同左（Firebase Authentication を使うため） | IP ごとに1時間30件 | 認証の仕組みしだい |

→ どれも「完全に防ぐ」手段は無料では見つからなかった。最悪は「その日（月）止まる、請求は来ない」で、requirements の「分かっている限界」と合う。

### 表示の速さ（NFR-016）

- A・B：Firestore の場所は**東京（`asia-northeast1`）を選べる。作った後は変えられない**（公式）。Spark で無料のデータベースは1つだけなので、作り直して移すこともできない
- C：D1 の置き場所は選べる範囲がある（要確認）
- D：Supabase の地域は選べる（要確認）。一時停止から起きるまでは画面が動かない
- E：Neon が眠っていると最初の1回が遅れる（数百ミリ秒〜1秒台と言われる：要確認）

### 招待URLとドメイン

- A：`firebase.json` で `/g/**` のリライトと、別ドメインへの転送（パスを保ったまま301）が書ける。ただし、**転送も Hosting から返すので、Hosting が転送量の枠で止まると転送も止まる**
- B・C：`/g/**` は SPA の設定で返せる。別ドメインへの転送は静的ファイルにしか効かないので、小さな転送用の Worker を置く（調査担当の案。要確認）
- **どの案でも**：ドメインを変えると、ブラウザに覚えた内容（端末が覚えたメンバー Q-017、匿名のログイン状態）は引き継がれない（ブラウザの仕組み。一般知識）。ログインなしの人は全員、名前を入れ直す。LINE に残った古い招待URLは、転送を残すかぎり使える

**Google ログインとドメイン**（公式：redirect-best-practices）：
- 2024年6月から、リダイレクト方式のログイン（`signInWithRedirect`）は、画面のドメインと認証のドメイン（`authDomain`、既定は `<project>.firebaseapp.com`）が違うと、Chrome・Firefox・Safari で対策なしでは動かない（ブラウザが別ドメインの保存を分けるため）
- **ポップアップ方式（`signInWithPopup`）なら、ドメインが違っても動く**（ポップアップがブロックされることはある）。[auth-flow](../design/auth-flow.md) はすでにポップアップを基本にしている。退会の前のログインし直し（REQ-036、`reauthenticateWithPopup`）も同じにする
- A で `*.web.app` から配信すると、既定の `authDomain` とドメインが違う。ポップアップなら問題ない（`*.web.app` が公式の「影響なし」に入るかは明記がない：要確認）。Hosting に独自ドメインを付ければ、それを `authDomain` にできる
- B・C（画面が Cloudflare）では、独自ドメインを `authDomain` にする方法は使えない。ポップアップにするか、`/__/auth/` を `firebaseapp.com` に中継する（中継は Worker のリクエストに数えられる）。どちらでも、配信のドメインを Firebase の「承認済みドメイン」に足す。確認メール・再設定メールから画面に戻すURL（continue URL）のドメインも承認が要る

### 規約（広告：Q-029）

- **E Vercel の Hobby は非商用だけ。広告は商用の例として明記されている**（公式）。広告を入れるときに Pro（月$20）が必須になる
- A・B・C・D：無料プランで広告を禁じる記載は見つからなかった（全文は未確認。広告を入れるときに読み直す）
- B・C：Cloudflare も外部の送り先になるので、プライバシーポリシー（NFR-008）に書く

### ローカルの開発

- A・B：Firebase のエミュレータに **JDK 21 以上**が要る（firebase-tools v15 のリリースノート。公式の手順ページの「JDK 11」は古い）
- C：Node.js と wrangler だけ（認証を Firebase のエミュレータで試すなら JDK が要る）
- D：Docker が要る

## 推奨（ユーザーの判断待ち）

### 2026-10-04 の見直し：案 C を第一候補にする

ユーザーの回答で前提が3つ変わった。(1) サーバーのプログラムは書いてもよい（仮定3の訂正）、(2) NFR-006 に (9) 1グループ1アカウント1メンバー、(10) 確認前はログインありとして扱わない、を足し、できるだけ保存先で守りたい、(3) 有料プランには上げない。

(2) の (9) は、A ではルールで書けない可能性がある一方、C ならデータベースの `UNIQUE` 制約で確実に守れる。運用（集計、書き出し、ログ、使い切られる対策の Turnstile）も C が楽。作る量の多さ（API を数百行）は、(1) により大きな欠点ではなくなった。

**推奨（改）：案 C。画面（[ADR 0004](0004-frontend-react-typescript.md)：アプリの画面は React＋TypeScript＋Vite、検索に出すページは素の HTML）を静的ファイルとして Cloudflare で配り、`/api/*` だけを Worker が受ける。API は Hono（Workers で動く小さなフレームワーク。Django の urls と views に近い感覚で書ける）、データは D1、認証は Firebase Authentication（Spark）。ドメインは Cloudflare Registrar の `.com`。** ただし、下の「決定の前に確かめること」の C の項目を試してから決める。

以下の「案 A」の推奨は、2026-10-03 の時点のもの（比べるために残す）。

### 画面の作り方と認証の組み合わせ（2026-10-04 調査）

ユーザーから「画面は Next.js にすべきか（Cloudflare Workers で動くのでは）」「認証は Firebase 以外がよいのでは」と出たので調べた。

**画面：Next.js は選ばない**（この節は 2026-10-04 の調査の時点の判断。このあと、画面は React＋TypeScript に、SEO は要ることに変わった。決定と理由は [ADR 0004](0004-frontend-react-typescript.md)）
- Next.js は Cloudflare Workers で動かせる（`@opennextjs/cloudflare`、Cloudflare が作った互換の vinext）。Worker のサイズの上限は 2026-09-04 に「展開後64MiB」に広がり、大きさは問題になりにくい（公式）
- ただし、サーバーで画面を作る使い方（SSR）だと、**ページを開くたびに Worker の無料枠（1日10万）を使う**。静的ファイルなら無料・無制限なのに、その良さを捨てることになる
- 静的に書き出す使い方（`output: 'export'`）なら無料枠を使わないが、**招待URL `/g/<グループID>` のように、作った後に増えるURLを素直に作れない**（公式の制約）。リダイレクトなどの設定も使えなくなる
- 画面は10未満で、地図は結局ブラウザで描く。SEO は、検索に出すページを素の HTML にすれば Next.js なしで強くできる（ADR 0004）。Next.js の利点が薄く、学ぶ手間だけが増える

**認証：Firebase Authentication のまま**

条件は「匿名で使い始め、同じ利用者IDのままログインに移れる」「無料で、超えたら止まる」「確認メール・再設定メールをサービスが送ってくれる」「日本語の文面にできる」。全部を満たしたのは Firebase Authentication だけだった。

| 候補 | 選ばない理由 |
|---|---|
| Supabase Auth | 認証だけ使っても、7日使われないと一時停止になる可能性がある（要確認）。メールは自前の送信サービスが要る |
| Clerk | 匿名ログインの記載が見つからない（要確認）。超えると1人あたりの従量課金になる道がある（NFR-004 に反する）。メールの文面の変更は有料 |
| Auth0 | 匿名からの昇格が Firebase と別の仕組みで、超えたときの挙動も確かめきれない（要確認） |
| Better Auth（自前で D1 に置く） | 昇格すると利用者IDが変わる（auth-flow の作り直し）。メールは自前で送る。パスワードの処理が Workers 無料の CPU 10ms を超えて失敗した報告がある（GitHub） |
| Lucia | 2025年3月に開発終了（公式） |
| Cloudflare Access | 社員などのログインの門番向けで、不特定の利用者の匿名ログインには合わない（一般知識。要確認） |

C で Firebase Authentication を使うときは、Worker で ID トークン（ログインの証明書）を検証する。Hono 用の部品がある（GitHub）。検証が Workers 無料の CPU 10ms に毎回収まるかは、作って測る（要確認）。

出典：https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/ 、https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ 、https://developers.cloudflare.com/workers/framework-guides/web-apps/react/ 、https://opennext.js.org/cloudflare 、https://nextjs.org/docs/app/guides/static-exports 、https://firebase.google.com/docs/auth/custom-email-handler 、https://github.com/honojs/middleware/tree/main/packages/firebase-auth 、https://clerk.com/pricing 、https://auth0.com/pricing 、https://www.better-auth.com/docs/plugins/anonymous 、https://github.com/better-auth/better-auth/issues/8860 、https://lucia-auth.com/

### 2026-10-03 の推奨（案 A）

**案 A（Firebase 一式、Spark のまま、課金アカウントをつながない）。あわせて、独自ドメインを最初から取って Hosting に付ける（決まった額の費用なので相談：NFR-004）。**

理由：
- **費用**：Spark はカードを登録せず、超えたら止まる（請求は来ない）。NFR-004 を満たす
- **作る量が少なく、これまでの設計を使える**：サーバーのプログラムを持たず、ルールとそのテスト、書き出しと集計の小さなスクリプトを書けばよい。data-model・auth-flow をそのまま使える。確かめる場所も1つで済む（NFR-014）
- **独自ドメインを最初から付ける理由**：
  - A の一番の弱点（Hosting の転送量を超えると翌月まで画面が出ない）が心配になったとき、**DNS の向き先を変えるだけで画面の配信を Cloudflare に移せる（案 B）**。ドメインが変わらないので、ログインなしの人の入り直しも、古い招待URLの転送も要らない。`*.web.app` のまま始めると、B に移すときにドメインが変わり、全員が名前を入れ直すことになる
  - 確認メール・再設定メールの送信元を自分のドメインにでき、迷惑メールに入りにくくなる（ブログ）
  - Google ログインの `authDomain` を画面と同じドメインにできる
- D（Supabase）は、7日の一時停止が、たまにしか使われない友達グループの使い方に合わない。メール送信も自前で要る
- E（Vercel）は、広告を入れる時点で月$20の有料プランが要る。匿名ログインの仕組みも乏しい
- C（Cloudflare＋D1）は、運用（集計、書き出し、ログ、使い切られる対策）とデータベースの制約（REQ-039 など）では一番よい。ただし API のプログラムを数百行書き、確かめる場所が2つになる。**A で NFR-006 の (4)(5) や REQ-039 がルールで書けないと分かったら、C に切り替える**

## ユーザーに決めてもらうこと

### 2026-10-04 にユーザーと決めたこと

- **A か C か**：C の方向で進め、小さく試してから決定にする（作る量より、NFR-006 (9) をデータベースで守れること、運用の楽さを重く見た。サーバーのプログラムは書いてよい）
- **独自ドメイン**：最初から取る。Cloudflare Registrar の `.com`（年約1,650円）。ただし、下の「C で Cloudflare 側を守る決まり」を書いてから買う
- **使用量の確認**：週1回、サービスの Web の管理画面で見る運用でよい（C なら定期実行で自動の知らせも試す）
- **有料プラン**：上げない。無料でやる

### まだ決めていないこと

- **将来、サーバーの処理が要る機能の作り方**：グループごとの OGP、運営者用の管理画面（Q-030）、広告（Q-029）は、C なら Worker（無料、超えたら止まる）に API を足して作れる見込み（要確認）。MVP の後に決める

## 決定の前に確かめること

**A を選ぶ場合**は、「決定」にする前にエミュレータで試す（Phase 1 の「Firestore のルールを書き、エミュレータでテストする」を前倒しする）。

- NFR-006 (4)(5)：作成者をルールで守れるか（Q-012・Q-019）
- REQ-039：1グループに1アカウント1メンバーをルールで守れるか（Q-019）。書けなければ「分かっている限界」に入れてよいか、をユーザーに聞く
- REQ-057：確認が済むまでメンバーに `uid` を書かせない、をルールで書けるか
- REQ-059：Spark のコンソールでパスワードのポリシーを設定できるか（実際の本番のプロジェクトを作るときに確かめる）
- 匿名からメール＋パスワードへの昇格が SDK v12 で動くか（Q-013）

**C（2026-10-04 の推奨）を「決定」にする前に、ローカル（wrangler と Vitest）で小さく試す：**
- Worker で Firebase の ID トークンを検証でき、Workers 無料の CPU 10ms に収まるか
- D1 の `UNIQUE(group_id, uid)`・`UNIQUE(group_id, slot)` で、NFR-006 の (8)(9) と同時の参加が守れるか
- `/g/<グループID>` を静的な `index.html` で返し、`/api/*` だけを Worker に通す設定が動くか
- 使用量の知らせを、Cloudflare の定期実行（Cron Triggers）で無料で作れるか（NFR-011。できなければ週1回、管理画面で見る）
- 匿名からメール＋パスワードへの昇格が SDK v12 で動くか（Q-013。A と共通）
- 確認メール（REQ-057、NFR-006 (10)）：API で `email_verified` を見て、確認前は紐づけや作成者の設定変更を断れるか。別のブラウザで確認が済んだ後、元の端末でトークンを取り直して紐づけられるか
- 作成者（NFR-006 (4)(5)）：作成者のメンバーが生まれる・消える（退出、削除、退会）・枠が使い回される・同じ人が別の入口（別の端末、ログアウト後）から来る、の4つの場面で、作成者を API で正しく判断できるか（[learnings](../learnings/2026-10-02-owner-and-slot-lifecycle.md)）
- 退会（REQ-036）：D1 のメンバーと `users` を消してから Firebase のアカウントを消す順番と、途中で失敗したときのやり直し
- 使い切られる対策（Q-031）：グループの作成と参加の API に Turnstile を付けられるか

試した後に、NFR-006 の (1)〜(10) を API とデータベースのどこで守るかの対応表を作る（下の「決めたら直すもの」）。

## 決めたら直すもの

- A なら：ADR 0001 を「決定」にし、この ADR から参照する。architecture に「Firestore は東京で作る（後から変えられない）」「課金アカウントをつながない」「Identity Platform にアップグレードしない」を書く。NFR-011 の方法は「週1回、手で確かめる」（Q-026）、NFR-017 は「自前のスクリプト」に決める。auth-flow に、確認メールの後にトークンを取り直すことと、`reauthenticateWithPopup` を足す。Q-020 に「匿名のログインに失敗したとき（IP ごとの上限）」の表示を足す
- C なら：architecture・data-model・auth-flow を書き直す（サーバーのプログラムを持つ構成）。NFR-006 の「保存先」を「API とデータベースの制約」と読み替える表を足す
- どの案でも：open-questions の Q-011〜Q-014・Q-019・Q-021・Q-022・Q-025〜Q-027・Q-031 の書き方を、選んだ案に合わせる。NFR-018 の問い合わせのフォームをどこで作るかを決める（どの案でも別のサービスが要るかもしれない）

## 独自ドメインの費用（2026-10-04 調査）

ユーザーは「年1,000〜2,000円程度なら取る」。**`.com` なら収まる**。円は1ドル約158円（2026-10-02）で換算した概算。外貨の手数料と消費税は要確認。

| 取る会社 | `.com` の年額 | ほかの種類 | WHOIS の公開代行（名前・住所を隠す） |
|---|---|---|---|
| **Cloudflare Registrar** | **初年度も更新も約1,650円**（原価で売り、上乗せしない：公式。数字は第三者の一覧なので、買う画面で確かめる） | `.app` は更新で約2,240円、`.jp` は扱いなし（要確認） | 無料・標準（公式） |
| Porkbun | 約1,750円 | 安い表示は初年度のセール | 無料・標準 |
| ムームードメイン | 初年度750円、**更新1,728円**（税込） | `.jp` は更新3,344円、`.app` は3,520円 | 無料（ブログ） |
| お名前.com | 1円は初年度だけ、更新は約1,780円。為替で動く「サービス維持調整費」が上乗せされる | | オプション扱い（要確認） |

- **推奨：Cloudflare Registrar で `.com` を1つ（年約1,650円）**。更新で値上がりしにくく、名前・住所が公開されない。DNS も Cloudflare に置くことになるので、将来、画面の配信を Cloudflare に移すとき（案 B・C）も DNS の付け替えで済む。Firebase Hosting も、Cloudflare の DNS に Firebase の指示するレコードを入れれば使える（プロキシは切る：ブログ）
- 避けるもの：初年度だけ安い種類（`.xyz`、`.site` など。`.site` は更新で約4,380円）、`.jp`・`.app`（更新が予算を超える）
- 支払いはカード（年額の決まった費用なので NFR-004 には反しない）。自動更新に失敗するとドメインを失うので、カードの期限に気をつける
- Firebase Hosting の独自ドメインは Spark で無料（SSL 込み：公式）。Firebase Authentication のメールの送信元を独自ドメインにする設定は、Spark で使えるかの明記がない（ドメインを取った後に試す：要確認）
- ドメインの種類は、後から変えると全員が入り直しになるので、最初に決めたものを使い続ける

出典：https://www.cloudflare.com/products/registrar/ 、https://developers.cloudflare.com/registrar/account-options/renew-domains/ 、https://developers.cloudflare.com/registrar/account-options/whois-redaction/ 、https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/ 、https://cfdomainpricing.com/（第三者）、https://porkbun.com/products/domains 、https://muumuu-domain.com/domain/price/ 、https://www.onamae.com/news/article/11340/ 、https://firebase.google.com/docs/hosting/custom-domain 、https://firebase.google.com/docs/auth/email-custom-domain

## 調査で分かった数字（Firebase、Q-022）

- Hosting：保存 10GB。転送は「10GB/月」（使用量のページ）と「360MB/日」（料金ページ）。日ごとに効くかは要確認。超えると短い猶予のあとサイトが無効になり、翌月の初めまで戻らない
- Authentication：5万 MAU（匿名も数える）。新しいアカウント（匿名を含む）は IP ごとに1時間100件まで。確認メール1日1,000通、パスワードの再設定1日150通。Identity Platform にアップグレードすると、Spark では1日3,000人まで
- Firestore：読み取り 5万/日、書き込み 2万/日、削除 2万/日、保存 1GiB、送信 10GiB/月。1日の枠は太平洋時間の0時（日本時間の16〜17時ごろ）に戻る（超えたあと月末まで止まるかは要確認）。場所は東京を選べ、後から変えられない
- App Check（reCAPTCHA Enterprise）：課金アカウントなしで使える。無料は月1万回の評価。スコアは4段階だけ
- エミュレータ：JDK 21 以上（firebase-tools v15.0.0 のリリースノート）

## 出典

Firebase
- https://firebase.google.com/pricing
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- https://firebase.google.com/docs/projects/billing/avoid-surprise-bills
- https://firebase.google.com/docs/projects/billing/advanced-billing-alerts-logic
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/firestore/pricing
- https://firebase.google.com/docs/firestore/locations
- https://firebase.google.com/docs/hosting/usage-quotas-pricing
- https://firebase.google.com/docs/hosting/full-config
- https://firebase.google.com/docs/auth/web/anonymous-auth
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/manage-users
- https://firebase.google.com/docs/auth/email-custom-domain
- https://firebase.google.com/docs/auth/limits
- https://firebase.google.com/docs/rules/rules-and-auth
- https://firebase.google.com/docs/firestore/manage-data/export-import
- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://github.com/firebase/firebase-tools/releases/tag/v15.0.0
- https://github.com/firebase/firebase-js-sdk/issues/7675（ブログ・開発者の報告）
- https://engineer-papa.com/firebase-auth-icloud-email-not-delivered/（ブログ）

Supabase
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/cost-control
- https://supabase.com/docs/guides/platform/billing-faq
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits

Cloudflare
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/billing/manage/budget-alerts/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- https://developers.cloudflare.com/workers/static-assets/redirects/
- https://developers.cloudflare.com/d1/best-practices/import-export-data/
- https://developers.cloudflare.com/workers/testing/vitest-integration/
- https://developers.cloudflare.com/turnstile/plans/
- https://github.com/Code-Hex/firebase-auth-cloudflare-workers（ブログ・GitHub）

Vercel・Neon
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/limits/fair-use-guidelines
- https://vercel.com/docs/spend-management
- https://neon.com/docs/introduction/plans
