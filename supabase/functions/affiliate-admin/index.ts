// affiliate-admin
// Super-admin-only data + actions API for the Partner Program Admin page.
//
// Auth: requires a JWT belonging to a row in public.platform_admins.
// Internally uses the service role to read/write across affiliate_*
// tables so the admin UI doesn't depend on widening RLS.
//
// Read actions (no side effects):
//   kpis | list_applications | list_partners | list_commissions
//   list_payouts | list_tiers | list_invites
//
// Mutating actions (with audit trail):
//   resend_invite              { invite_id }
//   revoke_invite              { invite_id }
//   deactivate_partner         { partner_id, reason? }
//   reactivate_partner         { partner_id }
//   soft_delete_partner        { partner_id }
//   resend_stripe_onboarding   { partner_id, send_email? }   // returns onboarding URL; optionally emails partner
//
// Approvals/rejections still go through the existing affiliate-review function.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? null;
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? null;
  const fromEmail =
    Deno.env.get("RESEND_FROM_EMAIL") ||
    Deno.env.get("INVITE_FROM_EMAIL") ||
    null;
  const appBaseUrl =
    Deno.env.get("APP_BASE_URL") ||
    Deno.env.get("INVITE_BASE_URL") ||
    Deno.env.get("APP_URL") ||
    "https://www.logisticintel.com";
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }
  return {
    supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey,
    stripeSecretKey, resendApiKey, fromEmail, appBaseUrl,
  };
}

async function authenticateSuperAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ ok: false, error: "Missing Authorization header" }, 401) };
  }
  const env = getEnv();
  const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { error: json({ ok: false, error: "Unauthorized" }, 401) };
  }
  const { data: adminRow } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!adminRow) {
    return { error: json({ ok: false, error: "Forbidden: super-admin access required" }, 403) };
  }
  return { user: data.user, adminClient, env };
}

async function fetchEmails(adminClient: SupabaseClient, userIds: string[]) {
  const map = new Map<string, string | null>();
  if (userIds.length === 0) return map;
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data } = await adminClient.auth.admin.getUserById(id);
        map.set(id, data?.user?.email ?? null);
      } catch {
        map.set(id, null);
      }
    }),
  );
  return map;
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function sendInviteEmail(args: {
  resendApiKey: string;
  fromEmail: string;
  to: string;
  recipientName: string | null;
  inviteUrl: string;
  invitedByEmail: string | null;
  note: string | null;
  appBaseUrl: string;
}) {
  const greeting = args.recipientName ? `Hi ${escapeHtml(args.recipientName)},` : "Hi,";
  const fromLine = args.invitedByEmail
    ? `<strong>${escapeHtml(args.invitedByEmail)}</strong> at Logistic Intel`
    : "The Logistic Intel partnerships team";
  const noteBlock = args.note
    ? `<blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #3b82f6;background:#EFF6FF;color:#1e3a8a;font-size:14px;line-height:1.55;">${escapeHtml(args.note)}</blockquote>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#0F172A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:40px 16px;">
<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
<tr><td style="padding:28px 32px 8px;"><div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3b82f6;">LIT Partner Program</div>
<h1 style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0F172A;">You're invited to partner with Logistic Intel.</h1></td></tr>
<tr><td style="padding:16px 32px 0;font-size:14px;line-height:1.6;color:#475569;"><p style="margin:0 0 14px;">${greeting}</p>
<p style="margin:0 0 14px;">${fromLine} has invited you to the Logistic Intel Partner Program.</p>${noteBlock}
<p style="margin:0 0 14px;">Click below to accept. You'll create or sign in to your Logistic Intel account, then connect Stripe Connect Express to enable monthly payouts.</p></td></tr>
<tr><td style="padding:8px 32px 24px;" align="left"><a href="${args.inviteUrl}" style="display:inline-block;padding:12px 22px;background:linear-gradient(180deg,#3B82F6,#2563EB);color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;box-shadow:0 1px 4px rgba(59,130,246,0.3);">Accept invitation →</a></td></tr>
<tr><td style="padding:0 32px 24px;font-size:12.5px;line-height:1.6;color:#64748b;">If the button doesn't work, paste this URL into your browser:<br/><span style="font-family:JetBrains Mono,monospace;color:#0F172A;word-break:break-all;">${escapeHtml(args.inviteUrl)}</span></td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #EEF2F7;font-size:12px;line-height:1.55;color:#94a3b8;">This invitation can only be claimed once. Program terms are set at the time you accept and are listed in your partner agreement. If you weren't expecting this email, you can safely ignore it.</td></tr>
</table><div style="margin-top:14px;font-size:11.5px;color:#94a3b8;">Logistic Intel · ${escapeHtml(args.appBaseUrl)}</div></td></tr></table></body></html>`;
  const text = [
    args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    "",
    `${args.invitedByEmail ?? "The Logistic Intel partnerships team"} has invited you to the Logistic Intel Partner Program.`,
    "",
    args.note ? `Note: ${args.note}\n` : "",
    "Accept the invitation here:",
    args.inviteUrl,
    "",
    "If you weren't expecting this email, you can safely ignore it.",
    "",
    "— Logistic Intel",
  ].filter(Boolean).join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: args.fromEmail,
      to: args.to,
      subject: "You're invited to the Logistic Intel Partner Program",
      html, text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${typeof data?.message === "string" ? data.message : "send failed"}`);
  }
  return data;
}

async function sendStripeLinkEmail(args: {
  resendApiKey: string;
  fromEmail: string;
  to: string;
  url: string;
  appBaseUrl: string;
}) {
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#0F172A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
<tr><td style="padding:28px 32px;"><div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3b82f6;">LIT Partner Program</div>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#0F172A;">Finish connecting Stripe to receive payouts</h1>
<p style="margin:14px 0;font-size:14px;color:#475569;line-height:1.6;">Your Logistic Intel partnerships team sent you a fresh Stripe Connect onboarding link. Stripe handles identity, tax, and bank verification — LIT never sees your details.</p>
<a href="${args.url}" style="display:inline-block;padding:12px 22px;background:linear-gradient(180deg,#3B82F6,#2563EB);color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Open Stripe onboarding →</a>
<p style="margin:18px 0 0;font-size:12.5px;color:#64748b;line-height:1.6;">If the button doesn't work, paste this URL into your browser:<br/><span style="font-family:JetBrains Mono,monospace;color:#0F172A;word-break:break-all;">${escapeHtml(args.url)}</span></p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    "Finish connecting Stripe to receive payouts.",
    "",
    args.url,
    "",
    "— Logistic Intel",
  ].join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: args.fromEmail,
      to: args.to,
      subject: "Finish connecting Stripe to receive Logistic Intel payouts",
      html, text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${typeof data?.message === "string" ? data.message : "send failed"}`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authenticateSuperAdmin(req);
  if ("error" in auth) return auth.error;
  const { user, adminClient, env } = auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  try {
    /* ── kpis ─────────────────────────────────────── */
    if (action === "kpis") {
      const [pendingQ, partnersQ, suspendedQ, deactivatedQ, invitedQ, openInvitesQ, commissionsPendingQ, payoutsPendingQ] =
        await Promise.all([
          adminClient.from("affiliate_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
          adminClient.from("affiliate_partners").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
          adminClient.from("affiliate_partners").select("id", { count: "exact", head: true }).eq("status", "suspended").is("deleted_at", null),
          adminClient.from("affiliate_partners").select("id", { count: "exact", head: true }).eq("status", "deactivated").is("deleted_at", null),
          adminClient.from("affiliate_partners").select("id", { count: "exact", head: true }).eq("status", "invited").is("deleted_at", null),
          adminClient.from("affiliate_invites").select("id", { count: "exact", head: true }).is("claimed_at", null).is("revoked_at", null),
          adminClient.from("affiliate_commissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
          adminClient.from("affiliate_payouts").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
        ]);
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const [approvedQ, rejectedQ] = await Promise.all([
        adminClient.from("affiliate_applications").select("id", { count: "exact", head: true }).eq("status", "approved").gte("reviewed_at", since),
        adminClient.from("affiliate_applications").select("id", { count: "exact", head: true }).eq("status", "rejected").gte("reviewed_at", since),
      ]);
      return json({
        ok: true,
        applications_pending: pendingQ.count ?? 0,
        applications_approved_30d: approvedQ.count ?? 0,
        applications_rejected_30d: rejectedQ.count ?? 0,
        partners_active: partnersQ.count ?? 0,
        partners_suspended: suspendedQ.count ?? 0,
        partners_deactivated: deactivatedQ.count ?? 0,
        partners_invited: invitedQ.count ?? 0,
        invites_open: openInvitesQ.count ?? 0,
        commissions_pending: commissionsPendingQ.count ?? 0,
        payouts_pending: payoutsPendingQ.count ?? 0,
      });
    }

    /* ── list_applications ─────────────────────────────────────── */
    if (action === "list_applications") {
      const { data, error } = await adminClient
        .from("affiliate_applications")
        .select("id, user_id, status, full_name, company_or_brand, website_or_linkedin, country, audience_description, audience_size, primary_channels, expected_referral_volume, submitted_at, reviewed_at, reviewer, rejection_reason")
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (error) return json({ ok: false, error: error.message }, 500);
      const rows = data ?? [];
      const emails = await fetchEmails(adminClient, rows.map((r: any) => r.user_id));
      return json({
        ok: true,
        applications: rows.map((r: any) => ({ ...r, email: emails.get(r.user_id) ?? null })),
      });
    }

    /* ── list_invites ─────────────────────────────────────── */
    if (action === "list_invites") {
      const { data, error } = await adminClient
        .from("affiliate_invites")
        .select("id, email, name, company, note, tier_code, expires_at, claimed_at, claimed_by_user_id, partner_id, revoked_at, last_sent_at, send_count, invited_by_user_id, invited_by_email, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return json({ ok: false, error: error.message }, 500);
      const rows = data ?? [];
      const now = Date.now();
      return json({
        ok: true,
        invites: rows.map((r: any) => {
          const expired = r.expires_at && new Date(r.expires_at).getTime() < now;
          let state: "pending" | "claimed" | "expired" | "revoked";
          if (r.revoked_at) state = "revoked";
          else if (r.claimed_at) state = "claimed";
          else if (expired) state = "expired";
          else state = "pending";
          return { ...r, state };
        }),
      });
    }

    /* ── list_partners ─────────────────────────────────────── */
    if (action === "list_partners") {
      const includeDeleted = body.include_deleted === true;
      let q = adminClient
        .from("affiliate_partners")
        .select("id, user_id, application_id, invite_id, ref_code, tier, status, commission_pct, commission_months, stripe_status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, joined_at, suspended_at, deactivated_at, deleted_at, referral_link_status")
        .order("joined_at", { ascending: false })
        .limit(200);
      if (!includeDeleted) q = q.is("deleted_at", null);
      const { data: partners, error } = await q;
      if (error) return json({ ok: false, error: error.message }, 500);
      const partnerRows = partners ?? [];
      const partnerIds = partnerRows.map((p: any) => p.id);

      const aggMap = new Map<string, { referrals: number; lifetime_cents: number; available_cents: number; pending_cents: number }>();
      for (const id of partnerIds) {
        aggMap.set(id, { referrals: 0, lifetime_cents: 0, available_cents: 0, pending_cents: 0 });
      }

      if (partnerIds.length > 0) {
        const [refsQ, comsQ] = await Promise.all([
          adminClient.from("affiliate_referrals").select("partner_id").in("partner_id", partnerIds),
          adminClient.from("affiliate_commissions").select("partner_id, amount_cents, status").in("partner_id", partnerIds),
        ]);
        for (const r of refsQ.data ?? []) {
          const e = aggMap.get(r.partner_id);
          if (e) e.referrals += 1;
        }
        for (const c of comsQ.data ?? []) {
          const e = aggMap.get(c.partner_id);
          if (!e) continue;
          const amt = Number(c.amount_cents) || 0;
          if (c.status === "paid") e.lifetime_cents += amt;
          else if (c.status === "earned") {
            e.lifetime_cents += amt;
            e.available_cents += amt;
          } else if (c.status === "pending") {
            e.pending_cents += amt;
          }
        }
      }

      const emails = await fetchEmails(adminClient, partnerRows.map((p: any) => p.user_id));
      return json({
        ok: true,
        partners: partnerRows.map((p: any) => {
          const agg = aggMap.get(p.id) ?? { referrals: 0, lifetime_cents: 0, available_cents: 0, pending_cents: 0 };
          return {
            ...p,
            email: emails.get(p.user_id) ?? null,
            referrals_count: agg.referrals,
            lifetime_earnings_cents: agg.lifetime_cents,
            available_cents: agg.available_cents,
            pending_cents: agg.pending_cents,
          };
        }),
      });
    }

    /* ── list_partner_referrals ──────────────────────────────────
       Returns the referred accounts for a single partner with: email,
       signed-up date, current subscription status, attribution-expiry,
       and the commission earned to date. Used by the admin drawer
       (AdminPartnerProgram → Referrals tab on each row). */
    if (action === "list_partner_referrals") {
      const partnerId = String(body?.partner_id || "").trim();
      if (!partnerId) return json({ ok: false, error: "partner_id_required" }, 400);

      const { data: refs, error } = await adminClient
        .from("affiliate_referrals")
        .select("id, referred_user_id, referred_email, referred_company, plan_code, subscription_status, mrr_cents, first_seen_at, signed_up_at, became_paid_at, churned_at, attribution_expires_at, ref_code, created_at")
        .eq("partner_id", partnerId)
        .order("signed_up_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) return json({ ok: false, error: error.message }, 500);
      const rows = refs ?? [];

      // Per-referral commission totals (lifetime + outstanding).
      const referralIds = rows.map((r: any) => r.id);
      const commissionAgg = new Map<string, { lifetime_cents: number; pending_cents: number; paid_cents: number }>();
      if (referralIds.length > 0) {
        const { data: coms } = await adminClient
          .from("affiliate_commissions")
          .select("referral_id, amount_cents, status")
          .in("referral_id", referralIds);
        for (const c of coms ?? []) {
          const rid = (c as any).referral_id;
          if (!rid) continue;
          const e = commissionAgg.get(rid) || { lifetime_cents: 0, pending_cents: 0, paid_cents: 0 };
          const amt = Number((c as any).amount_cents) || 0;
          const status = (c as any).status;
          if (status === "paid") { e.paid_cents += amt; e.lifetime_cents += amt; }
          else if (status === "earned") { e.lifetime_cents += amt; }
          else if (status === "pending") { e.pending_cents += amt; }
          commissionAgg.set(rid, e);
        }
      }

      // Resolve fresh emails from auth.users when referred_email is null
      // (older referrals may not have the email cached).
      const userIds = rows
        .map((r: any) => r.referred_user_id)
        .filter((v: any): v is string => !!v && !rows.find((rr: any) => rr.referred_user_id === v)?.referred_email);
      const emailMap = userIds.length > 0 ? await fetchEmails(adminClient, userIds) : new Map<string, string>();

      const now = Date.now();
      const enriched = rows.map((r: any) => {
        const agg = commissionAgg.get(r.id) || { lifetime_cents: 0, pending_cents: 0, paid_cents: 0 };
        const expiresAt = r.attribution_expires_at ? new Date(r.attribution_expires_at).getTime() : null;
        return {
          ...r,
          referred_email: r.referred_email || emailMap.get(r.referred_user_id) || null,
          lifetime_cents: agg.lifetime_cents,
          pending_cents: agg.pending_cents,
          paid_cents: agg.paid_cents,
          attribution_active: expiresAt == null ? true : expiresAt > now,
        };
      });

      return json({ ok: true, referrals: enriched, total: enriched.length });
    }

    /* ── list_commissions ─────────────────────────────────────── */
    if (action === "list_commissions") {
      const { data: coms, error } = await adminClient
        .from("affiliate_commissions")
        .select("id, partner_id, referral_id, invoice_id, amount_cents, currency, commission_pct, commission_months, status, earned_at, clears_at, paid_at, voided_at, created_at, notes")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return json({ ok: false, error: error.message }, 500);
      const rows = coms ?? [];
      const partnerIds = Array.from(new Set(rows.map((r: any) => r.partner_id).filter(Boolean)));
      const referralIds = Array.from(new Set(rows.map((r: any) => r.referral_id).filter(Boolean)));
      const partnerMap = new Map<string, { name: string; ref_code: string }>();
      const referralMap = new Map<string, string>();
      if (partnerIds.length > 0) {
        const { data: partners } = await adminClient
          .from("affiliate_partners")
          .select("id, user_id, ref_code")
          .in("id", partnerIds);
        const userIds = (partners ?? []).map((p: any) => p.user_id);
        const emails = await fetchEmails(adminClient, userIds);
        for (const p of partners ?? []) {
          partnerMap.set(p.id, { name: emails.get(p.user_id) ?? p.user_id, ref_code: p.ref_code });
        }
      }
      if (referralIds.length > 0) {
        const { data: refs } = await adminClient
          .from("affiliate_referrals")
          .select("id, referred_email, referred_company")
          .in("id", referralIds);
        for (const r of refs ?? []) {
          referralMap.set(r.id, r.referred_company || r.referred_email || "—");
        }
      }
      return json({
        ok: true,
        commissions: rows.map((r: any) => ({
          ...r,
          partner_label: partnerMap.get(r.partner_id)?.name ?? null,
          partner_ref_code: partnerMap.get(r.partner_id)?.ref_code ?? null,
          referred_label: r.referral_id ? referralMap.get(r.referral_id) ?? null : null,
        })),
      });
    }

    /* ── list_payouts ─────────────────────────────────────── */
    if (action === "list_payouts") {
      const { data, error } = await adminClient
        .from("affiliate_payouts")
        .select("id, partner_id, period_start, period_end, amount_cents, currency, commissions_count, stripe_transfer_id, stripe_payout_id, status, paid_on, failure_reason, created_at")
        .order("period_start", { ascending: false })
        .limit(200);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, payouts: data ?? [] });
    }

    /* ── list_tiers ─────────────────────────────────────── */
    if (action === "list_tiers") {
      const { data: tiers, error } = await adminClient
        .from("affiliate_tiers")
        .select("id, code, name, commission_pct, commission_months, attribution_days, min_payout_cents, description, is_active")
        .order("commission_pct", { ascending: true });
      if (error) return json({ ok: false, error: error.message }, 500);
      const tierRows = tiers ?? [];
      const counts = new Map<string, number>();
      const { data: partners } = await adminClient
        .from("affiliate_partners")
        .select("tier")
        .eq("status", "active")
        .is("deleted_at", null);
      for (const p of partners ?? []) {
        counts.set(p.tier, (counts.get(p.tier) ?? 0) + 1);
      }
      return json({
        ok: true,
        tiers: tierRows.map((t: any) => ({ ...t, partners_count: counts.get(t.code) ?? 0 })),
      });
    }

    /* ── resend_invite ─────────────────────────────────────── */
    if (action === "resend_invite") {
      const inviteId = nonEmptyString(body.invite_id);
      if (!inviteId) return json({ ok: false, error: "invite_id required" }, 400);
      if (!env.resendApiKey) return json({ ok: false, code: "RESEND_NOT_CONFIGURED" }, 500);
      if (!env.fromEmail) return json({ ok: false, code: "RESEND_NOT_CONFIGURED" }, 500);

      const { data: existing, error: loadErr } = await adminClient
        .from("affiliate_invites")
        .select("id, email, name, note, token, expires_at, send_count, invited_by_email, claimed_at, revoked_at")
        .eq("id", inviteId)
        .maybeSingle();
      if (loadErr) return json({ ok: false, error: loadErr.message }, 500);
      if (!existing) return json({ ok: false, error: "Invite not found" }, 404);
      if (existing.claimed_at) return json({ ok: false, code: "ALREADY_CLAIMED" }, 409);
      if (existing.revoked_at) return json({ ok: false, code: "REVOKED" }, 409);

      const expired = new Date(existing.expires_at).getTime() < Date.now();
      let token = existing.token;
      let expiresAt = existing.expires_at;
      if (expired) {
        token = generateInviteToken();
        expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
      }
      const inviteUrl = `${env.appBaseUrl.replace(/\/$/, "")}/affiliate/onboarding?token=${encodeURIComponent(token)}`;
      try {
        await sendInviteEmail({
          resendApiKey: env.resendApiKey,
          fromEmail: env.fromEmail,
          to: existing.email,
          recipientName: existing.name,
          inviteUrl,
          invitedByEmail: existing.invited_by_email,
          note: existing.note,
          appBaseUrl: env.appBaseUrl,
        });
      } catch (err) {
        return json({
          ok: false, error: "Failed to send email",
          details: err instanceof Error ? err.message : String(err),
        }, 502);
      }
      const { error: updErr } = await adminClient
        .from("affiliate_invites")
        .update({
          token, expires_at: expiresAt,
          send_count: (existing.send_count ?? 0) + 1,
          last_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) console.error("[affiliate-admin] resend_invite persist failed", updErr);
      return json({ ok: true, invite_id: existing.id });
    }

    /* ── revoke_invite ─────────────────────────────────────── */
    if (action === "revoke_invite") {
      const inviteId = nonEmptyString(body.invite_id);
      if (!inviteId) return json({ ok: false, error: "invite_id required" }, 400);
      const { data, error } = await adminClient
        .from("affiliate_invites")
        .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", inviteId)
        .is("claimed_at", null)
        .is("revoked_at", null)
        .select("id, revoked_at")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data) return json({ ok: false, error: "Invite not found, already claimed, or already revoked" }, 404);
      return json({ ok: true, invite: data });
    }

    /* ── deactivate_partner ─────────────────────────────────────── */
    if (action === "deactivate_partner") {
      const partnerId = nonEmptyString(body.partner_id);
      if (!partnerId) return json({ ok: false, error: "partner_id required" }, 400);
      const { data, error } = await adminClient
        .from("affiliate_partners")
        .update({
          status: "deactivated",
          deactivated_at: new Date().toISOString(),
          referral_link_status: "paused",
          updated_at: new Date().toISOString(),
        })
        .eq("id", partnerId)
        .is("deleted_at", null)
        .select("id, status, deactivated_at, referral_link_status")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data) return json({ ok: false, error: "Partner not found or already deleted" }, 404);
      return json({ ok: true, partner: data });
    }

    /* ── reactivate_partner ─────────────────────────────────────── */
    if (action === "reactivate_partner") {
      const partnerId = nonEmptyString(body.partner_id);
      if (!partnerId) return json({ ok: false, error: "partner_id required" }, 400);
      const { data, error } = await adminClient
        .from("affiliate_partners")
        .update({
          status: "active",
          deactivated_at: null,
          referral_link_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", partnerId)
        .is("deleted_at", null)
        .select("id, status, deactivated_at, referral_link_status")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data) return json({ ok: false, error: "Partner not found or already deleted" }, 404);
      return json({ ok: true, partner: data });
    }

    /* ── soft_delete_partner ─────────────────────────────────────── */
    if (action === "soft_delete_partner") {
      const partnerId = nonEmptyString(body.partner_id);
      if (!partnerId) return json({ ok: false, error: "partner_id required" }, 400);
      const now = new Date().toISOString();
      const { data, error } = await adminClient
        .from("affiliate_partners")
        .update({
          deleted_at: now,
          status: "deactivated",
          referral_link_status: "deleted",
          updated_at: now,
        })
        .eq("id", partnerId)
        .is("deleted_at", null)
        .select("id, status, deleted_at, referral_link_status")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data) return json({ ok: false, error: "Partner not found or already deleted" }, 404);
      return json({ ok: true, partner: data });
    }

    /* ── resend_stripe_onboarding ─────────────────────────────────────── */
    if (action === "resend_stripe_onboarding") {
      const partnerId = nonEmptyString(body.partner_id);
      if (!partnerId) return json({ ok: false, error: "partner_id required" }, 400);
      if (!env.stripeSecretKey) return json({ ok: false, code: "STRIPE_NOT_CONFIGURED" }, 200);

      const { data: partner, error: pErr } = await adminClient
        .from("affiliate_partners")
        .select("id, user_id, status, stripe_account_id, stripe_status")
        .eq("id", partnerId)
        .is("deleted_at", null)
        .maybeSingle();
      if (pErr) return json({ ok: false, error: pErr.message }, 500);
      if (!partner) return json({ ok: false, error: "Partner not found" }, 404);
      if (partner.status === "deactivated" || partner.status === "terminated") {
        return json({ ok: false, error: `Partner status is ${partner.status}` }, 409);
      }

      const stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2024-06-20" });
      let stripeAccountId = partner.stripe_account_id;

      // Resolve partner email for Stripe + Resend.
      const emails = await fetchEmails(adminClient, [partner.user_id]);
      const partnerEmail = emails.get(partner.user_id) ?? null;

      if (!stripeAccountId) {
        try {
          const account = await stripe.accounts.create({
            type: "express",
            email: partnerEmail ?? undefined,
            capabilities: { transfers: { requested: true } },
            business_type: "individual",
            metadata: {
              supabase_user_id: partner.user_id,
              affiliate_partner_id: partner.id,
              triggered_by: "admin_resend",
            },
          });
          stripeAccountId = account.id;
          await adminClient
            .from("affiliate_partners")
            .update({
              stripe_account_id: stripeAccountId,
              stripe_status: "onboarding_started",
              updated_at: new Date().toISOString(),
            })
            .eq("id", partner.id);
        } catch (err) {
          console.error("[affiliate-admin] stripe account create failed", err);
          return json({
            ok: false,
            error: "Failed to create Stripe Connect account",
            details: err instanceof Error ? err.message : String(err),
          }, 500);
        }
      }

      const refreshUrl = `${env.appBaseUrl.replace(/\/$/, "")}/app/affiliate?stripe=refresh`;
      const returnUrl = `${env.appBaseUrl.replace(/\/$/, "")}/app/affiliate?stripe=return`;
      let onboardingUrl: string;
      try {
        const link = await stripe.accountLinks.create({
          account: stripeAccountId!,
          refresh_url: refreshUrl,
          return_url: returnUrl,
          type: "account_onboarding",
        });
        onboardingUrl = link.url;
      } catch (err) {
        console.error("[affiliate-admin] account link failed", err);
        return json({
          ok: false,
          error: "Failed to create Stripe onboarding link",
          details: err instanceof Error ? err.message : String(err),
        }, 500);
      }

      let emailSent = false;
      const wantEmail = body.send_email !== false;
      if (wantEmail && env.resendApiKey && env.fromEmail && partnerEmail) {
        try {
          await sendStripeLinkEmail({
            resendApiKey: env.resendApiKey,
            fromEmail: env.fromEmail,
            to: partnerEmail,
            url: onboardingUrl,
            appBaseUrl: env.appBaseUrl,
          });
          emailSent = true;
        } catch (err) {
          console.error("[affiliate-admin] stripe link email failed", err);
        }
      }

      return json({
        ok: true,
        partner_id: partner.id,
        url: onboardingUrl,
        stripe_account_id: stripeAccountId,
        email_sent: emailSent,
        partner_email: partnerEmail,
      });
    }

    /* ── update_partner_commission ─────────────────────────────────────── */
    if (action === "update_partner_commission") {
      const partnerId = nonEmptyString(body.partner_id);
      if (!partnerId) return json({ ok: false, error: "partner_id required" }, 400);

      const rawPct = body.commission_pct;
      const rawMonths = body.commission_months;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (rawPct !== undefined && rawPct !== null) {
        const pct = typeof rawPct === "string" ? Number(rawPct) : (rawPct as number);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          return json({
            ok: false,
            code: "INVALID_COMMISSION_PCT",
            error: "commission_pct must be a number between 0 (exclusive) and 100",
          }, 400);
        }
        updates.commission_pct = Math.round(pct * 100) / 100;
      }

      if (rawMonths !== undefined && rawMonths !== null) {
        const months = typeof rawMonths === "string" ? Number(rawMonths) : (rawMonths as number);
        if (!Number.isFinite(months) || months < 1 || months > 120 || !Number.isInteger(months)) {
          return json({
            ok: false,
            code: "INVALID_COMMISSION_MONTHS",
            error: "commission_months must be an integer between 1 and 120",
          }, 400);
        }
        updates.commission_months = months;
      }

      if (Object.keys(updates).length === 1) {
        return json({ ok: false, error: "Nothing to update — provide commission_pct and/or commission_months" }, 400);
      }

      const { data, error } = await adminClient
        .from("affiliate_partners")
        .update(updates)
        .eq("id", partnerId)
        .is("deleted_at", null)
        .select("id, commission_pct, commission_months, status")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data) return json({ ok: false, error: "Partner not found or already deleted" }, 404);
      return json({ ok: true, partner: data });
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[affiliate-admin] handler error", err);
    return json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
    }, 500);
  }
});
