// credit-unlock-company — the reference Phase 3 metering endpoint (§7).
//
// Unlocking a NEW company costs 1 credit at the WORKSPACE level; re-viewing an
// already-unlocked company is free. Fully gated behind credits_metering_enabled
// (dark launch): while the flag is OFF, unlocking is free and behaves exactly as
// today, so this can ship with zero customer impact until the flag is flipped.
//
// This is the canonical shape for every future metered action: resolve org →
// check the metering flag → meterAction(...) via the shared CreditService.
import { requireUser, json, handlePreflight } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import { meterAction, hasUnlocked, getCreditBalance } from "../_shared/credits.ts";

const moduleLog = createLogger("credit-unlock-company");

function unlockKey(v: unknown): string {
  return String(v ?? "").replace(/^company\//i, "").toLowerCase().trim();
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const log = moduleLog.child({ request_id: requestId() });

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, admin } = auth;

  const { data: om } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const orgId = (om as { org_id?: string } | null)?.org_id ?? null;
  if (!orgId) return json({ ok: false, error: "no_org" }, 400);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const entityId = unlockKey(body.source_company_key ?? body.company_key ?? body.company_id);
  if (!entityId) return json({ ok: false, error: "company_key_required" }, 400);
  const companyName = (body.company_name as string | null) ?? null;

  // Metering gate (dark launch). When OFF, unlocking is free.
  const { data: flag } = await admin
    .from("lit_feature_flags")
    .select("global_kill")
    .eq("key", "credits_metering_enabled")
    .maybeSingle();
  const meteringOn = flag && (flag as { global_kill?: boolean }).global_kill === false;

  if (!meteringOn) {
    return json({ ok: true, unlocked: true, charged: 0, metering_off: true });
  }

  // Already owned by the workspace → free re-view.
  if (await hasUnlocked(admin, orgId, "company", entityId)) {
    return json({ ok: true, unlocked: true, charged: 0, already_owned: true });
  }

  // Unlock = access grant; there's no provider call, so `work` just succeeds and
  // commit records workspace ownership in lit_workspace_unlocks.
  const meter = await meterAction(
    admin,
    { orgId, userId: user.id, feature: "company_unlock", entityType: "company", entityId, metadata: { company_name: companyName, company_id: body.company_id ?? null } },
    async () => ({ ok: true }),
  );

  if (!meter.ok) {
    if (meter.blocked) {
      const bal = await getCreditBalance(admin, orgId);
      return json(
        { ok: false, error: "insufficient_credits", code: "insufficient_credits", reason: meter.reason, balance: bal },
        402,
      );
    }
    log.error("unlock_failed", { err: meter.reason, org_id: orgId, entity_id: entityId });
    return json({ ok: false, error: "unlock_failed", reason: meter.reason }, 500);
  }

  log.info("company_unlocked", { org_id: orgId, entity_id: entityId, charged: meter.charged, already_owned: meter.alreadyOwned });
  return json({ ok: true, unlocked: true, charged: meter.charged ?? 0, already_owned: meter.alreadyOwned === true });
});
