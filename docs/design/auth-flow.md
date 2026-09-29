# 認証の流れ

状態：レビュー待ち

関係する要件：[requirements.md](../requirements.md) の「ログインして使う」以降。

## 1. ログインなしで参加する

```mermaid
sequenceDiagram
  actor U as 利用者
  participant App as 画面
  participant Auth as Firebase Auth
  participant DB as Firestore

  U->>App: 招待URL /g/{groupId} を開く
  App->>Auth: signInAnonymously()（まだなら）
  Auth-->>App: 匿名の uid
  App->>DB: groups/{groupId} と members を読む
  App->>U: 名前を入力してもらう
  alt 同じ名前のメンバーがいる
    App->>U: その人として続きから操作
  else いない
    App->>DB: トランザクションで空いている枠 s0〜s19 に参加
  end
  App->>App: 端末に「このグループではこの名前」を保存（なくてもよい）
```

## 2. はじめてログインする（昇格）

メールやGoogleのアカウントがまだ使われていなければ、匿名のアカウントをそのまま昇格させる。**uid は変わらない**ので、`ownerUid` などはそのまま引き継がれる。

```mermaid
sequenceDiagram
  actor U as 利用者
  participant App as 画面
  participant Auth as Firebase Auth
  participant DB as Firestore

  U->>App: ログイン（メール or Google）
  App->>Auth: linkWithCredential / linkWithPopup
  Auth-->>App: 成功（uid は匿名のときと同じ）
  App->>DB: users/{uid} を作る（visited = グループでの G）
  App->>DB: members/{m}.uid = uid を書く（紐づけ）
```

## 3. 既存のアカウントにログインする（合算）

メールやGoogleがすでに別のアカウントで使われていると、昇格は失敗する。このとき **uid が匿名のものからアカウントのものに変わる**ので、先にデータを退避しておく。

```mermaid
sequenceDiagram
  actor U as 利用者
  participant App as 画面
  participant Auth as Firebase Auth
  participant DB as Firestore

  U->>App: ログイン
  App->>Auth: linkWithCredential
  Auth-->>App: credential-already-in-use / email-already-in-use
  App->>App: G（visited）、groupId、memberId を退避
  App->>Auth: signInWithCredential（既存のアカウント）
  Auth-->>App: アカウントの uid
  App->>DB: users/{uid}.visited（U）を読む
  alt U が空
    App->>DB: U = G
  else G ⊆ U
    Note over App: 確認なしで U を使う
  else それ以外
    App->>U: 「アカウントのデータを使う／合算する」
    U-->>App: 選ぶ
    opt 合算する
      App->>DB: U = G ∪ U
    end
  end
  App->>DB: members/{m}.uid = uid、visited = U（紐づいた全グループも更新）
```

- 匿名のときに作ったグループの `ownerUid` は、この場合は引き継がない（MVP での割り切り）
- 退避先はメモリか `sessionStorage`。Google ログインをリダイレクト方式にするとページが読み直されるので、ポップアップ方式を基本にする

## 4. ログインした状態でグループに入る

```mermaid
sequenceDiagram
  actor U as 利用者
  participant App as 画面
  participant DB as Firestore

  U->>App: 招待URLを開く
  App->>DB: members を読む
  alt 自分の uid のメンバーがいる
    Note over App: そのまま表示
  else 自分の表示名と同じ名前のメンバーがいる（uid なし）
    App->>U: 「この人はあなたですか？」
    alt はい
      App->>DB: 紐づけ（データは 3. と同じ流れ）
    else いいえ
      App->>U: 別の名前を入力してもらう
    end
  else いない
    App->>DB: 空いている枠に uid 付きで参加（visited = U）
  end
```

## LINE のアプリ内ブラウザ

- Google は WebView 内でのログインを禁止しているため、LINE のアプリ内ブラウザでは Google ログインができない（`disallowed_useragent`）
- 招待URLには `?openExternalBrowser=1` を付け、外部ブラウザで開かせる
- ログイン画面でも LINE のアプリ内ブラウザを検知したら、外部ブラウザで開くよう案内する

## 未確認のこと

- 匿名からメール＋パスワードへの昇格が SDK v12 で動くか。メール列挙保護が有効なプロジェクト（2023-09 以降に作ったものはデフォルトで有効）では、古い SDK で動かなかった記録がある。エミュレータと本番で確かめる
- メール列挙保護が有効だと、「このメールはもう登録済みか」を事前に調べられない。登録時のエラーで判断する前提にする
