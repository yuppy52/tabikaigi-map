# ADR 0015：公開の前の安全の確かめに、CodeQL（default setup）と Strix（Muse Spark を OpenRouter の前払いで）を使う

状態：決定（2026-11-24）

- 関係する要件：NFR-006（アクセス制御は保存先の側で守る）、NFR-009（費用に上限がある構成）
- roadmap の「公開の前の安全の確かめ：CodeQL と Strix を調べて、入れるかを決める」の決定

## 背景

公開の前に、`access-reviewer`（人の目の代わりのレビュー）と API のテストだけでは見落とすものを、別の道具で確かめたい。候補は、道具の表（roadmap の「導入を検討している道具」）にあった CodeQL と Strix。2026-11-24 に `researcher` で公式の情報を調べた。

- **CodeQL**：GitHub がコードを読んで、危ない書き方（SQL の注入、XSS、秘密の直書きなど）を探す。公開リポジトリで GitHub が貸す普通のマシン（標準ランナー）を使えば、Actions の費用はかからない（出典：https://docs.github.com/en/billing/concepts/product-billing/github-actions 、https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning ）。「CodeQL は公開リポジトリで無料」と明記した一文は確かめきれていない（要確認）。認可の抜け（他人のグループを読み書きできる）は、ほぼ拾えない。Hono の入力を人の入れた値として追えるかも分からない（要確認）
- **Strix**：AI のエージェントが攻撃する側の目でアプリを触り、実際に破れるかを試す（https://github.com/usestrix/strix 、Apache-2.0、PyPI の `strix-agent`）。Docker と LLM の API キーが要る。コード（ホワイトボックス）と URL（ブラックボックス）の両方を渡せる。`--max-budget` で1回の費用に上限をかけられるが、Strix が数えた推定で、値段を知らないモデルでは 0 と数えて効かないことがある（https://docs.strix.ai/usage/cli 、https://docs.strix.ai/advanced/configuration ）。渡したフォルダを書き換えられる。使い方の情報を外に送る設定（`STRIX_TELEMETRY`）が既定で有効
- LLM は、ユーザーが Meta のモデルを使いたいと言った（「Musu」と言ったが、その名前は見つからず、Meta の Muse の一家（Muse Spark など）のことと確かめた）
  - Meta の Model API には、使い過ぎを止める上限がない（メールの知らせだけ：https://dev.meta.ai/help/billing/spend-limit-alert ）。CLAUDE.md の費用の前提に合わない
  - OpenRouter（いろいろな会社の LLM を1つの窓口で使えるサービス）は前払いで、鍵ごとに金額の上限と期限を付けられる（https://openrouter.ai/docs/api-reference/api-keys/create-api-key ）。Muse Spark 1.3 も載っていて、Strix の公式の手順にも OpenRouter の書き方がある（https://docs.strix.ai/llm-providers/overview ）
  - Muse Spark 1.3 の料金は、100万トークンあたり入力 $1.25・出力 $4.25（https://dev.meta.ai/models/muse-spark/ ）。安い Contributor 版は、送った内容が Meta の製品の改善に使われる
  - Meta の利用の決まり（Acceptable Use Policy）は、エクスプロイトを作ることと、持ち主の許可なく弱いところを探すことを禁じている（https://dev.meta.ai/legal/acceptable-use-policy ）。自分のアプリを手元で試すのは許可のある使い方だが、Strix が攻撃のコードを作って試すことが「エクスプロイトを作った」と取られる余地は残る

## 選択肢

| | CodeQL を入れない | CodeQL：default setup（決定） | CodeQL：advanced setup |
|---|---|---|---|
| 入れ方 | — | GitHub の設定画面で有効にする。ファイルは増えない | workflow のファイルを足す |
| 検査の項目 | — | default か Extended を選べる | `security-and-quality` や追加の項目も選べる |
| 保守 | — | GitHub が言語と項目を選ぶ | ファイルと版上げを保守する |

| | Strix の LLM：Meta に直接（推奨しない） | OpenRouter の前払いで Muse Spark 1.3（推奨・決定） |
|---|---|---|
| 使い勝手 | 同じモデル。Strix から見た違いは鍵とモデル名の書き方だけ | 同じ |
| 請求の上限 | ない | 前払いの残高まで。鍵に金額の上限と期限 |
| Strix の公式の手順 | ない（LiteLLM の `meta/` で動く見込みだが、試した例がない） | ある |
| 日本から使えるか | はっきりしない（公開プレビュー、米国の開発者向けと書かれている） | 使える |
| 余計な費用 | なし | 前払いの手数料 5.5%。使わなかった残高は、買ってから365日で消えることがある |

## 決定（2026-11-24 にユーザーが推奨どおり選んだ）

1. **CodeQL は default setup で有効にし、検査の項目は Extended にする。最初はプルリクエストを止めない**（結果は Security タブで見る）。誤った指摘の量を見てから、重いものだけ止めるかを決める。Hono の入力を追えるかは、わざと危ない書き方をしたプルリクエストで1回試す（マージせずに閉じる）
2. **Strix は公開の前に1回、認可を重点に動かす**（コードと手元の `wrangler dev` の両方を渡す）。入力の上限と部屋（WebSocket）を重点にした2回目は、1回目の結果を見て要るときだけ
3. **LLM は Muse Spark 1.3 の標準の版（Contributor 版は使わない）を、OpenRouter 経由で使う**。OpenRouter には $10 だけ前払いし（手数料込みで $10.55）、自動で足す設定（auto top-up）は入れない。鍵には金額の上限と期限を付ける。送った内容を学習に使わせない設定にする
4. **Strix の `--max-budget` は1回 $3**（推奨の仮の値）。モデルの値段を `STRIX_LLM_INPUT_COST_PER_MTOK`・`STRIX_LLM_OUTPUT_COST_PER_MTOK` で渡し、推定が 0 にならないようにする。まず短い実行（quick）で、届くか・動くか・実際の金額を確かめてから、本番の確かめ（standard）をする
5. Muse で動かない、または利用の決まりで止められたときは、Strix がおすすめする GLM-5.3 を、同じ OpenRouter の前払いで使う

## 結果と注意

- 認可の抜けは CodeQL では守れない。これまでどおり `access-reviewer` と API のテストで守り、Strix で動かして確かめる
- Strix は次を守って動かす（手順は Strix を動かす小分けで deploy の隣に書く）
  - リポジトリは**コピーして**渡す（渡したフォルダを書き換えられるため）
  - 向ける先は手元の `wrangler dev` だけ（`--remote` を付けない）。手元の D1 は壊れてもよい前提で、あとで作り直す。本番の URL と鍵は渡さない
  - `STRIX_TELEMETRY=0`
  - 結果のフォルダ `strix_runs/` は `.gitignore` に入れる（攻撃の記録が入る。リポジトリは公開）
  - 入れ方は `pipx install strix-agent`（7日たった版を選び、公開者を確かめる）。`curl | bash` は使わない
  - コードと応答が OpenRouter と Meta に送られる。送るのは公開リポジトリのコードと、手元の試しのデータだけ
- 確かめきれていないこと：Strix が macOS と Muse で動くか、Docker の中から手元の `wrangler dev` に届くか、1回の実際の費用、Meta の利用の決まりで Strix の使い方が許されるか（最初の短い実行と、気になれば aup_exceptions@meta.com への問い合わせで確かめる）
- 費用が $10 で足りなければ、そのときに相談して前払いを足す
