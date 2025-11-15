import { Router } from "express";
import { z } from "zod";
import { bq } from "../bq.js";
const r = Router();
const Query = z.object({
    company_id: z.string().min(1).optional(),
    company_name: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});
r.get("/public/getCompanyShipments", async (req, res, next) => {
    try {
        const q = Query.parse({
            company_id: req.query.company_id,
            company_name: req.query.company_name,
            limit: req.query.limit ?? 50,
            offset: req.query.offset ?? 0,
        });
        const where = q.company_id
            ? `company_id = '${q.company_id}'`
            : (q.company_name ? `LOWER(COALESCE(company_name, party_name, consignee_name, shipper_name)) = LOWER('${q.company_name.replace(/'/g, "\'")}')` : '1=0');
        const sql = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', COALESCE(shipment_date, snapshot_date)) AS shipped_on,
        mode,
        origin_country AS origin,
        dest_country   AS destination,
        origin_port,
        origin_city,
        origin_state,
        dest_port,
        dest_city,
        dest_state,
        carrier,
        CAST(value_usd AS STRING)       AS value_usd,
        CAST(gross_weight_kg AS STRING) AS weight_kg,
        CAST(container_count AS INT64)  AS container_count,
        CAST(teu AS FLOAT64)            AS teu
      FROM \`logistics-intel.lit.v_shipments_full\`
      WHERE ${where}
      ORDER BY COALESCE(shipment_date, snapshot_date) DESC
      LIMIT ${q.limit} OFFSET ${q.offset}
    `;
        const [rows] = await bq.query({ query: sql, location: "US" });
        const shipments = rows.map((row) => ({
            date: row.shipped_on ?? null,
            origin_country: row.origin ?? null,
            dest_country: row.destination ?? null,
            mode: row.mode ?? null,
            hs_code: row.hs_code ?? null,
            carrier: row.carrier ?? null,
            value_usd: row.value_usd ? Number(row.value_usd) || 0 : 0,
            gross_weight_kg: row.weight_kg ? Number(row.weight_kg) || 0 : 0,
        }));
        res.json({
            shipments,
            total: Number(rows.length),
        });
    }
    catch (err) {
        next(err);
    }
});
export default r;
