import { Router } from "express";
import { bq, table, lookbackWhere } from "../bq";

let cached: { ts: number; payload: any } | null = null;
const TTL_MS = 60_000;

const r = Router();

r.get("/public/getFilterOptions", async (req, res, next) => {
  try {
    if (cached && Date.now() - cached.ts < TTL_MS) {
      return res.json(cached.payload);
    }
    const days = Number(req.query.days || 180);
    const where = lookbackWhere("snapshot_date", days);
    const t = table("shipments_daily_part");

    const [modes] = await bq.query({
      query: `
        SELECT mode, COUNT(*) c FROM ${t}
        WHERE ${where} AND mode IS NOT NULL
        GROUP BY mode ORDER BY c DESC
      `,
      location: "US",
    });

    const [hs] = await bq.query({
      query: `
        SELECT hs_code, COUNT(*) c FROM ${t}
        WHERE ${where} AND hs_code IS NOT NULL
        GROUP BY hs_code ORDER BY c DESC LIMIT 200
      `,
      location: "US",
    });

    const [origins] = await bq.query({
      query: `
        SELECT origin_country as code, COUNT(*) c FROM ${t}
        WHERE ${where} AND origin_country IS NOT NULL
        GROUP BY code ORDER BY c DESC
      `,
      location: "US",
    });

    const [dests] = await bq.query({
      query: `
        SELECT dest_country as code, COUNT(*) c FROM ${t}
        WHERE ${where} AND dest_country IS NOT NULL
        GROUP BY code ORDER BY c DESC
      `,
      location: "US",
    });

    const [carriers] = await bq.query({
      query: `
        SELECT carrier, COUNT(*) c FROM ${t}
        WHERE ${where} AND carrier IS NOT NULL
        GROUP BY carrier ORDER BY c DESC LIMIT 200
      `,
      location: "US",
    });

    const payload = { modes, hs, origins, dests, carriers };
    cached = { ts: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    try {
      // Fallback if shipments_daily_part is empty: use company_overview_daily_part
      const t2 = table("company_overview_daily_part");
      const where2 = lookbackWhere("snapshot_date", Number(req.query.days || 180));
      const [modes2] = await bq.query({
        query: `
          SELECT mode, COUNT(*) c FROM ${t2}
          WHERE ${where2} AND mode IS NOT NULL
          GROUP BY mode ORDER BY c DESC
        `,
        location: "US",
      });
      const [origins2] = await bq.query({
        query: `
          SELECT origin_country as code, COUNT(*) c FROM ${t2}
          WHERE ${where2} AND origin_country IS NOT NULL
          GROUP BY code ORDER BY c DESC
        `,
        location: "US",
      });
      const [dests2] = await bq.query({
        query: `
          SELECT dest_country as code, COUNT(*) c FROM ${t2}
          WHERE ${where2} AND dest_country IS NOT NULL
          GROUP BY code ORDER BY c DESC
        `,
        location: "US",
      });
      const payload = { modes: modes2, hs: [], origins: origins2, dests: dests2, carriers: [] };
      cached = { ts: Date.now(), payload };
      res.json(payload);
    } catch (fallbackErr) {
      console.error(fallbackErr);
      next(fallbackErr);
    }
  }
});

export default r;
