// Deno test for _shared/cron_auth.ts — verifies the X-Internal-Cron secret
// is required + matches before any cron function does work.
//
// Run with: deno test --allow-env supabase/functions/_shared/cron_auth.test.ts

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyCronAuth } from "./cron_auth.ts";

Deno.test("verifyCronAuth fails closed when LIT_CRON_SECRET is unset", async () => {
  Deno.env.delete("LIT_CRON_SECRET");
  const req = new Request("https://example/fn", { method: "POST" });
  const r = verifyCronAuth(req);
  if (r.ok) throw new Error("expected failure when LIT_CRON_SECRET unset");
  assertEquals(r.response.status, 500);
  assertStringIncludes(await r.response.text(), "misconfigured");
});

Deno.test("verifyCronAuth rejects 403 when X-Internal-Cron header missing", async () => {
  Deno.env.set("LIT_CRON_SECRET", "the-secret");
  const req = new Request("https://example/fn", { method: "POST" });
  const r = verifyCronAuth(req);
  if (r.ok) throw new Error("expected failure with missing header");
  assertEquals(r.response.status, 403);
});

Deno.test("verifyCronAuth rejects 403 when header value is wrong", async () => {
  Deno.env.set("LIT_CRON_SECRET", "the-secret");
  const req = new Request("https://example/fn", {
    method: "POST",
    headers: { "X-Internal-Cron": "wrong-secret" },
  });
  const r = verifyCronAuth(req);
  if (r.ok) throw new Error("expected failure with wrong header");
  assertEquals(r.response.status, 403);
});

Deno.test("verifyCronAuth accepts when header matches LIT_CRON_SECRET exactly", () => {
  Deno.env.set("LIT_CRON_SECRET", "the-secret");
  const req = new Request("https://example/fn", {
    method: "POST",
    headers: { "X-Internal-Cron": "the-secret" },
  });
  const r = verifyCronAuth(req);
  assertEquals(r.ok, true);
});
