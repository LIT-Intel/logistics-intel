import express from "express";
import health from "./routes/health.js";
import getFilterOptions from "./routes/getFilterOptions.js";
import searchCompanies from "./routes/searchCompanies.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

// CORS for Gateway/browser
app.use((req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(health);
app.use(getFilterOptions);
app.use(searchCompanies);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: "internal_error", detail: String(err?.message || err) });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`search-unified listening on :${port}`));

