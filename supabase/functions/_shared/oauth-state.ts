// HMAC-signed OAuth state for the Gmail / Outlook connect flow.
//
// Format: `${base64url(JSON payload)}.${base64url(HMAC-SHA256)}`
//
// Payload shape: { uid, prov, exp, n }
//   uid  — auth.users.id of the connecting user
//   prov — "gmail" | "outlook"
//   exp  — unix seconds (≤ 15 min from sign time)
//   n    — random nonce (replay defence; storage of used nonces is a
//          future hardening — for now exp + HMAC are enforced)
//
// Verified by the callback before any token exchange so the user_id
// pulled out of state is trustworthy without a db round-trip.

const STATE_TTL_SECONDS = 15 * 60;

type StatePayload = {
  uid: string;
  prov: "gmail" | "outlook";
  exp: number;
  n: string;
};

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function constantTimeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signState(
  uid: string,
  prov: "gmail" | "outlook",
  secret: string,
): Promise<string> {
  const payload: StatePayload = {
    uid,
    prov,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    n: toB64Url(crypto.getRandomValues(new Uint8Array(12))),
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
  return `${toB64Url(payloadBytes)}.${toB64Url(sig)}`;
}

export type VerifiedState =
  | { ok: true; uid: string; prov: "gmail" | "outlook" }
  | { ok: false; reason: string };

export async function verifyState(
  raw: string,
  expectedProv: "gmail" | "outlook",
  secret: string,
): Promise<VerifiedState> {
  if (!raw || typeof raw !== "string" || !raw.includes(".")) {
    return { ok: false, reason: "malformed_state" };
  }
  const [payloadB64, sigB64] = raw.split(".", 2);
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = fromB64Url(payloadB64);
    sigBytes = fromB64Url(sigB64);
  } catch {
    return { ok: false, reason: "decode_failed" };
  }

  const key = await hmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, payloadBytes),
  );
  if (!constantTimeEq(expected, sigBytes)) {
    return { ok: false, reason: "bad_signature" };
  }

  let parsed: StatePayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (
    !parsed ||
    typeof parsed.uid !== "string" ||
    parsed.prov !== expectedProv ||
    typeof parsed.exp !== "number"
  ) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, uid: parsed.uid, prov: parsed.prov };
}