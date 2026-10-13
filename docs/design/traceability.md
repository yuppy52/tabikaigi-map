# 要件IDの対応表

状態：下書き（2026-10-13：[api](api.md) に紐づけ・管理・退会などを足したので作り直した。2026-10-13：[api](api.md) を足して作り直した。2026-10-12：`/review-docs`（24件）を受けて、見出しの要件IDを数え、冒頭で名前を挙げただけのものを外し、「要件に対応しない設計」を足した。2026-10-12：要件IDの対応を付けるために作った）

各要件（[requirements](../requirements.md) の REQ・NFR）を、設計書と ADR のどこで扱っているかの一覧。設計書の本文に書いた要件ID（`（REQ-012）` の形）を集めて作った。括弧の中は節の名前。画面の配置は [ワイヤーフレーム](wireframes.drawio.svg)、構成は [構成図](architecture.drawio.svg) も見る。

設計書に要件IDを足したり消したりしたら、この表も直す（ずれたら、設計書の本文が正しい）。節の見出しに書いた要件IDも数える。文書の冒頭（最初の見出しより前）で名前を挙げただけのものは数えない。「設計での扱い」が「—」の要件は、設計書に書く必要がないもの（理由を添える）か、まだ書いていないもの。


## グループと参加

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-001 | グループ名と自分の名前を入れて、グループを作れる | [api](api.md)（一覧）<br/>[auth-flow](auth-flow.md)（3. ログインした状態でグループに入る）<br/>[data-model](data-model.md)（作成者、ログインしている人の扱い（API の共通の決まり））<br/>[permissions](permissions.md)（グループの外の操作）<br/>[screens](screens.md)（画面一覧） |
| REQ-002 | グループを作ると招待URLが発行される | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの中の操作、画面だけで止めているもの）<br/>[screens](screens.md)（画面一覧、グループの画面の中身、参加の画面） |
| REQ-003 | メンバーは、招待URLをコピー（またはシェア）して、LINE などで友達に送… | [permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-004 | 招待URLを開いて名前を入れると、会員登録なしでグループに参加できる | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの中の操作） |
| REQ-005 | 1グループのメンバーは20人まで | [api](api.md)（一覧）<br/>[data-model](data-model.md)（参加する）<br/>[permissions](permissions.md)（グループの中の操作） |
| REQ-006 | 招待URLのグループが見つからない（削除された、URLが間違っている）ときは… | [auth-flow](auth-flow.md)（1. ログインなしで参加する）<br/>[screens](screens.md)（知らせ） |

## メンバーの名前（全員に共通）

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-007 | 名前はグループごとに入力する | [data-model](data-model.md)（持たないもの） |
| REQ-008 | 1つのグループの中で、名前は重複させない | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの中の操作） |
| REQ-009 | 名前の決まり：前後の空白を取り除いてから数えて、1〜10文字 | [api](api.md)（共通の決まり）<br/>[data-model](data-model.md)（members（メンバー）） |
| REQ-010 | グループ名の決まり：前後の空白を取り除いてから数えて、1〜20文字 | [api](api.md)（共通の決まり）<br/>[data-model](data-model.md)（ER図、groups（グループ）） |
| REQ-011 | 「同じ名前」かどうかは、全角と半角（英数字・記号・空白・カタカナ）、英字の大… | [data-model](data-model.md)（ER図、members（メンバー））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（保存先で守るもの（NFR-006）、C で書き直すときの方針（2026-10-04 の `doc-reviewer` の指摘から）） |
| REQ-012 | 参加するときに、紐づいていないメンバーと同じ名前を入れたら、ログインしていな… | [api](api.md)（一覧、参加で同じ名前がいたとき）<br/>[auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、1. ログインなしで参加する）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（参加の画面、確認ダイアログ） |
| REQ-013 | アカウントに紐づいたメンバーと同じ名前では、ほかの人は参加できない（紐づいた… | [api](api.md)（一覧、参加で同じ名前がいたとき）<br/>[auth-flow](auth-flow.md)（1. ログインなしで参加する）<br/>[data-model](data-model.md)（作成者）<br/>[permissions](permissions.md)（グループの中の操作、作成者の別の入口）<br/>[screens](screens.md)（参加の画面） |
| REQ-014 | 名前を変えられるのは、ログインしている本人だけ | [api](api.md)（一覧）<br/>[data-model](data-model.md)（members（メンバー）、ログインしている人の扱い（API の共通の決まり））<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（グループ設定の中身） |
| REQ-015 | ログインせずに参加した人の名前は、誰も変えられない（本人を区別できないため） | [api](api.md)（一覧、誰が通るか）<br/>[data-model](data-model.md)（ログインしている人の扱い（API の共通の決まり））<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（グループ設定の中身） |

## 地図

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-016 | わたし：地図か一覧をタップして、自分の「行った」を付け外しできる | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-017 | みんな：行った人が多い県ほど濃く塗る | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-018 | みんな：全員まだ行っていない県を強調表示する | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-053 | みんな：誰かが行った県の数（「N / 47」）と、メンバーごとの行った県の数… | [screens](screens.md)（グループの画面の中身） |
| REQ-054 | みんな：全員まだ行っていない県の数と県名の一覧を表示する | [screens](screens.md)（グループの画面の中身） |
| REQ-019 | 県をタップすると、県の詳細で、その県に誰が行ったか（「N人中M人」）を見られ… | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-020 | メンバー別：選んだ1人の「行った」だけを表示し、その人の行った県の数を表示す… | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-055 | 地図の下に、県を地方ごとに並べた一覧を出す | [screens](screens.md)（グループの画面の中身） |
| REQ-021 | メンバーの色は10色で、参加したときに自動で決まる | [data-model](data-model.md)（ER図、members（メンバー）、色）<br/>[screens](screens.md)（グループの画面の中身） |

## ログインなしで使う

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-022 | 名前がそのまま本人になる | [auth-flow](auth-flow.md)（前提）<br/>[permissions](permissions.md)（グループの中の操作、画面だけで止めているもの） |
| REQ-023 | 「行った」はグループのメンバーごとに持ち、そのグループの誰でも編集できる | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの中の操作、画面だけで止めているもの） |
| REQ-024 | 端末に前回の名前が残っていて、グループの今のメンバーと合い、アカウントに紐づ… | [auth-flow](auth-flow.md)（1. ログインなしで参加する）<br/>[screens](screens.md)（画面遷移図） |
| REQ-025 | 端末に残っていた名前がグループの今の状態と合わない（その人が削除された、など… | [auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、1. ログインなしで参加する、2. ログインして、いまのグループのメンバーを紐づける）<br/>[data-model](data-model.md)（members（メンバー））<br/>[screens](screens.md)（参加の画面、操作の後に開く画面） |
| REQ-056 | メンバーを変更する：端末が覚えている名前を忘れて、名前の入力に戻れる | [auth-flow](auth-flow.md)（端末が覚えるもの（Q-017））<br/>[screens](screens.md)（グループ設定の中身、確認ダイアログ、操作の後に開く画面） |
| REQ-026 | グループの切り替えはない | [screens](screens.md)（グループの画面の中身） |

## アカウントとログイン

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-027 | まだ使っていないメールアドレス＋パスワード、または Google で、アカウ… | [auth-flow](auth-flow.md)（2. ログインして、いまのグループのメンバーを紐づける）<br/>[screens](screens.md)（ログインの画面の中身） |
| REQ-057 | メールアドレスでアカウントを作るときは、確認のメールを送る | [api](api.md)（共通の決まり）<br/>[auth-flow](auth-flow.md)（前提、2. ログインして、いまのグループのメンバーを紐づける、確認メールが済んだ後（REQ-057・NFR-006 (10)））<br/>[data-model](data-model.md)（ログインしている人の扱い（API の共通の決まり））<br/>[permissions](permissions.md)（グループの外の操作）<br/>[screens](screens.md)（メニューの中身、知らせ）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（メールの確認・パスワード（REQ-029・REQ-057〜REQ-059）、保存先で守るもの（NFR-006）、決定の前に確かめること） |
| REQ-058 | すでに使われているメールアドレスでアカウントを作ろうとしたときは、「登録でき… | [auth-flow](auth-flow.md)（同じメールアドレスを別のログイン方法で使ったとき（REQ-028））<br/>[screens](screens.md)（ログインの画面の中身）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（メールの確認・パスワード（REQ-029・REQ-057〜REQ-059）） |
| REQ-059 | パスワードは8文字以上 | [screens](screens.md)（ログインの画面の中身）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（メールの確認・パスワード（REQ-029・REQ-057〜REQ-059）、決定の前に確かめること） |
| REQ-028 | 作ってあるアカウントに、メールアドレス＋パスワード、または Google で… | [auth-flow](auth-flow.md)（2. ログインして、いまのグループのメンバーを紐づける、同じメールアドレスを別のログイン方法で使ったとき（REQ-028））<br/>[screens](screens.md)（ログインの画面の中身） |
| REQ-029 | パスワードを忘れたら、メールで再設定できる | [screens](screens.md)（ログインの画面の中身）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（メールの確認・パスワード（REQ-029・REQ-057〜REQ-059）） |
| REQ-060 | アカウントに紐づけられるメンバーは、10グループまで（グループを作る、参加す… | [api](api.md)（一覧）<br/>[auth-flow](auth-flow.md)（2. ログインして、いまのグループのメンバーを紐づける、3. ログインした状態でグループに入る）<br/>[data-model](data-model.md)（members（メンバー）、グループを作る、参加する ほか1か所）<br/>[permissions](permissions.md)（グループの外の操作、グループの中の操作）<br/>[screens](screens.md)（知らせ） |
| REQ-030 | ログインしている人の「行った」はアカウントに保存され、参加している全グループ… | [api](api.md)（一覧）<br/>[auth-flow](auth-flow.md)（3. ログインした状態でグループに入る）<br/>[data-model](data-model.md)（account_visits（アカウントの「行った」））<br/>[permissions](permissions.md)（グループの外の操作） |
| REQ-031 | 紐づいたメンバーの「行った」と名前は、本人しか編集できない（信頼ベースの例外… | [permissions](permissions.md)（グループの中の操作） |
| REQ-032 | グループ一覧：参加しているグループの一覧から、別のグループを開ける | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの外の操作）<br/>[screens](screens.md)（画面一覧、グループの画面の中身） |
| REQ-033 | マイページ：アカウントの「行った」とメールアドレスを見られる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（メールアドレス）<br/>[permissions](permissions.md)（グループの外の操作） |
| REQ-034 | ログアウトすると、トップを開く | [auth-flow](auth-flow.md)（4. ログアウトする）<br/>[permissions](permissions.md)（グループの外の操作）<br/>[screens](screens.md)（操作の後に開く画面） |
| REQ-035 | ログアウトした後にグループを開くと、名前の入力から入る（ログインし直して入る… | [auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、4. ログアウトする）<br/>[data-model](data-model.md)（作成者）<br/>[permissions](permissions.md)（グループの中の操作、作成者の別の入口）<br/>[screens](screens.md)（参加の画面） |
| REQ-036 | 退会できる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（members（メンバー）、退出・削除・退会）<br/>[permissions](permissions.md)（グループの外の操作）<br/>[screens](screens.md)（確認ダイアログ、操作の後に開く画面）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（招待URLとドメイン、決定の前に確かめること） |

## ログインなしで参加していた人がログインしたとき

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-037 | ログインなしでグループに参加していた人が、そのグループを開いたままアカウント… | [api](api.md)（一覧）<br/>[auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、2. ログインして、いまのグループのメンバーを紐づける、確認メールが済んだ後（REQ-057・NFR-006 (10)））<br/>[data-model](data-model.md)（members（メンバー）、作成者、紐づけ）<br/>[permissions](permissions.md)（人の区別、グループの中の操作）<br/>[screens](screens.md)（画面遷移図）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（匿名からログインへ（REQ-037〜REQ-043）） |
| REQ-038 | 紐づけるときの「行った」は、下の表のように扱う | [api](api.md)（一覧）<br/>[auth-flow](auth-flow.md)（2. ログインして、いまのグループのメンバーを紐づける）<br/>[data-model](data-model.md)（紐づけ）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（確認ダイアログ）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（匿名からログインへ（REQ-037〜REQ-043）） |
| REQ-039 | 開いていたグループに、自分のアカウントに紐づいたメンバーがすでにいる（別の端… | [api](api.md)（一覧）<br/>[auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、2. ログインして、いまのグループのメンバーを紐づける、3. ログインした状態でグループに入る）<br/>[data-model](data-model.md)（作成者、紐づけ）<br/>[permissions](permissions.md)（グループの中の操作、作成者の別の入口）<br/>[screens](screens.md)（画面一覧、画面遷移図、確認ダイアログ ほか1か所）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（匿名からログインへ（REQ-037〜REQ-043）、保存先で守るもの（NFR-006）、2026-10-03 の推奨（案 A） ほか1か所） |
| REQ-040 | 同じ端末からログインなしで参加していた他のグループは、ログインしたときには何… | [api](api.md)（一覧）<br/>[auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、2. ログインして、いまのグループのメンバーを紐づける、確認メールが済んだ後（REQ-057・NFR-006 (10)） ほか1か所）<br/>[data-model](data-model.md)（紐づけ）<br/>[permissions](permissions.md)（人の区別、グループの中の操作、作成者の別の入口）<br/>[screens](screens.md)（画面遷移図、操作の後に開く画面）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（匿名からログインへ（REQ-037〜REQ-043）） |

## ログインした人がグループに入るとき

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-041 | 自分のアカウントに紐づいたメンバーがいれば、名前を入れずにそのまま開く | [auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、3. ログインした状態でグループに入る）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（画面遷移図）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（匿名からログインへ（REQ-037〜REQ-043）） |
| REQ-042 | まだそのグループのメンバーでなく、端末が覚えているメンバーもいなければ（RE… | [auth-flow](auth-flow.md)（3. ログインした状態でグループに入る）<br/>[data-model](data-model.md)（ログインしている人の扱い（API の共通の決まり））<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（画面遷移図）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（匿名からログインへ（REQ-037〜REQ-043）） |
| REQ-043 | 本人確認：入れた名前と同じ名前の、紐づいていないメンバーがいれば「この人はあ… | [api](api.md)（一覧、参加で同じ名前がいたとき）<br/>[auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、3. ログインした状態でグループに入る）<br/>[data-model](data-model.md)（作成者）<br/>[permissions](permissions.md)（グループの中の操作、作成者の別の入口）<br/>[screens](screens.md)（参加の画面、確認ダイアログ）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（匿名からログインへ（REQ-037〜REQ-043）） |

## メンバーとグループの管理

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-044 | 管理できる人（メンバーの削除、グループ名の変更、グループの削除ができる人）を… | [data-model](data-model.md)（ER図、groups（グループ））<br/>[permissions](permissions.md)（管理の操作） |
| REQ-045 | 管理できる人を変えられるのは、ログインしている作成者だけ（ログインなしでは、… | [api](api.md)（一覧）<br/>[data-model](data-model.md)（作成者、管理できる人の操作）<br/>[permissions](permissions.md)（管理の操作）<br/>[screens](screens.md)（グループ設定の中身） |
| REQ-046 | 管理できる人は、グループ名を変えられる | [api](api.md)（一覧）<br/>[permissions](permissions.md)（管理の操作） |
| REQ-047 | 管理できる人は、グループを削除できる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（members（メンバー）、退出・削除・退会）<br/>[permissions](permissions.md)（管理の操作）<br/>[screens](screens.md)（確認ダイアログ） |
| REQ-048 | 管理できる人は、ほかのメンバーをグループから削除できる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（退出・削除・退会）<br/>[permissions](permissions.md)（管理の操作）<br/>[screens](screens.md)（確認ダイアログ、知らせ） |
| REQ-049 | メンバーは、管理できる人の設定に関係なく、自分でグループから退出できる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（退出・削除・退会）<br/>[permissions](permissions.md)（グループの中の操作、管理の操作）<br/>[screens](screens.md)（確認ダイアログ） |
| REQ-050 | 最後の1人が退出するときは、「グループも削除されます」と確認し、グループも削… | [api](api.md)（一覧）<br/>[data-model](data-model.md)（退出・削除・退会）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（確認ダイアログ） |
| REQ-051 | 作成者のメンバーがいなくなったら（退出、削除、退会）、そのグループの作成者は… | [api](api.md)（一覧、誰が通るか、グループを開いたときの応答）<br/>[auth-flow](auth-flow.md)（5. 退会する）<br/>[data-model](data-model.md)（members（メンバー）、作成者）<br/>[permissions](permissions.md)（管理の操作）<br/>[screens](screens.md)（グループ設定の中身、確認ダイアログ）<br/>[0005-owner-flag-on-member](../adr/0005-owner-flag-on-member.md)（結果） |
| REQ-052 | 作成者は「作成者のメンバー」で決まる（名前やアカウントでは決まらない） | [data-model](data-model.md)（members（メンバー）、作成者）<br/>[permissions](permissions.md)（人の区別、管理の操作、作成者の別の入口） |

## 使う環境と規模

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-001 | 端末：スマホのブラウザを主に想定する（PCでも使える） | [screens](screens.md)（画面のルール） |
| NFR-002 | アプリ内ブラウザ：アプリの画面 | [auth-flow](auth-flow.md)（端末が覚えるもの（Q-017））<br/>[screens](screens.md)（画面一覧、画面のルール） |
| NFR-003 | 更新の反映（リアルタイム）：旅行先を決める会議の場で使うので、同じグループの… | [api](api.md)（まだ作っていないもの）<br/>[architecture](architecture.md)（構成図、無料枠を超えたとき（NFR-009・NFR-012）、部屋が配るもの（NFR-003））<br/>[data-model](data-model.md)（groups（グループ））<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（知らせ）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（保存先で守るもの（NFR-006）、2026-10-04 の見直し：案 C を第一候補にする、2026-10-03 の推奨（案 A） ほか2か所） |
| NFR-015 | 想定する規模：100グループ、1グループ平均6人、全グループを合わせて1日に… | [architecture](architecture.md)（無料枠を使い切られないために（Q-031））<br/>[data-model](data-model.md)（読み書きの回数の見積もり）<br/>[privacy](privacy.md)（前提（仮定を含む））<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（調査の前提と仮定、想定規模（NFR-015）に収まるか、決定の前に確かめること ほか1か所） |
| NFR-016 | 表示の速さ：スマホの回線で、招待URLを開いてから地図が出るまで3秒以内を目… | [architecture](architecture.md)（運用）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（表示の速さ（NFR-016）、決定の前に確かめること）<br/>[0004-frontend-react-typescript](../adr/0004-frontend-react-typescript.md)（選択肢） |
| NFR-020 | 独自ドメイン：最初から独自ドメインを使い、変えない（ドメインを変えると、ログ… | [architecture](architecture.md)（使うサービス） |
| NFR-019 | 検索に出す：アプリを知らない人が検索で見つけられるように、トップ（アプリの説… | [architecture](architecture.md)（検索に出すページと出さないページ（NFR-019、NFR-005））<br/>[screens](screens.md)（画面一覧）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（調査の前提と仮定）<br/>[0004-frontend-react-typescript](../adr/0004-frontend-react-typescript.md)（検索に出す・出さない（NFR-019）） |

## 費用

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-004 | 使った分だけ上限なく請求が来る構成にはしない | [architecture](architecture.md)（運用）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（背景、費用と止まり方（NFR-004）、画面の作り方と認証の組み合わせ（2026-10-04 調査） ほか2か所）<br/>[0006-error-tracking-sentry](../adr/0006-error-tracking-sentry.md)（背景、決定） |

## セキュリティと個人情報

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-005 | グループIDは推測できない文字列にする | [architecture](architecture.md)（検索に出すページと出さないページ（NFR-019、NFR-005））<br/>[data-model](data-model.md)（groups（グループ）、グループを開く、保存先で守るもの（NFR-006）との対応）<br/>[permissions](permissions.md)（グループの外の操作）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（保存先で守るもの（NFR-006）、リアルタイムの共有（2026-10-04 調査、NFR-003）、C で書き直すときの方針（2026-10-04 の `doc-reviewer` の指摘から））<br/>[0004-frontend-react-typescript](../adr/0004-frontend-react-typescript.md)（検索に出す・出さない（NFR-019）） |
| NFR-006 | 次のことは、画面を改造されても破られないように、データの保存先の側で守る | [api](api.md)（共通の決まり、一覧）<br/>[architecture](architecture.md)（構成図、認証の方針）<br/>[auth-flow](auth-flow.md)（前提、1. ログインなしで参加する、2. ログインして、いまのグループのメンバーを紐づける ほか2か所）<br/>[data-model](data-model.md)（考え方、groups（グループ）、members（メンバー） ほか5か所）<br/>[permissions](permissions.md)（人の区別、グループの外の操作、グループの中の操作 ほか2か所）<br/>[screens](screens.md)（知らせ）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（保存先で守るもの（NFR-006）、2026-10-04 の見直し：案 C を第一候補にする、2026-10-03 の推奨（案 A） ほか4か所） |
| NFR-007 | アプリが保存する個人情報は、メンバーの名前、メールアドレス（ログインする人）… | [api](api.md)（共通の決まり）<br/>[architecture](architecture.md)（ログに残るもの（NFR-007・NFR-008・NFR-013））<br/>[data-model](data-model.md)（考え方、グループを開く）<br/>[privacy](privacy.md)（前提（仮定を含む））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（運用（NFR-010〜NFR-013、NFR-017、Q-031）） |
| NFR-008 | プライバシーポリシーを公開し、どの画面からもすぐ（1回の操作で）開けるように… | [architecture](architecture.md)（運用、ログに残るもの（NFR-007・NFR-008・NFR-013））<br/>[privacy](privacy.md)（書く項目）<br/>[screens](screens.md)（画面一覧、グループの画面の中身、画面のルール）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（運用（NFR-010〜NFR-013、NFR-017、Q-031）、規約（広告：Q-029）、決定の前に確かめること ほか1か所） |

## 信頼性

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-009 | 保存に失敗したとき（通信エラー、混み合っているなど）は、利用者にそのことを伝… | [architecture](architecture.md)（無料枠を超えたとき（NFR-009・NFR-012））<br/>[data-model](data-model.md)（member_visits（ログインなしのメンバーの「行った」））<br/>[screens](screens.md)（知らせ）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（決定の前に確かめること、C で書き直すときの方針（2026-10-04 の `doc-reviewer` の指摘から）） |
| NFR-017 | バックアップ：新しい版を出す前に、運営者が全データを手元に書き出して保存する… | [architecture](architecture.md)（運用）<br/>[permissions](permissions.md)（運営者）<br/>[privacy](privacy.md)（書く項目）<br/>[screens](screens.md)（確認ダイアログ）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（作るもの・続ける作業、運用（NFR-010〜NFR-013、NFR-017、Q-031）、決めたら直すもの） |

## 運用

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-010 | 利用状況の把握：運営者は、グループの数、メンバーの数（ログインあり・なし別）… | [api](api.md)（一覧）<br/>[architecture](architecture.md)（運用、検索に出すページと出さないページ（NFR-019、NFR-005））<br/>[data-model](data-model.md)（ER図、groups（グループ）、グループを開く）<br/>[permissions](permissions.md)（運営者）<br/>[privacy](privacy.md)（書く項目）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（費用と止まり方（NFR-004）、想定規模（NFR-015）に収まるか、作るもの・続ける作業 ほか2か所） |
| NFR-011 | 無料枠の監視：運営者は、使っているサービスの使用量が無料枠のどのくらいかを確… | [architecture](architecture.md)（運用）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（作るもの・続ける作業、運用（NFR-010〜NFR-013、NFR-017、Q-031）、決定の前に確かめること ほか1か所） |
| NFR-012 | 無料枠を超えたとき：データの保存や読み込みが止まったときは、利用者に「いまは… | [architecture](architecture.md)（無料枠を超えたとき（NFR-009・NFR-012）、運用）<br/>[screens](screens.md)（画面一覧、知らせ）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（想定規模（NFR-015）に収まるか、運用（NFR-010〜NFR-013、NFR-017、Q-031）、決定の前に確かめること） |
| NFR-013 | エラーの把握：利用者の画面で起きたエラー（保存の失敗、画面が動かないなど）を… | [architecture](architecture.md)（使うサービス、運用、エラーの送り方（Q-027） ほか1か所）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（運用（NFR-010〜NFR-013、NFR-017、Q-031）、決定の前に確かめること）<br/>[0006-error-tracking-sentry](../adr/0006-error-tracking-sentry.md)（背景） |
| NFR-014 | 運用の手間：運営者1人で回せる形にする | [architecture](architecture.md)（運用）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（作るもの・続ける作業、2026-10-03 の推奨（案 A））<br/>[0006-error-tracking-sentry](../adr/0006-error-tracking-sentry.md)（背景、決定） |
| NFR-018 | 削除の依頼への対応：利用者は、問い合わせ用のフォームから、データを消してほし… | [api](api.md)（まだ作っていないもの）<br/>[architecture](architecture.md)（運用）<br/>[data-model](data-model.md)（メールアドレス、持たないもの）<br/>[permissions](permissions.md)（運営者）<br/>[privacy](privacy.md)（書く項目）<br/>[screens](screens.md)（画面一覧）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（調査の前提と仮定、2026-10-04 にユーザーと決めたこと） |

## 要件に対応しない設計

要件IDの付いていない設計のうち、利用者に見えるもの。どれも要件を支えるための手段で、決めた場所を書く（2026-10-12：`/review-docs` #10 で足した）。

| 設計 | 場所 | 根拠 |
|---|---|---|
| 招待URLを貼る欄（トップ） | [screens](screens.md)（トップと URL） | Q-016（PC でもらった招待URLをスマホで開くため） |
| アカウントの入口（`/account`）とログインの状態の目印 | [screens](screens.md)（トップと URL）、[auth-flow](auth-flow.md)（端末が覚えるもの） | Q-016（トップで Firebase を読み込まないため） |
| 使い方のページ（`/guide`） | [screens](screens.md)（トップと URL） | NFR-019 を支える。Q-016 |
| メニュー、確認待ちの表示 | [screens](screens.md)（メニューの中身） | Q-020（立場ごとの入口と出口） |
| リアルタイムが切れたときの帯 | [screens](screens.md)（知らせ） | Q-020（会議の場で、自動で変わる前提で見ているため） |
| 部屋の URL の `room_key`、WAF のレート制限 | [architecture](architecture.md)（無料枠を使い切られないために）、[data-model](data-model.md) | Q-031 |
| 最後に開かれた日（`last_opened_on`） | [data-model](data-model.md)（groups） | Q-025（NFR-010 を支える） |

