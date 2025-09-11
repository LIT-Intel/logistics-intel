/**
 * Frontend API -> Firebase Callable Functions (with fallbacks)
 * This mirrors the old Base44 map so imports keep working.
 */
import { call, callOr } from './firebaseClient';

// ---------- Stripe & billing ----------
export const generateRfpPdf            = callOr('generateRfpPdf',      { ok: false });
export const stripeWebhookHandler      = callOr('stripeWebhookHandler', { ok: false });
export const createStripeCheckout      = callOr('createStripeCheckout', { ok: false });
export const createStripePortalSession = callOr('createStripePortalSession', { ok: false });
export const sendEmail                 = callOr('sendEmail',            { ok: false, message: 'Email not yet wired' });

// ---------- Enrichment & outreach ----------
export const enrichCompanyWithApollo   = callOr('enrichCompanyWithApollo',   { ok: false, contacts: [] });
export const findCompanyContacts       = callOr('findCompanyContacts',       { ok: true, contacts: [] });
export const phantombusterLinkedIn     = callOr('phantombusterLinkedIn',     { ok: false, message: 'Disabled' });
export const searchLeads               = callOr('searchLeads',               { ok: true, results: [], total: 0 });
export const toggleCompanySave         = callOr('toggleCompanySave',         { ok: true, saved: false });
export const debugAgent                = callOr('debugAgent',                { ok: false });
export const getOutreachHistory        = callOr('getOutreachHistory',        { ok: true, items: [] });

// ---------- Health / ping ----------
export const litPing                   = callOr('litPing',            { ok: true, ts: Date.now(), uid: null });
export const litPingIndex              = callOr('litPing_index',      { ok: true, ts: Date.now(), uid: null }); // back-compat

// ---------- Company data ----------
export const getCompanyDetails         = callOr('getCompanyDetails',   { ok: true, data: null });
export const getCompanyOverview        = callOr('getCompanyOverview',  { totals: { shipments: 0, spendUSD: 0, lanes: 0, carriers: 0 }, trend: [], byMode: [] });
export const getCompanyShipments       = callOr('getCompanyShipments', { rows: [], total: 0 });
export const company                   = callOr('company',             { ok: false });
export const companySave               = callOr('company_save',        { ok: false });
export const saveCompany               = companySave; // legacy alias

// ---------- AI endpoints ----------
export const ai                        = callOr('ai',                       { ok: false });
export const aiEnrichCompany           = callOr('ai_enrichCompany',         { ok: false });
export const enrichCompany             = aiEnrichCompany; // legacy alias

// ---------- Automations ----------
export const automationsRun            = callOr('automations_run',          { ok: false });

// ---------- Search ----------
export const searchShipments           = callOr('searchShipments',          { rows: [], total: 0 });
export const getFilterOptionsIndex     = callOr('getFilterOptions_index',   { modes: [], statuses: [], years: [] });
export const searchCompaniesIndex      = callOr('searchCompanies_index',    { results: [], total: 0 });

// ---------- Lib helpers ----------
export const libCors                   = callOr('_lib_cors',                { ok: true });
