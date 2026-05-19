/**
 * HMAC-signed tokens for the email preference center.
 *
 * Each marketing email contains a {{{preferences_url}}} that resolves to
 *   https://logisticintel.com/email-preferences?token=<token>
 * where the token is a base64url-encoded
 *   { email, exp }   payload concatenated with its HMAC SHA-256 signature
 *
 * Signing happens at email-dispatch time (the cron worker). Verification
 * happens server-side in the /api/email-preferences route. The shared
 * secret is `PREFERENCES_TOKEN_SECRET` — any 32+ byte random hex value,
 * NEVER exposed to the client.
 *
 * Expiry is 90 days from generation, well past the longest active
 * sequence (trial-welcome = 14 days) so a recipient who clicks the
 * footer of an email weeks later still lands on a working page.
 *
 * Token format:
 *   <base64url(JSON({email, exp}))>.<base64url(hmac_sha256(payload, secret))>
 * The dot separator matches JWT-shaped tokens — easy to recognize on the
 * wire and trivially splittable without a library.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export type PreferencesTokenPayload = {
  email: string;
  /** Unix seconds when this token stops verifying. */
  exp: number;
};

function getSecret(): string | null {
  const secret = process.env.PREFERENCES_TOKEN_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function sign(payloadB64: string, secret: string): string {
  return base64urlEncode(createHmac("sha256", secret).update(payloadB64).digest());
}

/**
 * Returns a signed token for the given email, or null if
 * PREFERENCES_TOKEN_SECRET is unset / too short. Callers MUST handle
 * null — emitting an unsigned URL would let any recipient toggle any
 * other recipient's preferences.
 */
export function signPreferencesToken(email: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return null;
  const payload: PreferencesTokenPayload = {
    email: normalized,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Returns the verified email, or null if the token is malformed,
 * expired, signed with a different secret, or tampered with. Use a
 * timing-safe compare on the signature to avoid leaking secret bytes
 * via response timing.
 */
export function verifyPreferencesToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const secret = getSecret();
  if (!secret) return null;

  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const expectedSig = sign(payloadB64, secret);
  const a = base64urlDecode(sigB64);
  const b = base64urlDecode(expectedSig);
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let payload: PreferencesTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.email !== "string" || typeof payload.exp !== "number") {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload.email.trim().toLowerCase() || null;
}
