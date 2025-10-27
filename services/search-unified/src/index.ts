import express from "express";
import health from "./routes/health.js";
import getFilterOptions from "./routes/getFilterOptions.js";
import searchCompanies from "./routes/searchCompanies.js";
import getCompanyShipments from "./routes/getCompanyShipments.js";
import companyShipments from "./routes/companyShipments.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

// CORS for Gateway/browser (permissive; tighten later)
app.use((req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'content-type, x-api-key, authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// app.use(health);
// --- lightweight health + status (safe to keep permanently)
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/public/status', (_req, res) => {
  res.json({ ok: true, service: 'search-unified' });
});

// Some infra ping "/" — make it 200 too
app.get('/', (_req, res) => {
  res.status(200).send('ok');
});
app.use(getFilterOptions);
app.use(searchCompanies);
app.use(getCompanyShipments);
app.use(companyShipments);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: "internal_error", detail: String(err?.message || err) });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => console.log(`search-unified listening on :${port}`));

export default app;

