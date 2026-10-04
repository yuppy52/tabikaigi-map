// ログインの確認にかかる時間の「目安」をこのパソコン（Node.js）で測る。
// Workers の本当の CPU 時間は、本番の環境に置いて Cloudflare の計測で測る（ここでは測れない）
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyFirebaseIdToken } from "../src/firebase-auth.ts";

const PROJECT = "bench";
const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = await exportJWK(publicKey);
const t = Math.floor(Date.now() / 1000);
const token = await new SignJWT({ auth_time: t, email_verified: true })
  .setProtectedHeader({ alg: "RS256", kid: "k" })
  .setIssuer(`https://securetoken.google.com/${PROJECT}`)
  .setAudience(PROJECT).setSubject("u").setIssuedAt(t).setExpirationTime(t + 3600)
  .sign(privateKey);

const importKey = () =>
  crypto.subtle.importKey("jwk", jwk as JsonWebKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);

async function measure(label: string, run: () => Promise<unknown>, n = 500) {
  for (let i = 0; i < 50; i++) await run(); // 温める
  const start = performance.now();
  for (let i = 0; i < n; i++) await run();
  console.log(`${label}: 1回あたり ${((performance.now() - start) / n).toFixed(3)} ms`);
}

const cached = await importKey();
await measure("鍵を取っておいた場合（ふだん）", () => verifyFirebaseIdToken(token, PROJECT, async () => cached));
await measure("毎回、鍵を読み込む場合（Worker が起きた直後）", () =>
  verifyFirebaseIdToken(token, PROJECT, async () => importKey()));
