import { Router } from "express";
import { z } from "zod";
import { bq } from "../bq.js";

const r = Router();

const Body = z.object({
  q: z.string().trim().max(120).optional(),
  mode: z.enum(["air","ocean"]).optional(),
  hs: z.union([z.string(), z.array(z.string())]).optional(),
  origin: z.array(z.string()).optional(),
  dest: z.array(z.string()).optional(),
  carrier: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

r.post("/public/searchCompanies", async (req, res, next) => {
  try {
    const body = Body.parse(req.body ?? {});

    const q = body.q ?? null;
    const limit = Math.min(Number(body.limit ?? 20), 50);
    const offset = Number(body.offset ?? 0);

    const sql = `
DECLARE q STRING DEFAULT @q;
DECLARE limit_int INT64 DEFAULT @limit;
DECLARE offset_int INT64 DEFAULT @offset;

WITH base AS (
  SELECT
    LOWER(REGEXP_REPLACE(COALESCE(company_name, party_name, consignee_name, shipper_name), r'\\s+', ' ')) AS name_norm,
    COALESCE(company_name, party_name, consignee_name, shipper_name) AS company_name_display,
    DATE AS date,
    SAFE_CAST(teu AS FLOAT64) AS teu,
    carrier AS carrier_raw,
    CONCAT(origin_country, '→', dest_country) AS route_raw
  FROM \`lit.shipments_daily_part\`
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
),
filtered AS (
  SELECT *
  FROM base
  WHERE name_norm IS NOT NULL AND name_norm <> ''
    AND (q IS NULL OR q = '' OR LOWER(company_name_display) LIKE CONCAT('%', LOWER(q), '%'))
),
agg AS (
  SELECT
    name_norm,
    ANY_VALUE(company_name_display) AS company_name,
    COUNT(*) AS shipments_12m,
    MAX(date) AS last_activity,
    SAFE_SUM(teu) AS total_teus,
    ARRAY(SELECT AS STRUCT route FROM UNNEST(ARRAY_AGG(route_raw)) route GROUP BY route ORDER BY COUNT(*) DESC LIMIT 3) AS top_routes,
    ARRAY(SELECT AS STRUCT carrier FROM UNNEST(ARRAY_AGG(carrier_raw)) carrier GROUP BY carrier ORDER BY COUNT(*) DESC LIMIT 3) AS top_carriers
  FROM filtered
  GROUP BY name_norm
)
SELECT
  TO_HEX(SHA256(name_norm)) AS company_id,
  company_name,
  shipments_12m,
  CAST(last_activity AS STRING) AS last_activity,
  top_routes,
  top_carriers
FROM agg
ORDER BY shipments_12m DESC
LIMIT limit_int OFFSET offset_int;
`;

    const [rows] = await bq.query({ query: sql, params: { q, limit, offset } });

    res.json({
      meta: {
        total: rows.length,
        page: Math.floor(offset / Math.max(limit, 1)) + 1,
        page_size: limit,
      },
      rows,
    });
  } catch (err) { next(err); }
});

export default r;
