// 本番の Worker に、ログインの確認を最後までたどる証明書を送る（CPU 時間を測るため）。
// Google の本物の kid を付けて、自分の鍵で署名する → Worker は公開鍵を取り、署名を確かめて 401 で断る
import { generateKeyPair, SignJWT } from "jose";

const BASE = process.argv[2] ?? "https://tabikaigi-spike.tabikaigi.workers.dev";
const N = Number(process.argv[3] ?? 20);
const PROJECT = "tabikaigi-map";
const jwks = (await (await fetch(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
)).json()) as { keys: { kid: string }[] };
const kid = jwks.keys[0].kid;
const { privateKey } = await generateKeyPair("RS256");
const t = Math.floor(Date.now() / 1000);
const token = await new SignJWT({ auth_time: t, email_verified: true })
  .setProtectedHeader({ alg: "RS256", kid })
  .setIssuer(`https://securetoken.google.com/${PROJECT}`)
  .setAudience(PROJECT).setSubject("probe").setIssuedAt(t).setExpirationTime(t + 3600)
  .sign(privateKey);
const statuses: number[] = [];
for (let i = 0; i < N; i++) {
  const res = await fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
  statuses.push(res.status);
}
console.log(`kid=${kid.slice(0, 8)}… statuses=${[...new Set(statuses)].join(",")} count=${N}`);
