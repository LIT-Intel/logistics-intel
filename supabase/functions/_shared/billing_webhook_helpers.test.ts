// Deno tests for billing-webhook helper logic.
//
// Run with: deno test supabase/functions/_shared/billing_webhook_helpers.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveOrganizationIdForUser } from "./billing_webhook_helpers.ts";

Deno.test("resolveOrganizationIdForUser prefers metadata.supabase_organization_id", async () => {
  const earliestOrgIdForUser = async () => "db-fallback-org";
  const orgId = await resolveOrganizationIdForUser("u-1", {
    metadata: { supabase_organization_id: "explicit-org" },
    earliestOrgIdForUser,
  });
  assertEquals(orgId, "explicit-org");
});

Deno.test("resolveOrganizationIdForUser accepts legacy supabase_org_id key as fallback", async () => {
  const earliestOrgIdForUser = async () => "db-fallback-org";
  const orgId = await resolveOrganizationIdForUser("u-1", {
    metadata: { supabase_org_id: "legacy-org" },
    earliestOrgIdForUser,
  });
  assertEquals(orgId, "legacy-org");
});

Deno.test("supabase_organization_id wins over legacy supabase_org_id", async () => {
  const earliestOrgIdForUser = async () => "db-fallback-org";
  const orgId = await resolveOrganizationIdForUser("u-1", {
    metadata: {
      supabase_org_id: "legacy-org",
      supabase_organization_id: "explicit-org",
    },
    earliestOrgIdForUser,
  });
  assertEquals(orgId, "explicit-org");
});

Deno.test("resolveOrganizationIdForUser falls back to DB when metadata absent", async () => {
  const earliestOrgIdForUser = async (u: string) => (u === "u-1" ? "db-org" : null);
  const orgId = await resolveOrganizationIdForUser("u-1", {
    metadata: null,
    earliestOrgIdForUser,
  });
  assertEquals(orgId, "db-org");
});

Deno.test("resolveOrganizationIdForUser returns null when user has no org", async () => {
  const earliestOrgIdForUser = async () => null;
  const orgId = await resolveOrganizationIdForUser("u-1", {
    metadata: {},
    earliestOrgIdForUser,
  });
  assertEquals(orgId, null);
});

Deno.test("resolveOrganizationIdForUser ignores non-string metadata values", async () => {
  const earliestOrgIdForUser = async () => "db-org";
  const orgId = await resolveOrganizationIdForUser("u-1", {
    metadata: { supabase_organization_id: 12345 as unknown as string },
    earliestOrgIdForUser,
  });
  assertEquals(orgId, "db-org");
});
