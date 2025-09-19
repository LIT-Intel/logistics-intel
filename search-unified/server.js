// server.js — Logistic Intel (search-unified)
// Express API behind API Gateway → Cloud Run
// Uses BigQuery for search + filter options

const express = require('express');
const { BigQuery } = require('@google-cloud/bigquery');

const app = express();
app.use(express.json());

const bq = new BigQuery();
const BQ_LOCATION = process.env.BQ_LOCATION || 'US';

// Basic health
app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, service: 'search-unified' });
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
app.post('/public/getFilterOptions', async (req, res) => {
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
});

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

app.post('/search', async (req, res) => {
  try {
    const { page = 1, page_size = 24, q } = req.body;
    const offset = (page - 1) * page_size;

    const whereClauses = [];
    const params = {};

    if (q) {
      whereClauses.push(`ov.company_name LIKE @q`);
      params.q = `%${q}%`;
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
              ov.shipments_12m,
              ov.last_activity_date as last_activity,
              ov.top_route,
              ov.top_carrier
            ) as kpis
          FROM 
            logistics-intel.lit.v_company_overview_latest ov
          ${whereSql}
          ORDER BY ov.shipments_12m DESC
          LIMIT @page_size
          OFFSET @offset
        ) as rows
    `;

    const [job] = await bq.createQueryJob({
      query,
      params: { ...params, page_size, offset },
      location: BQ_LOCATION,
    });
    const [rows] = await job.getQueryResults();

    const result = rows[0];

    res.status(200).json({
      meta: {
        total: result.total,
        page: page,
        page_size: page_size,
      },
      rows: result.rows,
    });
  } catch (e) {
    console.error('/search error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`search-unified listening on port ${PORT}`);
});
