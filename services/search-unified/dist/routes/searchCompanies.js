import { Router } from "express";
import { z } from "zod";
import { bq, table, lookbackWhere } from "../bq.js";
const r = Router();
const Body = z.object({
    q: z.string().trim().max(120).optional(),
    mode: z.enum(["air", "ocean"]).optional(),
    hs: z.array(z.string()).optional(),
    origin: z.array(z.string()).optional(),
    dest: z.array(z.string()).optional(),
    carrier: z.array(z.string()).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
});
r.post("/public/searchCompanies", async (req, res, next) => {
    try {
        const body = Body.parse(req.body ?? {});
        const limit = body.limit ?? 25;
        const offset = body.offset ?? 0;
        const t = table("shipments_daily_part");
        const dateWhere = body.startDate && body.endDate
            ? `snapshot_date BETWEEN DATE('${body.startDate}') AND DATE('${body.endDate}')`
            : lookbackWhere("snapshot_date", 180);
        const filters = [dateWhere];
        if (body.mode)
            filters.push(`mode = '${body.mode}'`);
        if (body.hs?.length)
            filters.push(`hs_code IN (${body.hs.map(h => `'${h}'`).join(",")})`);
        if (body.origin?.length)
            filters.push(`origin_country IN (${body.origin.map(o => `'${o}'`).join(",")})`);
        if (body.dest?.length)
            filters.push(`dest_country IN (${body.dest.map(d => `'${d}'`).join(",")})`);
        if (body.carrier?.length)
            filters.push(`carrier IN (${body.carrier.map(c => `'${c}'`).join(",")})`);
        if (body.q) {
            const q = body.q.replace(/'/g, "\\'");
            filters.push(`(LOWER(shipper_name) LIKE LOWER('%${q}%') OR LOWER(consignee_name) LIKE LOWER('%${q}%'))`);
        }
        const where = filters.join(" AND ");
        const sql = `
      WITH base AS (
        SELECT
          snapshot_date,
          mode,
          hs_code,
          origin_country,
          dest_country,
          carrier,
          shipper_name,
          consignee_name
        FROM ${t}
        WHERE ${where}
      ),
      unioned AS (
        SELECT shipper_name AS company, 'shipper' AS role, * EXCEPT(shipper_name, consignee_name) FROM base WHERE shipper_name IS NOT NULL
        UNION ALL
        SELECT consignee_name AS company, 'consignee' AS role, * EXCEPT(shipper_name, consignee_name) FROM base WHERE consignee_name IS NOT NULL
      ),
      agg AS (
        SELECT
          company, role,
          COUNT(*) AS shipments,
          MAX(snapshot_date) AS lastShipmentDate,
          ARRAY_AGG(DISTINCT mode IGNORE NULLS) AS modes,
          (SELECT ARRAY_AGG(x ORDER BY x.c DESC LIMIT 5) FROM (
            SELECT hs_code AS v, COUNT(*) c FROM unioned WHERE hs_code IS NOT NULL GROUP BY v
          ) AS x) AS hsTop,
          (SELECT ARRAY_AGG(x ORDER BY x.c DESC LIMIT 5) FROM (
            SELECT origin_country AS v, COUNT(*) c FROM unioned WHERE origin_country IS NOT NULL GROUP BY v
          ) AS x) AS originsTop,
          (SELECT ARRAY_AGG(x ORDER BY x.c DESC LIMIT 5) FROM (
            SELECT dest_country AS v, COUNT(*) c FROM unioned WHERE dest_country IS NOT NULL GROUP BY v
          ) AS x) AS destsTop,
          (SELECT ARRAY_AGG(x ORDER BY x.c DESC LIMIT 5) FROM (
            SELECT carrier AS v, COUNT(*) c FROM unioned WHERE carrier IS NOT NULL GROUP BY v
          ) AS x) AS carriersTop
        FROM unioned
        GROUP BY company, role
      ),
      counted AS (
        SELECT COUNT(*) AS total FROM agg
      )
      SELECT
        (SELECT total FROM counted) AS total,
        TO_JSON_STRING(ARRAY(
          SELECT AS STRUCT * FROM agg
          ORDER BY shipments DESC, lastShipmentDate DESC
          LIMIT ${limit} OFFSET ${offset}
        )) AS items_json
    `;
        const [rows] = await bq.query({ query: sql, location: "US" });
        const total = Number(rows?.[0]?.total ?? 0);
        const items = rows?.[0]?.items_json ? JSON.parse(rows[0].items_json) : [];
        res.json({ total, items });
    }
    catch (err) {
        next(err);
    }
});
export default r;
