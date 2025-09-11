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

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`search-unified listening on port ${PORT}`);
});
