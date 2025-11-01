import { Router } from "express";
import { z } from "zod";
import { bq } from "../bq.js";

const r = Router();

const Body = z.object({
  company: z.string().trim().min(1).max(160),
  name_norm: z.string().trim().max(200).optional(),
  month: z.string().trim().regex(/^\d{4}-\d{2}-01$/).optional(), // YYYY-MM-01
  origin: z.string().trim().optional(),
  dest: z.string().trim().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

function normName(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

r.post("/public/companyLanes", async (req, res, next) => {
  try {
    const b = Body.parse(req.body ?? {});
    const limit  = Math.min(Number(b.limit  ?? 10), 50);
    const offset = Number(b.offset ?? 0);

    const key = (b.name_norm && b.name_norm.trim().length) ? b.name_norm.trim() : normName(b.company);
    const month_str = (b.month && b.month.length) ? b.month : "0001-01-01"; // sentinel => auto-latest

    const sql = `
      WITH pick_month AS (
        SELECT CASE
          WHEN @month_str = '0001-01-01' THEN (
            SELECT MAX(month)
            FROM \`logistics-intel.lit_ingest.company_lanes_by_month\`
            WHERE name_norm = @key
          )
          ELSE SAFE_CAST(@month_str AS DATE)
        END AS m
      )
      SELECT
        CAST(l.month AS STRING) AS month,
        l.origin_label,
        l.dest_label,
        l.shipments,
        l.teu,
        l.value_usd,
        COUNT(*) OVER() AS total_rows
      FROM \`logistics-intel.lit_ingest.company_lanes_by_month\` l
      CROSS JOIN pick_month pm
      WHERE l.name_norm = @key
        AND l.month = pm.m
        AND (@origin IS NULL OR @origin = '' OR l.origin_label = @origin)
        AND (@dest   IS NULL OR @dest   = '' OR l.dest_label   = @dest)
      ORDER BY l.shipments DESC
      LIMIT @limit OFFSET @offset
    `;

    const params = {
      key,
      month_str,
      origin: b.origin ?? '',
      dest: b.dest ?? '',
      limit,
      offset,
    };

    const [rows] = await bq.query({ query: sql, params });

    res.json({
      company: b.company,
      name_norm: key,
      month: rows?.[0]?.month ?? (b.month ?? null),
      total: rows?.[0]?.total_rows ? Number(rows[0].total_rows) : (rows?.length ?? 0),
      items: (rows ?? []).map((r: any) => ({
        month: r.month,
        origin_label: r.origin_label,
        dest_label: r.dest_label,
        shipments: Number(r.shipments ?? 0),
        teu: Number(r.teu ?? 0),
        value_usd: Number(r.value_usd ?? 0),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default r;
