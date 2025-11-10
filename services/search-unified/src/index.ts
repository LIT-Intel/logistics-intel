import express from "express";
import getFilterOptions from "./routes/getFilterOptions.js";
import searchCompanies from "./routes/searchCompanies.js";
import getCompanyShipments from "./routes/getCompanyShipments.js";
import companyShipments from "./routes/companyShipments.js";
import iyRoutes from "./routes/iy.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

// CORS for Gateway/browser (permissive; tighten later)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "content-type, x-api-key, authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/public/status", (_req, res) => {
  res.json({ ok: true, service: "search-unified" });
});

app.get("/", (_req, res) => {
  res.status(200).send("ok");
});

app.use(getFilterOptions);
app.use(searchCompanies);
app.use(getCompanyShipments);
app.use(companyShipments);
app.use("/public/iy", iyRoutes);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ ok: false, error: "internal_error", detail: err?.message ?? String(err) });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, "0.0.0.0", () => console.log(`search-unified listening on :${port}`));

export default app;

