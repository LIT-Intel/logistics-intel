// Deno test for resolveSubscriptionForUser — locks in the B-001 tactical fix
// (invited members of a paid org see the org's subscription, not free_trial).
//
// Run with: deno test supabase/functions/_shared/subscription_resolve.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveSubscriptionForUser,
  type MinimalSubsDb,
  type SubscriptionRow,
} from "./subscription_resolve.ts";

const GROWTH: SubscriptionRow = {
  plan_code: "growth",
  status: "active",
  stripe_customer_id: "cus_x",
  stripe_subscription_id: "sub_x",
  current_period_start: "2026-05-01",
  current_period_end: "2026-06-01",
  cancel_at_period_end: false,
  trial_ends_at: null,
  seat_quantity: 3,
};

function fakeDb(
  byUser: Record<string, SubscriptionRow | null>,
  ownerByUser: Record<string, string | null>,
): MinimalSubsDb {
  return {
    findByUserId: async (userId) => byUser[userId] ?? null,
    findOrgOwner: async (userId) => ({ ownerUserId: ownerByUser[userId] ?? null }),
  };
}

Deno.test("owner sees their own subscription as 'self'", async () => {
  const db = fakeDb({ owner: GROWTH }, { owner: "owner" });
  const r = await resolveSubscriptionForUser("owner", db);
  assertEquals(r.owner, "self");
  assertEquals(r.sub?.plan_code, "growth");
});

Deno.test("invited member with paying owner falls back to 'org_owner'", async () => {
  const db = fakeDb(
    { owner: GROWTH, invitee: null },
    { invitee: "owner" },
  );
  const r = await resolveSubscriptionForUser("invitee", db);
  assertEquals(r.owner, "org_owner");
  assertEquals(r.sub?.plan_code, "growth");
});

Deno.test("invited member with no paying owner returns 'none'", async () => {
  const db = fakeDb(
    { owner: null, invitee: null },
    { invitee: "owner" },
  );
  const r = await resolveSubscriptionForUser("invitee", db);
  assertEquals(r.owner, "none");
  assertEquals(r.sub, null);
});

Deno.test("user with no org and no self-row returns 'none'", async () => {
  const db = fakeDb({ solo: null }, { solo: null });
  const r = await resolveSubscriptionForUser("solo", db);
  assertEquals(r.owner, "none");
  assertEquals(r.sub, null);
});

Deno.test("does not double-look-up when owner_user_id equals caller", async () => {
  const db = fakeDb({ owner: null }, { owner: "owner" });
  const r = await resolveSubscriptionForUser("owner", db);
  // owner has no row AND is the org's owner. Should not loop or false-positive.
  assertEquals(r.owner, "none");
  assertEquals(r.sub, null);
});
