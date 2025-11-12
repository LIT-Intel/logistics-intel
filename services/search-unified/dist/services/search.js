import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClient } from "../db/bq.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let cachedQuery = null;
function loadQuery() {
    if (!cachedQuery) {
        const sqlPath = path.join(__dirname, "..", "queries", "search_companies.sql");
        cachedQuery = fs.readFileSync(sqlPath, "utf8");
    }
    return cachedQuery;
}
function sanitizeArray(values, clampSize) {
    if (!Array.isArray(values))
        return [];
    const cleaned = values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
    if (typeof clampSize === "number" && clampSize >= 0) {
        return cleaned.slice(0, clampSize);
    }
    return cleaned;
}
function toNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}
export async function searchCompanies(input) {
    const query = loadQuery();
    const bq = await getClient();
    const modeValues = Array.isArray(input.mode)
        ? input.mode
            .map((value) => (typeof value === "string" ? value.trim().toUpperCase() : ""))
            .filter((value) => value.length > 0)
        : [];
    const params = {
        q: typeof input.q === "string" ? input.q.trim() : "",
        origins: sanitizeArray(input.origin),
        dests: sanitizeArray(input.dest),
        modes: sanitizeArray(modeValues),
        hs: sanitizeArray(input.hs),
        limit: Math.max(1, Math.min(100, toNumber(input.limit, 25))),
        offset: Math.max(0, toNumber(input.offset, 0)),
    };
    const [rows] = await bq.query({ query, location: "US", params });
    const resultRows = Array.isArray(rows) ? rows : [];
    const row = resultRows[0] ?? { total: 0, results: [] };
    const total = Number.isFinite(row.total) ? Number(row.total) : 0;
    const results = Array.isArray(row.results)
        ? row.results.map((entry) => ({
            company_id: entry?.company_id ?? null,
            company_name: entry?.company_name ?? null,
            shipments_12m: Number(entry?.shipments_12m ?? 0) || 0,
            last_activity: entry?.last_activity ?? null,
            top_routes: Array.isArray(entry?.top_routes)
                ? entry.top_routes.filter((route) => typeof route === "string")
                : [],
            top_carriers: Array.isArray(entry?.top_carriers)
                ? entry.top_carriers.filter((carrier) => typeof carrier === "string")
                : [],
        }))
        : [];
    return { total, results };
}
