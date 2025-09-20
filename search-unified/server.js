// server.js — Logistic Intel (search-unified)
// Express API behind API Gateway → Cloud Run
// Uses BigQuery for search + filter options

const express = require('express');
const cors = require('cors');
const { BigQuery } = require('@google-cloud/bigquery');

const app = express();
app.use(express.json());
app.use(cors());

const bq = new BigQuery();
const BQ_LOCATION = process.env.BQ_LOCATION || 'US';

// Basic health & index listing
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, service: 'search-unified' }));
app.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'search-unified',
    routes: [
      'POST /search',
      'POST /public/getFilterOptions',
      'GET  /public/getCompanyDetails',
      'GET  /public/getCompanyShipments',
      'POST /crm/saveCompany',
      'GET  /crm/savedCompanies',
      'GET  /campaigns',
      'GET  /healthz'
    ]
  });
});

// CORS (lenient; Gateway usually fronts this, but safe to include)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, x-client-info, apikey, content-type, x-lit-proxy-token'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});
// Public route for the SPA (no gateway token on the client)
async function handleGetFilterOptions(_req, res) {
  // Directly reuse the internal logic by calling the same queries again
  try {
    const where = `WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)`;

    const qModes = `
      SELECT DISTINCT LOWER(mode) AS mode
      FROM \`logistics-intel.lit.v_shipments_normalized\`
      ${where}
      AND mode IS NOT NULL AND mode != ''
      ORDER BY mode`;
    const qOrigins = `
      SELECT DISTINCT UPPER(origin_country) AS origin_country
      FROM \`logistics-intel.lit.v_shipments_normalized\`
      ${where}
      AND origin_country IS NOT NULL AND origin_country != ''
      ORDER BY origin_country`;
    const qDests = `
      SELECT DISTINCT UPPER(dest_country) AS dest_country
      FROM \`logistics-intel.lit.v_shipments_normalized\`
      ${where}
      AND dest_country IS NOT NULL AND dest_country != ''
      ORDER BY dest_country`;
    const qRange = `
      SELECT MIN(date) AS date_min, MAX(date) AS date_max
      FROM \`logistics-intel.lit.v_shipments_normalized\`
      WHERE date IS NOT NULL`;

    const [[modes], [origins], [dests], [rng]] = await Promise.all([
      bq.query({ query: qModes,   location: BQ_LOCATION }),
      bq.query({ query: qOrigins, location: BQ_LOCATION }),
      bq.query({ query: qDests,   location: BQ_LOCATION }),
      bq.query({ query: qRange,   location: BQ_LOCATION }),
    ]);

    res.status(200).json({
      modes:        (modes   || []).map(r => r.mode).filter(Boolean),
      origins:      (origins || []).map(r => r.origin_country).filter(Boolean),
      destinations: (dests   || []).map(r => r.dest_country).filter(Boolean),
      date_min:     rng?.[0]?.date_min || null,
      date_max:     rng?.[0]?.date_max || null,
    });
  } catch (e) {
    console.error('public/getFilterOptions error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
app.post('/public/getFilterOptions', handleGetFilterOptions);
app.get('/public/getFilterOptions', handleGetFilterOptions);

// ───────────────────────────────────────────────────────────────
// GET FILTER OPTIONS  (Required by search page)
// Source tables/views: logistics-intel.lit.v_shipments_normalized
// Fields used: date, mode, origin_country, dest_country
app.post('/getFilterOptions', async (_req, res) => {
  try {
    const where = `WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)`;

    const qModes = `
      SELECT DISTINCT LOWER(mode) AS mode
      FROM \`logistics-intel.lit.v_shipments_normalized\`
      ${where}
      AND mode IS NOT NULL AND mode != ''
      ORDER BY mode
    `;
    const qOrigins = `
      SELECT DISTINCT UPPER(origin_country) AS origin_country
      FROM \`logistics-intel.lit.v_shipments_normalized\`
      ${where}
      AND origin_country IS NOT NULL AND origin_country != ''
      ORDER BY origin_country
    `;
    const qDests = `
      SELECT DISTINCT UPPER(dest_country) AS dest_country
      FROM \`logistics-intel.lit.v_shipments_normalized\`
      ${where}
      AND dest_country IS NOT NULL AND dest_country != ''
      ORDER BY dest_country
    `;
    const qRange = `
      SELECT MIN(date) AS date_min, MAX(date) AS date_max
      FROM \`logistics-intel.lit.v_shipments_normalized\`
      WHERE date IS NOT NULL
    `;

    const [[modes], [origins], [dests], [rng]] = await Promise.all([
      bq.query({ query: qModes,   location: BQ_LOCATION }),
      bq.query({ query: qOrigins, location: BQ_LOCATION }),
      bq.query({ query: qDests,   location: BQ_LOCATION }),
      bq.query({ query: qRange,   location: BQ_LOCATION }),
    ]);

    res.status(200).json({
      modes:        (modes   || []).map(r => r.mode).filter(Boolean),
      origins:      (origins || []).map(r => r.origin_country).filter(Boolean),
      destinations: (dests   || []).map(r => r.dest_country).filter(Boolean),
      date_min:     rng?.[0]?.date_min || null,
      date_max:     rng?.[0]?.date_max || null,
    });
  } catch (e) {
    console.error('getFilterOptions error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
// ───────────────────────────────────────────────────────────────

// (Existing) Company search endpoint (kept minimal; extend later)
app.post('/searchCompanies', async (req, res) => {
  try {
    // Minimal no-op response preserves 200 contract until full query wired.
    // Frontend expects { items: [], total: number }
    res.status(200).json({ items: [], total: 0 });
  } catch (e) {
    console.error('searchCompanies error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// (Existing) Shipments search endpoint (stub)
app.post('/searchShipments', async (req, res) => {
  try {
    res.status(200).json({ items: [], total: 0 });
  } catch (e) {
    console.error('searchShipments error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// New unified search endpoint returning { meta, rows }
app.post('/search', async (req, res) => {
  try {
    const page = Number(req.body?.page || 1);
    const page_size = Number(req.body?.page_size || 24);
    // TODO: Replace with real BQ aggregation. Return lightweight shipments summary to populate cards.
    const rows = [];
    res.status(200).json({ meta: { total: rows.length, page, page_size }, rows });
  } catch (e) {
    console.error('search error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Company details per spec
app.get('/public/getCompanyDetails', async (req, res) => {
  try {
    const company_id = String(req.query?.company_id || '');
    if (!company_id) return res.status(400).json({ error: 'missing company_id' });
    res.status(200).json({
      company_id,
      name: 'Sample Inc',
      website: null,
      hq_city: null, hq_state: null, hq_country: null,
      kpis: { shipments_12m: 0, last_activity: null, top_route: null, top_carrier: null },
      plan_gates: { contacts: 'pro', notes: 'pro' },
    });
  } catch (e) {
    console.error('getCompanyDetails error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Company shipments per spec
app.get('/public/getCompanyShipments', async (req, res) => {
  try {
    const company_id = String(req.query?.company_id || '');
    if (!company_id) return res.status(400).json({ error: 'missing company_id' });
    res.status(200).json({ company_id, rows: [], source: 'primary' });
  } catch (e) {
    console.error('getCompanyShipments error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// CRM endpoints
app.post('/crm/saveCompany', async (req, res) => {
  try {
    const { company_id, stage = 'prospect' } = req.body || {};
    const user_id = req.headers['x-user-id'] || req.user_id || 'user';
    if (!user_id || !company_id) return res.status(400).json({ error: 'missing user_id or company_id' });
    res.status(200).json({ saved_id: 'placeholder', company_id, stage });
  } catch (e) {
    console.error('saveCompany error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/crm/savedCompanies', async (req, res) => {
  try {
    const stage = String(req.query?.stage || 'prospect');
    const user_id = req.headers['x-user-id'] || req.user_id || 'user';
    if (!user_id) return res.status(400).json({ error: 'missing user_id' });
    res.status(200).json({ rows: [] });
  } catch (e) {
    console.error('savedCompanies error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Campaigns list
app.get('/campaigns', async (req, res) => {
  try {
    const user_id = req.headers['x-user-id'] || req.user_id || 'user';
    if (!user_id) return res.status(400).json({ error: 'missing user_id' });
    res.status(200).json([]);
  } catch (e) {
    console.error('campaigns error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Stage update
app.patch('/crm/companyStage', async (req, res) => {
  try {
    const { company_id, stage } = req.body || {};
    const user_id = req.headers['x-user-id'] || req.user_id || 'user';
    if (!user_id || !company_id || !stage) return res.status(400).json({ error: 'missing user_id, company_id or stage' });
    res.status(200).json({ company_id, stage, updated: true });
  } catch (e) {
    console.error('companyStage error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`search-unified listening on port ${PORT}`);
});
