/**
 * ============================================================================
 * LOCAL SEARCH CONTRACT
 * ----------------------------------------------------------------------------
 * This SQL powers the unified Companies search endpoint. Keep the response
 * shape stable ({ results, total }) so the frontend can paginate safely. Any
 * schema changes in BigQuery must be reflected here without breaking existing
 * fields.
 * ============================================================================
 */
import { Router } from "express";
import { z } from "zod";
import { bq } from "../bq.js";
const r = Router();
const Body = z.object({
    keyword: z.string().trim().max(120).optional(),
    q: z.string().trim().max(120).optional(),
    mode: z.enum(["air", "ocean"]).optional(),
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
        const keyword = body.keyword ?? body.q ?? null;
        const limit = Math.min(Number(body.limit ?? 20), 50);
        const offset = Number(body.offset ?? 0);
        const sql = `
WITH base AS (
  SELECT
    COALESCE(NULLIF(TRIM(company_id), ''), TO_HEX(SHA256(LOWER(REGEXP_REPLACE(COALESCE(company_name, party_name, consignee_name, shipper_name), r'\\s+', ' '))))) AS company_id,
    COALESCE(company_name, party_name, consignee_name, shipper_name) AS company_name,
    date AS shipment_date,
    NULLIF(TRIM(carrier), '') AS carrier,
    CASE
      WHEN NULLIF(TRIM(origin_country), '') IS NOT NULL AND NULLIF(TRIM(dest_country), '') IS NOT NULL
        THEN CONCAT(origin_country, ' -> ', dest_country)
      ELSE NULL
    END AS route,
    LOWER(COALESCE(company_name, party_name, consignee_name, shipper_name)) AS name_lower
  FROM \`lit.shipments_daily_part\`
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
    AND COALESCE(company_name, party_name, consignee_name, shipper_name) IS NOT NULL
),
filtered AS (
  SELECT *
  FROM base
  WHERE (@q IS NULL OR @q = '' OR name_lower LIKE CONCAT('%', LOWER(@q), '%'))
),
agg AS (
  SELECT
    company_id,
    ANY_VALUE(company_name) AS company_name,
    COUNT(*) AS shipments_12m,
    MAX(shipment_date) AS last_activity
  FROM filtered
  GROUP BY company_id
),
routes AS (
  SELECT
    company_id,
    ARRAY_AGG(STRUCT(route, cnt AS shipments) ORDER BY cnt DESC LIMIT 3) AS top_routes
  FROM (
    SELECT company_id, route, COUNT(*) AS cnt
    FROM filtered
    WHERE route IS NOT NULL AND route <> ''
    GROUP BY company_id, route
  )
  GROUP BY company_id
),
carriers AS (
  SELECT
    company_id,
    ARRAY_AGG(STRUCT(carrier, cnt AS shipments) ORDER BY cnt DESC LIMIT 3) AS top_carriers
  FROM (
    SELECT company_id, carrier, COUNT(*) AS cnt
    FROM filtered
    WHERE carrier IS NOT NULL AND carrier <> ''
    GROUP BY company_id, carrier
  )
  GROUP BY company_id
),
final AS (
  SELECT
    agg.company_id,
    agg.company_name,
    agg.shipments_12m,
    CAST(agg.last_activity AS STRING) AS last_activity,
    COALESCE(routes.top_routes, []) AS top_routes,
    COALESCE(carriers.top_carriers, []) AS top_carriers
  FROM agg
  LEFT JOIN routes USING (company_id)
  LEFT JOIN carriers USING (company_id)
)
SELECT
  company_id,
  company_name,
  shipments_12m,
  last_activity,
  top_routes,
  top_carriers,
  COUNT(*) OVER() AS total_count
FROM final
ORDER BY shipments_12m DESC, company_name
LIMIT @limit OFFSET @offset;
`;
        const [rows] = await bq.query({
            query: sql,
            params: { q: keyword, limit, offset },
        });
        const total = rows.length > 0 && Number.isFinite(rows[0]?.total_count)
            ? Number(rows[0].total_count)
            : rows.length;
        const sanitized = rows.map((row) => {
            const shipments = Number(row.shipments_12m ?? 0);
            const topRoutes = Array.isArray(row.top_routes)
                ? row.top_routes.map((route) => ({
                    route: route?.route ?? null,
                    shipments: Number(route?.shipments ?? 0) || 0,
                }))
                : [];
            const topCarriers = Array.isArray(row.top_carriers)
                ? row.top_carriers.map((carrier) => ({
                    carrier: carrier?.carrier ?? null,
                    shipments: Number(carrier?.shipments ?? 0) || 0,
                }))
                : [];
            return {
                company_id: row.company_id,
                company_name: row.company_name,
                shipments_12m: Number.isFinite(shipments) ? shipments : 0,
                last_activity: row.last_activity ?? null,
                top_routes: topRoutes,
                top_carriers: topCarriers,
            };
        });
        res.json({
            results: sanitized,
            total,
        });
    }
    catch (err) {
        next(err);
    }
});
export default r;
