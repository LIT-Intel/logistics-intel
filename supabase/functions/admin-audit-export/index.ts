// admin-audit-export — streams lit_audit_log as CSV for admins.
//
// Authenticated GET. The caller must have a valid Supabase JWT and pass
// the is_admin_caller() check before any rows are returned. Filter
// params (q, from, to, severity, source) match the panel UI.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function csvEscape(s: unknown): string {
  if (s == null) return "";
  const t = typeof s === "object" ? JSON.stringify(s) : String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return new Response("method_not_allowed", { status: 405, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response("server_misconfigured", { status: 500, headers: cors });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth) return new Response("missing_auth", { status: 401, headers: cors });

  // Validate the caller through their own JWT, then check is_admin_caller.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return new Response("unauthorized", { status: 401, headers: cors });
  const { data: adminCheck } = await userClient.rpc("is_admin_caller");
  if (!adminCheck) return new Response("forbidden", { status: 403, headers: cors });

  const url = new URL(req.url);
  const sev = url.searchParams.get("severity");
  const src = url.searchParams.get("source");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q");
  const limit = Math.min(Number(url.searchParams.get("limit") || 5000), 25_000);

  const admin = createClient(supabaseUrl, serviceKey);
  let query = admin
    .from("lit_audit_log")
    .select("id, created_at, actor_id, actor_role, action, target, severity, source, ip, user_agent, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sev) query = query.eq("severity", sev);
  if (src) query = query.eq("source", src);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (q) query = query.or(`action.ilike.%${q}%,target.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return new Response(`query_failed:${error.message}`, { status: 500, headers: cors });

  const rows = data || [];
  const header = ["id","created_at","actor_id","actor_role","action","target","severity","source","ip","user_agent","metadata"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(header.map((h) => csvEscape((r as any)[h])).join(","));
  }
  const body = "﻿" + lines.join("\r\n");  // BOM for Excel compat
  const filename = `lit-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;

  // Audit the export itself.
  try {
    await admin.rpc("lit_audit_write", {
      p_actor_id: user.id,
      p_actor_role: "admin",
      p_action: "admin.audit.export_csv",
      p_target: `${rows.length} rows`,
      p_severity: "info",
      p_source: "admin",
      p_metadata: { filters: { sev, src, from, to, q, limit } },
    });
  } catch (e) { console.warn("[admin-audit-export] self-audit failed", e); }

  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
