// @vitest-environment node
/**
 * getCampaignsFromSupabase — org-scoped query builder tests.
 *
 * Covers the 4 contract guarantees per Sub-project A, Task 9:
 *  1. adminScope='org' adds `.eq('org_id', orgId)` to the query.
 *  2. adminScope='all' DROPS the org filter so platform admins can opt in.
 *  3. adminScope='org' with no orgId returns [] without firing a query
 *     (safety: prefer empty over leaking every campaign).
 *  4. Calling with no args defaults to scope='org' + no orgId → [].
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const eqSpy = vi.hoisted(() => vi.fn());
const orderSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [], error: null }));
const selectSpy = vi.hoisted(() => vi.fn());
const fromSpy = vi.hoisted(() => vi.fn());

// Chain shape: from() → select() → [eq() | order()]; eq() must also chain to order().
selectSpy.mockImplementation(() => ({ eq: eqSpy, order: orderSpy }));
eqSpy.mockImplementation(() => ({ eq: eqSpy, order: orderSpy }));
fromSpy.mockImplementation(() => ({ select: selectSpy }));

// supabase.ts re-exports the client from @/auth/supabaseAuthClient.
// Mocking THAT module replaces the shared client everywhere.
vi.mock("@/auth/supabaseAuthClient", () => ({
  supabase: { from: fromSpy },
  isSupabaseAvailable: () => true,
  getSupabaseError: () => null,
}));

import { getCampaignsFromSupabase } from "../supabase";

describe("getCampaignsFromSupabase", () => {
  beforeEach(() => {
    eqSpy.mockClear();
    orderSpy.mockClear();
    selectSpy.mockClear();
    fromSpy.mockClear();
  });

  it("adds .eq('org_id', orgId) when adminScope='org'", async () => {
    await getCampaignsFromSupabase({ orgId: "org-123", adminScope: "org" });
    expect(fromSpy).toHaveBeenCalledWith("lit_campaigns");
    expect(eqSpy).toHaveBeenCalledWith("org_id", "org-123");
    expect(orderSpy).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("omits .eq() when adminScope='all'", async () => {
    await getCampaignsFromSupabase({ orgId: "org-123", adminScope: "all" });
    expect(fromSpy).toHaveBeenCalledWith("lit_campaigns");
    expect(eqSpy).not.toHaveBeenCalled();
    expect(orderSpy).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns [] when scope='org' but orgId is missing (no query fired)", async () => {
    const result = await getCampaignsFromSupabase({ orgId: null, adminScope: "org" });
    expect(result).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("returns [] when args fully omitted (defaults to 'org' with no orgId → empty)", async () => {
    const result = await getCampaignsFromSupabase();
    expect(result).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
