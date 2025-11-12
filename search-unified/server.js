// server.js — Logistics-Intel (search-unified)
console.log('Server.js loaded');

const express = require('express');
const cors = require('cors');
const { BigQuery } = require('@google-cloud/bigquery');

// ImportYeti router
const importyeti = require('./routes/importyeti');
// --- RFP router (mounted at /rfp) ---
const rfp = require('./routes/rfp');

const app = express();
app.use(express.json());
app.use(cors());

// Health first (fast path)
app.get('/healthz', (_req, res) =>
  res.status(200).json({ ok: true, service: 'search-unified' })
);

<<<<<<< HEAD
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
      'GET  /healthz',
      'GET  /public/iy/searchShippers',
      'GET  /public/iy/companyBols',
      'GET  /public/iy/bol',
      'GET  /rfp/health',
      'POST /rfp/quote-html',
      'POST /rfp/annual-html',
      'GET  /rfp/export.csv',
      'POST /rfp/email',
      'POST /rfp/save'
    ]
  });
});

// CORS (lenient; Gateway usually fronts this, but safe to include)
=======
// CORS hardening (Gateway also sets CORS; keeping permissive here is fine)
>>>>>>> 86543b4c (fix(iy): use absolute DMA URLs + key; ensure router mount)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, x-client-info, apikey, content-type, x-lit-proxy-token'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

<<<<<<< HEAD
// -------- ImportYeti proxy mount (fixes 404) --------
app.use('/public/iy', importyeti);
// -------- RFP workspace backend --------
app.use('/rfp', rfp);
=======
// --- BigQuery client ---
let bq;
try {
  bq = new BigQuery();
  console.log('search-unified: BigQuery client initialized');
} catch (e) {
  console.error('search-unified: FATAL BigQuery init', e);
  process.exit(1);
}
const BQ_LOCATION = process.env.BQ_LOCATION || 'US';
>>>>>>> 86543b4c (fix(iy): use absolute DMA URLs + key; ensure router mount)

// --- Index route (helps quickly verify what’s mounted) ---
app.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'search-unified',
    routes: [
      'GET  /healthz',
      'GET  /public/getFilterOptions',
      'POST /public/getFilterOptions',
      'POST /public/searchCompanies',
      'GET  /public/getCompanyDetails',
      'GET  /public/getCompanyShipments',
      'GET  /public/iy/searchShippers',
      'GET  /public/iy/companyBols',
      'GET  /public/iy/bol',
      'GET  /crm/feature-flags',
      'GET  /campaigns'
    ]
  });
});

// -------- Filter options (single, clean implementation) --------
async function handleGetFilterOptions(_req, res) {
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
      bq.query({ query: qRange,   location: BQ_LOCATION })
    ]);

    res.status(200).json({
      modes:        (modes   || []).map(r => r.mode).filter(Boolean),
      origins:      (origins || []).map(r => r.origin_country).filter(Boolean),
      destinations: (dests   || []).map(r => r.dest_country).filter(Boolean),
      date_min:     rng?.[0]?.date_min || null,
      date_max:     rng?.[0]?.date_max || null
    });
  } catch (e) {
    console.error('public/getFilterOptions error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
app.post('/public/getFilterOptions', handleGetFilterOptions);
app.get('/public/getFilterOptions', handleGetFilterOptions);

// -------- Company search (BigQuery) --------
app.post('/public/searchCompanies', async (req, res) => {
  try {
    const { page = 1, limit = 24, q, hs } = req.body || {};
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const params = { limit, offset };
    const types = { limit: 'INT64', offset: 'INT64' };

    if (q) {
      whereClauses.push(`ov.company_name LIKE @q`);
      params.q = `%${q}%`;
      types.q = 'STRING';
    }
    if (hs && hs.length > 0) {
      whereClauses.push(`
        EXISTS (
          SELECT 1
          FROM UNNEST(ov.top_hs_list) AS h, UNNEST(@hs) AS hs_filter
          WHERE STARTS_WITH(h.hs_code, hs_filter)
        )`);
      params.hs = hs;
      types.hs = { type: 'ARRAY', arrayType: { type: 'STRING' } };
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT
        (SELECT COUNT(*) FROM \`logistics-intel.lit.v_company_overview_latest\` ov ${whereSql}) AS total,
        ARRAY(
          SELECT AS STRUCT
            ov.company_id,
            ov.company_name AS name,
            STRUCT(
              ov.total_shipments_12m AS shipments_12m,
              NULL AS last_activity
            ) AS kpis
          FROM \`logistics-intel.lit.v_company_overview_latest\` ov
          ${whereSql}
          ORDER BY ov.total_shipments_12m DESC
          LIMIT @limit
          OFFSET @offset
        ) AS companies
    `;

    const [job] = await bq.createQueryJob({ query, params, types, location: BQ_LOCATION });
    const [rows] = await job.getQueryResults();
    const r = rows[0];

    res.status(200).json({
      meta: { total: r.total, page, page_size: limit },
      rows: r.companies
    });
  } catch (e) {
    console.error('/public/searchCompanies error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// -------- Company details/shipments placeholders --------
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
      plan_gates: { contacts: 'pro', notes: 'pro' }
    });
  } catch (e) {
    console.error('getCompanyDetails error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

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

// -------- CRM / campaigns (placeholders) --------
app.get('/crm/feature-flags', (_req, res) =>
  res.status(200).json({ 'enable-shipment-search': true, 'enable-crm': true })
);
app.get('/crm/status', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/campaigns', (_req, res) => res.status(200).json([]));

// -------- ImportYeti router mounted under /public/iy --------
app.use('/public/iy', importyeti);

// -------- Start server --------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`search-unified: listening on ${PORT}`);
});
