const express = require('express');
const axios = require('axios');

const router = express.Router();

// Absolute upstream URLs (fallbacks included)
const SEARCH_URL = process.env.IY_DMA_SEARCH_URL      || 'https://data.importyeti.com/v1.0/search/shippers';
const BOLS_URL   = process.env.IY_DMA_BOLS_URL        || 'https://data.importyeti.com/v1.0/company/bols';
const BOL_URL    = process.env.IY_DMA_BOL_LOOKUP_URL  || 'https://data.importyeti.com/v1.0/bol';

// API key from either env (both names supported)
const API_KEY = process.env.IY_API_KEY || process.env.IYApiKey || '';

// Send key both ways to be safe (some DMA deployments expect header, some query)
function withAuth(url, query = {}) {
  const params = { ...query };
  if (API_KEY) params.api_key = API_KEY;
  const headers = API_KEY ? { 'Authorization': `Bearer ${API_KEY}`, 'x-api-key': API_KEY } : {};
  return { url, params, headers };
}

router.get('/searchShippers', async (req, res) => {
  try {
    const { q, page = 1 } = req.query || {};
    if (!q) return res.status(400).json({ error: 'missing q' });

    const reqCfg = withAuth(SEARCH_URL, { q, page });
    const r = await axios.get(reqCfg.url, { params: reqCfg.params, headers: reqCfg.headers, timeout: 15000 });
    res.status(200).json(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    res.status(status).json({
      error: e.response?.data || String(e.message || e),
      upstream: SEARCH_URL
    });
  }
});

router.get('/companyBols', async (req, res) => {
  try {
    const { company_id, page = 1 } = req.query || {};
    if (!company_id) return res.status(400).json({ error: 'missing company_id' });

    const reqCfg = withAuth(BOLS_URL, { company_id, page });
    const r = await axios.get(reqCfg.url, { params: reqCfg.params, headers: reqCfg.headers, timeout: 15000 });
    res.status(200).json(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    res.status(status).json({
      error: e.response?.data || String(e.message || e),
      upstream: BOLS_URL
    });
  }
});

router.get('/bol', async (req, res) => {
  try {
    const { number } = req.query || {};
    if (!number) return res.status(400).json({ error: 'missing number' });

    const reqCfg = withAuth(BOL_URL, { number });
    const r = await axios.get(reqCfg.url, { params: reqCfg.params, headers: reqCfg.headers, timeout: 15000 });
    res.status(200).json(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    res.status(status).json({
      error: e.response?.data || String(e.message || e),
      upstream: BOL_URL
    });
  }
});

module.exports = router;
