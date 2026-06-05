// Pub/Sub OIDC token verifier.
//
// Google Cloud Pub/Sub pushes notifications to subscribers with an OIDC
// identity token in the Authorization header. Verifying that token is what
// proves the request actually came from Google — without it any caller who
// knows the function URL can POST a forged notification (today exploitable
// against reply-receiver to pollute campaign reply analytics).
//
// Spec: https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions
// JWKS: https://www.googleapis.com/oauth2/v3/certs
//
// The audience claim must match what the subscription was configured with —
// typically the receiver's function URL or a service-account email. We read
// the expected audience from the LIT_PUBSUB_AUDIENCE env var so the
// subscription owner controls it without redeploying.

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "https://deno.land/x/jose@v5.6.3/index.ts";

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

// jose's RemoteJWKSet caches keys internally with sensible defaults
// (refresh on cache miss, no thundering herd). Module-level so it survives
// across invocations within one isolate.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  return jwks;
}

export interface PubsubVerifyResult {
  ok: true;
  payload: JWTPayload;
}
export interface PubsubVerifyFailure {
  ok: false;
  reason: string;
}
export type PubsubVerify = PubsubVerifyResult | PubsubVerifyFailure;

export interface VerifyOptions {
  /** Audience expected on the OIDC token. Defaults to LIT_PUBSUB_AUDIENCE env. */
  audience?: string;
  /** For tests: inject a custom JWKS resolver. */
  jwksResolver?: ReturnType<typeof createRemoteJWKSet>;
}

/**
 * Verify a Pub/Sub OIDC bearer token from an incoming request.
 *
 * Returns `{ ok: true, payload }` when the token is signed by Google,
 * unexpired, and matches the configured audience + issuer.
 *
 * Returns `{ ok: false, reason }` otherwise. Callers should respond 401
 * and NOT process the request body.
 */
export async function verifyPubsubOidc(
  req: Request,
  opts: VerifyOptions = {},
): Promise<PubsubVerify> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, reason: "missing_bearer" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, reason: "empty_token" };

  const audience = opts.audience ?? Deno.env.get("LIT_PUBSUB_AUDIENCE") ?? "";
  if (!audience) return { ok: false, reason: "audience_not_configured" };

  try {
    const { payload } = await jwtVerify(token, opts.jwksResolver ?? getJwks(), {
      audience,
      issuer: Array.from(GOOGLE_ISSUERS),
    });
    return { ok: true, payload };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "verify_failed",
    };
  }
}
