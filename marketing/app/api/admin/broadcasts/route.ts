import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/admin/broadcasts — Admin proxy to Resend's /broadcasts endpoint.
 *
 * Powers frontend/src/pages/AdminMarketingBroadcasts.tsx. The browser never
 * sees RESEND_API_KEY; the page sends the composed broadcast here, this
 * route verifies the caller is a platform admin (via the Supabase JWT in
 * the Authorization header + public.is_admin_caller()), forwards the
 * payload to https://api.resend.com/broadcasts, then upserts an audit row
 * in public.lit_broadcasts.
 *
 *   POST  body: { id?, name, audience_id, from, reply_to, subject,
 *                 preview_text, html, scheduled_at? }
 *         If scheduled_at is provided (and in the future) Resend queues
 *         the broadcast; otherwise it sends immediately.
 *   GET   list  → recent broadcasts (admin only, paginated lightly).
 *   GET   ?id=  → single broadcast detail (admin only).
 *
 * Auth: Authorization: Bearer <supabase-access-token>  (RLS-style)
 *
 * Required env:
 *   RESEND_API_KEY                     server-side only — never sent to browsers
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY          to bypass RLS for the audit insert
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY      to verify the caller's access token
 *
 * Optional env:
 *   RESEND_DEFAULT_FROM                fallback when `from` is absent.
 *                                       Default "Logistic Intel <pulse@logisticintel.com>"
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FROM =
  process.env.RESEND_DEFAULT_FROM ||
  "Logistic Intel <pulse@logisticintel.com>";

type BroadcastBody = {
  id?: string;
  name?: string;
  audience_id?: string;
  audience_name?: string;
  from?: string;
  reply_to?: string;
  subject?: string;
  preview_text?: string;
  html?: string;
  scheduled_at?: string | null;
};

type ResendBroadcastResponse = {
  id?: string;
  object?: string;
  status?: string;
  error?: { message?: string; name?: string };
};

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const reply = (b: unknown, s = 200) => json(b, s, origin);

  const auth = await requireAdmin(req);
  if (!auth.ok) return reply({ ok: false, error: auth.error }, auth.status);

  const supa = serviceClient();
  if (!supa) return reply({ ok: false, error: "supabase_not_configured" }, 500);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const { data, error } = await supa
      .from("lit_broadcasts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return reply({ ok: false, error: error.message }, 500);
    if (!data) return reply({ ok: false, error: "not_found" }, 404);
    return reply({ ok: true, broadcast: data });
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
  const { data, error } = await supa
    .from("lit_broadcasts")
    .select(
      "id,resend_broadcast_id,name,audience_id,audience_name,from_email,reply_to_email,subject,preview_text,status,scheduled_at,sent_at,sent_count,created_by,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return reply({ ok: false, error: error.message }, 500);
  return reply({ ok: true, broadcasts: data || [] });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const reply = (b: unknown, s = 200) => json(b, s, origin);

  const auth = await requireAdmin(req);
  if (!auth.ok) return reply({ ok: false, error: auth.error }, auth.status);

  let body: BroadcastBody;
  try {
    body = (await req.json()) as BroadcastBody;
  } catch {
    return reply({ ok: false, error: "invalid_json" }, 400);
  }

  const name = (body.name || "").trim();
  const audience_id = (body.audience_id || "").trim();
  const subject = (body.subject || "").trim();
  const html = body.html || "";
  const from = (body.from || "").trim() || DEFAULT_FROM;
  const replyTo = (body.reply_to || "").trim() || from;
  const previewText = (body.preview_text || "").slice(0, 200) || null;
  const audienceName = (body.audience_name || "").trim() || null;
  const scheduledAt = parseScheduledAt(body.scheduled_at);

  if (!name) return reply({ ok: false, error: "missing_name" }, 400);
  if (!audience_id) return reply({ ok: false, error: "missing_audience_id" }, 400);
  if (!subject) return reply({ ok: false, error: "missing_subject" }, 400);
  if (!html.trim()) return reply({ ok: false, error: "missing_html" }, 400);

  const supa = serviceClient();
  if (!supa) return reply({ ok: false, error: "supabase_not_configured" }, 500);

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return reply({ ok: false, error: "resend_not_configured" }, 500);

  // Build Resend broadcast payload. Resend's /broadcasts endpoint accepts:
  //   { name, audience_id, from, subject, html, reply_to?, preview_text?,
  //     scheduled_at? (ISO8601) }
  const resendPayload: Record<string, unknown> = {
    name,
    audience_id,
    from,
    reply_to: replyTo,
    subject,
    html,
  };
  if (previewText) resendPayload.preview_text = previewText;
  if (scheduledAt) resendPayload.scheduled_at = scheduledAt;

  let resendResp: ResendBroadcastResponse | null = null;
  let resendStatus = 0;
  let resendError: string | null = null;
  try {
    const resp = await fetch("https://api.resend.com/broadcasts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify(resendPayload),
    });
    resendStatus = resp.status;
    resendResp = (await resp.json().catch(() => null)) as ResendBroadcastResponse | null;
    if (!resp.ok) {
      resendError =
        resendResp?.error?.message ||
        `resend_http_${resendStatus}`;
    }
  } catch (e: any) {
    resendError = e?.message || "resend_request_failed";
  }

  // Determine status: queued (scheduled), sent (immediate ok), failed (error).
  // Resend's response status field can be "draft" / "queued" / "sending" — pass
  // it through when available.
  let status: string;
  if (resendError) status = "failed";
  else if (scheduledAt) status = "queued";
  else status = resendResp?.status === "sending" ? "sending" : "sent";

  const auditRow: Record<string, unknown> = {
    name,
    audience_id,
    audience_name: audienceName,
    from_email: from,
    reply_to_email: replyTo,
    subject,
    preview_text: previewText,
    html,
    status,
    scheduled_at: scheduledAt,
    sent_at: status === "sent" || status === "sending" ? new Date().toISOString() : null,
    resend_broadcast_id: resendResp?.id ?? null,
    created_by: auth.userId,
  };

  let saved: any = null;
  if (body.id) {
    const { data, error } = await supa
      .from("lit_broadcasts")
      .update({ ...auditRow })
      .eq("id", body.id)
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("[admin/broadcasts] update failed", error.message);
    } else {
      saved = data;
    }
  } else {
    const { data, error } = await supa
      .from("lit_broadcasts")
      .insert(auditRow)
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("[admin/broadcasts] insert failed", error.message);
    } else {
      saved = data;
    }
  }

  if (resendError) {
    return reply(
      {
        ok: false,
        error: resendError,
        resend_status: resendStatus,
        broadcast: saved,
      },
      502,
    );
  }

  return reply({ ok: true, broadcast: saved, resend: resendResp });
}

// ───────────── helpers ─────────────

// app.logisticintel.com (LIT React app) calls this route cross-origin. We
// only allow the two known LIT origins — leaving "*" off intentionally so
// random sites can't probe the admin endpoint, even though the route
// itself still requires a Supabase admin JWT.
const ALLOWED_ORIGINS = new Set([
  "https://app.logisticintel.com",
  "https://logisticintel.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  if (!allowed) return {};
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    vary: "origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function parseScheduledAt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  // Only forward if it's at least 60s in the future — otherwise drop it so
  // Resend treats the broadcast as send-now.
  if (d.getTime() <= Date.now() + 60_000) return null;
  return d.toISOString();
}

function serviceClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AdminCheck =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; status: number; error: string };

async function requireAdmin(req: NextRequest): Promise<AdminCheck> {
  const authz = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  if (!m) return { ok: false, status: 401, error: "missing_bearer_token" };
  const token = m[1].trim();

  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: "supabase_not_configured" };
  }

  // User-scoped client so RPC + getUser run as the caller. is_admin_caller()
  // reads auth.uid() from the GoTrue JWT.
  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userResp, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userResp?.user) {
    return { ok: false, status: 401, error: "invalid_token" };
  }
  const user = userResp.user;

  const { data: isAdmin, error: rpcErr } = await userClient.rpc("is_admin_caller");
  if (rpcErr) {
    console.error("[admin/broadcasts] is_admin_caller rpc failed", rpcErr.message);
    return { ok: false, status: 500, error: "admin_check_failed" };
  }
  if (!isAdmin) return { ok: false, status: 403, error: "not_admin" };

  return { ok: true, userId: user.id, email: user.email ?? null };
}
