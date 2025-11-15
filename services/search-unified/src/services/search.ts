import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClient } from "../db/bq.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedSearchQuery: string | null = null;

type SearchInput = Record<string, unknown>;

function loadSearchQuery(): string {
  if (!cachedSearchQuery) {
    const sqlPath = path.join(__dirname, "..", "queries", "search_companies.sql");
    cachedSearchQuery = fs.readFileSync(sqlPath, "utf8");
    console.log("loaded SQL: search_companies.sql");
  }
  return cachedSearchQuery;
}

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (typeof entry === "number") return entry.toString();
        if (entry && typeof entry === "object" && "value" in (entry as Record<string, unknown>)) {
          const val = (entry as Record<string, unknown>).value;
          return typeof val === "string" ? val.trim() : val == null ? "" : String(val);
        }
        return entry == null ? "" : String(entry);
      })
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (typeof value === "number") {
    return [value.toString()];
  }

  return [];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export async function searchCompanies(input: SearchInput) {
  const searchQuery = loadSearchQuery();
  const bq = await getClient();

  const qCandidate =
    typeof input.q === "string"
      ? input.q
      : typeof (input as Record<string, unknown>).keyword === "string"
        ? ((input as Record<string, unknown>).keyword as string)
        : "";

  const q = qCandidate.trim();
  const limit = Math.max(1, Math.min(50, toNumber(input.limit, 25)));
  const offset = Math.max(0, toNumber(input.offset, 0));

  const origins = unique(toStringArray((input as Record<string, unknown>).origin ?? (input as Record<string, unknown>).origins));
  const destinations = unique(
    toStringArray((input as Record<string, unknown>).dest ?? (input as Record<string, unknown>).destinations),
  );
  const modes = unique(
    toStringArray((input as Record<string, unknown>).mode ?? (input as Record<string, unknown>).modes).map((mode) =>
      mode.toUpperCase(),
    ),
  );
  const hsCodes = unique(toStringArray((input as Record<string, unknown>).hs ?? (input as Record<string, unknown>).hsCodes));
  const carriers = unique(
    toStringArray((input as Record<string, unknown>).carrier ?? (input as Record<string, unknown>).carriers),
  );

  const params: Record<string, string | number | string[]> = {
    q,
    origins,
    destinations,
    modes,
    hsCodes,
    carriers,
    limit,
    offset,
  };

  const [rows] = await bq.query({
    query: searchQuery,
    location: "US",
    params,
    types: {
      q: "STRING",
      origins: ["STRING"],
      destinations: ["STRING"],
      modes: ["STRING"],
      hsCodes: ["STRING"],
      carriers: ["STRING"],
      limit: "INT64",
      offset: "INT64",
    } as Record<string, string | string[]>,
  });

  const normalized = Array.isArray(rows)
    ? rows.map((entry: any) => {
        const shipments = Number(entry?.shipments_12m ?? 0);

        const topRoutes = Array.isArray(entry?.top_routes)
          ? entry.top_routes
              .map((route: any) => ({
                route: typeof route?.route === "string" ? route.route : null,
                shipments: Number(route?.shipments ?? 0) || 0,
              }))
              .filter((route: { route: string | null }) => route.route !== null)
          : [];

        const topCarriers = Array.isArray(entry?.top_carriers)
          ? entry.top_carriers
              .map((carrier: any) => ({
                carrier: typeof carrier?.carrier === "string" ? carrier.carrier : null,
                shipments: Number(carrier?.shipments ?? 0) || 0,
              }))
              .filter((carrier: { carrier: string | null }) => carrier.carrier !== null)
          : [];

        return {
          company_id: entry?.company_id ?? null,
          company_name: entry?.company_name ?? null,
          shipments_12m: Number.isFinite(shipments) ? shipments : 0,
          last_activity: entry?.last_activity ?? null,
          top_routes: topRoutes,
          top_carriers: topCarriers,
          total_count: Number(entry?.total_count ?? 0) || 0,
        };
      })
    : [];

  const total =
    normalized.length > 0 && Number.isFinite(normalized[0]?.total_count)
      ? Number(normalized[0].total_count)
      : normalized.length;

  const rowsSanitized = normalized.map(({ total_count, ...rest }) => rest);

  return {
    ok: true,
    meta: {
      q,
      limit,
      offset,
      origins,
      destinations,
      modes,
      hsCodes,
      carriers,
    },
    rows: rowsSanitized,
    results: rowsSanitized,
    total,
  };
}


