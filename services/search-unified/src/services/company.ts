import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClient } from "../db/bq.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedQuery: string | null = null;

function loadQuery(): string {
  if (!cachedQuery) {
    const sqlPath = path.join(__dirname, "..", "queries", "company_shipments.sql");
    cachedQuery = fs.readFileSync(sqlPath, "utf8");
  }
  return cachedQuery;
}

export async function getCompanyShipments(company_id: string, limit = 25, offset = 0) {
  if (!company_id) throw new Error("missing_company_id");

  const query = loadQuery();
  const bq = await getClient();
  const params = {
    company_id,
    limit: Math.max(1, Math.min(100, Number(limit) || 25)),
    offset: Math.max(0, Number(offset) || 0),
  };

  const [rows] = await bq.query({ query, location: "US", params });
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : { total: 0, shipments: [] };
  const shipments = Array.isArray(row?.shipments)
    ? row.shipments.map((s: any) => ({
        date: s?.date ?? null,
        origin_country: s?.origin_country ?? null,
        dest_country: s?.dest_country ?? null,
        mode: s?.mode ?? null,
        hs_code: s?.hs_code ?? null,
        carrier: s?.carrier ?? null,
        value_usd: s?.value_usd ?? null,
        gross_weight_kg: s?.gross_weight_kg ?? null,
      }))
    : [];

  return {
    total: Number(row?.total ?? 0),
    shipments,
  };
}


