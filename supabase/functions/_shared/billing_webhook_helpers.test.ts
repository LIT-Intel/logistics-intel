// Deno tests for billing-webhook helper logic.
//
// Run with: deno test supabase/functions/_shared/billing_webhook_helpers.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getOrgIdWriteGate,
  resolveOrgIdForUser,
} from "./billing_webhook_helpers.ts";

Deno.test("resolveOrgIdForUser prefers metadata.supabase_org_id", async () => {
  const earliestOrgIdForUser = async () => "db-fallback-org";
  const orgId = await resolveOrgIdForUser("u-1", {
    metadata: { supabase_org_id: "explicit-org" },
    earliestOrgIdForUser,
  });
  assertEquals(orgId, "explicit-org");
});

Deno.test("resolveOrgIdForUser falls back to DB when metadata absent", async () => {
  const earliestOrgIdForUser = async (u: string) => (u === "u-1" ? "db-org" : null);
  const orgId = await resolveOrgIdForUser("u-1", {
    metadata: null,
    earliestOrgIdForUser,
  });
  assertEquals(orgId, "db-org");
});

Deno.test("resolveOrgIdForUser returns null when user has no org", async () => {
  const earliestOrgIdForUser = async () => null;
  const orgId = await resolveOrgIdForUser("u-1", {
    metadata: {},
    earliestOrgIdForUser,
  });
  assertEquals(orgId, null);
});

Deno.test("resolveOrgIdForUser ignores non-string metadata values", async () => {
  const earliestOrgIdForUser = async () => "db-org";
  const orgId = await resolveOrgIdForUser("u-1", {
    metadata: { supabase_org_id: 12345 as unknown as string },
    earliestOrgIdForUser,
  });
  assertEquals(orgId, "db-org");
});

Deno.test("getOrgIdWriteGate is off by default", () => {
  const r = getOrgIdWriteGate({});
  assertEquals(r.shouldWrite, false);
  assertEquals(r.reason, "flag_off");
});

Deno.test("getOrgIdWriteGate enables on 'true' literal", () => {
  const r = getOrgIdWriteGate({ LIT_BILLING_WEBHOOK_WRITE_ORG_ID: "true" });
  assertEquals(r.shouldWrite, true);
  assertEquals(r.reason, "flag_on");
});

Deno.test("getOrgIdWriteGate stays off for truthy-but-wrong values", () => {
  // Common footgun: "1", "yes", "on" — we require the exact literal "true"
  // because the column doesn't exist pre-migration; a typo means EVERY
  // webhook event 400s.
  for (const v of ["1", "yes", "on", "TRUE", " true ", "True"]) {
    const r = getOrgIdWriteGate({ LIT_BILLING_WEBHOOK_WRITE_ORG_ID: v });
    assertEquals(r.shouldWrite, false, `expected off for ${JSON.stringify(v)}`);
  }
});
