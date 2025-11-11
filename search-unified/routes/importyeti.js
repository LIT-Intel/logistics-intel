// search-unified/routes/importyeti.js
const express = require('express');
const fetch = require('node-fetch');

const router = express.Router();

const IY_API_KEY = process.env.IY_API_KEY || process.env.IYApiKey || '';
const URL_SEARCH  = process.env.IY_DMA_SEARCH_URL      || 'https://data.importyeti.com/v1.0/search/shippers';
const URL_BOLS    = process.env.IY_DMA_BOLS_URL        || 'https://data.importyeti.com/v1.0/company/bols';
const URL_BOL_ONE = process.env.IY_DMA_BOL_LOOKUP_URL  || 'https://data.importyeti.com/v1.0/bol';

function required(v, name) {
  if (!v) throw new Error(`missing required param: ${name}`);
}

async function proxyGet(res, url) {
  const r = await fetch(url, { headers: { 'X-API-KEY': IY_API_KEY } });
  const ct = r.headers.get('content-type') || '';
  const body = await r.text();
  // Try to pass through JSON when possible
  if (ct.includes('application/json')) {
    res.status(r.status).type('application/json').send(body);
  } else {
    // fall back (some endpoints are text/csv occasionally)
    res.status(r.status).type('application/json').send(body);
  }
}

// GET /public/iy/searchShippers?q=NAME&page=1
router.get('/searchShippers', async (req, res) => {
  try {
    required(IY_API_KEY, 'IY_API_KEY');
    const q = String(req.query.q || '').trim();
    required(q, 'q');
    const page = Number(req.query.page || 1);
    const url = `${URL_SEARCH}?q=${encodeURIComponent(q)}&page=${page}`;
    await proxyGet(res, url);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /public/iy/companyBols?company_id=ID&page=1
router.get('/companyBols', async (req, res) => {
  try {
    required(IY_API_KEY, 'IY_API_KEY');
    const company_id = String(req.query.company_id || '').trim();
    required(company_id, 'company_id');
    const page = Number(req.query.page || 1);
    const url = `${URL_BOLS}?company_id=${encodeURIComponent(company_id)}&page=${page}`;
    await proxyGet(res, url);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /public/iy/bol?number=BOLNUMBER
router.get('/bol', async (req, res) => {
  try {
    required(IY_API_KEY, 'IY_API_KEY');
    const number = String(req.query.number || '').trim();
    required(number, 'number');
    const url = `${URL_BOL_ONE}?number=${encodeURIComponent(number)}`;
    await proxyGet(res, url);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

module.exports = router;