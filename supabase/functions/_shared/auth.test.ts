// Deno test for _shared/auth.ts — covers the public-shape promises of the
// auth helpers (CORS, preflight, JSON envelope, 401 paths). The Supabase JWT
// verification path requires live infra and is exercised via integration
// tests (Playwright golden paths), not unit tests.
//
// Run with: deno test --allow-env --allow-net=esm.sh supabase/functions/_shared/auth.test.ts

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  corsHeaders,
  handlePreflight,
  json,
  requireUser,
  requireUserOrService,
} from "./auth.ts";

Deno.test("corsHeaders includes the standard Supabase headers", () => {
  assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
  assertStringIncludes(corsHeaders["Access-Control-Allow-Headers"], "authorization");
  assertStringIncludes(corsHeaders["Access-Control-Allow-Methods"], "POST");
});

Deno.test("json() wraps body with cors + content-type", async () => {
  const res = json({ hello: "world" }, 201);
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await res.json(), { hello: "world" });
});

Deno.test("handlePreflight returns 200 ok for OPTIONS, null otherwise", async () => {
  const opt = new Request("https://example/fn", { method: "OPTIONS" });
  const r = handlePreflight(opt);
  if (!r) throw new Error("expected Response");
  assertEquals(r.status, 200);
  assertEquals(await r.text(), "ok");

  const get = new Request("https://example/fn", { method: "GET" });
  assertEquals(handlePreflight(get), null);
});

Deno.test("requireUser rejects requests without Authorization header", async () => {
  // Set env so requireUser passes its boot check before hitting the header.
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role");

  const r = await requireUser(new Request("https://example/fn", { method: "POST" }));
  if (!(r instanceof Response)) throw new Error("expected Response");
  assertEquals(r.status, 401);
  const body = await r.json();
  assertEquals(body.ok, false);
  assertStringIncludes(String(body.error), "Authorization");
});

Deno.test("requireUser rejects malformed Bearer token", async () => {
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role");

  const r = await requireUser(
    new Request("https://example/fn", {
      method: "POST",
      headers: { Authorization: "Basic dXNlcjpwYXNz" }, // wrong scheme
    }),
  );
  if (!(r instanceof Response)) throw new Error("expected Response");
  assertEquals(r.status, 401);
});

Deno.test({
  name: "requireUserOrService accepts a service-role token directly",
  // Supabase client creation starts an internal fetch-retry timer that
  // doesn't get cleaned up before the test exits. The auth logic itself
  // is the property under test.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const SRK = "fake-service-role-key";
    Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
    Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SRK);

    const r = await requireUserOrService(
      new Request("https://example/fn", {
        method: "POST",
        headers: { Authorization: `Bearer ${SRK}` },
      }),
    );

    if (r instanceof Response) throw new Error("expected AuthContext, got Response");
    assertEquals(r.mode, "service");
  },
});

Deno.test({
  name: "requireUserOrService rejects no header",
  // Same caveat as the test above — leaked timers from the prior test's
  // Supabase client creation can persist; what we're testing here is the
  // pure pre-client-creation rejection path.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
    Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "srk");

    const r = await requireUserOrService(
      new Request("https://example/fn", { method: "POST" }),
    );
    if (!(r instanceof Response)) throw new Error("expected Response");
    assertEquals(r.status, 401);
  },
});
