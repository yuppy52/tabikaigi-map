# 要件IDの対応表

状態：下書き（2026-11-09：参加の画面で名前を選ぶ形にした（REQ-012）のと、L-1 の `/review-docs` の直しに合わせて、REQ-007・REQ-012・REQ-024・REQ-025・REQ-046・REQ-047・REQ-056・NFR-006・NFR-018 の行を手で直した（作り直しのスクリプトが手元に残っていなかったため。変えた節の要件IDを grep で確かめた）。2026-11-06：ログインをやめた（[ADR 0013](../adr/0013-drop-login.md)）ので作り直した。なくした要件の行を消し、要件の節の名前を requirements に合わせた。作り直しは手元のスクリプト（リポジトリにはない）で行い、状態の行と「要件に対応しない設計」は手で直した。2026-10-15：`/review-docs` を受けて作り直し、要件に対応しない設計に目印のヘッダー・health・Turnstile を足した。2026-10-13：[api](api.md) に紐づけ・管理・退会などを足したので作り直した。2026-10-13：[api](api.md) を足して作り直した。2026-10-12：`/review-docs`（24件）を受けて、見出しの要件IDを数え、冒頭で名前を挙げただけのものを外し、「要件に対応しない設計」を足した。2026-10-12：要件IDの対応を付けるために作った）

各要件（[requirements](../requirements.md) の REQ・NFR）を、設計書と ADR のどこで扱っているかの一覧。設計書の本文に書いた要件ID（`（REQ-012）` の形）を集めて作った。括弧の中は節の名前。画面の配置は [ワイヤーフレーム](wireframes.drawio.svg)、構成は [構成図](architecture.drawio.svg) も見る。

設計書に要件IDを足したり消したりしたら、この表も直す（ずれたら、設計書の本文が正しい）。節の見出しに書いた要件IDも数える。文書の冒頭（最初の見出しより前）で名前を挙げただけのものは数えない。「設計での扱い」が「—」の要件は、設計書に書く必要がないもの（理由を添える）か、まだ書いていないもの。

## グループと参加

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-001 | グループ名と自分の名前を入れて、グループを作れる | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの外の操作）<br/>[screens](screens.md)（画面一覧） |
| REQ-002 | グループを作ると招待URLが発行される | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの中の操作、画面だけで止めているもの）<br/>[screens](screens.md)（画面一覧、グループの画面の中身、参加の画面、画面のルール） |
| REQ-003 | メンバーは、招待URLをコピー（またはシェア）して、LINE などで友達に送れる | [permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-004 | 招待URLを開いて名前を入れると、会員登録なしでグループに参加できる | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの中の操作） |
| REQ-005 | 1グループのメンバーは20人まで | [api](api.md)（一覧、参加で同じ名前がいたとき）<br/>[data-model](data-model.md)（参加する）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（参加の画面） |
| REQ-006 | 招待URLのグループが見つからない（削除された、URLが間違っている）ときは、… | [auth-flow](auth-flow.md)（名前で参加する）<br/>[screens](screens.md)（知らせ） |

## メンバーの名前

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-007 | 名前はグループごとに入力する | [screens](screens.md)（参加の画面） |
| REQ-008 | 1つのグループの中で、名前は重複させない | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの中の操作） |
| REQ-009 | 名前の決まり：前後の空白を取り除いてから数えて、1〜10文字 | [api](api.md)（共通の決まり）<br/>[data-model](data-model.md)（members（メンバー）） |
| REQ-010 | グループ名の決まり：前後の空白を取り除いてから数えて、1〜20文字 | [api](api.md)（共通の決まり）<br/>[data-model](data-model.md)（ER図、groups（グループ））<br/>[permissions](permissions.md)（グループの中の操作） |
| REQ-011 | 「同じ名前」かどうかは、全角と半角（英数字・記号・空白・カタカナ）、英字の大文… | [api](api.md)（共通の決まり）<br/>[data-model](data-model.md)（ER図、members（メンバー））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（保存先で守るもの（NFR-006）、C で書き直すときの方針（2026-10-04 の `doc-reviewer` の指摘から）） |
| REQ-012 | 参加の画面では、参加中のメンバーの名前を並べる。自分の名前をタップすれば… | [api](api.md)（一覧、参加で同じ名前がいたとき）<br/>[auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、名前で参加する）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（画面一覧、画面遷移図、参加の画面、API の応答と画面の動き）<br/>[0013-drop-login](../adr/0013-drop-login.md)（結果と注意） |
| REQ-015 | メンバーの名前は、誰も変えられない（本人を区別できないため） | [data-model](data-model.md)（members（メンバー）、メンバーの番号で操作する API の共通の決まり）<br/>[permissions](permissions.md)（グループの中の操作） |

## 地図

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-016 | わたし：地図か一覧をタップして、自分の「行った」を付け外しできる | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-017 | みんな：行った人が多い県ほど濃く塗る | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-018 | みんな：全員まだ行っていない県を強調表示する | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-053 | みんな：誰かが行った県の数（「N / 47」）と、メンバーごとの行った県の数を… | [screens](screens.md)（グループの画面の中身） |
| REQ-054 | みんな：全員まだ行っていない県の数と県名の一覧を表示する | [screens](screens.md)（グループの画面の中身） |
| REQ-019 | 県をタップすると、県の詳細で、その県に誰が行ったか（「N人中M人」）を見られる | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-020 | メンバー別：選んだ1人の「行った」だけを表示し、その人の行った県の数を表示する | [api](api.md)（一覧）<br/>[screens](screens.md)（グループの画面の中身） |
| REQ-055 | 地図の下に、県を地方ごとに並べた一覧を出す | [screens](screens.md)（グループの画面の中身） |
| REQ-021 | メンバーの色は10色で、参加したときに自動で決まる（使われていない色から順に | [data-model](data-model.md)（ER図、members（メンバー）、色）<br/>[screens](screens.md)（グループの画面の中身） |

## 名前で本人を決める

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-022 | 名前がそのまま本人になる | [permissions](permissions.md)（グループの中の操作、画面だけで止めているもの） |
| REQ-023 | 「行った」はグループのメンバーごとに持ち、そのグループの誰でも編集できる | [api](api.md)（一覧）<br/>[permissions](permissions.md)（グループの中の操作、画面だけで止めているもの） |
| REQ-024 | 端末に前回の名前が残っていて、グループの今のメンバーと合えば、参加の画面を出さ… | [auth-flow](auth-flow.md)（名前で参加する）<br/>[permissions](permissions.md)（人の区別）<br/>[screens](screens.md)（画面遷移図、参加の画面） |
| REQ-025 | 端末に残っていた名前がグループの今の状態と合わない（その人が削除された、など）… | [auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、名前で参加する）<br/>[data-model](data-model.md)（members（メンバー））<br/>[permissions](permissions.md)（人の区別）<br/>[screens](screens.md)（参加の画面） |
| REQ-056 | メンバーを変更する：端末が覚えている名前を忘れて、参加の画面に戻れる | [auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、名前で参加する）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（グループ設定の中身、確認ダイアログ、操作の後に開く画面） |
| REQ-026 | グループの切り替えはない | [screens](screens.md)（グループの画面の中身） |

## メンバーとグループの管理

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| REQ-046 | メンバーは誰でも、グループ名を変えられる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（グループ名の変更・グループの削除）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（グループ設定の中身） |
| REQ-047 | メンバーは誰でも、グループを削除できる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（members（メンバー）、退出・削除、グループ名の変更・グループの削除）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（グループ設定の中身、確認ダイアログ） |
| REQ-048 | メンバーは誰でも、ほかのメンバーをグループから削除できる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（退出・削除）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（グループ設定の中身、確認ダイアログ、知らせ） |
| REQ-049 | メンバーは、自分でグループから退出できる | [api](api.md)（一覧）<br/>[data-model](data-model.md)（退出・削除）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（確認ダイアログ） |
| REQ-050 | 最後の1人が退出するときは、「グループも削除されます」と確認し、グループも削除… | [api](api.md)（一覧）<br/>[data-model](data-model.md)（退出・削除）<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（確認ダイアログ） |

## 使う環境と規模

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-001 | 端末：スマホのブラウザを主に想定する（PCでも使える） | [screens](screens.md)（画面のルール） |
| NFR-002 | アプリ内ブラウザ：アプリの画面（招待URLのほか、グループ作成など | [auth-flow](auth-flow.md)（端末が覚えるもの（Q-017）、LINE のアプリ内ブラウザ）<br/>[screens](screens.md)（画面のルール） |
| NFR-003 | 更新の反映（リアルタイム）：旅行先を決める会議の場で使うので、同じグループの画… | [architecture](architecture.md)（構成図、無料枠を超えたとき（NFR-009・NFR-012）、部屋が配るもの（NFR-003））<br/>[data-model](data-model.md)（groups（グループ））<br/>[permissions](permissions.md)（グループの中の操作）<br/>[screens](screens.md)（知らせ）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（保存先で守るもの（NFR-006）、2026-10-04 の見直し：案 C を第一候補にする、2026-10-03 の推奨（案 A）、2026-10-04 にユーザーと決めたこと、リアルタイムの共有（2026-10-04 調査、NFR-003））<br/>[0012-realtime-reconnect-and-no-polling-fallback](../adr/0012-realtime-reconnect-and-no-polling-fallback.md)（決定（2026-10-26 にユーザーが推奨どおりに選んだ）、結果と注意） |
| NFR-015 | 想定する規模：100グループ、1グループ平均6人、全グループを合わせて1日に5… | [architecture](architecture.md)（無料枠を使い切られないために（Q-031））<br/>[data-model](data-model.md)（読み書きの回数の見積もり）<br/>[privacy](privacy.md)（前提（仮定を含む））<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（調査の前提と仮定、想定規模（NFR-015）に収まるか、決定の前に確かめること、リアルタイムの共有（2026-10-04 調査、NFR-003）） |
| NFR-016 | 表示の速さ：スマホの回線で、招待URLを開いてから地図が出るまで3秒以内を目安… | [architecture](architecture.md)（運用）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（表示の速さ（NFR-016）、決定の前に確かめること）<br/>[0004-frontend-react-typescript](../adr/0004-frontend-react-typescript.md)（選択肢） |
| NFR-020 | 独自ドメイン：最初から独自ドメインを使い、変えない（ドメインを変えると、全員が… | [architecture](architecture.md)（使うサービス） |
| NFR-019 | 検索に出す：アプリを知らない人が検索で見つけられるように、トップ（アプリの説明… | [architecture](architecture.md)（検索に出すページと出さないページ（NFR-019、NFR-005））<br/>[screens](screens.md)（画面一覧）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（調査の前提と仮定）<br/>[0004-frontend-react-typescript](../adr/0004-frontend-react-typescript.md)（検索に出す・出さない（NFR-019）） |

## 費用

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-004 | 使った分だけ上限なく請求が来る構成にはしない（必須 | [architecture](architecture.md)（運用）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（背景、費用と止まり方（NFR-004）、画面の作り方と認証の組み合わせ（2026-10-04 調査）、2026-10-03 の推奨（案 A）、独自ドメインの費用（2026-10-04 調査））<br/>[0006-error-tracking-sentry](../adr/0006-error-tracking-sentry.md)（背景、決定） |

## セキュリティと個人情報

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-005 | グループIDは推測できない文字列にする | [architecture](architecture.md)（検索に出すページと出さないページ（NFR-019、NFR-005））<br/>[data-model](data-model.md)（groups（グループ）、グループを開く）<br/>[permissions](permissions.md)（グループの外の操作）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（保存先で守るもの（NFR-006）、リアルタイムの共有（2026-10-04 調査、NFR-003）、C で書き直すときの方針（2026-10-04 の `doc-reviewer` の指摘から））<br/>[0004-frontend-react-typescript](../adr/0004-frontend-react-typescript.md)（検索に出す・出さない（NFR-019）） |
| NFR-006 | 次のことは、画面を改造されても破られないように、データの保存先の側で守る | [architecture](architecture.md)（構成図）<br/>[auth-flow](auth-flow.md)（名前で参加する）<br/>[data-model](data-model.md)（考え方、groups（グループ）、members（メンバー）、メンバーの番号で操作する API の共通の決まり、参加する、保存先で守るもの（NFR-006）との対応）<br/>[permissions](permissions.md)（グループの外の操作、グループの中の操作、テスト）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（保存先で守るもの（NFR-006）、2026-10-04 の見直し：案 C を第一候補にする、2026-10-03 の推奨（案 A）、2026-10-04 にユーザーと決めたこと、決定の前に確かめること、リアルタイムの共有（2026-10-04 調査、NFR-003）、決めたら直すもの） |
| NFR-007 | アプリが保存する個人情報は、メンバーの名前、行った都道府県、問い合わせの内容（… | [architecture](architecture.md)（ログに残るもの（NFR-007・NFR-008・NFR-013））<br/>[data-model](data-model.md)（考え方）<br/>[privacy](privacy.md)（前提（仮定を含む））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（運用（NFR-010〜NFR-013、NFR-017、Q-031）） |
| NFR-008 | プライバシーポリシーを公開し、どの画面からもすぐ（1回の操作で）開けるようにする | [architecture](architecture.md)（運用、ログに残るもの（NFR-007・NFR-008・NFR-013））<br/>[deploy](deploy.md)（ふだんのデプロイ（表を変えないとき））<br/>[privacy](privacy.md)（書く項目）<br/>[screens](screens.md)（画面一覧、グループの画面の中身、画面のルール）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（運用（NFR-010〜NFR-013、NFR-017、Q-031）、規約（広告：Q-029）、決定の前に確かめること、C で書き直すときの方針（2026-10-04 の `doc-reviewer` の指摘から）） |

## 信頼性

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-009 | 保存に失敗したとき（通信エラー、混み合っているなど）は、利用者にそのことを伝える | [architecture](architecture.md)（無料枠を超えたとき（NFR-009・NFR-012））<br/>[data-model](data-model.md)（member_visits（メンバーの「行った」））<br/>[screens](screens.md)（知らせ）<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（決定の前に確かめること、C で書き直すときの方針（2026-10-04 の `doc-reviewer` の指摘から）） |
| NFR-017 | バックアップ：新しい版を出す前に、運営者が全データを手元に書き出して保存する（… | [architecture](architecture.md)（運用）<br/>[deploy](deploy.md)（ふだんのデプロイ（表を変えないとき））<br/>[permissions](permissions.md)（運営者）<br/>[privacy](privacy.md)（書く項目）<br/>[screens](screens.md)（確認ダイアログ）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（作るもの・続ける作業、運用（NFR-010〜NFR-013、NFR-017、Q-031）、決めたら直すもの）<br/>[0008-deploy-from-pc-no-staging](../adr/0008-deploy-from-pc-no-staging.md)（結果と注意） |

## 運用

| ID | 要件（要約） | 設計での扱い |
|---|---|---|
| NFR-010 | 利用状況の把握：運営者は、グループの数、メンバーの数、最近使われたグループの数… | [api](api.md)（一覧）<br/>[architecture](architecture.md)（運用、検索に出すページと出さないページ（NFR-019、NFR-005））<br/>[data-model](data-model.md)（ER図、groups（グループ）、グループを開く）<br/>[permissions](permissions.md)（運営者）<br/>[privacy](privacy.md)（書く項目）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（費用と止まり方（NFR-004）、想定規模（NFR-015）に収まるか、作るもの・続ける作業、運用（NFR-010〜NFR-013、NFR-017、Q-031）、決定の前に確かめること） |
| NFR-011 | 無料枠の監視：運営者は、使っているサービスの使用量が無料枠のどのくらいかを確か… | [architecture](architecture.md)（運用）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（作るもの・続ける作業、運用（NFR-010〜NFR-013、NFR-017、Q-031）、決定の前に確かめること、決めたら直すもの） |
| NFR-012 | 無料枠を超えたとき：データの保存や読み込みが止まったときは、利用者に「いまは使… | [architecture](architecture.md)（無料枠を超えたとき（NFR-009・NFR-012）、運用）<br/>[screens](screens.md)（画面一覧、知らせ）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（想定規模（NFR-015）に収まるか、運用（NFR-010〜NFR-013、NFR-017、Q-031）、決定の前に確かめること） |
| NFR-013 | エラーの把握：利用者の画面で起きたエラー（保存の失敗、画面が動かないなど）を、… | [architecture](architecture.md)（使うサービス、運用、エラーの送り方（Q-027）、ログに残るもの（NFR-007・NFR-008・NFR-013））<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（運用（NFR-010〜NFR-013、NFR-017、Q-031）、決定の前に確かめること）<br/>[0006-error-tracking-sentry](../adr/0006-error-tracking-sentry.md)（背景） |
| NFR-014 | 運用の手間：運営者1人で回せる形にする | [architecture](architecture.md)（運用）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（作るもの・続ける作業、2026-10-03 の推奨（案 A））<br/>[0006-error-tracking-sentry](../adr/0006-error-tracking-sentry.md)（背景、決定）<br/>[0010-plain-vite-with-wrangler-dev](../adr/0010-plain-vite-with-wrangler-dev.md)（決定） |
| NFR-018 | 削除の依頼への対応：利用者は、問い合わせ用のフォームから、データを消してほしい… | [api](api.md)（まだ作っていないもの）<br/>[architecture](architecture.md)（運用）<br/>[data-model](data-model.md)（メールアドレス、持たないもの、問い合わせ（NFR-018））<br/>[permissions](permissions.md)（運営者）<br/>[privacy](privacy.md)（書く項目）<br/>[screens](screens.md)（画面一覧、画面のルール）<br/>[0001-backend-firebase](../adr/0001-backend-firebase.md)（見直しの理由（2026-10-02））<br/>[0003-backend-selection](../adr/0003-backend-selection.md)（調査の前提と仮定、2026-10-04 にユーザーと決めたこと） |

## 要件に対応しない設計

要件IDの付いていない設計のうち、利用者に見えるもの。どれも要件を支えるための手段で、決めた場所を書く（2026-10-12：`/review-docs` #10 で足した）。

| 設計 | 場所 | 根拠 |
|---|---|---|
| 招待URLを貼る欄（トップ） | [screens](screens.md)（トップと URL） | Q-016（PC でもらった招待URLをスマホで開くため） |
| 使い方のページ（`/guide`） | [screens](screens.md)（トップと URL） | NFR-019 を支える。Q-016 |
| メニュー | [screens](screens.md)（メニューの中身） | Q-020（グループの画面からの入口と出口） |
| リアルタイムが切れたときの帯 | [screens](screens.md)（知らせ） | Q-020（会議の場で、自動で変わる前提で見ているため） |
| 部屋の URL の `room_key`、WAF のレート制限 | [architecture](architecture.md)（無料枠を使い切られないために）、[data-model](data-model.md) | Q-031 |
| 最後に開かれた日（`last_opened_on`） | [data-model](data-model.md)（groups） | Q-025（NFR-010 を支える） |
| 目印のヘッダー（`X-Tabikaigi`） | [api](api.md)（共通の決まり）、[architecture](architecture.md)（無料枠を使い切られないために） | 2026-10-13：`access-reviewer`（よそのサイトから利用者のブラウザで API を呼ばせて、D1 の枠を使わせないため。NFR-012 を支える） |
| 動いているかの確かめ（`/api/health`） | [api](api.md)（共通の決まり） | 目印のヘッダーなしで呼べる、D1 を使わない入口（NFR-011 の監視を支える） |
| ボット対策（Turnstile） | [api](api.md)（Turnstile）、[screens](screens.md)（参加の画面）、[architecture](architecture.md)（無料枠を使い切られないために） | Q-031（作成と参加を大量に送られて、D1 の書き込みの枠を使わせないため。NFR-012 を支える） |

