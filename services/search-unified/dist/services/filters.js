import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClient } from "../db/bq.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let cachedQuery = null;
function loadQuery() {
    if (!cachedQuery) {
        const sqlPath = path.join(__dirname, "..", "queries", "filters.sql");
        cachedQuery = fs.readFileSync(sqlPath, "utf8");
    }
    return cachedQuery;
}
export async function getFilterOptions() {
    const query = loadQuery();
    const bq = await getClient();
    const [rows] = await bq.query({ query, location: "US" });
    const resultRows = Array.isArray(rows) ? rows : [];
    const row = resultRows[0] ?? {};
    const origins = Array.isArray(row.origins)
        ? row.origins
            .map((entry) => typeof entry?.origin_country === "string" ? entry.origin_country : null)
            .filter((value) => Boolean(value))
        : [];
    const destinations = Array.isArray(row.destinations)
        ? row.destinations
            .map((entry) => typeof entry?.dest_country === "string" ? entry.dest_country : null)
            .filter((value) => Boolean(value))
        : [];
    const modes = Array.isArray(row.modes)
        ? row.modes
            .map((entry) => (typeof entry?.mode === "string" ? entry.mode : null))
            .filter((value) => Boolean(value))
        : [];
    const hs = Array.isArray(row.hs)
        ? row.hs
            .map((entry) => typeof entry?.hs_code === "string" ? entry.hs_code : null)
            .filter((value) => Boolean(value))
        : [];
    return {
        origins,
        destinations,
        modes,
        hs,
    };
}
