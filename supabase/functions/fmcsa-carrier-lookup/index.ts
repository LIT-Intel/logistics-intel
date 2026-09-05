// fmcsa-carrier-lookup — company-level DOMESTIC fleet data from the free FMCSA
// motor-carrier census (Socrata dataset kjg3-diqy on data.transportation.gov,
// no API key required; the FMCSA Data Dissemination Program publishes it
// publicly). Given a company name, returns matching carrier registrations with
// fleet size, drivers, mileage, private-fleet flags, and HQ location — the
// "does this shipper run its own trucks?" signal on company profiles.
//
// Server-side 30-day cache in lit_fmcsa_lookups (service role) keeps us a
// polite consumer of the public endpoint. JWT-required (edge fn = the security
// boundary; an open proxy would invite abuse).
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const SOCRATA_URL = "https://data.transportation.gov/resource/kjg3-diqy.json";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — census updates monthly

const log = createLogger("fmcsa-carrier-lookup");

/** Uppercased, punctuation-stripped, suffix-trimmed key for cache + search. */
function normName(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[.,'&]/g, " ")
    .replace(/\s+(LLC|INC|CORP|CORPORATION|CO|LTD|LIMITED|COMPANY|USA)\.?$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface FmcsaMatch {
  dot_number: string;
  legal_name: string;
  dba_name: string | null;
  phy_city: string | null;
  phy_state: string | null;
  phy_zip: string | null;
  power_units: number | null;
  drivers: number | null;
  recent_mileage: number | null;
  recent_mileage_year: string | null;
  carrier_operation: string | null; // A=interstate, B=intrastate hazmat, C=intrastate
  authorized_for_hire: boolean;
  private_fleet: boolean;
  hazmat: boolean;
}

function toBool(v: unknown): boolean {
  return v === true || v === "true" || v === "Y" || v === "1";
}
function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(r: Record<string, unknown>): FmcsaMatch {
  return {
    dot_number: String(r.dot_number ?? ""),
    legal_name: String(r.legal_name ?? ""),
    dba_name: r.dba_name ? String(r.dba_name) : null,
    phy_city: r.phy_city ? String(r.phy_city) : null,
    phy_state: r.phy_state ? String(r.phy_state) : null,
    phy_zip: r.phy_zip ? String(r.phy_zip) : null,
    power_units: toNum(r.nbr_power_unit),
    drivers: toNum(r.driver_total),
    recent_mileage: toNum(r.recent_mileage) ?? toNum(r.mcs150_mileage),
    recent_mileage_year: r.recent_mileage_year
      ? String(r.recent_mileage_year)
      : r.mcs150_mileage_year ? String(r.mcs150_mileage_year) : null,
    carrier_operation: r.carrier_operation ? String(r.carrier_operation) : null,
    authorized_for_hire: toBool(r.authorized_for_hire),
    private_fleet: toBool(r.private_property) || toBool(r.private_only),
    hazmat: toBool(r.hm_flag),
  };
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const rid = requestId();

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const admin = auth.admin;

  let body: { name?: string } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }
  const name = normName(body.name);
  if (name.length < 3) {
    return json({ ok: false, error: "name_required" }, 400);
  }

  // Cache first
  const { data: cached } = await admin
    .from("lit_fmcsa_lookups")
    .select("payload, fetched_at")
    .eq("lookup_key", name)
    .maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return json({ ok: true, cached: true, matches: cached.payload });
  }

  // SoQL prefix search on legal_name OR dba_name. Single quotes escaped.
  const esc = name.replace(/'/g, "''");
  const where = encodeURIComponent(
    `upper(legal_name) like '${esc}%' OR upper(dba_name) like '${esc}%'`,
  );
  let matches: FmcsaMatch[] = [];
  try {
    const resp = await fetch(`${SOCRATA_URL}?$limit=8&$where=${where}`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`socrata_${resp.status}`);
    const rows = (await resp.json()) as Record<string, unknown>[];
    matches = rows.map(normalizeRow).filter((m) => m.dot_number && m.legal_name);
  } catch (err) {
    log.warn("socrata_fetch_failed", { rid, err: String(err) });
    // Serve stale cache if we have it; else empty (never a hard error to the UI)
    if (cached) return json({ ok: true, cached: true, stale: true, matches: cached.payload });
    return json({ ok: true, matches: [] });
  }

  await admin.from("lit_fmcsa_lookups").upsert({
    lookup_key: name,
    payload: matches,
    fetched_at: new Date().toISOString(),
  });

  log.info("lookup_ok", { rid, name, matches: matches.length });
  return json({ ok: true, cached: false, matches });
});
