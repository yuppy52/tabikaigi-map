# ドキュメント一覧

旅会議マップの要件・設計・計画をまとめる場所。

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [roadmap.md](roadmap.md) | フェーズと進み具合、次にやること | 更新中 |
| [glossary.md](glossary.md) | 用語集（言葉の意味をそろえる） | レビュー待ち |
| [use-cases.md](use-cases.md) | ユースケース（誰が何をするか）。要件の元になる | レビュー待ち |
| [open-questions.md](open-questions.md) | 未決事項の一覧（ID・影響先・決める段階） | レビュー待ち |
| [requirements.md](requirements.md) | 要件定義（何を作るか、何を作らないか） | レビュー待ち（2026-10-10：NFR-007・NFR-008 を更新） |
| [design/architecture.md](design/architecture.md) | システム構成図、使うサービスと無料枠、開発環境 | 下書き（2026-10-10：案 C で書き直した） |
| [design/data-model.md](design/data-model.md) | ER図、D1 のテーブル、保存先で守るもの（NFR-006）の対応 | 下書き（2026-10-10：案 C で書き直した） |
| [design/auth-flow.md](design/auth-flow.md) | 認証の流れ（ログインなしで参加 → ログインして紐づけ → 退会）のシーケンス図 | 下書き（2026-10-10：案 C で書き直した） |
| [design/permissions.md](design/permissions.md) | 権限マトリクス（誰が何をできるか、どこで守るか） | 下書き（2026-10-10） |
| [design/screens.md](design/screens.md) | 画面一覧と画面遷移図 | レビュー待ち |
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

図は [Mermaid](https://mermaid.js.org/) で書いている。GitHub や VS Code（拡張機能）でそのまま図として表示される。
