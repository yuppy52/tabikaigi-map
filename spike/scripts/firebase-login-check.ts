export {};
// 本物の Firebase の証明書で、Worker のログインの確認が通るかを試す（ADR 0003 の決定の基準の2）
// 使い方（別のターミナルで `npm run dev` を起動してから）：
//   node --env-file=.dev.vars --experimental-strip-types scripts/firebase-login-check.ts
// 値は .dev.vars から読む（このスクリプトはファイルを直接読まない）。値は画面に出さない。
// 手順：テスト用の利用者でメール＋パスワードのログインをして ID トークンを取り、Worker の /api/me に送る。
// 期待：200 と uid が返る。Worker の確認が通らなければ、401 か 503 が返る。

const email = process.env.TEST_FIREBASE_USER_EMAIL;
const password = process.env.TEST_FIREBASE_USER_PASSWORD;
const apiKey = process.env.TEST_FIREBASE_WEB_API_KEY;
const workerUrl = process.env.WORKER_URL ?? "http://localhost:8787";

const missing = [
  ["TEST_FIREBASE_USER_EMAIL", email],
  ["TEST_FIREBASE_USER_PASSWORD", password],
  ["TEST_FIREBASE_WEB_API_KEY", apiKey],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length > 0) {
  console.error(`.dev.vars に次の値がありません：${missing.join("、")}`);
  process.exit(1);
}

// 1. メール＋パスワードでログインして、ID トークンを取る（Firebase Authentication の REST API）
const signIn = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
);
const signInBody = (await signIn.json()) as { idToken?: string; error?: { message: string } };
if (!signIn.ok || !signInBody.idToken) {
  // Firebase のエラーの名前（例：EMAIL_NOT_FOUND、INVALID_PASSWORD）だけを出す
  console.error(`ログインできなかった（Firebase）：${signInBody.error?.message ?? signIn.status}`);
  process.exit(1);
}
console.log("1. Firebase でログインできた（ID トークンを取得）");

// 2. その ID トークンを Worker に送って、証明書の確認を通るかを見る
const me = await fetch(`${workerUrl}/api/me`, {
  headers: { Authorization: `Bearer ${signInBody.idToken}` },
});
const meBody = await me.text();
console.log(`2. Worker の /api/me：${me.status} ${meBody}`);
if (me.status === 200) {
  console.log("結果：本物の証明書で通った（基準の2）");
} else {
  console.log("結果：通らなかった。上の応答と、`npm run dev` の画面のログを確認する");
  process.exit(1);
}
