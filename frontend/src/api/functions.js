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
    console.error(`[Functions] Supabase invoke failed for ${functionName}:`, error);
    throw error;
  }

  return data ?? { ok: false, message: `No response returned from ${functionName}` };
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

// Optional webhook (usually server-side only)
export const stripeWebhookHandler = async (payload = {}) =>
  invokeSupabaseFunction('billing-webhook', payload);

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

export const phantombusterLinkedIn = httpCall('/functions/phantombusterLinkedIn', {
  ok: false,
  message: 'Disabled',
});

export const searchLeads = httpCall('/functions/searchLeads', {
  ok: true,
  results: [],
  total: 0,
});

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
