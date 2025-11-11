const express = require('express');
const router = express.Router();
const axios = require('axios');

const { BigQuery } = require('@google-cloud/bigquery');
const bq = new BigQuery();
const BQ_LOCATION = process.env.BQ_LOCATION || 'US';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

function htmlEscape(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function renderSingleQuoteHTML(payload) {
  const {
    company = {},
    requester = {},
    meta = {},
    service = 'AIRFREIGHT',
    charges = [],
    totals = {},
    brand = {}
  } = payload || {};
  const logo = brand.logo_url
    ? `<img src="${htmlEscape(brand.logo_url)}" style="height:36px;"/>`
    : `<div style="font-weight:700;">${htmlEscape(brand.company_name || 'Your Company')}</div>`;
  const chargeRows = (charges || []).map(c => `
    <tr><td>${htmlEscape(c.label)}</td><td style="text-align:right;">${htmlEscape(c.currency || 'USD')} ${Number(c.amount || 0).toFixed(2)}</td></tr>
  `).join('');
  return `
<!doctype html><html><head><meta charset="utf-8"/>
<style>
body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:24px;}
.card{border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04);padding:20px;margin-bottom:16px;}
.h{font-weight:600}
.sub{color:#64748b;font-size:12px}
.table{width:100%;border-collapse:collapse;margin-top:8px}
.table td,.table th{border-bottom:1px solid #e2e8f0;padding:8px}
.kpi{display:flex;gap:16px;margin-top:8px}
.kpill{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:8px 12px;font-size:12px}
.total{font-weight:700}
.badge{display:inline-block;border-radius:999px;background:#eef2ff;color:#3730a3;padding:2px 8px;font-size:12px;font-weight:600}
</style></head><body>
<div class="card" style="display:flex;justify-content:space-between;align-items:center;">
  <div>${logo}</div>
  <div style="text-align:right">
    <div class="h">Quote</div>
    <div class="sub">Created ${new Date().toISOString()}</div>
  </div>
</div>
<div class="card">
  <div class="h" style="display:flex;align-items:center;gap:8px;">Service <span class="badge">${htmlEscape(service)}</span></div>
  <div class="kpi">
    <div class="kpill">Company: ${htmlEscape(company.name || '')}</div>
    <div class="kpill">Requested by: ${htmlEscape(requester.name || '')}</div>
    <div class="kpill">Lane: ${htmlEscape(meta.origin || '–')} → ${htmlEscape(meta.destination || '–')}</div>
  </div>
</div>
<div class="card">
  <div class="h">Charges</div>
  <table class="table">
    <tbody>${chargeRows}</tbody>
    <tfoot>
      <tr><td class="total">Total</td><td class="total" style="text-align:right;">${htmlEscape(totals.currency || 'USD')} ${Number(totals.grand || 0).toFixed(2)}</td></tr>
    </tfoot>
  </table>
</div>
</body></html>`;
}

function renderAnnualHTML(payload) {
  const { brand = {}, company = {}, lanes = [], kpis = {}, currency = 'USD' } = payload || {};
  const logo = brand.logo_url
    ? `<img src="${htmlEscape(brand.logo_url)}" style="height:36px;"/>`
    : `<div style="font-weight:700;">${htmlEscape(brand.company_name || 'Your Company')}</div>`;
  const laneRows = (lanes || []).map(l => `
    <tr>
      <td>${htmlEscape(l.mode || '')}</td>
      <td>${htmlEscape(l.origin || '')}</td>
      <td>${htmlEscape(l.destination || '')}</td>
      <td style="text-align:right;">${htmlEscape(currency)} ${Number(l.rate_per_unit || 0).toFixed(2)}</td>
      <td style="text-align:right;">${Number(l.forecast_units || 0)}</td>
      <td style="text-align:right;">${htmlEscape(currency)} ${Number(l.annual_cost || 0).toFixed(2)}</td>
    </tr>
  `).join('');
  return `
<!doctype html><html><head><meta charset="utf-8"/>
<style>
body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:24px;}
.card{border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04);padding:20px;margin-bottom:16px;}
.h{font-weight:600}
.sub{color:#64748b;font-size:12px}
.table{width:100%;border-collapse:collapse;margin-top:8px}
.table td,.table th{border-bottom:1px solid #e2e8f0;padding:8px}
.kpi{display:flex;gap:16px;margin-top:8px;flex-wrap:wrap}
.kpill{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:8px 12px;font-size:12px}
.total{font-weight:700}
</style></head><body>
<div class="card" style="display:flex;justify-content:space-between;align-items:center;">
  <div>${logo}</div>
  <div style="text-align:right">
    <div class="h">Annual RFP</div>
    <div class="sub">Prepared ${new Date().toISOString()}</div>
  </div>
</div>
<div class="card">
  <div class="h">Company</div>
  <div class="kpi">
    <div class="kpill">Name: ${htmlEscape(company.name || '')}</div>
    <div class="kpill">Shipments (12m): ${Number(kpis.shipments_12m || 0)}</div>
    <div class="kpill">Projected savings: ${htmlEscape(kpis.savings_pct != null ? String(kpis.savings_pct) + '%' : '—')}</div>
  </div>
</div>
<div class="card">
  <div class="h">Lanes</div>
  <table class="table">
    <thead><tr><th>Mode</th><th>Origin</th><th>Destination</th><th style="text-align:right;">Rate/Unit</th><th style="text-align:right;">Forecast Units</th><th style="text-align:right;">Annual Cost</th></tr></thead>
    <tbody>${laneRows}</tbody>
  </table>
</div>
</body></html>`;
}

router.get('/health', (_req, res) => res.json({ ok: true, service: 'rfp' }));

router.post('/quote-html', async (req, res) => {
  const html = renderSingleQuoteHTML(req.body || {});
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
});

router.post('/annual-html', async (req, res) => {
  const html = renderAnnualHTML(req.body || {});
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
});

router.get('/export.csv', async (req, res) => {
  const rows = Array.isArray(req.query.rows) ? req.query.rows : [];
  const head = ['mode', 'origin', 'destination', 'rate_per_unit', 'forecast_units', 'annual_cost'];
  const csv = [head.join(',')].concat(rows.map(r => [
    r.mode || '', r.origin || '', r.destination || '',
    Number(r.rate_per_unit || 0), Number(r.forecast_units || 0), Number(r.annual_cost || 0)
  ].join(','))).join('\\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=\"rfp.csv\"');
  res.status(200).send(csv);
});

router.post('/email', async (req, res) => {
  try {
    if (!RESEND_API_KEY) return res.status(200).json({ ok: true, emailed: false, reason: 'RESEND_API_KEY not set' });
    const { to, subject, html } = req.body || {};
    if (!to || !subject || !html) return res.status(400).json({ error: 'to, subject, html required' });
    const r = await axios.post('https://api.resend.com/emails', {
      from: req.body.from || 'rfp@logistics-intel.app',
      to: [to],
      subject,
      html
    }, { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } });
    res.json({ ok: true, id: r.data?.id || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post('/save', async (_req, res) => {
  const id = `rfp_${Date.now()}`;
  res.json({ ok: true, id });
});

module.exports = router;
