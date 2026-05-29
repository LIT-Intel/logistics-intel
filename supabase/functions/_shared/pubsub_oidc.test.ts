// Deno test for _shared/pubsub_oidc.ts — verifies the bearer-token plumbing
// and configuration gates. The end-to-end JWT signature path against real
// Google JWKS is exercised in staging (the function is deployed with
// verify_jwt=false; the test below uses an in-memory key set).
//
// Run with: deno test --allow-env --allow-net=esm.sh,deno.land supabase/functions/_shared/pubsub_oidc.test.ts

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generateKeyPair,
  SignJWT,
  createLocalJWKSet,
  exportJWK,
} from "https://deno.land/x/jose@v5.6.3/index.ts";
import { verifyPubsubOidc } from "./pubsub_oidc.ts";

const AUDIENCE = "https://example.supabase.co/functions/v1/reply-receiver";

async function buildOidcFixture(opts: {
  audience?: string;
  issuer?: string;
  expiresIn?: string;
} = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  const jwks = createLocalJWKSet({ keys: [jwk] });

  const token = await new SignJWT({ email: "service-account@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuer(opts.issuer ?? "https://accounts.google.com")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(privateKey);

  return { token, jwks };
}

Deno.test("verifyPubsubOidc rejects requests with no Authorization header", async () => {
  Deno.env.set("LIT_PUBSUB_AUDIENCE", AUDIENCE);
  const r = await verifyPubsubOidc(new Request("https://example/fn", { method: "POST" }));
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_bearer");
});

Deno.test("verifyPubsubOidc rejects when audience is not configured", async () => {
  Deno.env.delete("LIT_PUBSUB_AUDIENCE");
  const r = await verifyPubsubOidc(
    new Request("https://example/fn", {
      method: "POST",
      headers: { Authorization: "Bearer fake.jwt.token" },
    }),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "audience_not_configured");
});

Deno.test("verifyPubsubOidc accepts a valid token signed by the test key set", async () => {
  Deno.env.set("LIT_PUBSUB_AUDIENCE", AUDIENCE);
  const { token, jwks } = await buildOidcFixture();
  const r = await verifyPubsubOidc(
    new Request("https://example/fn", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    { jwksResolver: jwks as any },
  );
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.payload.email, "service-account@example.com");
});

Deno.test("verifyPubsubOidc rejects a token with wrong audience", async () => {
  Deno.env.set("LIT_PUBSUB_AUDIENCE", AUDIENCE);
  const { token, jwks } = await buildOidcFixture({
    audience: "https://attacker.example.com/fn",
  });
  const r = await verifyPubsubOidc(
    new Request("https://example/fn", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    { jwksResolver: jwks as any },
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.reason, "aud");
});

Deno.test("verifyPubsubOidc rejects a token from a non-Google issuer", async () => {
  Deno.env.set("LIT_PUBSUB_AUDIENCE", AUDIENCE);
  const { token, jwks } = await buildOidcFixture({
    issuer: "https://attacker.example.com",
  });
  const r = await verifyPubsubOidc(
    new Request("https://example/fn", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    { jwksResolver: jwks as any },
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.reason, "iss");
});

Deno.test("verifyPubsubOidc rejects an expired token", async () => {
  Deno.env.set("LIT_PUBSUB_AUDIENCE", AUDIENCE);
  const { token, jwks } = await buildOidcFixture({ expiresIn: "-1m" });
  const r = await verifyPubsubOidc(
    new Request("https://example/fn", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    { jwksResolver: jwks as any },
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.reason.toLowerCase(), "exp");
});
