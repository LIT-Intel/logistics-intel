import { Router } from "express";
import { bq, table, lookbackWhere } from "../bq.js";

let cached: { ts: number; payload: any } | null = null;
const TTL_MS = 60_000;

const r = Router();

// CORS preflight just for this route (explicit headers)
r.options('/public/getFilterOptions', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-api-key'
  });
  return res.status(204).end();
});

async function handleGet(req: any, res: any, next: any) {
  try {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-api-key'
    });

    if (cached && Date.now() - cached.ts < TTL_MS) {
      return res.status(200).json(cached.payload);
    }

    const days = Number(req.query.days || 180);
    const where = lookbackWhere("snapshot_date", days);
    const t = table("shipments_daily_part");

    const [[dateBounds]] = await bq.query({
      query: `SELECT MIN(snapshot_date) AS date_min, MAX(snapshot_date) AS date_max FROM ${t} WHERE ${where}`,
      location: 'US',
    });

    const [modesRows] = await bq.query({
      query: `SELECT mode, COUNT(*) c FROM ${t} WHERE ${where} AND mode IS NOT NULL GROUP BY mode ORDER BY c DESC`,
      location: "US",
    });
    const [originsRows] = await bq.query({
      query: `SELECT origin_country AS code, COUNT(*) c FROM ${t} WHERE ${where} AND origin_country IS NOT NULL GROUP BY code ORDER BY c DESC`,
      location: "US",
    });
    const [destsRows] = await bq.query({
      query: `SELECT dest_country AS code, COUNT(*) c FROM ${t} WHERE ${where} AND dest_country IS NOT NULL GROUP BY code ORDER BY c DESC`,
      location: "US",
    });
    const [carriersRows] = await bq.query({
      query: `SELECT carrier, COUNT(*) c FROM ${t} WHERE ${where} AND carrier IS NOT NULL GROUP BY carrier ORDER BY c DESC LIMIT 200`,
      location: "US",
    });
    const [hsPrefixRows] = await bq.query({
      query: `SELECT SUBSTR(hs_code,1,4) AS hs_prefix, COUNT(*) c FROM ${t} WHERE ${where} AND hs_code IS NOT NULL GROUP BY hs_prefix ORDER BY c DESC LIMIT 200`,
      location: "US",
    });

    const payload = {
      modes: (modesRows as any[]).map(r => r.mode).filter(Boolean),
      origin_countries: (originsRows as any[]).map(r => r.code).filter(Boolean),
      destination_countries: (destsRows as any[]).map(r => r.code).filter(Boolean),
      carriers: (carriersRows as any[]).map(r => r.carrier).filter(Boolean),
      hs_prefixes: (hsPrefixRows as any[]).map(r => r.hs_prefix).filter(Boolean),
      date_min: (dateBounds as any)?.date_min ?? null,
      date_max: (dateBounds as any)?.date_max ?? null,
      value_buckets: [
        { min: 0, max: 10000 },
        { min: 10000, max: 50000 },
        { min: 50000, max: 100000 },
        { min: 100000, max: 1000000 },
        { min: 1000000, max: null },
      ],
    };

    cached = { ts: Date.now(), payload };
    return res.status(200).json(payload);
  } catch (err) {
    try {
      // Fallback: use company_overview_daily_part for modes/countries/dates; keep other arrays safe
      const t2 = table("company_overview_daily_part");
      const where2 = lookbackWhere("snapshot_date", Number(req.query.days || 180));
      const [[dateBounds2]] = await bq.query({
        query: `SELECT MIN(snapshot_date) AS date_min, MAX(snapshot_date) AS date_max FROM ${t2} WHERE ${where2}`,
        location: 'US',
      });
      const [modes2Rows] = await bq.query({
        query: `SELECT mode, COUNT(*) c FROM ${t2} WHERE ${where2} AND mode IS NOT NULL GROUP BY mode ORDER BY c DESC`,
        location: "US",
      });
      const [origins2Rows] = await bq.query({
        query: `SELECT origin_country AS code, COUNT(*) c FROM ${t2} WHERE ${where2} AND origin_country IS NOT NULL GROUP BY code ORDER BY c DESC`,
        location: "US",
      });
      const [dests2Rows] = await bq.query({
        query: `SELECT dest_country AS code, COUNT(*) c FROM ${t2} WHERE ${where2} AND dest_country IS NOT NULL GROUP BY code ORDER BY c DESC`,
        location: "US",
      });

      const payload = {
        modes: (modes2Rows as any[]).map(r => r.mode).filter(Boolean),
        origin_countries: (origins2Rows as any[]).map(r => r.code).filter(Boolean),
        destination_countries: (dests2Rows as any[]).map(r => r.code).filter(Boolean),
        carriers: [],
        hs_prefixes: [],
        date_min: (dateBounds2 as any)?.date_min ?? null,
        date_max: (dateBounds2 as any)?.date_max ?? null,
        value_buckets: [
          { min: 0, max: 10000 },
          { min: 10000, max: 50000 },
          { min: 50000, max: 100000 },
          { min: 100000, max: 1000000 },
          { min: 1000000, max: null },
        ],
      };
      cached = { ts: Date.now(), payload };
      return res.status(200).json(payload);
    } catch (fallbackErr) {
      console.error(fallbackErr);
      // Final fallback: static safe defaults
      const payload = {
        modes: ['air','ocean'],
        origin_countries: [],
        destination_countries: [],
        carriers: [],
        hs_prefixes: [],
        date_min: null,
        date_max: null,
        value_buckets: [
          { min: 0, max: 10000 },
          { min: 10000, max: 50000 },
          { min: 50000, max: 100000 },
          { min: 100000, max: 1000000 },
          { min: 1000000, max: null },
        ],
      };
      cached = { ts: Date.now(), payload };
      return res.status(200).json(payload);
    }
  }
}

r.get("/public/getFilterOptions", handleGet);
r.post("/public/getFilterOptions", handleGet);

export default r;
