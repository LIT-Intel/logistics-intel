import { Router } from "express";
import { z } from "zod";
import { bq } from "../bq.js";

const r = Router();

const Body = z.object({
  company: z.string().trim().min(1).max(200),      // human label; we’ll normalize for matching
  name_norm: z.string().trim().max(240).optional(),// optional explicit normalized key
  mode: z.enum(["air","ocean"]).optional(),
  origin: z.string().trim().max(64).optional(),    // country code or name (normalized upper for country)
  dest: z.string().trim().max(64).optional(),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // inclusive
  endDate:   z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // inclusive
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

function normName(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

r.post("/public/companyShipments", async (req, res, next) => {
  try {
    const b = Body.parse(req.body ?? {});
    const key = b.name_norm ? b.name_norm : normName(b.company);

    const limit = Math.min(Number(b.limit ?? 25), 50);
    const offset = Number(b.offset ?? 0);

    // Normalize filters
    const modeNorm = b.mode ? String(b.mode).toUpperCase() : "";
    const originNorm = b.origin ? String(b.origin).toUpperCase() : "";
    const destNorm   = b.dest   ? String(b.dest).toUpperCase()   : "";

    // Default window: last 180d if no explicit dates
    const start = b.startDate ?? null;
    const end   = b.endDate   ?? null;

    const sql = `
WITH src AS (
  SELECT
    -- Normalize to match by display/party/consignee/shipper
    LOWER(REGEXP_REPLACE(COALESCE(company_name, party_name, consignee_name, shipper_name), r'\\s+', ' ')) AS name_norm,
    date,
    UPPER(mode) AS mode,
    UPPER(origin_country) AS origin_country,
    UPPER(dest_country)   AS dest_country,
    carrier,
    SAFE_CAST(teu AS FLOAT64) AS teu,
    hs_code
  FROM \`lit.shipments_daily_part\`
  WHERE 1=1
    AND ( @mode       = '' OR UPPER(mode) = @mode )
    AND ( @origin     = '' OR UPPER(origin_country) = @origin )
    AND ( @dest       = '' OR UPPER(dest_country)   = @dest )
    AND ( @start IS NULL OR date >= @start )
    AND ( @end   IS NULL OR date <= @end )
    AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) -- hard guardrail
),
filtered AS (
  SELECT *
  FROM src
  WHERE name_norm = @name_norm
),
paged AS (
  SELECT
    date, mode, origin_country, dest_country, carrier, teu, hs_code,
    COUNT(*) OVER() AS total_rows
  FROM filtered
  ORDER BY date DESC, origin_country, dest_country, carrier
  LIMIT @limit OFFSET @offset
)
SELECT * FROM paged
`;

    const params = {
      name_norm: key,
      mode: modeNorm,
      origin: originNorm,
      dest: destNorm,
      start: start, // strings in YYYY-MM-DD; BigQuery will coerce to DATE
      end: end,
      limit,
      offset,
    };

    const [rows] = await bq.query({ query: sql, params });
    const total = rows.length ? Number(rows[0].total_rows ?? 0) : 0;

    const items = rows.map((r: any) => ({
      date: r.date,                          // "YYYY-MM-DD"
      mode: r.mode ?? null,                  // "OCEAN"/"AIR"
      origin_country: r.origin_country ?? null,
      dest_country: r.dest_country ?? null,
      carrier: r.carrier ?? null,
      teu: r.teu ?? null,
      hs_code: r.hs_code ?? null,
    }));

    res.json({
      company: b.company,
      name_norm: key,
      total,
      items,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

export default r;
