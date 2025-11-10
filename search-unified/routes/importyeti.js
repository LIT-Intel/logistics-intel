const express = require('express');
const router = express.Router();

const IY_API_KEY = process.env.IY_API_KEY || "";
const URL_SEARCH  = process.env.IY_DMA_SEARCH_URL     || "https://data.importyeti.com/v1.0/search/shippers";
const URL_BOLS    = process.env.IY_DMA_BOLS_URL       || "https://data.importyeti.com/v1.0/company/bols";
const URL_BOL_ONE = process.env.IY_DMA_BOL_LOOKUP_URL || "https://data.importyeti.com/v1.0/bol";

async function proxyGet(res, url, params) {
  if (!IY_API_KEY) {
    return res.status(500).json({ ok:false, error:"Missing IY_API_KEY env" });
  }
  const qstr = new URLSearchParams(params).toString();
  const resp = await fetch(`${url}?${qstr}`, {
    headers: { "x-api-key": IY_API_KEY, "accept": "application/json" }
  });
  const text = await resp.text();
  // Try JSON first; fall back to raw text for debugging
  try {
    const json = JSON.parse(text);
    return res.status(resp.status).json(json);
  } catch {
    return res.status(resp.status).send(text);
  }
}

// GET /public/iy/searchShippers?q=ACME&page=1
router.get('/searchShippers', async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const page = parseInt(String(req.query.page || "1"), 10) || 1;
    if (!q) return res.status(400).json({ ok:false, error:"q required" });
    await proxyGet(res, URL_SEARCH, { q, page });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// GET /public/iy/companyBols?company_id=SLUG_OR_KEY&page=1
router.get('/companyBols', async (req, res) => {
  try {
    const company_id = String(req.query.company_id || "").trim();
    const page = parseInt(String(req.query.page || "1"), 10) || 1;
    if (!company_id) return res.status(400).json({ ok:false, error:"company_id required" });
    await proxyGet(res, URL_BOLS, { company_id, page });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// GET /public/iy/bol?number=XXXX
router.get('/bol', async (req, res) => {
  try {
    const number = String(req.query.number || "").trim();
    if (!number) return res.status(400).json({ ok:false, error:"number required" });
    await proxyGet(res, URL_BOL_ONE, { number });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

module.exports = router;
