// request-company-access — collision-awareness "Request access" action.
//
// When a user opens a company that an ORG-MATE already saved (shared saves,
// gated by organizations.saved_sharing_enabled), the collision card offers a
// "Request access" button. This function notifies the org-mate who saved the
// company:
//   1. In-app: inserts a lit_notifications row for the saver (kind 'system' —
//      constrained by lit_notifications_kind_chk; metadata carries the
//      structured request payload).
//   2. Email: Resend (LIT_RESEND_API_KEY), same from/reply-to idiom as
//      send-subscription-email. Soft-fails — the in-app notification is the
//      contract; email is best-effort.
//
// Server-side enforcement (RLS-independent, service-role reads):
//   - caller must be an active member of an org,
//   - that org's saved_sharing_enabled must be ON (sharing OFF ⇒ org-mates'
//     saves are invisible, so the request path is refused too),
//   - the target save must belong to the SAME org and a DIFFERENT user.

import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("request-company-access");

interface RequestBody {
  /** lit_companies.id (uuid) of the company the caller wants access to. */
  company_id?: string;
  /** Optional free-text note from the requester (plain text, truncated). */
  message?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, admin } = auth;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const companyId = String(body.company_id ?? "").trim();
  if (!UUID_RE.test(companyId)) {
    return json({ ok: false, error: "company_id (uuid) is required", code: "INVALID_INPUT" }, 400);
  }
  const message = String(body.message ?? "").trim().slice(0, 500);

  try {
    // Caller's primary org (oldest active membership — same rule as save-company).
    const { data: myMembership } = await admin
      .from("org_members")
      .select("org_id, full_name, email, title")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const orgId = myMembership?.org_id ?? null;
    if (!orgId) {
      return json({ ok: false, error: "You are not a member of a workspace", code: "NO_ORG" }, 403);
    }

    // Sharing toggle — org owner controls it in Settings → Workspace.
    const { data: org } = await admin
      .from("organizations")
      .select("id, name, saved_sharing_enabled")
      .eq("id", orgId)
      .maybeSingle();
    if (!org || org.saved_sharing_enabled === false) {
      return json(
        { ok: false, error: "Saved-company sharing is disabled for this workspace", code: "SHARING_DISABLED" },
        403,
      );
    }

    // The org-mate's save of this company (most recent activity first).
    const { data: saves } = await admin
      .from("lit_saved_companies")
      .select("id, user_id, org_id, created_at, last_activity_at")
      .eq("company_id", companyId)
      .eq("org_id", orgId)
      .neq("user_id", user.id)
      .order("last_activity_at", { ascending: false, nullsFirst: false });
    const target = saves?.[0] ?? null;
    if (!target) {
      return json(
        { ok: false, error: "No workspace member has this company saved", code: "NO_ORG_SAVE" },
        404,
      );
    }

    const [{ data: company }, { data: saver }] = await Promise.all([
      admin.from("lit_companies").select("id, name, source_company_key").eq("id", companyId).maybeSingle(),
      admin
        .from("org_members")
        .select("user_id, full_name, email, title")
        .eq("org_id", orgId)
        .eq("user_id", target.user_id)
        .maybeSingle(),
    ]);

    const companyName = company?.name ?? "a saved company";
    const requesterName =
      (myMembership?.full_name ?? "").trim() ||
      (user.email ?? "").split("@")[0] ||
      "A teammate";
    const requesterEmail = myMembership?.email ?? user.email ?? null;
    const saverName = (saver?.full_name ?? "").trim() || (saver?.email ?? "").split("@")[0] || "there";

    const appUrl = (Deno.env.get("LIT_APP_URL") ?? "https://app.logisticintel.com").replace(/\/+$/, "");
    const companyPath = `/app/companies/${company?.source_company_key ?? companyId}`;

    // 1) In-app notification for the saver.
    const { error: notifyError } = await admin.from("lit_notifications").insert({
      user_id: target.user_id,
      org_id: orgId,
      kind: "system",
      severity: "medium",
      title: `${requesterName} requested access to ${companyName}`,
      body: message
        ? `"${message}" — reply to coordinate on this account.`
        : `${requesterName} is looking at ${companyName}, which you saved. Reach out to coordinate on this account.`,
      cta_label: "Open company",
      cta_url: companyPath,
      source_table: "lit_saved_companies",
      source_id: target.id,
      metadata: {
        type: "company_access_request",
        company_id: companyId,
        company_name: companyName,
        requester_id: user.id,
        requester_name: requesterName,
        requester_email: requesterEmail,
        requester_title: myMembership?.title ?? null,
        message: message || null,
      },
    });
    if (notifyError) {
      log.error("notification_insert_failed", { err: notifyError.message, saver_id: target.user_id });
      return json({ ok: false, error: "Failed to notify the saver", code: "NOTIFY_FAILED" }, 500);
    }

    // 2) Best-effort email to the saver via Resend.
    let emailed = false;
    const resendKey = Deno.env.get("LIT_RESEND_API_KEY");
    const saverEmail = saver?.email ?? null;
    if (resendKey && saverEmail) {
      const fromEmail =
        Deno.env.get("LIT_EMAIL_FROM") ?? "Gabriel from LIT <hello@updates.logisticintel.com>";
      const replyTo = Deno.env.get("LIT_EMAIL_REPLY_TO") ?? "hello@logisticintel.com";
      const safeCompany = escapeHtml(companyName);
      const safeRequester = escapeHtml(requesterName);
      const safeTitle = myMembership?.title ? ` (${escapeHtml(myMembership.title)})` : "";
      const safeMessage = message ? `<p style="margin:12px 0;padding:10px 14px;background:#F1F5F9;border-radius:8px;color:#334155;">"${escapeHtml(message)}"</p>` : "";
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [saverEmail],
            reply_to: requesterEmail ?? replyTo,
            subject: `${requesterName} requested access to ${companyName} on LIT`,
            html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0F172A;">
  <h2 style="font-size:18px;margin:24px 0 8px;">Access request in your workspace</h2>
  <p style="margin:8px 0;color:#334155;line-height:1.6;">
    <strong>${safeRequester}</strong>${safeTitle} is working on
    <strong>${safeCompany}</strong> — a company you saved${org.name ? ` in ${escapeHtml(org.name)}` : ""}.
    They asked to coordinate with you on this account.
  </p>
  ${safeMessage}
  <p style="margin:20px 0;">
    <a href="${appUrl}${companyPath}" style="background:#1D4ED8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Open ${safeCompany}</a>
  </p>
  <p style="margin:16px 0;color:#64748B;font-size:12px;">Replying to this email goes straight to ${safeRequester}.</p>
</div>`,
            text: `${requesterName}${myMembership?.title ? ` (${myMembership.title})` : ""} requested access to ${companyName}, a company you saved. ${message ? `Message: "${message}". ` : ""}Open it here: ${appUrl}${companyPath}`,
            tags: [{ name: "event_type", value: "company_access_request" }],
          }),
        });
        emailed = resp.ok;
        if (!resp.ok) {
          const detail = await resp.text().catch(() => "");
          log.warn("resend_send_failed", { status: resp.status, detail: detail.slice(0, 300) });
        }
      } catch (err) {
        log.warn("resend_send_threw", { err: String(err) });
      }
    }

    log.info("access_request_sent", {
      user_id: user.id,
      org_id: orgId,
      company_id: companyId,
      saver_id: target.user_id,
      emailed,
    });

    return json({
      ok: true,
      notified: { user_id: target.user_id, name: saverName },
      emailed,
    });
  } catch (err) {
    log.error("unhandled", { err: String(err) });
    return json({ ok: false, error: "Internal error", code: "INTERNAL" }, 500);
  }
});
