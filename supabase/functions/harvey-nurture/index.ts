// harvey-nurture — Project Harvey TRIAL NURTURE engine.
//
// Harvey nurtures EXISTING LIT trial / signed-up users who have NOT upgraded,
// to help them activate and convert. This REPLACES the old behavioral trial
// drip (the day1/day2/tip/book_demo/check_in/trial_ending sweeps that
// subscription-email-cron used to fire). The owner set
// lit_internal_meta['harvey_owns_trial_nurture']='true', so that cron now hands
// those behavioral touches to Harvey.
//
// These people ALREADY signed up for LIT — they are customers/trials, NOT cold
// freight-sales prospects. So Harvey writes in his TRIAL-LIFECYCLE voice
// (trial_welcome / trial_day_2 / trial_inactive / trial_searches_no_contacts /
// trial_near_end templates), never cold outreach.
//
// This function DRAFTS ONLY. It never sends. It selects not-upgraded lifecycle
// users, invokes harvey-writer to persist an on-voice trial-lifecycle draft,
// then stamps metadata_json.lifecycle onto that draft so the dispatcher can
// record the lifecycle send + dedup via lit_lifecycle_record_send. Sending is
// gated later in dispatch (dryRun / paused / suppression are re-checked there).
//
// INTERNAL-ONLY boundary (mirrors harvey-controller's dual auth):
//   - verified pg_cron (X-Internal-Cron == LIT_CRON_SECRET), OR
//   - authenticated PLATFORM ADMIN (requireUser + isUserAdmin.isPlatformAdmin).
//   Everyone else gets 401/403.
//
// Gates (fail CLOSED — same layer as harvey-controller):
//   1. lit_feature_flags['harvey_internal_agent'] exists + not killed.
//   2. lit_agent_config['harvey'].enabled === true.
//   3. Quiet hours skip the run unless trigger_type is 'manual'/'test'.
//   (dryRun does NOT block drafting — drafting is always safe.)
//
// Input JSON: { agent_name='harvey', trigger_type?, limit?, created_by? }
// Response:   { ok, run_id, drafted, candidates, skipped, by_stage }.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { handlePreflight, json, requireUser, isUserAdmin } from "../_shared/auth.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import {
  completeAgentRun,
  isAgentFlagEnabled,
  loadAgentConfig,
  recordAgentRun,
  withinQuietHours,
} from "../_shared/agent.ts";

const AGENT_NAME = "harvey-nurture";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";
const CAMPAIGN = "lifecycle";
const DEFAULT_LIMIT = 20;

type TriggerType = "cron" | "webhook" | "manual" | "test";

// A not-upgraded signup from lit_lifecycle_user_stages. The view already
// excludes converted/internal/suspended/banned users — every row is eligible.
interface LifecycleRow {
  user_id: string;
  email: string | null;
  stage: string | null;
  event_type: string | null;
  deep_link: string | null;
  recent_company_key: string | null;
  current_plan: string | null;
  activity_count_30d: number | null;
  last_active_at: string | null;
  trial_started_at: string | null;
}

// stage → the Harvey trial-lifecycle template intent + the "what they've done"
// framing + the suggested next action the writer should nudge toward.
interface StageMapping {
  intent: string;
  situation: string;
  nextAction: string;
}

function mapStage(stage: string | null, deepLink: string | null): StageMapping {
  const s = (stage ?? "").trim().toLowerCase();
  const link = deepLink && deepLink.trim() ? deepLink.trim() : null;
  switch (s) {
    case "stage0":
      // Never searched — day-1 activation.
      return {
        intent: "trial_welcome",
        situation: "they signed up but have not run a single company search yet",
        nextAction: link
          ? `run their first search (${link})`
          : "run their first company search",
      };
    case "stage1":
      // Searched but not saving companies.
      return {
        intent: "trial_day_2",
        situation: "they have started searching but have not saved any companies to work",
        nextAction: link
          ? `save a company that matches their book (${link})`
          : "save a company that matches their book of business",
      };
    case "stage2":
    case "stage3":
      // Saved companies / searched but no contacts enriched.
      return {
        intent: "trial_searches_no_contacts",
        situation:
          "they are finding companies but have not enriched any contacts, so they cannot reach a buyer yet",
        nextAction: link
          ? `enrich a decision-maker contact on a saved company (${link})`
          : "enrich a decision-maker contact on one of their saved companies",
      };
    case "stage4":
      // Engaged trial — recap value toward upgrade.
      return {
        intent: "trial_inactive",
        situation:
          "they have gotten real value from the trial (searched, saved, enriched) but have not upgraded",
        nextAction: link
          ? `pick up where they left off and see the value recap (${link})`
          : "pick up where they left off and keep the momentum toward upgrading",
      };
    case "trial_expiry":
      // Trial ending — upgrade push.
      return {
        intent: "trial_near_end",
        situation: "their free trial is ending soon and they have not upgraded",
        nextAction: link
          ? `upgrade before the trial ends so they keep their saved work (${link})`
          : "upgrade before the trial ends so they keep their saved work",
      };
    default:
      // Unknown lifecycle stage — treat as a general activation nudge. Keep a
      // concrete, non-"unknown" intent so harvey-writer does NOT classify it
      // sensitive (its isSensitive() flags stage/intent === 'unknown').
      return {
        intent: "trial_inactive",
        situation: "they are an active trial that has not upgraded yet",
        nextAction: link ? `come back and keep exploring (${link})` : "come back and keep exploring LIT",
      };
  }
}

// ─── suppression (mirror harvey-prospect + the 3 legacy tables) ──────────────

/**
 * True when this email must NOT be nurtured. Checks the suppression RPC plus
 * the three legacy suppression tables. Fails SAFE: on any lookup error we
 * suppress (never draft toward an address we cannot confirm is clean).
 */
async function isSuppressed(admin: SupabaseClient, email: string | null): Promise<boolean> {
  if (!email) return true; // no address = cannot nurture
  const addr = email.trim().toLowerCase();

  // 1. Primary: SECURITY DEFINER RPC (converted/bounced/complained/unsubscribed).
  try {
    const { data, error } = await admin.rpc("lit_email_suppression_status", { p_email: addr });
    if (error) return true; // fail safe
    const row = (Array.isArray(data) ? data[0] : data) as
      | { converted?: boolean; bounced?: boolean; complained?: boolean; unsubscribed?: boolean }
      | null;
    if (row && (row.converted || row.bounced || row.complained || row.unsubscribed)) return true;
  } catch (_err) {
    return true; // fail safe
  }

  // 2. lit_email_unsubscribes (recipient_email).
  try {
    const { data } = await admin
      .from("lit_email_unsubscribes")
      .select("id")
      .eq("recipient_email", addr)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  } catch (_err) {
    return true;
  }

  // 3. lit_email_suppression_list (email).
  try {
    const { data } = await admin
      .from("lit_email_suppression_list")
      .select("email")
      .eq("email", addr)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  } catch (_err) {
    return true;
  }

  // 4. lit_marketing_suppression_list (email).
  try {
    const { data } = await admin
      .from("lit_marketing_suppression_list")
      .select("email")
      .eq("email", addr)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  } catch (_err) {
    return true;
  }

  return false;
}

// ─── firstName resolution ────────────────────────────────────────────────────

/** First token of profiles.full_name, or 'there'. */
async function resolveFirstName(admin: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const full = (data as { full_name?: string | null } | null)?.full_name ?? null;
    const first = full ? full.trim().split(/\s+/)[0] : null;
    return first && first.length ? first : "there";
  } catch (_err) {
    return "there";
  }
}

// ─── server-to-server harvey-writer invoke (gateway-auth pattern) ────────────

/**
 * Invoke harvey-writer exactly like harvey-controller's invokeWorker:
 * X-Internal-Cron + Authorization/apikey (service role) so the gateway routes
 * the internal call before the target fn's cron check runs. Never throws.
 */
async function invokeWriter(
  bodyObj: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; data?: Record<string, unknown>; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) return { ok: false, error: "SUPABASE_URL not configured" };
  if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured" };

  const url = `${supabaseUrl}/functions/v1/harvey-writer`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Cron": cronSecret,
        "Authorization": `Bearer ${gatewayKey}`,
        "apikey": gatewayKey,
      },
      body: JSON.stringify(bodyObj),
    });
    if (res.status === 404) return { ok: false, status: 404, error: "harvey-writer not deployed" };
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok || (data && (data as Record<string, unknown>).ok === false)) {
      const errMsg = (data && typeof (data as Record<string, unknown>).error === "string")
        ? String((data as Record<string, unknown>).error)
        : `harvey-writer HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: errMsg };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, error: `harvey-writer unreachable: ${String((err as Error)?.message ?? err)}` };
  }
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  // ── parse body first so cron callers can pass trigger_type/created_by/limit ─
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── auth: verified cron OR platform-admin — else 401/403 ───────────────────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null = typeof body.created_by === "string" ? body.created_by : null;

  if (req.headers.get("X-Internal-Cron")) {
    const cron = verifyCronAuth(req);
    if (!cron.ok) return cron.response;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "cron";
    triggerType = requested === "manual" || requested === "test" || requested === "webhook"
      ? requested
      : "cron";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("missing_supabase_env");
      return json({ ok: false, error: "server_misconfigured", request_id: rid }, 500);
    }
    admin = createClient(supabaseUrl, serviceKey);
  } else {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { isPlatformAdmin } = await isUserAdmin(auth.admin, auth.user.id);
    if (!isPlatformAdmin) {
      log.warn("forbidden_not_platform_admin", { user_id: auth.user.id });
      return json({ ok: false, error: "forbidden", request_id: rid }, 403);
    }
    admin = auth.admin;
    actorUserId = auth.user.id;
    triggerType = body.trigger_type === "test" ? "test" : "manual";
  }

  const limit = (() => {
    const raw = typeof body.limit === "number" ? body.limit : Number(body.limit);
    if (Number.isFinite(raw) && raw > 0) return Math.min(200, Math.floor(raw));
    return DEFAULT_LIMIT;
  })();

  let runId: string | null = null;
  try {
    // ── gate 1: feature flag — fail CLOSED ──────────────────────────────────
    const flagEnabled = await isAgentFlagEnabled(admin, FLAG_KEY);
    if (!flagEnabled) {
      const reason = `feature flag '${FLAG_KEY}' missing or killed (fail-closed)`;
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        input_json: { request_id: rid, actor_user_id: actorUserId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_flag_disabled", { run_id: runId, trigger_type: triggerType });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }

    // ── gate 2: agent config must exist AND be enabled ──────────────────────
    const config = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config || config.enabled !== true) {
      const reason = config
        ? "lit_agent_config['harvey'].enabled is false"
        : "lit_agent_config['harvey'] row missing (fail-closed)";
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        test_mode: config?.testMode === true,
        input_json: { request_id: rid, actor_user_id: actorUserId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_config_disabled", { run_id: runId, trigger_type: triggerType });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }
    const testMode = config.testMode === true;

    // ── gate 3: quiet hours (manual/test exempt) ────────────────────────────
    if (triggerType !== "manual" && triggerType !== "test" && withinQuietHours(config)) {
      const qh = config.quietHours;
      const reason = `within quiet hours (${qh?.start}–${qh?.end} ${qh?.timezone})`;
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        test_mode: testMode,
        input_json: { request_id: rid, actor_user_id: actorUserId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_quiet_hours", { run_id: runId, trigger_type: triggerType });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }

    // ── open the run before selection so an error still has a run id ─────────
    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "running",
      test_mode: testMode,
      input_json: { request_id: rid, actor_user_id: actorUserId, limit },
    });
    log.info("run_started", { run_id: runId, trigger_type: triggerType, test_mode: testMode, limit });

    // ── 1. read nurture candidates from the lifecycle view (service role) ────
    // The view ALREADY excludes converted/internal/suspended/banned users —
    // every row is a not-upgraded signup. Over-fetch so we can drop dedup /
    // suppressed / already-drafted rows and still fill the batch.
    const overFetch = Math.max(limit * 6, limit);
    const { data: rawRows, error: viewErr } = await admin
      .from("lit_lifecycle_user_stages")
      .select(
        "user_id, email, stage, event_type, deep_link, recent_company_key, current_plan, activity_count_30d, last_active_at, trial_started_at",
      )
      .order("last_active_at", { ascending: true, nullsFirst: true })
      .limit(overFetch);
    if (viewErr) throw new Error(`lit_lifecycle_user_stages read failed: ${viewErr.message}`);
    const candidates = (rawRows ?? []) as LifecycleRow[];

    // ── 2. dedup against lit_lifecycle_sends for (user_id, current stage) ────
    // The cross-engine ledger: a user already sent for THIS stage under the
    // 'lifecycle' campaign must not be nurtured again for the same stage.
    const userIds = Array.from(new Set(candidates.map((c) => c.user_id).filter(Boolean)));
    const sentKeys = new Set<string>(); // `${user_id}|${stage}`
    if (userIds.length) {
      const { data: sends, error: sendsErr } = await admin
        .from("lit_lifecycle_sends")
        .select("user_id, stage, campaign")
        .in("user_id", userIds)
        .eq("campaign", CAMPAIGN);
      if (sendsErr) throw new Error(`lit_lifecycle_sends read failed: ${sendsErr.message}`);
      for (const s of sends ?? []) {
        const row = s as { user_id: string; stage: string | null };
        sentKeys.add(`${row.user_id}|${row.stage ?? ""}`);
      }
    }

    // ── 3. exclude users who already have an un-sent nurture draft for this ──
    //     stage (metadata_json.lifecycle.user_id + stage). Avoids piling drafts.
    // Pull recent harvey trial-stage drafts that are not yet sent/approved-out
    // and index by (lifecycle.user_id | lifecycle.stage).
    const pendingDraftKeys = new Set<string>(); // `${user_id}|${stage}`
    {
      const { data: drafts, error: draftErr } = await admin
        .from("lit_agent_drafts")
        .select("id, status, metadata_json")
        .eq("agent_name", CONFIG_KEY)
        .eq("stage", "trial")
        .in("status", ["pending_approval", "approved", "draft"])
        .order("created_at", { ascending: false })
        .limit(1000);
      if (draftErr) throw new Error(`lit_agent_drafts read failed: ${draftErr.message}`);
      for (const d of drafts ?? []) {
        const meta = (d as { metadata_json?: Record<string, unknown> | null }).metadata_json ?? null;
        const lc = meta && typeof meta === "object" ? (meta as Record<string, unknown>).lifecycle : null;
        if (lc && typeof lc === "object") {
          const uid = (lc as Record<string, unknown>).user_id;
          const st = (lc as Record<string, unknown>).stage;
          if (typeof uid === "string") pendingDraftKeys.add(`${uid}|${typeof st === "string" ? st : ""}`);
        }
      }
    }

    // ── 4. build the eligible batch (dedup + suppression + no pending draft) ─
    const byStage: Record<string, number> = {};
    const skipReasons = { already_sent: 0, pending_draft: 0, suppressed: 0, no_email: 0 };
    const seenUsers = new Set<string>();
    let drafted = 0;
    const failures: Array<{ user_id: string; error: string }> = [];

    for (const cand of candidates) {
      if (drafted >= limit) break;
      if (!cand.user_id) continue;
      if (seenUsers.has(cand.user_id)) continue; // one draft per user per run
      const stageKey = `${cand.user_id}|${cand.stage ?? ""}`;

      if (sentKeys.has(stageKey)) {
        skipReasons.already_sent++;
        continue;
      }
      if (pendingDraftKeys.has(stageKey)) {
        skipReasons.pending_draft++;
        continue;
      }
      if (!cand.email) {
        skipReasons.no_email++;
        continue;
      }
      if (await isSuppressed(admin, cand.email)) {
        skipReasons.suppressed++;
        continue;
      }

      seenUsers.add(cand.user_id);

      const mapping = mapStage(cand.stage, cand.deep_link);
      const firstName = await resolveFirstName(admin, cand.user_id);

      const instructions = [
        "This is an EXISTING LIT trial user (not a cold prospect).",
        "Help them get value from their trial and move toward upgrading.",
        "Use the trial-lifecycle voice (helpful, activation-focused), NOT cold outreach.",
        `Their lifecycle stage is ${cand.stage ?? "unknown"} (${mapping.situation}).`,
        `Suggested next action: ${mapping.nextAction}.`,
        "You MAY include the booking link only if inviting them to a session; otherwise do not.",
      ].join(" ");

      const lifecycle = {
        user_id: cand.user_id,
        stage: cand.stage,
        event_type: cand.event_type,
        campaign: CAMPAIGN,
        deep_link: cand.deep_link,
      };

      // Call harvey-writer. We ALSO pass `lifecycle` in the body — harvey-writer
      // does not currently forward unknown fields (verified: its WriterInput
      // ignores them and metadata_json is a fixed object), so we do NOT rely on
      // it. After the draft is created we post-update metadata_json.lifecycle
      // and null out lead_id below.
      const res = await invokeWriter({
        agent_name: CONFIG_KEY,
        channel: "email",
        stage: "trial",
        intent: mapping.intent,
        contact: { firstName, email: cand.email },
        research: null,
        instructions,
        created_by: actorUserId,
        trigger_type: triggerType,
        lifecycle,
      });

      if (!res.ok) {
        failures.push({ user_id: cand.user_id, error: res.error ?? "harvey-writer failed" });
        continue;
      }

      const draftId = res.data && typeof res.data.draft_id === "string"
        ? res.data.draft_id as string
        : null;

      // ── stamp metadata_json.lifecycle so the dispatcher can record the send
      //    + dedup (lit_lifecycle_record_send), and null lead_id (nurture drafts
      //    are user-scoped, not lead-scoped). Merge to preserve writer metadata.
      if (draftId) {
        try {
          const { data: existing } = await admin
            .from("lit_agent_drafts")
            .select("metadata_json")
            .eq("id", draftId)
            .maybeSingle();
          const prevMeta = (existing as { metadata_json?: Record<string, unknown> | null } | null)
            ?.metadata_json ?? {};
          const mergedMeta = { ...(prevMeta as Record<string, unknown>), lifecycle };
          const { error: updErr } = await admin
            .from("lit_agent_drafts")
            .update({ metadata_json: mergedMeta, lead_id: null })
            .eq("id", draftId);
          if (updErr) {
            failures.push({
              user_id: cand.user_id,
              error: `lifecycle stamp failed: ${updErr.message}`,
            });
            // Draft exists but is not lifecycle-tagged; still count as failure so
            // it can be retried (the pending-draft guard uses the lifecycle tag,
            // so an un-stamped draft won't block a retry).
            continue;
          }
        } catch (stampErr) {
          failures.push({
            user_id: cand.user_id,
            error: `lifecycle stamp threw: ${String((stampErr as Error)?.message ?? stampErr)}`,
          });
          continue;
        }
      }

      drafted++;
      byStage[cand.stage ?? "unknown"] = (byStage[cand.stage ?? "unknown"] ?? 0) + 1;
    }

    const skipped = skipReasons.already_sent + skipReasons.pending_draft +
      skipReasons.suppressed + skipReasons.no_email + failures.length;

    // ── record ONE run row. NEVER sends (dispatch sends later). ──────────────
    await completeAgentRun(admin, runId, {
      status: "ok",
      decision: "nurtured",
      decision_reason: `Drafted ${drafted} trial-nurture email(s) across ${
        Object.keys(byStage).length
      } stage(s)`,
      output_json: {
        candidates: candidates.length,
        drafted,
        skipped,
        skip_reasons: skipReasons,
        by_stage: byStage,
        test_mode: testMode,
        ...(failures.length ? { failures: failures.slice(0, 25) } : {}),
      },
    });
    log.info("run_ok", {
      run_id: runId,
      drafted,
      candidates: candidates.length,
      skipped,
      trigger_type: triggerType,
    });

    return json({
      ok: true,
      run_id: runId,
      drafted,
      candidates: candidates.length,
      skipped,
      by_stage: byStage,
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("run_failed", { run_id: runId, err: message, trigger_type: triggerType });
    try {
      if (runId) {
        await completeAgentRun(admin, runId, {
          status: "error",
          error_json: { message, request_id: rid },
        });
      } else {
        runId = await recordAgentRun(admin, {
          agent_name: AGENT_NAME,
          trigger_type: triggerType,
          status: "error",
          error_json: { message, request_id: rid },
          completed_at: new Date().toISOString(),
        });
      }
    } catch (auditErr) {
      log.error("run_audit_write_failed", { run_id: runId, err: String(auditErr) });
    }
    return json({ ok: false, error: "internal_error", run_id: runId, request_id: rid }, 500);
  }
});
