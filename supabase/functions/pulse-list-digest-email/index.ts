// pulse-list-digest-email — daily/weekly email digest of new
// auto-refresh inbox matches across the user's saved lists.
//
// Two invocation modes (mirrors pulse-refresh-lists):
//   1. Service role (cron) → loops every user with enabled digest
//      prefs that's due based on cadence + last_digest_at.
//   2. User auth (manual UI trigger) → sends a digest to the
//      caller right now if they have any pending inbox items.
//
// Per user:
//   - Skip if last_digest_at < cadence window
//   - Pull pulse_lists they own with pending inbox items
//     (status='pending'). Optionally restrict to items found
//     SINCE last_digest_at so we don't repeat content.
//   - If zero pending items → mark as "no_matches" but don't send
//   - Build HTML email grouped by list, send via Resend
//   - Stamp last_digest_at + counts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("DIGEST_FROM_EMAIL") ||
  Deno.env.get("INVITE_FROM_EMAIL") ||
  "pulse@logisticsintel.com";
const APP_BASE_URL =
  Deno.env.get("APP_BASE_URL") ||
  Deno.env.get("INVITE_BASE_URL") ||
  "https://app.logisticsintel.com";

const MAX_USERS_PER_RUN = 200;
const MAX_LISTS_PER_USER = 20;
const MAX_MATCHES_PER_LIST = 8; // shown in the email body

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface DigestPref {
  user_id: string;
  enabled: boolean;
  cadence: "off" | "daily" | "weekly";
  last_digest_at: string | null;
}

function isDue(pref: DigestPref): boolean {
  if (!pref.enabled) return false;
  if (!pref.last_digest_at) return true;
  const last = new Date(pref.last_digest_at).getTime();
  const ageHours = (Date.now() - last) / 3600_000;
  if (pref.cadence === "daily") return ageHours >= 22;
  if (pref.cadence === "weekly") return ageHours >= 24 * 6.5;
  return false;
}

async function lookupUserEmail(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ email: string; name: string } | null> {
  // Try the public profiles table first
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.email) {
      return {
        email: String(profile.email),
        name: String(profile.full_name || profile.email.split("@")[0]),
      };
    }
  } catch (_) { /* ignore */ }

  // Fall back to auth.users via admin API
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    return {
      email: data.user.email,
      name: String(
        data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          data.user.email.split("@")[0],
      ),
    };
  } catch (_) {
    return null;
  }
}

interface ListWithMatches {
  list_id: string;
  list_name: string;
  query_text: string | null;
  matches: Array<{
    company_id: string;
    name: string;
    domain: string | null;
    location: string | null;
    found_at: string;
    match_reason: string | null;
  }>;
  total_pending: number;
}

async function gatherDigestForUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  sinceIso: string | null,
): Promise<ListWithMatches[]> {
  // Pull lists the user owns
  const { data: lists } = await admin
    .from("pulse_lists")
    .select("id, name, query_text")
    .eq("user_id", userId)
    .limit(MAX_LISTS_PER_USER);
  if (!lists?.length) return [];

  const results: ListWithMatches[] = [];

  for (const list of lists) {
    let q = admin
      .from("pulse_list_inbox")
      .select(`
        company_id,
        found_at,
        match_reason,
        lit_companies!inner ( id, name, domain, city, state, country_code )
      `, { count: "exact" })
      .eq("list_id", list.id)
      .eq("status", "pending")
      .order("found_at", { ascending: false });

    if (sinceIso) q = q.gte("found_at", sinceIso);

    const { data: rows, count } = await q.limit(MAX_MATCHES_PER_LIST);
    if (!rows?.length) continue;

    results.push({
      list_id: list.id,
      list_name: list.name,
      query_text: list.query_text,
      total_pending: count ?? rows.length,
      matches: rows.map((r: any) => ({
        company_id: r.company_id,
        name: r.lit_companies?.name || "Unknown",
        domain: r.lit_companies?.domain || null,
        location: [
          r.lit_companies?.city,
          r.lit_companies?.state,
          r.lit_companies?.country_code,
        ].filter(Boolean).join(", ") || null,
        found_at: r.found_at,
        match_reason: r.match_reason,
      })),
    });
  }

  return results;
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildEmail({
  recipientName,
  digestData,
}: {
  recipientName: string;
  digestData: ListWithMatches[];
}): { subject: string; html: string; text: string } {
  const totalLists = digestData.length;
  const totalMatches = digestData.reduce((s, l) => s + l.total_pending, 0);
  const subject =
    totalLists === 1
      ? `${totalMatches} new match${totalMatches === 1 ? "" : "es"} in "${digestData[0].list_name}"`
      : `${totalMatches} new matches across ${totalLists} of your lists`;

  const sectionsHtml = digestData
    .map((list) => {
      const matchesHtml = list.matches
        .map((m) => {
          const url = `${APP_BASE_URL}/app/prospecting?focus=${encodeURIComponent(m.company_id)}`;
          const sub = [m.domain, m.location].filter(Boolean).join(" · ");
          return `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
                <a href="${url}" style="text-decoration:none;color:#0f172a;font-weight:600;font-size:14px;">${escapeHtml(m.name)}</a>
                ${sub ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">${escapeHtml(sub)}</div>` : ""}
              </td>
            </tr>
          `;
        })
        .join("");
      const moreFooter =
        list.total_pending > list.matches.length
          ? `<div style="color:#94a3b8;font-size:12px;margin-top:8px;">+${list.total_pending - list.matches.length} more pending — open the list to see them all.</div>`
          : "";
      const listUrl = `${APP_BASE_URL}/app/prospecting?list=${encodeURIComponent(list.list_id)}`;
      return `
        <div style="margin:24px 0;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div>
              <a href="${listUrl}" style="text-decoration:none;color:#0f172a;font-weight:700;font-size:15px;">${escapeHtml(list.list_name)}</a>
              ${list.query_text ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">"${escapeHtml(list.query_text.slice(0, 120))}${list.query_text.length > 120 ? "…" : ""}"</div>` : ""}
            </div>
            <div style="background:#eff6ff;color:#2563eb;font-size:11px;font-weight:700;padding:4px 8px;border-radius:9999px;">${list.total_pending} new</div>
          </div>
          <table style="width:100%;border-collapse:collapse;">${matchesHtml}</table>
          ${moreFooter}
        </div>
      `;
    })
    .join("");

  const html = `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
<table style="width:100%;background:#f8fafc;padding:32px 16px;">
<tr><td align="center">
<table style="max-width:640px;width:100%;background:#ffffff;border-radius:14px;padding:28px;box-shadow:0 4px 20px rgba(15,23,42,0.06);">
<tr><td>
<div style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#0F172A,#1E293B);color:#00F0FF;padding:6px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#00F0FF;"></span>
Pulse Coach digest
</div>
<h1 style="font-size:22px;font-weight:700;margin:14px 0 6px;">Hey ${escapeHtml(recipientName)},</h1>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">
${totalMatches === 1 ? "Pulse found a new match" : `Pulse found ${totalMatches} new matches`} for your saved list${totalLists === 1 ? "" : "s"} since the last digest. Quick look:
</p>
${sectionsHtml}
<div style="margin-top:24px;text-align:center;">
<a href="${APP_BASE_URL}/app/prospecting" style="display:inline-block;background:linear-gradient(180deg,#3B82F6,#2563EB);color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px;">Open Pulse Library →</a>
</div>
<p style="color:#94a3b8;font-size:11px;line-height:1.5;margin-top:24px;text-align:center;">
You're receiving this because Pulse Library digest is enabled.
<a href="${APP_BASE_URL}/app/prospecting" style="color:#3b82f6;text-decoration:none;">Manage preferences</a>.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
  `.trim();

  const text = [
    `Hey ${recipientName},`,
    ``,
    `${totalMatches === 1 ? "Pulse found a new match" : `Pulse found ${totalMatches} new matches`} for your saved list${totalLists === 1 ? "" : "s"}.`,
    ``,
    ...digestData.flatMap((list) => [
      `--- ${list.list_name} (${list.total_pending} new) ---`,
      ...list.matches.map((m) => `  • ${m.name}${m.domain ? ` (${m.domain})` : ""}${m.location ? ` — ${m.location}` : ""}`),
      list.total_pending > list.matches.length
        ? `  +${list.total_pending - list.matches.length} more`
        : "",
      "",
    ]),
    `Open Pulse: ${APP_BASE_URL}/app/prospecting`,
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}

async function sendEmail(
  to: string,
  recipientName: string,
  digestData: ListWithMatches[],
): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY missing" };
  }
  const { subject, html, text } = buildEmail({ recipientName, digestData });
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Logistics Intel <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, error: result?.message || `Resend HTTP ${resp.status}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, code: "METHOD_NOT_ALLOWED", message: "POST only." },
      405,
    );
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, code: "NOT_CONFIGURED", message: "Server is missing Supabase credentials." },
      500,
    );
  }
  if (!RESEND_API_KEY) {
    return jsonResponse(
      { ok: false, code: "NOT_CONFIGURED", message: "RESEND_API_KEY not set." },
      500,
    );
  }

  let body: { test_user_id?: string; force?: boolean } = {};
  try { body = (await req.json()) || {}; } catch { body = {}; }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Differentiate cron vs user auth
  let scopedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (token && token !== SERVICE_ROLE_KEY) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResp } = await userClient.auth.getUser();
    if (!userResp?.user?.id) {
      return jsonResponse({ ok: false, code: "UNAUTHORIZED" }, 401);
    }
    scopedUserId = userResp.user.id;
  }

  // Build the candidate set of users
  let prefsQuery = admin
    .from("pulse_digest_prefs")
    .select("user_id, enabled, cadence, last_digest_at")
    .eq("enabled", true)
    .limit(MAX_USERS_PER_RUN);

  if (scopedUserId) prefsQuery = prefsQuery.eq("user_id", scopedUserId);
  if (body.test_user_id) prefsQuery = prefsQuery.eq("user_id", body.test_user_id);

  const { data: prefs, error: prefsErr } = await prefsQuery;
  if (prefsErr) {
    return jsonResponse(
      { ok: false, code: "QUERY_FAILED", message: prefsErr.message },
      500,
    );
  }

  const candidates = (prefs || []).filter((p: any) =>
    body.force ? true : isDue(p as DigestPref),
  );

  const results: Array<{ user_id: string; status: string }> = [];
  let totalSent = 0;
  let totalSkipped = 0;

  for (const pref of candidates) {
    const userId = (pref as DigestPref).user_id;
    const sinceIso = (pref as DigestPref).last_digest_at;
    try {
      const digestData = await gatherDigestForUser(admin, userId, sinceIso);
      if (!digestData.length) {
        await admin.from("pulse_digest_prefs").update({
          last_status: "no_matches",
          last_digest_at: new Date().toISOString(),
          last_lists_count: 0,
          last_matches_count: 0,
        }).eq("user_id", userId);
        results.push({ user_id: userId, status: "no_matches" });
        totalSkipped++;
        continue;
      }
      const userInfo = await lookupUserEmail(admin, userId);
      if (!userInfo?.email) {
        await admin.from("pulse_digest_prefs").update({
          last_status: "no_email_on_file",
        }).eq("user_id", userId);
        results.push({ user_id: userId, status: "no_email_on_file" });
        totalSkipped++;
        continue;
      }
      const totalMatches = digestData.reduce((s, l) => s + l.total_pending, 0);
      const send = await sendEmail(userInfo.email, userInfo.name, digestData);
      if (!send.ok) {
        await admin.from("pulse_digest_prefs").update({
          last_status: `send_failed: ${send.error?.slice(0, 200) || "unknown"}`,
        }).eq("user_id", userId);
        results.push({ user_id: userId, status: `error: ${send.error}` });
        continue;
      }
      await admin.from("pulse_digest_prefs").update({
        last_status: "sent",
        last_digest_at: new Date().toISOString(),
        last_lists_count: digestData.length,
        last_matches_count: totalMatches,
      }).eq("user_id", userId);
      results.push({ user_id: userId, status: "sent" });
      totalSent++;
    } catch (err) {
      console.error(`[pulse-digest] user ${userId} fatal:`, err);
      results.push({ user_id: userId, status: `fatal: ${(err as Error).message}` });
    }
  }

  return jsonResponse({
    ok: true,
    scope: scopedUserId ? "user" : "all",
    candidates: candidates.length,
    sent: totalSent,
    skipped: totalSkipped,
    results,
  });
});
