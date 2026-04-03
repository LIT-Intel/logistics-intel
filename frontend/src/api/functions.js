/**
 * Frontend API -> Direct HTTP Calls (via Supabase Edge Functions)
 */

import { httpCall } from './httpClient';
import { supabase } from '../lib/supabase';

// ---------- Shared helpers ----------
async function invokeEdgeFunction(functionName, options = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const accessToken = session?.access_token;

  console.log(`[Billing Debug] ${functionName} session exists:`, !!session);
  console.log(`[Billing Debug] ${functionName} token exists:`, !!accessToken);

  if (!accessToken) {
    throw new Error('No active session found. Please sign in again.');
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: options.body || {},
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

// ---------- Stripe & billing ----------
export const generateRfpPdf = httpCall('/functions/generateRfpPdf', { ok: false });
export const stripeWebhookHandler = httpCall('/functions/billing-webhook', { ok: false });

export const createStripeCheckout = async (payload) => {
  return invokeEdgeFunction('billing-checkout', {
    body: payload,
  });
};

export const createStripePortalSession = async () => {
  return invokeEdgeFunction('billing-portal', {
    body: {},
  });
};

export const sendEmail = httpCall('/functions/sendEmail', {
  ok: false,
  message: 'Email not yet wired',
});

// ---------- Enrichment & outreach ----------
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

export const debugAgent = httpCall('/functions/debugAgent', {
  ok: false,
});

export const getOutreachHistory = httpCall('/functions/getOutreachHistory', {
  ok: true,
  items: [],
});

// ---------- Health / ping ----------
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

// ---------- Company data ----------
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

export const company = httpCall('/functions/company', {
  ok: false,
});

export const companySave = httpCall('/functions/company_save', {
  ok: false,
});

export const saveCompany = companySave;

// ---------- AI endpoints ----------
export const ai = httpCall('/functions/ai', {
  ok: false,
});

export const aiEnrichCompany = httpCall('/functions/ai_enrichCompany', {
  ok: false,
});

export const enrichCompany = aiEnrichCompany;

// ---------- Automations ----------
export const automationsRun = httpCall('/functions/automations_run', {
  ok: false,
});

// ---------- Search ----------
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

// ---------- Lib helpers ----------
export const libCors = httpCall('/functions/_lib_cors', {
  ok: true,
});
