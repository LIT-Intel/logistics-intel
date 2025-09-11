const { onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2/options');

setGlobalOptions({ region: 'us-central1' });

// --- Health ---
exports.litPing = onCall(async (req) => {
  return { ok: true, ts: Date.now(), uid: req.auth?.uid ?? null };
});

// Client previously called "litPing/index" — Firebase uses underscores instead.
exports.litPing_index = onCall(async (req) => {
  return { ok: true, ts: Date.now(), uid: req.auth?.uid ?? null };
});

// --- Dashboard-safe stubs (so pages render) ---
exports.getCompanyOverview = onCall(async () => {
  return {
    totals: { shipments: 0, spendUSD: 0, lanes: 0, carriers: 0 },
    trend: [],
    byMode: [],
  };
});

exports.getCompanyShipments = onCall(async () => {
  return { rows: [], total: 0 };
});

exports.searchShipments = onCall(async () => {
  return { results: [], total: 0 };
});

exports.getFilterOptions_index = onCall(async () => {
  return {
    modes: ['FCL', 'LCL', 'AIR', 'TRUCK'],
    statuses: ['Booked', 'In Transit', 'Delivered'],
    years: [2022, 2023, 2024, 2025],
  };
});

exports.searchCompanies_index = onCall(async () => {
  return { results: [], total: 0 };
});

// --- Billing/Email placeholders ---
exports.createStripeCheckout = onCall(async () => {
  return { url: null, message: 'Stripe not configured yet.' };
});

exports.createStripePortalSession = onCall(async () => {
  return { url: null, message: 'Stripe not configured yet.' };
});

exports.sendEmail = onCall(async () => {
  return { ok: false, message: 'Email service not wired yet.' };
});
