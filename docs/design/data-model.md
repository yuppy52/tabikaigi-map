# データモデル

状態：レビュー待ち（2026-10-02：表示名をなくし、名前・色の変更、退会、0人のグループ、作成者がいなくなるときの扱いを要件定義の決定に合わせた）

## ER図

Firestore はリレーショナルDBではないが、関係を把握するために ER 図で表す。

```mermaid
erDiagram
  GROUP ||--o{ MEMBER : "members サブコレクション（最大20）"
  USER |o--o{ MEMBER : "uid で紐づく（ログイン時のみ）"
  PREFECTURE }o--o{ MEMBER : "visited（コード配列）"
  PREFECTURE }o--o{ USER : "visited（コード配列）"

  GROUP {
    string groupId PK "Firestore の自動ID（20文字）。招待URLにも使う"
    string name "グループ名（20文字まで）"
    timestamp createdAt
    string ownerMemberId "作成者のメンバーの枠ID（sN）。作成者＝作成者のメンバー。作成者のメンバーが消えたら空にする（作成者はいなくなる）"
    string ownerUid "作成者のメンバーに紐づいた uid（匿名を含む）。紐づけと同時にだけ更新できる（要確認：Q-012）。持ち続けるかは要確認：Q-019"
    string manageBy "anyone | owner"
  }
  MEMBER {
    string memberId PK "s0〜s19 の固定枠"
    string name "メンバーの名前（10文字まで）。グループ内で重複しない（ログインあり・なしとも）"
    string color "パレットの色。参加したときに自動で決まり、変えない。重複してよい"
    int_array visited "行った都道府県コード。ログイン済みなら USER の複製"
    string uid FK "ログインしたメンバーだけ持つ"
  }
  USER {
    string uid PK "Firebase Auth の uid"
    int_array visited "行った都道府県コードの正本"
  }
  PREFECTURE {
    int code PK "JIS X 0401 の 1〜47"
    string name "DB には持たず、画面に埋め込む"
  }
```

## Firestore の構造

```
groups/{groupId}                 name, createdAt, ownerMemberId, ownerUid, manageBy
  └ members/{s0〜s19}            name, color, visited: number[], uid?
users/{uid}                      visited: number[]（表示名は持たない。名前はメンバーごと）
```

## 設計上のポイント

### メンバーのIDは20枠に固定する
- ルールではサブコレクションの件数を数えられないため、メンバーのIDを `s0`〜`s19` に限定して20人の上限を守る
- 参加するときは、トランザクションで空いている枠を選んで作る（同じIDがすでにあれば作成は失敗する）

### 「行った」の付け外し
- `arrayUnion` / `arrayRemove` を使う。サーバー側でアトミックに適用されるので、別の県を同時に塗っても消し合わない
- 同じ県を付ける操作と外す操作がぶつかったら、後に届いた方が勝つ

### ログイン済みのメンバーの「行った」は複製する
- 正本は `users/{uid}.visited`。本人しか読めない
- 他の人に見せるため、`members/{m}.visited` にも同じ内容を持つ
- 本人が塗ったら、1回のバッチで `users/{uid}` と、紐づいている全グループのメンバーを同時に更新する（バッチは最大500件でアトミック）

### 参加中のグループの一覧
- コレクショングループクエリ（全グループの `members` から `uid == 自分` を検索）で取る
- `users` にグループIDの一覧は持たない（二重管理でずれるのを防ぐ）
- このクエリ用の複合インデックスは不要（単一フィールドの等価条件のため）

### 名前の重複
- ルールでは防げない。参加するとき、名前を変えるとき（ログインありの本人だけ）、トランザクションで同じグループのメンバーを確認する
- ほぼ同時に同じ名前で参加する競合は許容する

### グループの削除
- 親のドキュメントを消してもサブコレクションは残る。先に `members`（最大20件）をバッチで消してからグループを消す
- 最後のメンバーが退出したとき（退会を含む）も、メンバーとグループを一緒に消す（細部は要確認：Q-010）

### 作成者がいなくなるとき
- 作成者のメンバーを消すとき（退出、削除、退会、同じアカウントのメンバーが2つになりそうなときの片付け）は、同じバッチで `ownerMemberId` を空にし、`manageBy` を `anyone` にする。枠は使い回すので、空にしないと次にその枠に入った人が作成者になってしまう
- `ownerUid` も古いまま残ると、もうメンバーでない人が設定を変えられる。`ownerUid` をやめて、ルールで `get(members/$(ownerMemberId)).data.uid == request.auth.uid` のように作成者のメンバーから引く案がある（要確認：Q-019）

### 1グループに1アカウント1メンバー
- 同じグループで、同じ `uid` のメンバーは1つだけにする（[auth-flow.md](auth-flow.md) の 3.）。ルールで守れるかは Q-019 と一緒に確かめる

### 退会
- 紐づいた全グループのメンバーを消し（退出と同じ扱い）、`users/{uid}` を消してから、最後にアカウントを削除する（流れは [auth-flow.md](auth-flow.md) の 6.）

## セキュリティルールの方針

| 対象 | 操作 | 許可する条件 |
|---|---|---|
| `groups/{g}` | get | 認証済み（匿名を含む） |
| | list | 禁止（グループIDを知らないと読めない） |
| | create | 認証済みで、`ownerUid` が自分、`manageBy` が `anyone` |
| | update（名前） | `manageBy` が `anyone`、または自分が `ownerUid` |
| | update（`manageBy`） | 自分が `ownerUid` で、ログイン済み（匿名ではない） |
| | delete | 名前の変更と同じ |
| `members/{m}` | get / list | 認証済み |
| | create | IDが `s0`〜`s19`。`uid` を付けるなら自分の uid でログイン済み |
| | update（`visited`） | `uid` がなければ認証済みなら誰でも。あれば本人だけ |
| | update（名前） | `uid` があれば本人だけ。なければ誰も変えられない |
| | update（色） | 禁止（参加したときに決まる） |
| | update（紐づけ） | `uid` がないメンバーに、ログイン済みの本人が自分の `uid` を書く |
| | delete | `manageBy` に従う。自分の退出はいつでもできる（ログインなしのメンバーの退出をどう書くかは要確認：Q-018） |
| 全グループの `members` | list（横断検索） | 検索結果が `uid == 自分` のものだけ |
| `users/{uid}` | すべて | 本人だけ |

ほかに入れる検証：
- フィールド名のホワイトリスト（決まったフィールド以外は書けない）
- `visited` の要素が 1〜47 の整数であること
- 名前の長さ（グループ名20文字、メンバーの名前10文字）

ルールの叩き台は Firebase 調査のときに作ったものがあり、`firestore.rules` を書くときの出発点にする。

## 読み書きの回数の見積もり

グループの画面を開くたびに、グループ1件と members 最大20件の読み取り（約21回）。無料枠の5万回/日なら、1日に約2,000回開ける。友達グループの規模なら十分に収まる。
