// freightos-benchmark-sync — weekly Tuesday 15:03 UTC.
// Scrapes the FBX composite + 12 lane pages from freightos.com, parses rates
// from server-rendered HTML, validates, upserts into lit_benchmark_rates.
//
// HARD RULE: rate_usd values NEVER flow into any LLM prompt (Freightos ToS §2.10).
// This edge fn does not import or call any LLM API. Rates are stored and rendered
// only; downstream consumers must keep them out of model context.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Lane = { code: string; url: string; label: string };

const COMPOSITE: Lane = {
  code: "fbx-composite",
  url: "https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/",
  label: "FBX Composite",
};
const LANES: Lane[] = [
  { code: "fbx-01", url: "https://www.freightos.com/enterprise/terminal/fbx-01-china-to-north-america-west-coast/", label: "FBX01: China -> NA West Coast" },
  { code: "fbx-02", url: "https://www.freightos.com/enterprise/terminal/fbx-02-north-america-west-coast-to-china/", label: "FBX02: NA West Coast -> China" },
  { code: "fbx-03", url: "https://www.freightos.com/enterprise/terminal/fbx-03-china-to-north-america-east-coast/", label: "FBX03: China -> NA East Coast" },
  { code: "fbx-04", url: "https://www.freightos.com/enterprise/terminal/fbx-04-north-america-east-coast-to-china/", label: "FBX04: NA East Coast -> China" },
  { code: "fbx-11", url: "https://www.freightos.com/enterprise/terminal/fbx-11-china-to-northern-europe/", label: "FBX11: China -> N. Europe" },
  { code: "fbx-12", url: "https://www.freightos.com/enterprise/terminal/fbx-12-northern-europe-to-china/", label: "FBX12: N. Europe -> China" },
  { code: "fbx-13", url: "https://www.freightos.com/enterprise/terminal/fbx-13-china-to-mediterranean/", label: "FBX13: China -> Mediterranean" },
  { code: "fbx-14", url: "https://www.freightos.com/enterprise/terminal/fbx-14-mediterranean-to-china/", label: "FBX14: Mediterranean -> China" },
  { code: "fbx-21", url: "https://www.freightos.com/enterprise/terminal/fbx-21-north-america-east-coast-to-northern-europe/", label: "FBX21: NA East -> N. Europe" },
  { code: "fbx-22", url: "https://www.freightos.com/enterprise/terminal/fbx-22-northern-europe-to-north-america-east-coast/", label: "FBX22: N. Europe -> NA East" },
  { code: "fbx-25", url: "https://www.freightos.com/enterprise/terminal/fbx-25-northern-europe-to-south-america-east-coast/", label: "FBX25: N. Europe -> SA East" },
  { code: "fbx-26", url: "https://www.freightos.com/enterprise/terminal/fbx-26-south-america-east-coast-to-northern-europe/", label: "FBX26: SA East -> N. Europe" },
];

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const all = [COMPOSITE, ...LANES];

  const parsed: Array<{ lane: Lane; rate_usd: number; volatility_pct: number | null }> = [];
  for (const lane of all) {
    try {
      const html = await fetch(lane.url, { redirect: "follow" }).then(r => r.text());
      const rate = parseRateFromHtml(html);
      if (rate && rate.rate_usd > 0) parsed.push({ lane, ...rate });
    } catch (err) {
      console.error(`[freightos] ${lane.code} fetch failed:`, (err as any)?.message || err);
    }
  }

  // Validation gate — never overwrite good rates with garbage.
  // Abort whole batch if <50% of lanes parsed OR any zero/invalid rate slipped through.
  const expected = all.length;
  const allRatesPositive = parsed.every(p => p.rate_usd > 0);
  if (parsed.length < Math.floor(expected * 0.5) || !allRatesPositive) {
    await logJobError(supabase, "freightos_parse_failure", {
      found: parsed.length,
      expected,
      all_positive: allRatesPositive,
    });
    return json({ ok: false, error: "parse_failure_aborted", found: parsed.length, expected });
  }

  // Upsert. freightos:no-llm — rate_usd written to DB only, never to an LLM prompt.
  const weekOf = mondayOf(new Date());
  const rows = parsed.map(p => ({
    week_of: weekOf,
    lane: p.lane.label,
    lane_code: p.lane.code,
    mode: "FCL_40HC",
    rate_usd: p.rate_usd, // freightos:no-llm
    volatility_pct: p.volatility_pct,
    source_url: p.lane.url,
    parse_confidence: 1.0,
  }));
  const { error } = await supabase
    .from("lit_benchmark_rates")
    .upsert(rows, { onConflict: "week_of,lane_code,mode" });
  if (error) {
    await logJobError(supabase, "freightos_upsert_failed", { error: error.message });
    return json({ ok: false, error: error.message });
  }

  // Fire benchmark alerts for lanes that moved >=10% WoW.
  const alertsCreated = await fireBenchmarkAlerts(supabase, parsed, weekOf);

  return json({ ok: true, parsed: parsed.length, alerts: alertsCreated });
});

function parseRateFromHtml(html: string): { rate_usd: number; volatility_pct: number | null } | null {
  // Targets phrases like: "Current FBX: $1,981.50" and "volatility 0.76%"
  const rateMatch = html.match(/Current\s+FBX[:\s]*\$?([0-9,]+\.?[0-9]*)/i);
  if (!rateMatch) return null;
  const rate_usd = Number(rateMatch[1].replace(/,/g, "")); // freightos:no-llm
  if (!Number.isFinite(rate_usd) || rate_usd <= 0) return null;
  const volMatch = html.match(/volatility[:\s]*([0-9.]+)\s*%/i);
  const volatility_pct = volMatch ? Number(volMatch[1]) : null;
  return { rate_usd, volatility_pct };
}

function mondayOf(d: Date): string {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const monday = new Date(d.getTime() - diff * 86400 * 1000);
  return monday.toISOString().slice(0, 10);
}

async function fireBenchmarkAlerts(supabase: any, parsed: any[], weekOf: string): Promise<number> {
  // For each lane, look up prior week's rate, compute WoW delta.
  const prevWeek = new Date(weekOf);
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  const prevWeekStr = prevWeek.toISOString().slice(0, 10);
  const codes = parsed.map(p => p.lane.code);
  const { data: prior } = await supabase
    .from("lit_benchmark_rates")
    .select("lane_code, rate_usd")
    .eq("week_of", prevWeekStr)
    .in("lane_code", codes);
  // freightos:no-llm — prior rates loaded for delta math only, never sent to an LLM.
  const priorByCode = new Map((prior || []).map((r: any) => [r.lane_code, Number(r.rate_usd)]));

  const movers: any[] = [];
  for (const p of parsed) {
    const before = priorByCode.get(p.lane.code);
    if (!before || before <= 0) continue;
    const pct = (p.rate_usd - before) / before; // freightos:no-llm
    if (Math.abs(pct) >= 0.10) {
      movers.push({ lane: p.lane, before, after: p.rate_usd, pct });
    }
  }
  if (movers.length === 0) return 0;

  // Fan out to all users with benchmark_alerts=true.
  const { data: optedIn } = await supabase
    .from("lit_user_alert_prefs")
    .select("user_id")
    .eq("benchmark_alerts", true);
  if (!optedIn || optedIn.length === 0) return 0;

  const rows: any[] = [];
  for (const u of optedIn) {
    for (const m of movers) {
      // freightos:no-llm — before/after rates persisted in alert payload for UI render only.
      rows.push({
        user_id: u.user_id,
        source_company_key: null,
        alert_type: "benchmark",
        severity: Math.abs(m.pct) >= 0.25 ? "high" : "warning",
        payload: {
          lane: m.lane.label, lane_code: m.lane.code,
          before: m.before, after: m.after, pct,
          source_url: m.lane.url,
        },
      });
    }
  }
  await supabase.from("lit_pulse_alerts").insert(rows);
  return rows.length;
}

async function logJobError(supabase: any, source: string, payload: any) {
  await supabase
    .from("lit_job_errors")
    .insert({ source, payload, occurred_at: new Date().toISOString() })
    .catch(() => {});
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
