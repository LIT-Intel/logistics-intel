import { Router } from "express";
import * as fs from 'fs';
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

    // --- PRD normalization (HS + case) ---
    const q = body.q ?? null;
    const limit = Math.min(Number(body.limit ?? 10), 50);
    const offset = Number(body.offset ?? 0);

    // mode/origin/dest normalization
    const modeNorm: string | null = body.mode ? String(body.mode).toUpperCase() : null;
    const originNorm: string[] = Array.isArray(body.origin)
      ? body.origin.map((c: unknown) => String(c ?? '').toUpperCase()).filter(Boolean)
      : body.origin ? [String(body.origin).toUpperCase()] : [];
    const destNorm: string[] = Array.isArray(body.dest)
      ? body.dest.map((c: unknown) => String(c ?? '').toUpperCase()).filter(Boolean)
      : body.dest ? [String(body.dest).toUpperCase()] : [];

    // HS normalization: accept string or array; digits only
    const hsInput: string[] = Array.isArray(body.hs)
      ? body.hs
      : (typeof body.hs === 'string' && body.hs.length ? [body.hs] : []);
    const hsDigits = hsInput.map((s) => String(s).replace(/\D/g, ''));

    // 4-digit prefixes and 6–10 exacts (both optional)
    const hs4: string[] = hsDigits.map((s) => s.slice(0, 4)).filter((s) => s.length === 4);
    const hsExact: string[] = hsDigits.filter((s) => s.length >= 6 && s.length <= 10);

    // Flags
    const hasMode  = !!modeNorm;
    const hasOrigin = Array.isArray(originNorm) && originNorm.length > 0;
    const hasDest   = Array.isArray(destNorm)   && destNorm.length   > 0;
    const hasHS4    = Array.isArray(hs4)        && hs4.length > 0;
    const hasHS     = Array.isArray(hsExact)    && hsExact.length > 0;

    // CSVs (avoid ARRAY param typing issues in BigQuery)
    const originCsv = hasOrigin ? originNorm.join(',') : '';   // e.g., "CN,TR"
    const destCsv   = hasDest   ? destNorm.join(',')   : '';   // e.g., "US,CA"
    const hs4Csv    = hasHS4    ? hs4.join(',')        : '';   // e.g., "8471,8504"
    const hsCsv     = hasHS     ? hsExact.join(',')    : '';   // e.g., "847130,850440"

    const sql = `
  WITH companies AS (
    SELECT
      company_id,
      company_name,
      COUNT(*) AS shipments_12m,
      MAX(date) AS last_activity,
      ARRAY_AGG(STRUCT(origin_country, dest_country) ORDER BY date DESC LIMIT 20) AS top_routes,
      ARRAY_AGG(STRUCT(carrier) ORDER BY date DESC LIMIT 20) AS top_carriers
    FROM `lit.shipments_daily_part`
    WHERE 1=1
      AND ( @has_mode  = FALSE OR UPPER(mode) = @mode)
      AND ( @has_origin = FALSE OR UPPER(origin_country) IN UNNEST(SPLIT( @origin_csv, ',')))
      AND ( @has_dest   = FALSE OR UPPER(dest_country)   IN UNNEST(SPLIT( @dest_csv,   ',')))
      AND (
        ( @has_hs4 = FALSE OR SUBSTR(hs_code,1,4) IN UNNEST(SPLIT( @hs4_csv, ',')))
        OR
        ( @has_hs  = FALSE OR hs_code             IN UNNEST(SPLIT( @hs_csv,  ',')))
      )
      ${q ? 'AND CONTAINS_SUBSTR(LOWER(company_name), LOWER( @q))' : ''}
      AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
    GROUP BY company_id, company_name
  ),
  shaped AS (
    SELECT
      c.*,
      /* FE-friendly arrays extracted from structs */
      ARRAY(
        SELECT DISTINCT r.origin_country FROM UNNEST(c.top_routes) r
        WHERE r.origin_country IS NOT NULL
        LIMIT 5
      ) AS origins_top,
      ARRAY(
        SELECT DISTINCT r.dest_country FROM UNNEST(c.top_routes) r
        WHERE r.dest_country IS NOT NULL
        LIMIT 5
      ) AS dests_top,
      ARRAY(
        SELECT DISTINCT x.carrier FROM UNNEST(c.top_carriers) x
        WHERE x.carrier IS NOT NULL
        LIMIT 5
      ) AS carriers_top
    FROM companies c
  )
  SELECT
    *, COUNT(*) OVER() AS total_rows
  FROM shaped
  ORDER BY shipments_12m DESC
  LIMIT @limit OFFSET @offset
`;

    const params = {
      q: q ?? '',
      mode: modeNorm ?? '',
      has_mode: hasMode,

      origin_csv: originCsv,  // STRING
      has_origin: hasOrigin,  // BOOL

      dest_csv: destCsv,      // STRING
      has_dest: hasDest,      // BOOL

      hs4_csv: hs4Csv,        // STRING
      has_hs4: hasHS4,        // BOOL

      hs_csv: hsCsv,          // STRING
      has_hs: hasHS,          // BOOL

      limit,
      offset,
    };

    const [rows] = await bq.query({ query: sql, params });
    const total = rows.length ? Number(rows[0].total_rows ?? 0) : 0;

    const items = rows.map((r: any) => ({
      company_id: r.company_id,
      company_name: r.company_name,

      // snake_case (existing)
      shipments_12m: Number(r.shipments_12m ?? 0),
      last_activity: r.last_activity,
      top_routes: r.top_routes ?? [],
      top_carriers: r.top_carriers ?? [],

      // arrays extracted for quick UI use
      origins_top: Array.isArray(r.origins_top) ? r.origins_top : [],
      dests_top: Array.isArray(r.dests_top) ? r.dests_top : [],
      carriers_top: Array.isArray(r.carriers_top) ? r.carriers_top : [],

      // camelCase mirrors (backward/forward compatible with FE)
      shipments12m: Number(r.shipments_12m ?? 0),
      lastActivity: r.last_activity ?? null,
      originsTop: Array.isArray(r.origins_top) ? r.origins_top : [],
      destsTop: Array.isArray(r.dests_top) ? r.dests_top : [],
      carriersTop: Array.isArray(r.carriers_top) ? r.carriers_top : [],
    }));

    res.json({ total, items });
  } catch (err) { next(err); }
});

export default r;
