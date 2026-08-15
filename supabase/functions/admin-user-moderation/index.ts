// admin-user-moderation — platform-admin spam/abuse moderation.
//
// Real session-revocation and hard-delete require the Supabase Auth Admin API
// (service role), which SQL RPCs cannot reach — hence this edge function.
//
// Auth: JWT-verified caller (via _shared/auth.ts requireUser) who MUST also be
// a platform admin (verified server-side against is_platform_admin(caller.id)
// through the service-role client). Non-admins get 403. Org admins are NOT
// platform admins and are rejected (per CLAUDE.md rule #5/#6).
//
// Actions (JSON body { action, user_id, reason?, confirm? }):
//   suspend    — profiles.status='suspended' + auth ban (~100y) to revoke
//                all sessions and block token refresh.
//   reactivate — profiles.status='active' + lift the auth ban.
//   delete     — HARD delete via auth.admin.deleteUser. Requires confirm:true.
//                Captures a light audit snapshot first. See FK/cascade notes.
//
// Every action writes an audit row via lit_audit_write(...) with actor=caller,
// target=email(or id), reason in metadata.
//
// FK / cascade note (investigated 2026-08-15 via pg_constraint):
//   auth.admin.deleteUser deletes the auth.users row; profiles + the vast
//   majority of app tables reference auth.users / profiles ON DELETE CASCADE
//   (or SET NULL) and are cleaned up automatically. However a handful of FKs
//   are ON DELETE NO ACTION and will BLOCK the delete if the target user has
//   rows in them:
//     lit_broadcasts.created_by, lit_fmcsa_import_runs.triggered_by,
//     lit_outreach_safety_holds.cleared_by, lit_recipient_consent.attested_by_user_id,
//     org_memberships.user_id, pulse_list_companies.added_by,
//     pulse_list_contacts.added_by, pulse_list_inbox.resolved_by.
//   A freshly-caught bot has no such rows, so delete succeeds for the spam
//   case. If deleteUser returns a FK error we surface it verbatim so the admin
//   can suspend instead. We do NOT auto-null those columns here (they are
//   authorship/audit fields; suspend is the safer default for real users).

import { requireUser, json, handlePreflight } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

// ~100-year ban. Supabase ban_duration accepts a Go duration string; hours are
// the largest safe unit, so 876000h ≈ 100y. "none" lifts the ban.
const BAN_DURATION = "876000h";

type Action = "suspend" | "reactivate" | "delete";

Deno.serve(async (req: Request): Promise<Response> => {
  const log = createLogger("admin-user-moderation", { request_id: requestId() });

    const pre = handlePreflight(req);
    if (pre) return pre;
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    // 1. Verify JWT — caller must be a real authenticated user.
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user, admin } = auth;

    // 2. Platform-admin gate (server-side, service-role). This is the security
    //    boundary — frontend gating is only a UX hint (CLAUDE.md rule #6).
    const { data: isAdmin, error: gateErr } = await admin.rpc("is_platform_admin", {
      p_user_id: user.id,
    });
    if (gateErr) {
      log.error("gate_check_failed", { err: gateErr.message, user_id: user.id });
      return json({ ok: false, error: "Authorization check failed" }, 500);
    }
    if (isAdmin !== true) {
      log.warn("forbidden_non_admin", { user_id: user.id });
      return json({ ok: false, error: "Forbidden: platform admin required" }, 403);
    }

    // 3. Parse + validate body.
    let body: { action?: string; user_id?: string; reason?: string; confirm?: boolean };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }
    const action = body.action as Action | undefined;
    const targetId = (body.user_id || "").trim();
    const reason = (body.reason || "").trim() || null;

    if (!action || !["suspend", "reactivate", "delete"].includes(action)) {
      return json({ ok: false, error: "Invalid action" }, 400);
    }
    if (!targetId) return json({ ok: false, error: "user_id required" }, 400);
    if (targetId === user.id) {
      return json({ ok: false, error: "You cannot moderate your own account" }, 400);
    }

    // Resolve the target's email for a readable audit target.
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", targetId)
      .maybeSingle();
    const targetEmail = (targetProfile as { email?: string } | null)?.email ?? targetId;

    const writeAudit = async (auditAction: string, severity: string, metadata: Record<string, unknown>) => {
      const { error } = await admin.rpc("lit_audit_write", {
        p_actor_id: user.id,
        p_actor_role: "platform_admin",
        p_action: auditAction,
        p_target: targetEmail,
        p_severity: severity,
        p_source: "admin-user-moderation",
        p_metadata: { user_id: targetId, reason, ...metadata },
      });
      if (error) log.warn("audit_write_failed", { err: error.message, action: auditAction });
    };

    try {
      if (action === "suspend") {
        const { error: profErr } = await admin
          .from("profiles")
          .update({ status: "suspended", updated_at: new Date().toISOString() })
          .eq("id", targetId);
        if (profErr) throw new Error(`profile update failed: ${profErr.message}`);

        const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
          ban_duration: BAN_DURATION,
        });
        if (banErr) throw new Error(`ban failed: ${banErr.message}`);

        await writeAudit("admin.user.suspend", "warn", { ban_duration: BAN_DURATION });
        log.info("suspended", { target: targetId, actor: user.id });
        return json({ ok: true, action, user_id: targetId, new_state: "suspended" });
      }

      if (action === "reactivate") {
        const { error: profErr } = await admin
          .from("profiles")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("id", targetId);
        if (profErr) throw new Error(`profile update failed: ${profErr.message}`);

        const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
          ban_duration: "none",
        });
        if (banErr) throw new Error(`unban failed: ${banErr.message}`);

        await writeAudit("admin.user.reactivate", "info", {});
        log.info("reactivated", { target: targetId, actor: user.id });
        return json({ ok: true, action, user_id: targetId, new_state: "active" });
      }

      // action === "delete" — HARD delete. Guarded by explicit confirm:true.
      if (body.confirm !== true) {
        return json({ ok: false, error: "Hard delete requires confirm:true" }, 400);
      }

      // Light snapshot for the audit trail BEFORE the row disappears.
      const { data: authUser } = await admin.auth.admin.getUserById(targetId);
      const snapshot = {
        email: targetEmail,
        created_at: authUser?.user?.created_at ?? null,
        last_sign_in_at: authUser?.user?.last_sign_in_at ?? null,
        email_confirmed_at: authUser?.user?.email_confirmed_at ?? null,
      };

      const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
      if (delErr) {
        // Most likely an ON DELETE NO ACTION FK (see header). Surface verbatim
        // so the admin can fall back to suspend.
        log.error("delete_failed", { err: delErr.message, target: targetId });
        await writeAudit("admin.user.delete.failed", "error", { error: delErr.message, snapshot });
        return json(
          { ok: false, action, user_id: targetId, error: `Delete failed: ${delErr.message}` },
          409,
        );
      }

      await writeAudit("admin.user.delete", "error", { snapshot });
      log.info("deleted", { target: targetId, actor: user.id });
      return json({ ok: true, action, user_id: targetId, new_state: "deleted" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("moderation_action_failed", { err: msg, action, target: targetId });
      return json({ ok: false, action, user_id: targetId, error: msg }, 500);
    }
  });
