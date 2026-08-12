// supabase/functions/profile-kpi-writeback/index.ts
//
// CEO trust P0 — server-side KPI writeback for the Company Profile page.
//
// CompanyProfileV2 used to compute the lane-matched market-rate spend in the
// browser and UPDATE lit_companies.est_spend_12m directly from the client — a
// data-integrity liability (any authenticated client could persist any
// number). This function owns both the computation and the write:
//
//   1. Resolve the company slug (accepts "company/<slug>", bare slug, or a
//      lit_companies UUID).
//   2. Load the server-side snapshot (lit_importyeti_company_snapshot
//      .parsed_summary) — the same system of record the page renders from.
//   3. Load the latest FBX benchmark lanes (lit_freight_rate_benchmarks).
//   4. Recompute spend with the SAME tiered formula the page displays:
//        Tier 1 — per-route lane-matched spend, trusted only when matched
//                 route TEU covers ≥70% of total TEU (catch-all importer
//                 guard: Old Navy / Tesla / Flexport style snapshots).
//        Tier 2 — TEU-only fallback at the global FBX average $/TEU, with
//                 LCL TEU bounded at min(lcl_count, 15% of total) × $850.
//   5. Persist est_spend_12m on lit_companies (service role — clients no
//      longer need, and should not have, UPDATE access for this field).
//
// Called fire-and-forget from CompanyProfileV2 on profile load. JWT-verified
// via _shared/auth.ts requireUser — computation inputs all come from the
// server, so a malicious caller can at worst trigger a recompute.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import {
  type FreightLane,
  LCL_PER_TEU_DEFAULT,
  LCL_TEU_TOTAL_CAP_FRACTION,
  matchAllRoutesForCompany,
} from "../_shared/freight_benchmark.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIER1_TEU_COVERAGE_MIN = 0.7;

serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { admin } = auth;

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body tolerated */
  }
  const rawKey = String(body?.companyKey || "").trim();
  if (!rawKey) return json({ ok: false, error: "companyKey required" }, 400);

  // ── 1. Resolve slug ────────────────────────────────────────────────────
  let slug = rawKey.replace(/^company\//i, "").trim();
  if (UUID_RE.test(slug)) {
    const { data: companyRow } = await admin
      .from("lit_companies")
      .select("source_company_key")
      .eq("id", slug)
      .maybeSingle();
    const sck = (companyRow?.source_company_key as string | null) || null;
    if (!sck) return json({ ok: false, error: "company_not_found" }, 404);
    slug = sck.replace(/^company\//i, "").trim();
  }
  if (!slug) return json({ ok: false, error: "companyKey required" }, 400);

  // ── 2. Snapshot (system of record) ─────────────────────────────────────
  const { data: snap, error: snapErr } = await admin
    .from("lit_importyeti_company_snapshot")
    .select("company_id, parsed_summary, updated_at")
    .eq("company_id", slug)
    .maybeSingle();
  if (snapErr) return json({ ok: false, error: snapErr.message }, 500);
  // deno-lint-ignore no-explicit-any
  const summary: any = snap?.parsed_summary ?? null;
  if (!summary || typeof summary !== "object") {
    return json({ ok: true, skipped: "no_snapshot" });
  }
  // Mirror the client gate: only write when real BOL-backed snapshot data
  // exists, never from a lit_companies shell fallback.
  const recentBols = Array.isArray(summary.recent_bols)
    ? summary.recent_bols
    : [];
  if (recentBols.length === 0) {
    return json({ ok: true, skipped: "no_snapshot_bols" });
  }

  // ── 3. Latest FBX benchmarks (one row per lane_code) ───────────────────
  const { data: benchRows, error: benchErr } = await admin
    .from("lit_freight_rate_benchmarks")
    .select("*")
    .order("fetched_at", { ascending: false });
  if (benchErr) return json({ ok: false, error: benchErr.message }, 500);
  const seen = new Set<string>();
  const lanes: FreightLane[] = [];
  for (const row of (benchRows ?? []) as FreightLane[]) {
    if (seen.has(row.lane_code)) continue;
    seen.add(row.lane_code);
    lanes.push(row);
  }
  if (lanes.length === 0) return json({ ok: true, skipped: "no_benchmarks" });

  // ── 4. Tiered spend recompute (mirrors CompanyProfileV2) ───────────────
  const rk = summary.route_kpis || {};
  // deno-lint-ignore no-explicit-any
  const topRoutes: any[] =
    Array.isArray(rk.topRoutesLast12m) && rk.topRoutesLast12m.length > 0
      ? rk.topRoutesLast12m
      : Array.isArray(summary.top_routes)
        ? summary.top_routes
        : [];
  const baseTeu = Number(rk.teuLast12m ?? summary.total_teu ?? 0);

  let estSpend: number | null = null;
  let tier: "lane_matched" | "teu_fallback" | null = null;

  if (topRoutes.length > 0) {
    const matches = matchAllRoutesForCompany(topRoutes, lanes);
    const matchedTeuSum = matches.reduce(
      (s, m) => s + (Number(m.ourTeu) || 0),
      0,
    );
    const total = matches.reduce((s, m) => s + (m.marketSpend || 0), 0);
    // Coverage gate: routes must explain ≥70% of total TEU, OR there is no
    // total-TEU reference to compare against.
    const coverageOk =
      baseTeu <= 0 || matchedTeuSum >= baseTeu * TIER1_TEU_COVERAGE_MIN;
    if (total > 0 && coverageOk) {
      estSpend = total;
      tier = "lane_matched";
    }
  }

  if (estSpend == null && baseTeu > 0) {
    const lcl = Number(
      summary.containers?.lclShipments12m ?? summary.lcl_count ?? 0,
    );
    const avgPerTeu =
      lanes.reduce((s, l) => s + (Number(l.rate_usd_per_teu) || 0), 0) /
      lanes.length;
    if (avgPerTeu > 0) {
      const lclTeu = Math.min(
        Math.max(0, Math.round(lcl)),
        baseTeu * LCL_TEU_TOTAL_CAP_FRACTION,
      );
      const fclTeu = Math.max(0, baseTeu - lclTeu);
      const total = Math.round(
        fclTeu * avgPerTeu + lclTeu * LCL_PER_TEU_DEFAULT,
      );
      if (total > 0) {
        estSpend = total;
        tier = "teu_fallback";
      }
    }
  }

  if (estSpend == null || estSpend <= 0) {
    return json({ ok: true, skipped: "no_spend_computable" });
  }

  // ── 5. Persist ─────────────────────────────────────────────────────────
  const candidates = Array.from(new Set([`company/${slug}`, slug]));
  const { error: writeErr } = await admin
    .from("lit_companies")
    .update({ est_spend_12m: Math.round(estSpend) })
    .in("source_company_key", candidates);
  if (writeErr) return json({ ok: false, error: writeErr.message }, 500);

  return json({
    ok: true,
    companyKey: `company/${slug}`,
    estSpend12m: Math.round(estSpend),
    tier,
  });
});
