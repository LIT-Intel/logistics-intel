// iy-powerquery-probe — one-shot diagnostic to probe ImportYeti PowerQuery
// endpoint coverage. Reports which endpoints work, cost-per-call, and
// whether air-freight data is exposed anywhere.
//
// Auth: deployed with verify_jwt=true at the gateway (default). Inside
// the function, we additionally verify the caller is a `platform_admin`
// against the platform_admins table. Non-admins get 403.
//
// IY key resolution priority matches importyeti-proxy: IYApiKey →
// IY_DMA_API_KEY → IY_API_KEY → IMPORTYETI_API_KEY. We log which env var
// resolved (NEVER the key value) so the user can correlate with their
// Supabase dashboard secrets list.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

type KeySource =
  | "IYApiKey"
  | "IY_DMA_API_KEY"
  | "IY_API_KEY"
  | "IMPORTYETI_API_KEY";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function resolveIyKey(): { key: string; source: KeySource | null } {
  const candidates: Array<{ name: KeySource; value: string | undefined }> = [
    { name: "IYApiKey", value: Deno.env.get("IYApiKey")?.trim() },
    { name: "IY_DMA_API_KEY", value: Deno.env.get("IY_DMA_API_KEY")?.trim() },
    { name: "IY_API_KEY", value: Deno.env.get("IY_API_KEY")?.trim() },
    { name: "IMPORTYETI_API_KEY", value: Deno.env.get("IMPORTYETI_API_KEY")?.trim() },
  ];
  for (const c of candidates) {
    if (c.value) return { key: c.value, source: c.name };
  }
  return { key: "", source: null };
}

type ProbeResult = {
  step: number;
  label: string;
  path: string;
  http_status: number | null;
  request_cost: number | null;
  credits_remaining_after: number | null;
  has_data: boolean;
  air_evidence: unknown;
  error: string | null;
  /** Truncated peek at response body to confirm endpoint shape */
  sample_keys?: string[];
};

const BASE = "https://data.importyeti.com/v1.0";

const PROBES: Array<{ step: number; label: string; path: string }> = [
  { step: 1, label: "US ocean PQ — bols", path: "/powerquery/us-import/bols?page_size=1" },
  { step: 2, label: "US ocean PQ — companies", path: "/powerquery/us-import/companies?page_size=1" },
  { step: 3, label: "US ocean PQ — suppliers", path: "/powerquery/us-import/suppliers?page_size=1" },
  { step: 4, label: "US export PQ — bols", path: "/powerquery/us-export/bols?page_size=1" },
  { step: 5, label: "MX import PQ — declarations", path: "/powerquery/mx-import/declarations?page_size=1" },
  { step: 6, label: "MX import PQ — companies", path: "/powerquery/mx-import/companies?page_size=1" },
  { step: 7, label: "Air guess #1 — air-waybills", path: "/powerquery/us-import/air-waybills?page_size=1" },
  { step: 8, label: "Air guess #2 — us-air/bols", path: "/powerquery/us-air/bols?page_size=1" },
  { step: 9, label: "Air guess #3 — airfreight/us-import", path: "/powerquery/airfreight/us-import?page_size=1" },
  { step: 10, label: "Air guess #4 — /airfreight/us-import (no PQ)", path: "/airfreight/us-import?page_size=1" },
  { step: 11, label: "Filter-based air — transport_types=Air", path: "/powerquery/us-import/bols?transport_types=Air&page_size=1" },
  { step: 12, label: "Field-scan — does BOL row carry mode/transport/freight?", path: "/powerquery/us-import/bols?page_size=1" },
];

// Air-evidence sniffer: walk a response and return any keys/values that
// hint at air-freight data. Cheap shallow walk, capped to keep payloads
// readable.
function sniffAirEvidence(payload: unknown): { air_hit: boolean; evidence: unknown } {
  const keysOfInterest = [
    "transport_type",
    "transport_types",
    "mode",
    "freight_type",
    "shipment_mode",
    "modality",
    "air",
    "awb",
    "air_waybill",
    "carrier_air",
  ];
  const airValueHits: Array<{ where: string; value: unknown }> = [];

  function walk(node: unknown, path: string, depth: number) {
    if (depth > 4) return;
    if (node === null || node === undefined) return;
    if (typeof node !== "object") {
      const sv = String(node).toLowerCase();
      if (sv === "air" || sv === "airfreight" || sv === "air-freight") {
        airValueHits.push({ where: path, value: node });
      }
      return;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < Math.min(node.length, 3); i++) {
        walk(node[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const here = path ? `${path}.${k}` : k;
      const lk = k.toLowerCase();
      if (keysOfInterest.some((needle) => lk.includes(needle))) {
        airValueHits.push({ where: here, value: v });
      }
      walk(v, here, depth + 1);
    }
  }

  walk(payload, "", 0);
  return { air_hit: airValueHits.length > 0, evidence: airValueHits.slice(0, 10) };
}

function topLevelKeys(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.keys(payload as Record<string, unknown>).slice(0, 30);
}

async function runProbe(
  probe: { step: number; label: string; path: string },
  apiKey: string,
): Promise<ProbeResult> {
  const url = `${BASE}${probe.path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        IYApiKey: apiKey,
        Accept: "application/json",
      },
    });

    const requestCost =
      Number(res.headers.get("x-request-cost") ?? res.headers.get("X-Request-Cost") ?? NaN);
    const creditsRemaining =
      Number(
        res.headers.get("x-credits-remaining") ??
          res.headers.get("X-Credits-Remaining") ??
          res.headers.get("x-credit-balance") ??
          res.headers.get("X-Credit-Balance") ??
          NaN,
      );

    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { __raw_first_240: text.slice(0, 240) };
    }

    const sniff = sniffAirEvidence(payload);
    const hasData =
      Array.isArray((payload as any)?.data) && (payload as any).data.length > 0 ||
      Array.isArray((payload as any)?.rows) && (payload as any).rows.length > 0 ||
      Array.isArray((payload as any)?.results) && (payload as any).results.length > 0 ||
      Array.isArray(payload) && (payload as unknown[]).length > 0;

    return {
      step: probe.step,
      label: probe.label,
      path: probe.path,
      http_status: res.status,
      request_cost: Number.isFinite(requestCost) ? requestCost : null,
      credits_remaining_after: Number.isFinite(creditsRemaining) ? creditsRemaining : null,
      has_data: Boolean(hasData),
      air_evidence: sniff.air_hit ? sniff.evidence : null,
      sample_keys: topLevelKeys(payload),
      error: res.ok ? null : `HTTP ${res.status}: ${text.slice(0, 240)}`,
    };
  } catch (e: any) {
    return {
      step: probe.step,
      label: probe.label,
      path: probe.path,
      http_status: null,
      request_cost: null,
      credits_remaining_after: null,
      has_data: false,
      air_evidence: null,
      error: e?.message ?? String(e),
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
    return json({ ok: false, error: "Supabase env missing" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── Auth: user JWT (gateway-verified) + platform_admin check ────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ ok: false, error: "Missing Authorization" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) {
    return json({ ok: false, error: "Forbidden: platform admin required" }, 403);
  }
  const authUserId = user.id;

  // ── Resolve IY key ──────────────────────────────────────────────────
  const { key, source } = resolveIyKey();
  if (!key) {
    return json(
      {
        ok: false,
        error: "No ImportYeti API key in env",
        checked: ["IYApiKey", "IY_DMA_API_KEY", "IY_API_KEY", "IMPORTYETI_API_KEY"],
      },
      500,
    );
  }

  // ── Run probes sequentially (so cost/credits log in order) ──────────
  const results: ProbeResult[] = [];
  let creditsBefore: number | null = null;
  let creditsAfter: number | null = null;
  let totalCost = 0;

  for (const probe of PROBES) {
    const r = await runProbe(probe, key);
    if (r.credits_remaining_after !== null) {
      if (creditsBefore === null) {
        // First successful credit reading = best estimate of "before"
        // (the cost was already applied; add it back).
        creditsBefore =
          r.credits_remaining_after + (r.request_cost ?? 0);
      }
      creditsAfter = r.credits_remaining_after;
    }
    if (r.request_cost !== null) totalCost += r.request_cost;
    results.push(r);
  }

  // ── Synthesize air verdict ──────────────────────────────────────────
  const airProbes = results.filter((r) => r.step >= 7 && r.step <= 12);
  const airHits = airProbes.filter(
    (r) =>
      (r.http_status === 200 && r.has_data && r.air_evidence) ||
      // step 11: filter-based air — 200 + has_data is enough; evidence
      // may be absent if the upstream just returned rows without a
      // mode field
      (r.step === 11 && r.http_status === 200 && r.has_data),
  );
  const airFound = airHits.length > 0;

  const notes: string[] = [];
  notes.push(`Auth: platform_admin (user ${authUserId})`);
  notes.push(`IY key source: ${source}`);
  notes.push(`Probes run: ${results.length} / 12`);
  if (creditsBefore === null) {
    notes.push("No credit headers seen on any response — IY may not expose credit balance via header.");
  }
  if (airFound) {
    notes.push(
      `Air-freight signal found in ${airHits.length} probe(s): steps ${airHits.map((r) => r.step).join(", ")}`,
    );
  } else {
    notes.push("No air-freight evidence found across steps 7-12.");
  }

  return json({
    ok: true,
    key_source: source,
    credits_before: creditsBefore,
    credits_after: creditsAfter,
    total_cost: totalCost,
    probes: results,
    air_found: airFound,
    notes,
    generated_at: new Date().toISOString(),
  });
});
