# ADR 0009：lint とフォーマッタに ESLint と Prettier を使う

状態：決定（2026-10-16）

## 背景

Phase 2 からコード（画面と API）が増える。いまの CI は型の確かめ（`tsc --noEmit`）とテストだけで、次のものを見ていない。

- **書き方の間違い**（lint で見つけるもの）：たとえば D1 への書き込みの `await` のし忘れ。応答を返した時点で書き込みが捨てられることがあり、画面には「塗れた」と出るのに開き直すと消えている。型としては正しいので `tsc` では見つからず、たまにしか起きないのでテストでも見逃しうる。React のフックの依存の抜け（WebSocket の張り直しが漏れる）も同じ種類
- **見た目のそろい**（フォーマッタでそろえるもの）：AI が書くと字下げや改行がファイルごとに揺れる。push の前にユーザーが差分を見る運用（CLAUDE.md の「Git の運用」）では、中身の変わらない行が混ざると本当の変更が読みにくい

2026-10-16 に `researcher` で、1人＋AI の開発の道具を調べた（このセッションの調査。出典は下）。

## 選択肢

| | A：Biome | B：ESLint＋typescript-eslint＋eslint-plugin-react-hooks＋Prettier |
|---|---|---|
| 入れるもの | 1つ（lint とフォーマット） | 4〜5個 |
| 設定ファイル | 1つ | 2つ（ESLint と Prettier） |
| 型を使うチェック（`await` のし忘れなど） | 自前で型を推測する。検出は typescript-eslint の約75％（Biome 自身の初期の検証）。`noFloatingPromises` は試験中の規則で、自分で有効にする | TypeScript 本体を使うので正確（`recommendedTypeChecked`、`projectService`） |
| React のフックの規則 | 入っている | React 公式の `eslint-plugin-react-hooks` |
| 保守 | 1つ上げるだけ | 部品同士の版が合わなくなることがある |
| 費用 | 無料 | 無料 |

## 決定

**B（ESLint＋Prettier）**。2026-10-16 にユーザーが選んだ。

- 推奨は A（Biome）だった。理由は、部品と設定が1つで済み、JavaScript に慣れていないユーザーにも設定が読みやすいこと。込み入った型での見落としは、テストと、足りなければ ESLint の規則1つで補う案だった
- B を選んだことで A と比べて変わること：
  - 得るもの：型を使うチェックが正確になる（`await` のし忘れを、込み入った型でも見落としにくい）
  - 増えるもの：入れる部品が4〜5個になり、設定ファイルが2つになる。部品の版上げのときに組み合わせが合うかを確かめる（Dependabot の PR で CI が通るかで分かる）

## 結果と注意

- 型を使うチェックは、`tsconfig.json` の範囲のファイルにしか効かない。画面（`web/`）を足したら、ESLint の設定の対象と `tsconfig` をそろえる
- CI（`.github/workflows/test.yml`）で lint と `prettier --check` を動かし、通らなければマージできないようにする（ブランチ保護の必須のチェック）
- Claude がファイルを書いたら、Claude Code の hooks（`PostToolUse`）で Prettier を当てる（CI でフォーマットの差で落ちる手戻りを減らす）
- 入れるときは CLAUDE.md の「部品（npm）」のとおり、警告（非推奨、改名）と `npm audit` を見る

## 出典

https://typescript-eslint.io/getting-started/typed-linting 、https://react.dev/reference/eslint-plugin-react-hooks 、https://biomejs.dev/linter/domains/ 、https://biomejs.dev/blog/biome-v2/
