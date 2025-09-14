import express from "express";
import health from "./routes/health.js";
import getFilterOptions from "./routes/getFilterOptions.js";
import searchCompanies from "./routes/searchCompanies.js";
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
// CORS for Gateway/browser (permissive; tighten later)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'content-type, x-api-key, authorization');
    if (req.method === 'OPTIONS')
        return res.status(204).end();
    next();
});
app.use(health);
// Back-compat healthz endpoint for Cloud Run checks
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'OK' }));
app.use(getFilterOptions);
app.use(searchCompanies);
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "internal_error", detail: String(err?.message || err) });
});
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`search-unified listening on :${port}`));
