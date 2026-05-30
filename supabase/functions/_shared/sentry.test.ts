// Deno test for _shared/sentry.ts — verifies the no-op-when-unset path
// (the most important property; the wire to Sentry itself is exercised in
// staging where the DSN is set).
//
// Run with: deno test --allow-env supabase/functions/_shared/sentry.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("isSentryEnabled returns false when SENTRY_DSN is unset", async () => {
  Deno.env.delete("SENTRY_DSN");
  // Force a fresh module import so the top-level DSN read sees the cleared env.
  const mod = await import(`./sentry.ts?v=${Date.now()}-1`);
  assertEquals(mod.isSentryEnabled(), false);
});

Deno.test("captureSentryEvent is a no-op (does not throw) when DSN is unset", async () => {
  Deno.env.delete("SENTRY_DSN");
  const mod = await import(`./sentry.ts?v=${Date.now()}-2`);
  // Should not throw, should not require network access.
  mod.captureSentryEvent({
    fn: "test-fn",
    event: "test_event",
    fields: { user_id: "u-1" },
    error: new Error("boom"),
  });
  assertEquals(true, true);
});

Deno.test("isSentryEnabled returns true when SENTRY_DSN is a valid DSN", async () => {
  Deno.env.set("SENTRY_DSN", "https://abc123@o12345.ingest.sentry.io/67890");
  const mod = await import(`./sentry.ts?v=${Date.now()}-3`);
  assertEquals(mod.isSentryEnabled(), true);
});

Deno.test("isSentryEnabled returns false on malformed DSN", async () => {
  Deno.env.set("SENTRY_DSN", "not-a-url");
  const mod = await import(`./sentry.ts?v=${Date.now()}-4`);
  assertEquals(mod.isSentryEnabled(), false);
});

Deno.test("isSentryEnabled returns false on DSN without project id", async () => {
  Deno.env.set("SENTRY_DSN", "https://abc123@sentry.io/");
  const mod = await import(`./sentry.ts?v=${Date.now()}-5`);
  assertEquals(mod.isSentryEnabled(), false);
});
