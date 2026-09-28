// share-map — trade-lanes map share portal (design handoff #2 §4.6).
//
// Actions (POST JSON { action, ... }):
//   create | list | revoke  — JWT-required, owner-scoped.
//   view                    — PUBLIC, token-validated. Returns a payload
//                             REDACTED server-side per the link's include
//                             flags: excluded fields are never sent. CRM
//                             fields (owner, stage, notes, contacts) are
//                             never included at all.
//
// SELF-CONTAINED on purpose: the GitHub CI deploy for NEW functions is
// broken (setup-cli), so this function deploys via the Supabase MCP
// bundler, which doesn't ship ../_shared. The auth/json/logger helpers
// below mirror _shared/auth.ts + _shared/logger.ts (minus Sentry).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const log = (level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, fn: "share-map", event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

const env = () => ({
  url: Deno.env.get("SUPABASE_URL")!,
  anon: Deno.env.get("SUPABASE_ANON_KEY")!,
  service: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
});

const admin = () => createClient(env().url, env().service);

/** Mirror of _shared/auth.ts requireUser. */
async function requireUser(req: Request): Promise<{ user: { id: string; email?: string | null } } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ ok: false, error: "Missing Authorization header" }, 401);
  }
  const userClient = createClient(env().url, env().anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  return { user: data.user };
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const newToken = (): string => {
  const bytes = new Uint8Array(32); // 256-bit
  crypto.getRandomValues(bytes);
  return b64url(bytes);
};

type IncludeFlags = { spend: boolean; bols: boolean; suppliers: boolean; carriers: boolean };
const normInclude = (raw: unknown): IncludeFlags => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    spend: o.spend !== false,
    bols: o.bols !== false,
    suppliers: o.suppliers !== false,
    carriers: o.carriers !== false,
  };
};

// Naive per-isolate rate limit: 60 views / token / minute.
const hits = new Map<string, number[]>();
const rateLimited = (token: string): boolean => {
  const now = Date.now();
  const arr = (hits.get(token) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(token, arr);
  return arr.length > 60;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const action = String(body?.action ?? "");

  // ── PUBLIC: view ─────────────────────────────────────────────────────────
  if (action === "view") {
    const token = String(body?.token ?? "");
    if (!token || token.length < 20) return json({ ok: false, error: "invalid_token" }, 400);
    if (rateLimited(token)) return json({ ok: false, error: "rate_limited" }, 429);
    const sb = admin();
    const { data: link } = await sb.from("lit_share_links").select("*").eq("token", token).maybeSingle();
    if (!link) return json({ ok: false, error: "not_found" }, 404);
    if (link.revoked_at) return json({ ok: false, error: "expired" }, 410);
    if (link.expires_at && Date.parse(link.expires_at) < Date.now()) {
      return json({ ok: false, error: "expired" }, 410);
    }
    const include = normInclude(link.include);
    const slug = String(link.company_id);

    const [bolsQ, tsQ, lanesQ] = await Promise.all([
      include.bols
        ? sb
            .from("lit_unified_shipments")
            .select(
              "bol_number,bol_date,scac,carrier_name,shipper_name,origin_country,origin_country_code," +
                "destination_country_code,origin_port,destination_port,hs_code,product_description," +
                "container_count,teu,weight_kg,lcl,load_type,shipping_cost_usd,container_type",
            )
            .eq("company_id", slug)
            .order("bol_date", { ascending: true })
            .limit(2000)
        : Promise.resolve({ data: [] as any[] }),
      sb.from("lit_company_time_series_monthly").select("year,month,shipments,teu").eq("company_id", slug).limit(2000),
      sb.from("lit_company_lane_months").select("origin_country,dest_country,month,shipments,teu").eq("company_id", slug).limit(5000),
    ]);

    // SERVER-SIDE REDACTION — excluded fields are removed before send.
    const bols = ((bolsQ as any).data ?? []).map((r: any) => ({
      ...r,
      id: r.bol_number,
      house_bol: null,
      master_bol: null,
      shipper_name: include.suppliers ? r.shipper_name : null,
      scac: include.carriers ? r.scac : null,
      carrier_name: include.carriers ? r.carrier_name : null,
      shipping_cost_usd: include.spend ? r.shipping_cost_usd : null,
    }));

    // Best-effort counters + audit (never block the view on failures).
    try {
      await sb
        .from("lit_share_links")
        .update({ view_count: (link.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() })
        .eq("id", link.id);
      await sb.from("lit_events_audit").insert({
        event: "share_map_view",
        payload: { link_id: link.id, company_id: slug },
      });
    } catch (err) {
      log("warn", "audit_failed", { err: String(err) });
    }

    return json({
      ok: true,
      company: { name: link.company_name ?? slug, key: slug },
      shared_by: link.created_by_name ?? null,
      expires_at: link.expires_at ?? null,
      include,
      initial_state: link.initial_state ?? {},
      bols,
      tsMonths: (tsQ as any).data ?? [],
      laneMonths: (lanesQ as any).data ?? [],
    });
  }

  // ── AUTHED: create / list / revoke ──────────────────────────────────────
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user } = auth;
  const sb = admin();

  if (action === "create") {
    const companyId = String(body?.company_id ?? "").trim().replace(/^company\//, "");
    if (!companyId) return json({ ok: false, error: "company_id required" }, 400);
    const expiresDays = body?.expires_days == null ? null : Number(body.expires_days);
    const expires_at =
      expiresDays && Number.isFinite(expiresDays) ? new Date(Date.now() + expiresDays * 864e5).toISOString() : null;
    const row = {
      token: newToken(),
      company_id: companyId,
      company_uuid: body?.company_uuid ?? null,
      company_name: body?.company_name ?? null,
      created_by: user.id,
      created_by_name: body?.created_by_name ?? user.email ?? null,
      access: body?.access === "invite" ? "invite" : "link",
      invite_emails: Array.isArray(body?.invite_emails) ? body.invite_emails : [],
      expires_at,
      include: normInclude(body?.include),
      initial_state: body?.initial_state ?? {},
    };
    const { data, error } = await sb.from("lit_share_links").insert(row).select("id, token").single();
    if (error) {
      log("error", "create_failed", { err: String(error.message ?? error) });
      return json({ ok: false, error: "create_failed" }, 500);
    }
    return json({ ok: true, id: data.id, token: data.token });
  }

  if (action === "list") {
    const companyId = String(body?.company_id ?? "").trim().replace(/^company\//, "");
    let q = sb
      .from("lit_share_links")
      .select("id, token, company_id, company_name, access, expires_at, include, revoked_at, view_count, last_viewed_at, created_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) return json({ ok: false, error: "list_failed" }, 500);
    return json({ ok: true, links: data ?? [] });
  }

  if (action === "revoke") {
    const id = String(body?.id ?? "");
    if (!id) return json({ ok: false, error: "id required" }, 400);
    const { error } = await sb
      .from("lit_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("created_by", user.id);
    if (error) return json({ ok: false, error: "revoke_failed" }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: "unknown_action" }, 400);
});
