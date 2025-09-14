import { Router } from "express";
import fetch from "node-fetch";

const router = Router();
const GATEWAY_BASE = process.env.GATEWAY_BASE!;
const SHARED_PROXY_TOKEN = process.env.SHARED_PROXY_TOKEN!;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

router.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.header("Access-Control-Allow-Headers", "authorization, x-lit-proxy-token, content-type, accept, apikey, x-client-info");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

async function forward(path: string, req: any, res: any) {
  const url = `${GATEWAY_BASE}${path}`;
  const r = await fetch(url, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      // inject the required proxy token server-side (kept secret)
      "x-lit-proxy-token": SHARED_PROXY_TOKEN,
      // optionally forward viewer auth if you add auth later
      // authorization: req.headers["authorization"] || "",
      // apikey: req.headers["apikey"] || "",
      // origin header not needed server→gateway
    },
    body: ["POST","PUT","PATCH"].includes(req.method) ? JSON.stringify(req.body || {}) : undefined,
  });

  const text = await r.text();
  res.status(r.status);
  // pass through JSON when possible
  try { res.type("application/json").send(JSON.parse(text)); }
  catch { res.send(text); }
}

router.post("/getFilterOptions", (req, res) => forward("/public/getFilterOptions", req, res));
router.post("/searchCompanies", (req, res) => forward("/public/searchCompanies", req, res));

export default router;

