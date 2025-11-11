// server.js — Logistic Intel (search-unified)
console.log('Server.js loaded');
// Express API behind API Gateway → Cloud Run
// Uses BigQuery for search + filter options

const express = require('express');
const cors = require('cors');
const { BigQuery } = require('@google-cloud/bigquery');

// --- ImportYeti router (mounted at /public/iy) ---
const importyeti = require('./routes/importyeti');

console.log('search-unified: loading express and bigquery modules');

const app = express();
app.get('/healthz', (_req, res) => {
  console.log('Health check called');
  res.status(200).json({ ok: true, service: 'search-unified' });
});
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
      'GET  /healthz',
      'GET  /public/iy/searchShippers',
      'GET  /public/iy/companyBols',
      'GET  /public/iy/bol'
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

// -------- ImportYeti proxy mount (fixes 404) --------
app.use('/public/iy', importyeti);

// -------- Filter options (GET/POST) --------
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
    if (hs && Array.isArray(hs) && hs.length > 0) {
      whereClauses.push(
        `EXISTS (
           SELECT 1
           FROM UNNEST(ov.top_hs_list) AS h, UNNEST(@hs) AS hs_filter
           WHERE STARTS_WITH(h.hs_code, hs_filter)
         )`
      );
      params.hs = hs;
      types.hs = { type: 'ARRAY', arrayType: { type: 'STRING' } };
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

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

    const [job] = await bq.createQueryJob({
      query,
      params,
      types,
      location: BQ_LOCATION,
    });
    const [rows] = await job.getQueryResults();
    const result = rows[0];

    res.status(200).json({
      meta: { total: result?.total || 0, page, page_size: limit },
      rows: result?.companies || [],
    });
  } catch (e) {
    console.error('/public/searchCompanies error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// -------- Company details (placeholder) --------
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

// -------- Company shipments (placeholder) --------
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

// Feature flags
app.get('/crm/feature-flags', async (_req, res) => {
  res.status(200).json({
    'enable-shipment-search': true,
    'enable-crm': true
  });
});

// --- LIT Enrich demo endpoints ---
app.get('/crm/status', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.post('/crm/enrich', (req, res) => {
  const { company_id, domain } = req.body || {};
  if (!company_id || !domain) return res.status(400).json({ error: 'company_id and domain required' });
  res.json({ ok: true, company_id, enriched_at: new Date().toISOString() });
});

app.get('/crm/contacts', (_req, res) => {
  res.json({ rows: [] });
});

app.post('/crm/contacts/enrich', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  res.json({
    ok: true,
    contact: { id: `c_${Date.now()}`, name, source: 'LIT Enrich', status: 'active' }
  });
});

app.post('/crm/campaigns/addContact', (req, res) => {
  const { contact_id, company_id } = req.body || {};
  if (!contact_id || !company_id) return res.status(400).json({ error: 'contact_id and company_id required' });
  res.json({ ok: true, contact_id, company_id });
});

app.post('/crm/contacts/export', (_req, res) => {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 50 740 Td (Contacts Export) Tj ET
endstream endobj
xref 0 5
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000118 00000 n 
0000000222 00000 n 
trailer<</Root 1 0 R/Size 5>>
startxref
320
%%EOF`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.pdf"');
  res.send(pdf);
});
// --- end LIT Enrich block ---

// CRM list + stage update
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