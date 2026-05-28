import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

import {
  cancelStripeSubscription,
  createStripeCheckout,
  createStripePortalSession,
  getBillingStatus,
  listStripeInvoices,
  previewUpcomingInvoice,
} from "./billing";
import { EdgeFunctionError } from "./_client";

describe("billing domain", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("getBillingStatus calls the canonical edge function", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, user_id: "u-1", org_id: null, subscription_owner: "self" },
      error: null,
    });
    await getBillingStatus();
    expect(invokeMock.mock.calls[0]![0]).toBe("get-billing-status");
  });

  it("createStripeCheckout calls billing-checkout with payload", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, url: "https://checkout.stripe.com/x" },
      error: null,
    });
    const res = await createStripeCheckout({ plan_code: "growth", billing_interval: "monthly" });
    expect(invokeMock.mock.calls[0]![0]).toBe("billing-checkout");
    expect(invokeMock.mock.calls[0]![1]).toEqual({
      body: { plan_code: "growth", billing_interval: "monthly" },
    });
    expect(res.url).toContain("checkout.stripe.com");
  });

  it("createStripePortalSession calls billing-portal", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, url: "https://billing.stripe.com/x" },
      error: null,
    });
    await createStripePortalSession();
    expect(invokeMock.mock.calls[0]![0]).toBe("billing-portal");
  });

  it("listStripeInvoices calls list-invoices", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, invoices: [], totals: null },
      error: null,
    });
    await listStripeInvoices();
    expect(invokeMock.mock.calls[0]![0]).toBe("list-invoices");
  });

  it("previewUpcomingInvoice calls upcoming-invoice", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, today_cents: 12500, next_cents: 12500, next_billing_date: null, prorations: [], currency: "usd" },
      error: null,
    });
    await previewUpcomingInvoice({ plan_code: "starter", billing_interval: "monthly" });
    expect(invokeMock.mock.calls[0]![0]).toBe("upcoming-invoice");
  });

  it("cancelStripeSubscription calls cancel-subscription", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, cancel_at_period_end: true },
      error: null,
    });
    await cancelStripeSubscription({ action: "cancel", reason: "too_expensive" });
    expect(invokeMock.mock.calls[0]![0]).toBe("cancel-subscription");
  });

  it("throws EdgeFunctionError on ok=false (typed across the domain)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: "no_active_subscription", code: "NO_SUB" },
      error: null,
    });
    await expect(getBillingStatus()).rejects.toBeInstanceOf(EdgeFunctionError);
  });
});
