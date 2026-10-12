# ドキュメント一覧

旅会議マップの要件・設計・計画をまとめる場所。

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [roadmap.md](roadmap.md) | フェーズと進み具合、次にやること | 更新中 |
| [glossary.md](glossary.md) | 用語集（言葉の意味をそろえる） | レビュー待ち |
| [use-cases.md](use-cases.md) | ユースケース（誰が何をするか）。要件の元になる | レビュー待ち |
| [open-questions.md](open-questions.md) | 未決事項の一覧（ID・影響先・決める段階） | レビュー待ち |
| [requirements.md](requirements.md) | 要件定義（何を作るか、何を作らないか） | レビュー待ち（2026-10-12：Q-025〜Q-031 で、運用の NFR の方法と「分かっている限界」を変えた） |
| [design/architecture.md](design/architecture.md) | システム構成図（清書：[architecture.drawio.svg](design/architecture.drawio.svg)）、使うサービスと無料枠、運用（監視、エラー、使い切られる対策）、開発環境 | 下書き（2026-10-12：Q-025〜Q-027・Q-030・Q-031 を決め、構成図の清書を足した） |
| [design/data-model.md](design/data-model.md) | ER図、D1 のテーブル、保存先で守るもの（NFR-006）の対応 | 下書き（2026-10-12：最後に開かれた日を足した） |
| [design/auth-flow.md](design/auth-flow.md) | 認証の流れ（ログインなしで参加 → ログインして紐づけ → 退会）のシーケンス図 | 下書き（2026-10-12：「端末が覚えるもの」を足した） |
| [design/permissions.md](design/permissions.md) | 権限マトリクス（誰が何をできるか、どこで守るか） | 下書き（2026-10-12：共用の端末の行を足した） |
| [design/screens.md](design/screens.md) | 画面一覧と画面遷移図、グループの画面の中身、確認ダイアログ、知らせ（ワイヤーフレーム：[wireframes.drawio.svg](design/wireframes.drawio.svg)） | 下書き（2026-10-12：グループの画面の中身とワイヤーフレームを足した） |
| [design/privacy.md](design/privacy.md) | プライバシーポリシーに書くこと（法律の調べた結果とチェックリスト） | 下書き（2026-10-12：Q-028 で作った） |
| [design/traceability.md](design/traceability.md) | 要件IDの対応表（各 REQ・NFR を設計書のどこで扱うか） | 下書き（2026-10-12 に作った） |
| [adr/](adr/) | 技術選定などの決定の記録（ADR） | — |
| [../spike/](../spike/README.md) | 案 C を小さく試した試作と結果（docs の外。ADR 0003 の根拠） | — |
| [learnings/](learnings/) | 学びの記録（ハマったこと、レビューの指摘）。`/compound` で書く | — |

## 書き分けのルール

- **requirements**：利用者から見た「何ができるか」。技術の言葉はなるべく使わない
- **design**：それを「どう作るか」。技術の言葉で書く
- **adr**：選択肢を比べて1つに決めたときの記録。なぜそれを選んだかを残す。決定後は書き換えず、覆すときは新しい ADR を足す
- **roadmap**：いつ・何をやるか。設計の中身は書かず、各ドキュメントへのリンクにとどめる

## 状態の意味

- **下書き**：書きかけ
- **レビュー待ち**：一通り書けたので読んでほしい
- **確定**：レビュー済み。変えるときは理由を残す

図は [Mermaid](https://mermaid.js.org/) で書いている（正本）。システム構成図とワイヤーフレームだけは draw.io の `*.drawio.svg`（画像として見られ、draw.io でそのまま開いて直せる）。GitHub や VS Code（拡張機能）でそのまま図として表示される。
