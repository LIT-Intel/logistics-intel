import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClient } from "../db/bq.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedQuery: string | null = null;

function loadQuery(): string {
  if (!cachedQuery) {
    const sqlPath = path.join(__dirname, "..", "queries", "filters.sql");
    cachedQuery = fs.readFileSync(sqlPath, "utf8");
  }
  return cachedQuery;
}

type OriginStruct = { origin_country: string | null };
type DestinationStruct = { dest_country: string | null };
type ModeStruct = { mode: string | null };
type HsStruct = { hs_code: string | null };

type FacetRow = {
  origins?: OriginStruct[] | null;
  destinations?: DestinationStruct[] | null;
  modes?: ModeStruct[] | null;
  hs?: HsStruct[] | null;
};

export async function getFilterOptions(): Promise<{
  origins: string[];
  destinations: string[];
  modes: string[];
  hs: string[];
}> {
  const query = loadQuery();
  const bq = await getClient();
  const [rows] = await bq.query({ query, location: "US" });
  const resultRows = Array.isArray(rows) ? (rows as FacetRow[]) : [];
  const row = resultRows[0] ?? {};

  const origins = Array.isArray(row.origins)
    ? row.origins
        .map((entry: OriginStruct | null | undefined) =>
          typeof entry?.origin_country === "string" ? entry.origin_country : null,
        )
        .filter((value): value is string => Boolean(value))
    : [];
  const destinations = Array.isArray(row.destinations)
    ? row.destinations
        .map((entry: DestinationStruct | null | undefined) =>
          typeof entry?.dest_country === "string" ? entry.dest_country : null,
        )
        .filter((value): value is string => Boolean(value))
    : [];
  const modes = Array.isArray(row.modes)
    ? row.modes
        .map((entry: ModeStruct | null | undefined) => (typeof entry?.mode === "string" ? entry.mode : null))
        .filter((value): value is string => Boolean(value))
    : [];
  const hs = Array.isArray(row.hs)
    ? row.hs
        .map((entry: HsStruct | null | undefined) =>
          typeof entry?.hs_code === "string" ? entry.hs_code : null,
        )
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    origins,
    destinations,
    modes,
    hs,
  };
}


