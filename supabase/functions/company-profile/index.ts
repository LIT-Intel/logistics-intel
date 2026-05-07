// Phase 1 — Company Profile aggregator (Supabase Edge Function).
//
// One round trip from the client. Resolves the input via 5 strategies
// (uuid → company_key → canonical_domain → name+city+state → name+country),
// then fans out to existing tables to assemble a ProfileBundle.
//
// Read-only. Does not mutate any table. Pulse brief is read from
// lit_saved_companies.gemini_brief when present; never calls an LLM here.
//
// Request:
//   POST /company-profile
//   { id?: string, hints?: { domain?, name?, city?, state?, country? },
//     include?: ("identity"|"shipments"|"contacts"|"activity"|"pulse")[] }
//
// Response shape mirrors frontend/src/lib/companyProfile.types.ts.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNAPSHOT_TTL_DAYS = 7;

type Include = "identity" | "shipments" | "contacts" | "activity" | "pulse";

interface RequestBody {
  id?: string | null;
  hints?: {
    domain?: string | null;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
  include?: Include[];
}

function isUuid(v: string | null | undefined) {
  return !!v && UUID_RE.test(v.trim());
}

function normalizeKey(raw: string) {
  const stripped = raw.replace(/^company\//i, "").trim();
  return stripped
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(raw: string) {
  return raw
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|sa|ag|nv|bv|sas|sarl|plc)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeDomain(raw: string) {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function keyCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const set = new Set<string>([trimmed]);
  if (trimmed.startsWith("company/")) {
    set.add(trimmed.replace(/^company\//, ""));
  } else {
    set.add(`company/${trimmed}`);
  }
  const norm = normalizeKey(trimmed);
  if (norm) {
    set.add(norm);
    set.add(`company/${norm}`);
  }
  return Array.from(set);
}

async function resolve(
  client: SupabaseClient,
  body: RequestBody,
): Promise<
  | { ok: true; saved: any | null; directory: any | null; resolvedVia: string }
  | { ok: false; code: string; message: string }
> {
  const raw = (body.id ?? "").trim();
  if (!raw && !body.hints?.domain && !body.hints?.name) {
    return { ok: false, code: "INVALID_INPUT", message: "Empty company identifier and no hints provided." };
  }

  let saved: any = null;
  let directory: any = null;
  let resolvedVia = "company_key";

  // 1. UUID
  if (raw && isUuid(raw)) {
    const { data } = await client.from("lit_companies").select("*").eq("id", raw).maybeSingle();
    if (data) {
      saved = data;
      resolvedVia = "uuid";
    }
  }

  // 2. company_key / source_company_key
  if (!saved && raw) {
    const candidates = keyCandidates(raw);
    if (candidates.length) {
      const { data: companies } = await client
        .from("lit_companies")
        .select("*")
        .in("source_company_key", candidates)
        .limit(1);
      if (companies && companies.length > 0) {
        saved = companies[0];
        resolvedVia = "company_key";
      } else {
        const { data: dirRows } = await client
          .from("lit_company_directory")
          .select("*")
          .in("company_key", candidates)
          .limit(1);
        if (dirRows && dirRows.length > 0) {
          directory = dirRows[0];
          resolvedVia = "directory_id";
        }
      }
    }
  }

  // 3. canonical_domain
  const domainCandidate =
    body.hints?.domain ?? (raw && raw.includes(".") && !raw.includes("/") ? raw : null);
  if (!saved && !directory && domainCandidate) {
    const domain = normalizeDomain(domainCandidate);
    if (domain) {
      const { data: companies } = await client
        .from("lit_companies")
        .select("*")
        .eq("domain", domain)
        .limit(1);
      if (companies && companies.length > 0) {
        saved = companies[0];
        resolvedVia = "canonical_domain";
      } else {
        const { data: dirRows } = await client
          .from("lit_company_directory")
          .select("*")
          .or(`canonical_domain.eq.${domain},domain.eq.${domain}`)
          .limit(1);
        if (dirRows && dirRows.length > 0) {
          directory = dirRows[0];
          resolvedVia = "canonical_domain";
        }
      }
    }
  }

  // 4 & 5. name + city/state OR name + country
  if (!saved && !directory && body.hints?.name) {
    const normalized = normalizeName(body.hints.name);
    if (normalized) {
      const city = body.hints.city ?? null;
      const state = body.hints.state ?? null;
      const country = body.hints.country ?? null;

      let savedQ = client
        .from("lit_companies")
        .select("*")
        .ilike("normalized_name", `%${normalized}%`);
      if (city) savedQ = savedQ.ilike("city", city);
      if (state) savedQ = savedQ.ilike("state", state);
      if (country) savedQ = savedQ.ilike("country_code", country);
      const { data: companies } = await savedQ.limit(1);
      if (companies && companies.length > 0) {
        saved = companies[0];
        resolvedVia = city && state ? "name_city_state" : "name_country";
      } else {
        let dirQ = client
          .from("lit_company_directory")
          .select("*")
          .ilike("normalized_name", `%${normalized}%`);
        if (city) dirQ = dirQ.ilike("city", city);
        if (state) dirQ = dirQ.ilike("state", state);
        if (country) dirQ = dirQ.ilike("country", country);
        const { data: dirRows } = await dirQ.limit(1);
        if (dirRows && dirRows.length > 0) {
          directory = dirRows[0];
          resolvedVia = city && state ? "name_city_state" : "name_country";
        }
      }
    }
  }

  if (!saved && !directory) {
    return { ok: false, code: "COMPANY_NOT_FOUND", message: `Could not resolve company from input "${raw}".` };
  }

  return { ok: true, saved, directory, resolvedVia };
}

function buildIdentity(saved: any | null, directory: any | null, resolvedVia: string) {
  const display: any = {
    name: pickFirst(saved?.name, directory?.canonical_name, directory?.company_name) ?? "",
    domain: pickFirst(saved?.domain, directory?.canonical_domain, directory?.domain),
    website: pickFirst(saved?.website, directory?.website),
    phone: pickFirst(saved?.phone, directory?.phone),
    address: {
      line1: pickFirst(saved?.address_line1, directory?.address_line1),
      city: pickFirst(saved?.city, directory?.city),
      state: pickFirst(saved?.state, directory?.state),
      country: pickFirst(directory?.country),
      country_code: pickFirst(saved?.country_code),
      postal_code: pickFirst(saved?.postal_code, directory?.postal_code),
    },
    industry: pickFirst(saved?.industry, directory?.industry),
    headcount: pickFirst(saved?.headcount, directory?.employee_count),
    revenue: pickFirst(saved?.revenue, directory?.revenue),
    logo_url: pickFirst(saved?.logo_url),
  };

  return {
    id: saved?.id ?? directory?.id ?? null,
    key: saved?.source_company_key ?? directory?.company_key ?? null,
    display,
    sources: {
      saved: { present: !!saved },
      importyeti: { present: false },
      directory: {
        present: !!directory,
        source: directory?.source ?? null,
        enrichment_status: directory?.enrichment_status ?? null,
        enriched_at: directory?.enriched_at ?? null,
      },
      metrics: {
        shipments_12m: saved?.shipments_12m ?? null,
        teu_12m: saved?.teu_12m ?? null,
        fcl_shipments_12m: saved?.fcl_shipments_12m ?? null,
        lcl_shipments_12m: saved?.lcl_shipments_12m ?? null,
        est_spend_12m: saved?.est_spend_12m ?? null,
        last_shipment: saved?.most_recent_shipment_date ?? null,
        top_route: saved?.top_route_12m ?? saved?.recent_route ?? null,
        primary_mode: saved?.primary_mode ?? null,
      },
      contacts: { count: 0, saved_count: 0 },
    },
    resolved_via: resolvedVia,
  };
}

async function loadShipments(client: SupabaseClient, companyId: string | null, companyKey: string | null) {
  if (!companyId && !companyKey) return null;
  const filter = companyId ?? companyKey!;
  const { data: snap } = await client
    .from("lit_importyeti_company_snapshot")
    .select("parsed_summary, raw_payload, updated_at")
    .eq("company_id", filter)
    .maybeSingle();

  if (snap) {
    const parsed = snap.parsed_summary ?? {};
    const ageMs = Date.now() - new Date(snap.updated_at).getTime();
    const isStale = ageMs > SNAPSHOT_TTL_DAYS * 24 * 3600 * 1000;
    return {
      monthly: parsed.timeSeries ?? parsed.monthly ?? [],
      top_routes: parsed.topRoutes ?? parsed.top_routes ?? [],
      top_origins: parsed.topOrigins ?? parsed.top_origins ?? [],
      top_destinations: parsed.topDestinations ?? parsed.top_destinations ?? [],
      recent_bols: parsed.recentBols ?? parsed.recent_bols ?? [],
      _meta: { source: "importyeti_snapshot", updated_at: snap.updated_at, is_stale: isStale },
    };
  }

  if (companyKey) {
    const { data: metrics } = await client
      .from("lit_company_source_metrics")
      .select("*")
      .eq("company_key", companyKey);
    if (metrics && metrics.length > 0) {
      return {
        monthly: [],
        top_routes: [],
        top_origins: metrics
          .filter((m: any) => m.country)
          .map((m: any) => ({ country: m.country, shipments: Number(m.shipments) || 0 }))
          .slice(0, 10),
        top_destinations: [],
        recent_bols: [],
        _meta: { source: "company_source_metrics", count: metrics.length },
      };
    }
  }

  return null;
}

async function loadContacts(client: SupabaseClient, companyId: string | null) {
  if (!companyId) return null;
  const { data, count } = await client
    .from("lit_contacts")
    .select("id, full_name, first_name, last_name, name, title, department, email, phone, linkedin_url, source, source_provider, enriched_at, is_verified, email_verified, verified_by_provider, email_verification_status", { count: "exact" })
    .eq("company_id", companyId)
    .order("enriched_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (!data) return null;

  const items = data.map((row: any) => ({
    id: row.id,
    full_name:
      row.full_name ||
      row.name ||
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
      null,
    title: row.title ?? null,
    department: row.department ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    linkedin_url: row.linkedin_url ?? null,
    source: row.source ?? row.source_provider ?? null,
    enriched_at: row.enriched_at ?? null,
    is_verified:
      row.verified_by_provider === true ||
      row.email_verified === true ||
      ["verified", "valid", "deliverable"].includes(String(row.email_verification_status || "").toLowerCase()),
  }));

  return { items, count: count ?? items.length, saved_count: items.length };
}

async function loadActivity(client: SupabaseClient, companyId: string | null) {
  if (!companyId) return null;
  const { data } = await client
    .from("lit_activity_events")
    .select("id, event_type, metadata, created_at, user_id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (!data) return null;

  const events = data.map((row: any) => ({
    type: (row.event_type ?? "other") as string,
    at: row.created_at,
    actor: row.user_id ? { kind: "user" as const, user_id: row.user_id } : { kind: "system" as const },
    title: row.metadata?.title ?? row.event_type ?? "Event",
    description: row.metadata?.description ?? null,
    payload: row.metadata ?? {},
    source_table: "lit_activity_events" as const,
  }));

  return { events, next_cursor: null };
}

async function loadPulse(client: SupabaseClient, companyId: string | null, userId: string | null) {
  if (!companyId || !userId) return null;
  const { data } = await client
    .from("lit_saved_companies")
    .select("gemini_brief, gemini_brief_updated_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || !data.gemini_brief) {
    return { brief: null, cached_at: null, is_stale: true, source: "none" as const };
  }

  const ageMs = Date.now() - new Date(data.gemini_brief_updated_at ?? 0).getTime();
  const isStale = ageMs > 14 * 24 * 3600 * 1000;
  return {
    brief: data.gemini_brief,
    cached_at: data.gemini_brief_updated_at,
    is_stale: isStale,
    source: "saved_company_cache" as const,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestId = crypto.randomUUID();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await client.auth.getUser(token);
      userId = user?.id ?? null;
    }

    const body: RequestBody = await req.json();
    const include: Include[] = body.include ?? ["identity", "shipments", "contacts", "activity"];

    const resolved = await resolve(client, body);
    if (!resolved.ok) {
      console.warn(JSON.stringify({ fn: "company-profile", requestId, code: resolved.code }));
      return new Response(JSON.stringify({ ok: false, error: resolved }), {
        status: resolved.code === "COMPANY_NOT_FOUND" ? 404 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const identity = buildIdentity(resolved.saved, resolved.directory, resolved.resolvedVia);

    const [shipments, contacts, activity, pulse] = await Promise.all([
      include.includes("shipments") ? loadShipments(client, identity.id, identity.key) : Promise.resolve(null),
      include.includes("contacts") ? loadContacts(client, identity.id) : Promise.resolve(null),
      include.includes("activity") ? loadActivity(client, identity.id) : Promise.resolve(null),
      include.includes("pulse") ? loadPulse(client, identity.id, userId) : Promise.resolve(null),
    ]);

    if (contacts) {
      identity.sources.contacts.count = contacts.count;
      identity.sources.contacts.saved_count = contacts.saved_count;
    }
    if (shipments && (shipments as any)._meta?.source === "importyeti_snapshot") {
      identity.sources.importyeti.present = true;
      identity.sources.importyeti.updated_at = (shipments as any)._meta.updated_at;
      identity.sources.importyeti.is_stale = (shipments as any)._meta.is_stale;
    }

    const bundle = { identity, shipments, contacts, activity, pulse };
    return new Response(JSON.stringify({ ok: true, data: bundle }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(JSON.stringify({ fn: "company-profile", requestId, error: String(err?.message ?? err) }));
    return new Response(JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR", message: String(err?.message ?? err) } }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
