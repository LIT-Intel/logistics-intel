// server.js — Logistic Intel (search-unified)
console.log('Server.js loaded');
// Express API behind API Gateway → Cloud Run
// Uses BigQuery for search + filter options

const express = require('express');
const cors = require('cors');
const { BigQuery } = require('@google-cloud/bigquery');

console.log('search-unified: loading express and bigquery modules');

const app = express();
app.get('/healthz', (_req, res) => { console.log('Health check called'); res.status(200).json({ ok: true, service: 'search-unified' }); });
app.use(express.json());
app.use(cors());

let bq;
try {
  console.log('search-unified: initializing BigQuery client');
  bq = new BigQuery();
  console.log('search-unified: BigQuery client initialized successfully');
} catch (e) {
  console.error('search-unified: FATAL: failed to initialize BigQuery client', e);
  process.exit(1);
}

const BQ_LOCATION = process.env.BQ_LOCATION || 'US';

// Basic health & index listing
app.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'search-unified',
    routes: [
      'POST /public/searchCompanies',
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
      FROM 
      logistics-intel.lit.v_shipments_normalized
      ${where}
      AND mode IS NOT NULL AND mode != ''
      ORDER BY mode`;
    const qOrigins = `
      SELECT DISTINCT UPPER(origin_country) AS origin_country
      FROM 
      logistics-intel.lit.v_shipments_normalized
      ${where}
      AND origin_country IS NOT NULL AND origin_country != ''
      ORDER BY origin_country`;
    const qDests = `
      SELECT DISTINCT UPPER(dest_country) AS dest_country
      FROM 
      logistics-intel.lit.v_shipments_normalized
      ${where}
      AND dest_country IS NOT NULL AND dest_country != ''
      ORDER BY dest_country`;
    const qRange = `
      SELECT MIN(date) AS date_min, MAX(date) AS date_max
      FROM 
      logistics-intel.lit.v_shipments_normalized
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
      FROM 
      logistics-intel.lit.v_shipments_normalized
      ${where}
      AND mode IS NOT NULL AND mode != ''
      ORDER BY mode
    `;
    const qOrigins = `
      SELECT DISTINCT UPPER(origin_country) AS origin_country
      FROM 
      logistics-intel.lit.v_shipments_normalized
      ${where}
      AND origin_country IS NOT NULL AND origin_country != ''
      ORDER BY origin_country
    `;
    const qDests = `
      SELECT DISTINCT UPPER(dest_country) AS dest_country
      FROM 
      logistics-intel.lit.v_shipments_normalized
      ${where}
      AND dest_country IS NOT NULL AND dest_country != ''
      ORDER BY dest_country
    `;
    const qRange = `
      SELECT MIN(date) AS date_min, MAX(date) AS date_max
      FROM 
      logistics-intel.lit.v_shipments_normalized
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

app.post('/public/searchCompanies', async (req, res) => {
  try {
    const { page = 1, limit = 24, q, hs } = req.body;
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const params = {};

    if (q) {
      whereClauses.push(`ov.company_name LIKE @q`);
      params.q = `%${q}%`;
    }
    if (hs && hs.length > 0) {
      whereClauses.push(`EXISTS (SELECT 1 FROM UNNEST(ov.top_hs_list) as h, UNNEST(@hs) as hs_filter WHERE STARTS_WITH(h.hs_code, hs_filter))`);
      params.hs = hs;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT
        (SELECT COUNT(*) FROM 
          logistics-intel.lit.v_company_overview_latest ov ${whereSql}) as total,
        ARRAY(
          SELECT AS STRUCT
            ov.company_id,
            ov.company_name as name,
            STRUCT(
              ov.total_shipments_12m as shipments_12m,
              ov.last_seen_12m as last_activity
            ) as kpis
          FROM 
            logistics-intel.lit.v_company_overview_latest ov
          ${whereSql}
          ORDER BY ov.total_shipments_12m DESC
          LIMIT @limit
          OFFSET @offset
        ) as companies
    `;

    const [job] = await bq.createQueryJob({
      query,
      params: { ...params, limit, offset },
      location: BQ_LOCATION,
    });
    const [rows] = await job.getQueryResults();

    const result = rows[0];

    res.status(200).json({
      meta: {
        total: result.total,
        page: page,
        page_size: limit,
      },
      rows: result.companies,
    });
  } catch (e) {
    console.error('/search error:', e);
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
  }
  catch (e) {
    console.error('getCompanyShipments error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/crm/feature-flags', async (req, res) => {
  res.status(200).json({
    "enable-shipment-search": true,
    "enable-crm": true
  });
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

app.get('/public/dashboard/summary', async (req, res) => {
  res.status(200).json({
    total_shipments: 12345,
    total_value_usd: 67890,
    top_lanes: [
      { origin: 'CN', destination: 'US', shipments: 123 },
      { origin: 'US', destination: 'CN', shipments: 100 },
    ],
  });
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
  console.log(`search-unified: server listening on port ${PORT}`);
});