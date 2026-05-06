/**
 * Frontend API -> Direct HTTP Calls / Supabase Edge Functions
 *
 * IMPORTANT FIX:
 * - Billing endpoints now call Supabase directly (no /api/lit proxy)
 * - Fixes 404 error: "The current request is not defined by this API."
 */

import { httpCall } from './httpClient';
import { supabase } from '@/lib/supabase';

/**
 * Helper to invoke Supabase Edge Functions directly
 */
async function invokeSupabaseFunction(functionName, body = {}) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    // supabase-js wraps non-2xx responses in a generic "Edge Function
    // returned a non-2xx status code" error — the actual structured
    // body the edge fn returned (e.g. { error, code, message }) lives
    // on error.context (a Response). Parse it so callers see the real
    // reason instead of the unhelpful "non-2xx" toast.
    let parsed = null;
    try {
      const ctx = error?.context;
      if (ctx?.clone && ctx?.json) {
        parsed = await ctx.clone().json();
      } else if (ctx?.json) {
        parsed = await ctx.json();
      }
    } catch {
      /* body wasn't JSON — leave parsed null */
    }

    console.error(
      `[Functions] Supabase invoke failed for ${functionName}:`,
      parsed || error,
    );

    const friendlyMessage =
      (parsed && (parsed.message || parsed.error)) || error?.message;
    const wrapped = new Error(
      friendlyMessage || `Request to ${functionName} failed.`,
    );
    wrapped.code = parsed?.code || error?.code || null;
    wrapped.body = parsed;
    wrapped.original = error;
    throw wrapped;
  }

  return data ?? { ok: false, message: `No response returned from ${functionName}` };
}

function normalizeLeadResults(raw) {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => ({
    id: item?.id ?? item?.company_id ?? item?.domain ?? item?.name ?? `pulse-${index}`,
    name: item?.name ?? item?.company_name ?? item?.title ?? 'Unknown Company',
    domain: item?.domain ?? item?.website ?? item?.company_domain ?? '',
    city: item?.city ?? item?.hq_city ?? item?.location_city ?? '',
    country: item?.country ?? item?.hq_country ?? item?.location_country ?? '',
    industry: item?.industry ?? item?.industry_name ?? '',
    employee_count: item?.employee_count ?? item?.employees ?? item?.employeeCount ?? '',
    annual_revenue: item?.annual_revenue ?? item?.revenue ?? '',
    contacts: Array.isArray(item?.contacts) ? item.contacts : [],
    source: item?.source ?? 'pulse',
  }));
}

// ============================================================
// STRIPE / BILLING (FIXED)
// ============================================================

export const generateRfpPdf = httpCall('/functions/generateRfpPdf', { ok: false });

// ✅ FIXED: direct Supabase call
export const createStripeCheckout = async (payload = {}) =>
  invokeSupabaseFunction('billing-checkout', payload);

// ✅ FIXED: direct Supabase call
export const createStripePortalSession = async (payload = {}) =>
  invokeSupabaseFunction('billing-portal', payload);

// Lists the user's Stripe invoices + computes MTD/YTD spend totals.
// Powers the inline invoice table on /app/billing so users don't have
// to bounce out to the Stripe portal just to see past charges.
export const listStripeInvoices = async (payload = {}) =>
  invokeSupabaseFunction('list-invoices', payload);

// Authoritative billing snapshot. Returns plan, subscription state,
// REAL Stripe default payment method (not inferred from customer id),
// trial_ends_at, and seat snapshot. Use this — not subscriptions row
// alone — for the Billing page payment-method state.
export const getBillingStatus = async (payload = {}) =>
  invokeSupabaseFunction('get-billing-status', payload);

// Previews the next invoice + today's prorated charge if the user
// upgrades / switches plans now. Powers the pre-checkout confirmation
// modal so users see "today: $X / then $Y/mo from [date]" before
// hitting Stripe-hosted checkout. Reduces sticker-shock abandonment.
export const previewUpcomingInvoice = async (payload = {}) =>
  invokeSupabaseFunction('upcoming-invoice', payload);

// Server-side cancellation flow. Sets cancel_at_period_end = true on
// the active subscription so the user keeps access until period end;
// no refund. Persists reason + feedback to subscription metadata.
// Use action: 'reactivate' to flip cancel_at_period_end back to false.
export const cancelStripeSubscription = async (payload = {}) =>
  invokeSupabaseFunction('cancel-subscription', payload);

// Optional webhook (usually server-side only)
export const stripeWebhookHandler = async (payload = {}) =>
  invokeSupabaseFunction('billing-webhook', payload);

// ✅ NEW: Server-side entitlement checking
export const checkEntitlements = async (payload = {}) =>
  invokeSupabaseFunction('check-entitlements', payload);

export const sendEmail = httpCall('/functions/sendEmail', {
  ok: false,
  message: 'Email not yet wired',
});

// ============================================================
// ENRICHMENT / OUTREACH
// ============================================================

export const enrichCompanyWithApollo = httpCall('/functions/enrichCompanyWithApollo', {
  ok: false,
  contacts: [],
});

export const findCompanyContacts = httpCall('/functions/findCompanyContacts', {
  ok: true,
  contacts: [],
});

export const phantombusterLinkedIn = async (payload = {}) =>
  invokeSupabaseFunction('phantombuster-linkedin', payload);

const rawSearchLeads = async (payload = {}) =>
  invokeSupabaseFunction('searchLeads', payload);

export const searchLeads = async (payload = {}) => {
  const response = await rawSearchLeads(payload);
  const data = response?.data ?? response ?? {};

  const rawResults =
    data?.results ??
    data?.data?.results ??
    data?.items ??
    response?.results ??
    [];

  const normalizedResults = normalizeLeadResults(rawResults);

  return {
    ...response,
    ok: response?.ok ?? data?.ok ?? true,
    status: response?.status ?? 200,
    error: response?.error ?? data?.error ?? null,
    data: {
      ...data,
      results: normalizedResults,
      total: data?.total ?? normalizedResults.length,
    },
  };
};

export const toggleCompanySave = httpCall('/functions/toggleCompanySave', {
  ok: true,
  saved: false,
});

export const debugAgent = httpCall('/functions/debugAgent', { ok: false });

export const getOutreachHistory = httpCall('/functions/getOutreachHistory', {
  ok: true,
  items: [],
});

// ============================================================
// HEALTH
// ============================================================

export const litPing = httpCall('/functions/litPing', {
  ok: true,
  ts: Date.now(),
  uid: null,
});

export const litPingIndex = httpCall('/functions/litPing_index', {
  ok: true,
  ts: Date.now(),
  uid: null,
});

// ============================================================
// COMPANY DATA
// ============================================================

export const getCompanyDetails = httpCall('/functions/getCompanyDetails', {
  ok: true,
  data: null,
});

export const getCompanyOverview = httpCall('/functions/getCompanyOverview', {
  totals: { shipments: 0, spendUSD: 0, lanes: 0, carriers: 0 },
  trend: [],
  byMode: [],
});

export const getCompanyShipments = httpCall('/functions/getCompanyShipments', {
  rows: [],
  total: 0,
});

export const company = httpCall('/functions/company', { ok: false });

export const companySave = httpCall('/functions/company_save', { ok: false });

export const saveCompany = companySave; // legacy alias

// ============================================================
// AI
// ============================================================

export const ai = httpCall('/functions/ai', { ok: false });

export const aiEnrichCompany = httpCall('/functions/ai_enrichCompany', { ok: false });

export const enrichCompany = aiEnrichCompany; // alias

// ============================================================
// AUTOMATIONS
// ============================================================

export const automationsRun = httpCall('/functions/automations_run', { ok: false });

// ============================================================
// SEARCH
// ============================================================

export const searchShipments = httpCall('/functions/searchShipments', {
  rows: [],
  total: 0,
});

export const getFilterOptionsIndex = httpCall('/functions/getFilterOptions_index', {
  modes: [],
  statuses: [],
  years: [],
});

export const searchCompaniesIndex = httpCall('/functions/searchCompanies_index', {
  results: [],
  total: 0,
});

// ============================================================
// LIB
// ============================================================

export const libCors = httpCall('/functions/_lib_cors', { ok: true });
