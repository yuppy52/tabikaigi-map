# ADR 0003：バックエンドの選び直し（Q-023）

- 状態：**提案中**（2026-10-03 に `researcher` で4つのサービスを調べ、比較と推奨案を書いた。`doc-reviewer` のレビュー（15件）を受けて、Firebase の追加調査をして書き直した。ユーザーが決め、下の「決定の前に確かめること」を済ませたら「決定」にし、[ADR 0001](0001-backend-firebase.md) を確定するか、この ADR で置き換えるかを書く）
- 日付：2026-10-03
- 関係する要件：NFR-003（リアルタイム）、NFR-004（費用の上限）、NFR-009・NFR-012（止まったときの表示）、NFR-019・NFR-020（検索、独自ドメイン）、NFR-006（保存先で守るもの）、NFR-007・NFR-008（外部に送る情報）、NFR-010〜NFR-014（運用）、NFR-015（想定規模）、NFR-016（表示の速さ）、NFR-017（バックアップ）、NFR-018（問い合わせのフォーム）、REQ-027〜REQ-029・REQ-057〜REQ-059（ログインの方法、確認メール、パスワード）、REQ-036（退会のときのログインし直し）、REQ-037〜REQ-043（匿名からログインへ）、Q-029（広告）、Q-031（無料枠を使い切られる）

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

**C で Cloudflare 側を守る決まり**（2026-10-04 調査）：ドメインを買うために Cloudflare のアカウントにカードを登録する。調べた結果：
- Free のまま、操作をしないのに有料へ切り替わる道は、公式の記述からは見つからなかった（「ない」の証明ではない）。有料になるのは、利用者が購入・有効化の操作をしたときだけ。Workers・D1・KV は Free の枠を超えるとエラーで止まる
- **R2（ファイルの保存）は、有効にした時点から無料枠を超えた分が上限なく従量で請求されうる**（公式の請求 FAQ からの推論とブログ）。一番の落とし穴
- **請求の上限を設ける機能はない**。予算アラートは知らせるだけで、しかも従量課金のアカウントだけが対象（Free は対象外：公式）。Cloudflare 側の安全装置は「Free の枠で止まる」ことだけ
- カードを登録しただけでは請求は起きない。Free でも $0 の請求書が届く。与信確認（一時的な保留）があることがある（公式）

決まり：
1. Cloudflare で買うのはドメインだけ。使う製品は Workers（Free）、静的アセット、D1、KV、Durable Objects（Free の SQLite 版。2026-10-04 にリアルタイムのために足した）、Cron Triggers、Turnstile、Workers Logs、Free のレート制限ルールに限る。Web Analytics は、アプリの画面（`/g/*`）には入れない（グループIDが送られるため：NFR-010）
2. しない操作：Workers Paid へのアップグレード、R2 の有効化（有効化の画面にも進まない）、Images・Stream の購入、Workers AI、Queues、Logpush。画面やメールに「Upgrade」「Subscribe」「Enable」と出ても押さず、相談する。ファイルの保存（R2 など）が要る機能が出てきたら、使う前に相談する
3. 請求書（Billing > Invoices）を月1回見る。$0 とドメインの年額のほかに明細があれば、すぐ調べる
4. ドメインの自動更新はオンのまま、カードの期限を年1回確かめる
5. （提案）支払いは、使える額に上限を付けられる手段（デビットやプリペイドのカード、カード会社のアプリの利用通知）にすると、万一のときの被害を小さくできる

出典：https://developers.cloudflare.com/workers/platform/pricing/ 、https://developers.cloudflare.com/r2/pricing/ 、https://developers.cloudflare.com/billing/understand/faq/ 、https://developers.cloudflare.com/billing/understand/billing-policy/ 、https://developers.cloudflare.com/billing/manage/budget-alerts/ 、https://developers.cloudflare.com/turnstile/plans/

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

A・B（Firestore のルール）と C（API のプログラムとデータベースの制約）で、NFR-006 の (1)〜(8)と、それに準じる REQ-039・REQ-057 を書けるか。

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

**推奨（改）：案 C。画面（[ADR 0004](0004-frontend-react-typescript.md)：アプリの画面は React＋TypeScript＋Vite、検索に出すページは素の HTML）を静的ファイルとして Cloudflare で配り、`/api/*` だけを Worker が受ける。API は Hono（Workers で動く小さなフレームワーク。Django の urls と views に近い感覚で書ける）、データは D1、認証は Firebase Authentication（Spark）。ドメインは Cloudflare Registrar の `.com`。リアルタイムの共有（NFR-003）は Durable Objects ＋ WebSocket で、変わったことを配る（下の「リアルタイムの共有」）。** ただし、下の「決定の前に確かめること」の C の項目を試してから決める。

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

（2026-10-04 の注記：この節は、リアルタイム（NFR-003）を要件にする前の判断。リアルタイムを入れると、A は `onSnapshot` で作るのは簡単になるが、無料枠の読み取りの余裕が小さくなる。下の「リアルタイムの共有」）

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
- **リアルタイム**（NFR-003 の見直し）：会議の場で使うので、画面を開いている人どうしで「行った」の付け外しが自動で見えるようにする（数秒の遅れは可）。案 C に Durable Objects（下の「リアルタイムの共有」）を足して実現する
- **無料枠を超えたら**：その日は止まることを受け入れる（requirements の「分かっている限界」）
- **名前の重複**：保存先（D1 の `UNIQUE`）でも防ぐ（NFR-006 (11)）
- **問い合わせのフォーム**：アプリの中に作る（API＋D1＋Turnstile。NFR-018）。外部のサービスに送らずに済む。返事はこのアプリ用のメールアドレスから送る。運営者への知らせ方は、使用量の知らせと一緒に試す
- **ログインなしの人の匿名ログイン**：やめる（2026-10-04 の `doc-reviewer` の指摘から）。ログインなしの人も、メンバー（名前と「行った」）としてデータベースに保存されるのは今までどおりで、Firebase の利用者ID（`uid`）を持たないだけ。ログインなしの人は証明書なしで API を使い、メールや Google でログインする人だけが Firebase の証明書を使う。理由：案 C ではログインなしの人の `uid` を保存しないので、匿名ログインの利点（同じ `uid` のままアカウントになる）がない。やめると、Firebase の「IP ごとに1時間100件」の上限に当たらなくなり、最初の表示も速くなる。守れる強さは変わらない（匿名の証明書は誰でも取れるので、もともと本人の区別に使えない）。auth-flow の 1.〜3.（匿名ログイン、昇格）は C で書き直すときに直す。ER 図などのデータの形は、基本設計でユーザーと確かめる

### まだ決めていないこと

- **将来、サーバーの処理が要る機能の作り方**：グループごとの OGP、運営者用の管理画面（Q-030）、広告（Q-029）は、C なら Worker（無料、超えたら止まる）に API を足して作れる見込み（要確認）。MVP の後に決める

## 決定の前に確かめること

**A を選ぶ場合**は、「決定」にする前にエミュレータで試す（Phase 1 の「Firestore のルールを書き、エミュレータでテストする」を前倒しする）。

- NFR-006 (4)(5)：作成者をルールで守れるか（Q-012・Q-019）
- REQ-039：1グループに1アカウント1メンバーをルールで守れるか（Q-019）。書けなければ「分かっている限界」に入れてよいか、をユーザーに聞く
- REQ-057：確認が済むまでメンバーに `uid` を書かせない、をルールで書けるか
- REQ-059：Spark のコンソールでパスワードのポリシーを設定できるか（実際の本番のプロジェクトを作るときに確かめる）
- 匿名からメール＋パスワードへの昇格が SDK v12 で動くか（Q-013）

**C（2026-10-04 の推奨）を「決定」にする前に小さく試す**。ふつうはローカル（wrangler と Vitest）で試すが、CPU の時間と表示の速さはローカルでは測れない（要確認）ので、無料のまま本番の環境に置いて測る。試す範囲は API 2〜3本と、リアルタイムの部屋1つに絞る。

まず通らなければ考え直すもの：
- **招待URLの返し方**：トップ（`/`）は検索に出す素の HTML（ADR 0004）なので、アプリの画面は別の HTML（例：`app.html`）にし、`/g/*` でそれを **Worker を通さずに**返せるか（静的アセットの `_redirects` の 200 リライトが使えるか：要確認）。`noindex` を `_headers` で `X-Robots-Tag` として付けられるか。Worker を通すと、Worker の枠が尽きたときに画面ごと出なくなる
- **ログインの確認と CPU**：Worker で Firebase の ID トークンを検証でき（`aud`・`iss` がプロジェクトIDと合うかも見る）、Workers 無料の CPU 10ms に収まるか（本番の環境で、Cloudflare の計測で測る）

2026-10-04 のローカルの結果（詳しくは [spike/README.md](../../spike/README.md)）：どちらも**ローカルでは通った**。招待URL `/g/*` は `_redirects` の 200 リライトで、Worker を通らずにアプリの画面を返し、`_headers` で `noindex` を付けられた。ログインの確認は `jose` で書け、テスト16件が通り、時間の目安は1回約0.03ms。残りは本番の環境での確認（Worker の回数に数えられないか、CPU 時間、本物の証明書）で、Cloudflare のアカウントと Firebase のプロジェクトが要る。ファイルがない URL は Worker に回る（枠を使う）ことも分かった

2026-10-05 の本番（`*.workers.dev`）の結果：**どちらも通った**。`/g/*` を50回開いても Worker の回数は増えなかった。ログインの確認（Google の公開鍵の取得と署名の確認を最後までたどる）の CPU 時間は、ふだん 0〜1ms、Worker が起きた直後だけ最大 7ms（確認をしない API でも 5ms 出るので、起きた直後の準備の分）。上限 10ms には収まるが、起きた直後の余裕は大きくないので、本番のアプリでも見続ける。Workers Logs には URL・IP アドレス・おおよその場所（市、郵便番号）が残る（NFR-008、Q-027 に関係）。詳しくは [spike/README.md](../../spike/README.md)

2026-10-05 のローカルの D1 の結果：上の「D1 の『読んで、判断して、書く』」と「D1 の制約」は**守れた**（20人、名前の重複、1アカウント1メンバー、最後の退出、作成者の `ON DELETE SET NULL`、batch の取り消し）。本番の D1 での同時の操作は未確認。詳しくは [spike/README.md](../../spike/README.md)

2026-10-09 のローカルのリアルタイムの結果：下の「リアルタイムの共有」の形で**動いた**（同じグループの全員に届く、違うグループには届かない、部屋が眠って起きても届く、`ping` は部屋を起こさない、画面に戻ったら取り直してつなぎ直す）。URL にはグループIDの代わりにその SHA-256 を入れ、グループIDは最初のメッセージで確かめる形にした。参加は配らないので、知らないメンバーの変更が届いたら全体を取り直す。ログインしている人の証明書の確認、スマホ、無料枠の消費は未確認。詳しくは [spike/README.md](../../spike/README.md)

そのほか：
- **ローカルでの認証のテスト**：テスト用の鍵で自分で署名した証明書を使う（公開鍵を差し替える）。「ログインの確認を緩める」設定は作らない。作るなら、本番に紛れ込まないことをデプロイのときに自動で確かめる（設定の環境を分ける）
- **Google の公開鍵**：取り直す頻度（`Cache-Control` に従う）、取っておく場所（KV なら1日1,000回の書き込みの枠）、取れなかったときの応答
- **D1 の「読んで、判断して、書く」**：D1 には途中で他の人を待たせるトランザクションがない（複数の SQL をまとめて実行する batch だけ：要確認）。判断を1つの SQL か batch に収める。参加は `INSERT … SELECT … WHERE (人数) < 20`、最後の退出はメンバーを消した後の同じ batch で `DELETE FROM groups WHERE … AND NOT EXISTS(メンバー)`。親のないメンバーは外部キー（`ON DELETE CASCADE`）で防ぐ。参加と最後の退出を同時に流すテストで確かめる（Q-010）
- **D1 の制約**：`UNIQUE(group_id, uid)`（ログインなしは `uid` を `NULL` にする。空の文字にすると壊れる）、正規化した名前の `UNIQUE`（NFR-006 (11)）、20人（人数の判断と、使うなら枠番号の `CHECK`）
- **止まったときの応答の形**（NFR-009・NFR-012）：Worker の枠切れ（Cloudflare のエラー画面で JSON ではない）、D1 の枠切れ（Worker の中の例外）、公開鍵が取れない、Durable Objects の枠切れ、のそれぞれで、画面が「いまは使えない」を出せるか
- **ログに招待URLが残らないか**（NFR-010・NFR-013）：グループIDは API の URL のパスに入れず、リクエストの中身かヘッダーで送る。Workers Logs に何が残るかを確かめる
- **使い切られる対策**（Q-031）：グループの作成と参加の API に Turnstile を付けられるか。`/api/*` に Free のレート制限ルール（1つ：要確認）や、Workers のレート制限の機能が使えるか
- **D1 の置き場所**：作るときにアジアを指定する（後から変えられない：要確認）。本番の環境に置いて、スマホの回線（遅い回線のまね）で3秒以内に地図が出るか測る（NFR-016）
- **リアルタイム**（下の「リアルタイムの共有」）：Durable Objects ＋ WebSocket で、つながるときに Firebase の証明書を確かめられるか。スマホで画面を消して戻ったときに、つなぎ直して全体を取り直せるか。無料枠の消費（管理画面で見る）。Free で必須の設定（`new_sqlite_classes`）
- 使用量の知らせを、Cloudflare の定期実行（Cron Triggers）で無料で作れるか（NFR-011）。送り先（LINE Notify は2025年3月に終わった）と、使用量を読む API トークンの置き場所（`wrangler secret`）。できなければ週1回、管理画面で見る。Firebase Authentication の使用量は Cloudflare からは見えないので、週1回、手で見る
- 匿名からメール＋パスワードへの昇格が SDK v12 で動くか（Q-013。A と共通）
- 確認メール（REQ-057、NFR-006 (10)）：API で `email_verified` を見て、確認前は紐づけや作成者の設定変更を断れるか。別のブラウザで確認が済んだ後、元の端末でトークンを取り直して紐づけられるか
- 作成者（NFR-006 (4)(5)）：作成者のメンバーが生まれる・消える（退出、削除、退会）・枠が使い回される・同じ人が別の入口（別の端末、ログアウト後）から来る、の4つの場面で、作成者を API で正しく判断できるか（[learnings](../learnings/2026-10-02-owner-and-slot-lifecycle.md)）
- 退会（REQ-036、NFR-006 (6)）：退会の API で、証明書の `auth_time`（最後にログインした時刻）が数分以内であることを確かめる（画面の「ログインし直し」だけだと、改造した画面から呼べてしまう）。順番は「D1 を消す → 画面で Firebase のアカウントを消す」。消すのに失敗したら、マイページに「退会をやり直す」を出す。消した後も手元の証明書は最大1時間使えるので、D1 に「退会済みの `uid`」を残して書き込みを断るか、限界として書く

試した後に、NFR-006 の (1)〜(11) を API とデータベースのどこで守るかの対応表を作る（下の「決めたら直すもの」）。

### リアルタイムの共有（2026-10-04 調査、NFR-003）

ユーザーから「会議の補助ツールなので、リアルタイムに共有できないと意味がない」と出た。D1 は普通のデータベースで、変わったことを画面に知らせる仕組みを持たない。`researcher` で方法を比べた（概算は NFR-015 の会議の場面、1日30回の会議で計算。調査担当の見積もり）。

| 方法 | 届く速さ | 無料枠の使用 | 作る手間 |
|---|---|---|---|
| **Durable Objects ＋ WebSocket（推奨）** | 1秒以内の見込み | Durable Objects・Workers とも約1〜6% | 中（Cloudflare の部品 `partyserver` がある） |
| 3秒ごとに問い合わせる（ポーリング） | 3秒 | Workers の1日10万を2倍超えて、アプリ全体が止まる。10秒ごとなら65% | 小 |
| Firestore の `onSnapshot`（案 A） | 1秒以内 | ふだんの分と合わせて1日5万読み取りの約60〜78%。大きいグループが会議をいくつも開くと超える | 小（ただし NFR-006 のルールの問題が戻る） |
| 組み合わせ（通知だけ Firestore） | 1秒以内 | A と同じだけ使う | 中。ルールと2つのサービスが戻る |

**決めた方法**：Durable Objects（Cloudflare の、グループごとに作れる「部屋」）を、**変わったことの知らせを配るだけ**に使う。
- 書き込みは今までどおり API が D1 に行い、NFR-006 の確かめも API の1か所に置く。書けたら API が部屋に知らせ、部屋が WebSocket（つなぎっぱなしの通信）で、画面を開いている全員に配る。データの正本は D1
- Free で使える（SQLite 版のみ）。1日10万リクエスト（WebSocket の受信は20通で1）、送信は数えない、超えたらエラーで止まる（請求なし）。眠れる書き方（Hibernation API）にすれば、実行時間の枠もほぼ使わない（公式）
- 画面は、つながったとき・画面に戻ったとき（`visibilitychange`）に全体を取り直し、取りこぼしを防ぐ。再接続は `partysocket` に任せる
- WebSocket がつながらないとき（会社の回線など）は、画面が見えているときだけ10〜15秒ごとに問い合わせる予備に切り替える
- ブラウザの WebSocket には証明書のヘッダーを付けられないので、最初のメッセージで送り、部屋はそのグループのメンバーだけを通す。配る内容は、そのグループの人が見られる範囲だけ
- 生きているかの確認は、部屋を起こさない自動応答（`setWebSocketAutoResponse`）を使う（自前の確認を送ると、部屋が起きて受信に数えられる）
- データを Durable Objects の中に置く案は採らない（集計、書き出し、`UNIQUE`、複数グループにまたがるアカウントの「行った」が分かれてしまうため）

出典：https://developers.cloudflare.com/durable-objects/platform/pricing/ 、https://developers.cloudflare.com/durable-objects/platform/limits/ 、https://developers.cloudflare.com/durable-objects/best-practices/websockets/ 、https://firebase.google.com/docs/firestore/pricing 、https://hono.dev/docs/helpers/websocket 、https://github.com/cloudflare/partykit/tree/main/packages/partyserver

### C で書き直すときの方針（2026-10-04 の `doc-reviewer` の指摘から）

data-model・auth-flow を C で書き直すときに入れる。
- **作成者**：メンバーは使い回さない主キーで持ち、`owner_member_id` をその外部キーにして `ON DELETE SET NULL`（作成者のメンバーが消えたら自動で空になる）。空いた枠に入った人が作成者になる問題（[learnings](../learnings/2026-10-02-owner-and-slot-lifecycle.md)）を防ぐ。「作成者のみ」が効くかは「`manage_by='owner'` かつ作成者がいる」から計算する（同じ事実を2か所に持たない）
- **「行った」**：1県1行で持つ（付けるのは `INSERT … ON CONFLICT DO NOTHING`、外すのは `DELETE`。`INSERT OR IGNORE` は `CHECK` の違反まで黙って無視するので使わない：2026-10-05 の試作で分かった。押し直しても結果が変わらない）。同時に塗っても消し合わない（NFR-009）。ログインしている人の分は、アカウントの1か所に持ち、表示のときに結合して読む（メンバーに写さない）
- **グループID**：推測できない文字列（`crypto.getRandomValues` で20文字以上。NFR-005）
- **D1 の「過去に戻せる機能」**（Time Travel）は、消したデータも7日間戻せる状態で持つ。プライバシーポリシーの保存期間に書く（NFR-008）。全データの書き出し（`wrangler d1 export`）の間はほかの読み書きが止まる（要確認）ので、使われない時間に行う
- **無料枠を超えて伸びたら**：その日は止まる。有料プランは上限なく請求が来るので使わない（requirements の「分かっている限界」）。移すときは、認証が Firebase のままなら `uid` は変わらず、D1 は SQLite なので書き出して移せる
- **保守の負担**：React・Hono・D1・wrangler・Firebase の5つと Durable Objects を1人で扱う。テーブル定義の変更（マイグレーション）は戻せないので、Phase 2 の前に「デプロイとテーブル定義の変更の手順書」を作る

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
- **取った（2026-10-04、ユーザー）**：`tabikaigi-map.com` を Cloudflare Registrar で。期限 2027-10-04、更新は年10.46ドル（約1,650円。為替で動く）。上の「C で Cloudflare 側を守る決まり」の 3.（請求書を月1回見る）と 4.（自動更新はオン、カードの期限を年1回）をここから始める
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
