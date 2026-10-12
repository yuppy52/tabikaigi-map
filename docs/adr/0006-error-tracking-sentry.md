# ADR 0006：エラーの把握に Sentry の無料プランを使う

状態：決定（2026-10-12）

## 背景

NFR-013 は、利用者の画面で起きたエラー（保存の失敗、画面が動かないなど）を運営者が把握できることを求めている。エラーの記録には、名前、メールアドレス、行った都道府県、招待URL（グループID）を含めない。NFR-014 は、運営者1人で回せて、何かあったときは知らせが届くことを求めている。NFR-004 は、使った分だけ上限なく請求が来る構成を禁じている。

構成は Cloudflare Workers の Free と D1（[ADR 0003](0003-backend-selection.md)）。Workers Logs は Worker の中のエラーしか残らず、利用者の画面のエラーは残らない。

## 選択肢

| | A：Sentry の無料プラン（Developer） | B：画面のエラーを自分の API に送り、Workers Logs に残す |
|---|---|---|
| 画面のエラー | SDK が拾って送る | 画面から `/api/errors` に送る |
| 知らせ | 新しいエラーをメールで知らせる | Free で使える知らせは見つからない。運営者が見に行く |
| 費用 | 無料、月5,000件。超えたら受け付けなくなるだけで請求は来ない（有料プランと従量課金を有効にしない限り） | 無料。ただし受け口を濫用されると Workers・D1・ログの枠を使う |
| 外部に送るもの | エラーの内容（グループIDなどを伏せた後）。プライバシーポリシーの送り先が1つ増える | なし |
| 作る手間 | SDK を入れて、送る前に伏せる処理を書く | 受け口、回数の制限、伏せる処理を書く |

## 決定

**A（Sentry の無料プラン）**。ユーザーが「7. の残りを一気に進めて」と頼んだので、推奨案で決めた（Q-027）。

理由：NFR-014 の「何かあったときは知らせが届く」を、無料で満たせるのは A だけだった。超えたら止まるので NFR-004 にも合う。外部に送るものは、グループID、ID トークン、要求のヘッダーと中身を消し、IP を保存しない設定にして減らす（[architecture](../design/architecture.md) の「エラーの送り方」）。

## 結果と注意

- 有料プラン、従量課金、試用を有効にしない。アカウントを作る前に、試用が自動で始まらないか、組織の名前に個人の情報が使われないか、クレジットカードを求められないかを確かめる。求められたら作らずに相談し、B に切り替える
- 画面に埋め込む DSN は誰でも見られるので、偽のエラーで月の枠を使い切られうる（請求は来ず、その月はエラーが見えなくなる）
- Worker に SDK を入れた状態の CPU 時間を Phase 2 で測る（Free の上限は 10ms）
- プライバシーポリシーに、送る先（Sentry）、送る情報、保存期間を書く（[privacy](../design/privacy.md)）

## 出典

https://sentry.io/pricing/ 、https://docs.sentry.io/pricing/quotas/ 、https://docs.sentry.io/platforms/javascript/guides/cloudflare/ 、https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options/ 、https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/
