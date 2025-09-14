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

const { z } = require('zod');

function buildNormalizer() {
  const ModeEnum = z.enum(["all","ocean","air"]).default("all");
  const Pagination = z.object({ limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0) }).default({ limit: 25, offset: 0 });
  const DateRange = z.object({ from: z.string().min(1), to: z.string().min(1) }).optional();
  const Filters = z.record(z.any()).default({});
  const Normalized = z.object({ data: z.object({ search: z.object({ q: z.string(), mode: ModeEnum }), filters: Filters, dateRange: DateRange, pagination: Pagination }) });
  const Shape1 = z.object({ q: z.string().optional(), mode: z.union([z.literal("ocean"), z.literal("air"), z.literal("all")]).optional(), limit: z.number().int().optional(), offset: z.number().int().optional() }).strict();
  const Shape2 = z.object({ search: z.object({ q: z.string().optional(), mode: ModeEnum.optional() }).optional(), pagination: z.object({ limit: z.number().int().optional(), offset: z.number().int().optional() }).optional(), filters: z.record(z.any()).optional(), dateRange: DateRange.optional() }).strict();
  const Shape3 = z.object({ data: Shape2 }).strict();

  function normalize(input) {
    let s3=null,s2=null,s1=null;
    try { s3 = Shape3.parse(input);} catch{}
    if (!s3) try { s2 = Shape2.parse(input);} catch{}
    if (!s3 && !s2) try { s1 = Shape1.parse(input);} catch{}
    let q="", mode="all", filters={}, dateRange, limit=25, offset=0;
    if (s3) { const d=s3.data||{}; q=d.search?.q??""; mode=d.search?.mode??"all"; filters=d.filters??{}; dateRange=d.dateRange; limit=d.pagination?.limit??25; offset=d.pagination?.offset??0; }
    else if (s2) { q=s2.search?.q??""; mode=s2.search?.mode??"all"; filters=s2.filters??{}; dateRange=s2.dateRange; limit=s2.pagination?.limit??25; offset=s2.pagination?.offset??0; }
    else if (s1) { q=s1.q??""; mode=s1.mode??"all"; limit=s1.limit??25; offset=s1.offset??0; }
    else {
      const union = z.union([Shape3, Shape2, Shape1]);
      const parsed = union.safeParse(input);
      const flat = parsed.error?.flatten?.();
      const err = new Error('invalid_input');
      err.status = 422;
      if (flat) err.fieldErrors = flat.fieldErrors;
      throw err;
    }
    if (!["all","ocean","air"].includes(mode)) mode = "all";
    return Normalized.parse({ data: { search: { q, mode }, filters, dateRange, pagination: { limit, offset } } });
  }
  return { normalize };
}

const { normalize } = buildNormalizer();

exports.searchCompanies_index = onCall(async (req) => {
  try {
    // For onCall, the wrapper and clients pass the payload directly as the first arg
    const normalized = normalize(req ?? {});
    // leave actual implementation to upstream; just echo normalized for now
    return { ok: true, normalized };
  } catch (e) {
    if (e && e.status === 422) {
      // Firebase callable returns 200 with error-style payloads; keep shape consistent for client
      return { error: 'invalid_input', fieldErrors: e.fieldErrors ?? {} };
    }
    return { error: 'internal_error' };
  }
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
