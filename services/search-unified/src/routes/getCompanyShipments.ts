import { Router } from "express";
import { z } from "zod";
import { bq } from "../bq.js";

const r = Router();

const Query = z.object({
  company_id: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

r.get("/public/getCompanyShipments", async (req, res, next) => {
  try {
    const q = Query.parse({
      company_id: req.query.company_id,
      limit: req.query.limit ?? 50,
      offset: req.query.offset ?? 0,
    });

    const sql = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', COALESCE(shipment_date, snapshot_date)) AS shipped_on,
        mode,
        origin_country AS origin,
        dest_country   AS destination,
        carrier,
        CAST(value_usd AS STRING)       AS value_usd,
        CAST(gross_weight_kg AS STRING) AS weight_kg
      FROM \`logistics-intel.lit.shipments_daily_part\`
      WHERE company_id = '${q.company_id}'
      ORDER BY COALESCE(shipment_date, snapshot_date) DESC
      LIMIT ${q.limit} OFFSET ${q.offset}
    `;

    const [rows] = await bq.query({ query: sql, location: "US" });
    res.json({ rows });
  } catch (err) { next(err); }
});

export default r;
