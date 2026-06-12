// save-campaign-draft — atomic create/update for a campaign draft.
//
// CR P0-3 fix. The legacy save flow in CampaignBuilder.jsx fired four
// independent Supabase calls (createCampaignDraft + attach/setCompanies +
// upsertCampaignStep xN + deleteStepsFrom). A network blip or RLS error
// mid-sequence left the campaign in a partial state: row in lit_campaigns
// but only a subset of steps. The user would see "save failed" but the
// URL had already flipped to ?edit=<id> with a half-saved sequence.
//
// This function collapses the whole save into one POST. Server-side it
// calls the SECURITY DEFINER `save_campaign_draft` PL/pgSQL function,
// which runs inside a single implicit transaction so any failure
// (including invalid step_type, FK violations, RLS denial inside the
// helper) rolls back ALL writes.
//
// Auth: standard JWT verification via _shared/auth.ts. We pass the
// verified user id to the RPC; the RPC enforces ownership against
// lit_campaigns (edit mode) or org_members (create mode).

import { createLogger } from "../_shared/logger.ts";
import {
  corsHeaders,
  handlePreflight,
  json,
  requireUser,
} from "../_shared/auth.ts";

interface StepPayload {
  channel?: string;
  step_type?: string;
  subject?: string | null;
  subject_b?: string | null;
  body?: string | null;
  delay_days?: number;
  delay_hours?: number;
  delay_minutes?: number;
  include_signature?: boolean;
  /** J.2 — "HH:MM" or "HH:MM:SS". NULL/empty = use delay-based fire time. */
  time_of_day_local?: string | null;
  /** J.2 — defer to next Monday when computed day lands on Sat/Sun. */
  weekdays_only?: boolean;
  metadata?: Record<string, unknown>;
}

interface SaveBody {
  campaign_id?: string | null;       // null/omitted = create new draft
  name: string;
  channel?: string;
  metrics?: Record<string, unknown>;
  scheduled_start_at?: string | null;
  send_timezone?: string;
  company_ids?: string[];
  steps?: StepPayload[];
  // edit mode does a full company diff; create mode is additive.
  replace_companies?: boolean;
}

// Whitelist matches the channels persistPayloadFor(...) emits in
// CampaignBuilder.jsx. Anything else is rejected so a stale or hostile
// client can't slip an unknown channel past the RPC's CHECK constraints.
const VALID_CHANNELS = new Set(["email", "linkedin", "call", "wait"]);
const VALID_STEP_TYPES = new Set([
  "email",
  "linkedin_invite",
  "linkedin_message",
  "call",
  "wait",
]);

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalizeStep(s: StepPayload, idx: number): Record<string, unknown> {
  const channel = (s.channel ?? "email").toString();
  const step_type = (s.step_type ?? "email").toString();
  if (!VALID_CHANNELS.has(channel)) {
    throw new Error(`step[${idx}]: invalid channel "${channel}"`);
  }
  if (!VALID_STEP_TYPES.has(step_type)) {
    throw new Error(`step[${idx}]: invalid step_type "${step_type}"`);
  }
  // Subjects/bodies: empty string == null. Frontend sometimes sends "".
  const subject =
    typeof s.subject === "string" && s.subject.trim().length > 0
      ? s.subject.trim()
      : null;
  const subject_b =
    typeof s.subject_b === "string" && s.subject_b.trim().length > 0
      ? s.subject_b.trim()
      : null;
  const body =
    typeof s.body === "string" && s.body.trim().length > 0
      ? s.body.trim()
      : null;
  // J.2 — time_of_day_local must be a valid "HH:MM[:SS]" string. The RPC
  // NULLIFs empty strings before casting to `time`, so we send "" when
  // the field is absent / invalid; that preserves the legacy code path.
  let timeOfDayLocal: string | null = null;
  if (typeof s.time_of_day_local === "string") {
    const t = s.time_of_day_local.trim();
    if (/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(t)) timeOfDayLocal = t;
  }
  const weekdaysOnly = s.weekdays_only === true;
  return {
    channel,
    step_type,
    subject,
    subject_b,
    body,
    delay_days: clampInt(s.delay_days, 0, 365, 0),
    delay_hours: clampInt(s.delay_hours, 0, 23, 0),
    delay_minutes: clampInt(s.delay_minutes, 0, 59, 0),
    include_signature: s.include_signature !== false,
    time_of_day_local: timeOfDayLocal,
    weekdays_only: weekdaysOnly,
    metadata: s.metadata && typeof s.metadata === "object" ? s.metadata : {},
  };
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const requestId = crypto.randomUUID();
  const log = createLogger("save-campaign-draft", { request_id: requestId });

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, admin } = auth;

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  // ── Input validation (cheap, before the RPC) ──────────────────────────
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return json({ ok: false, error: "name is required" }, 400);
  }
  const channel =
    typeof body.channel === "string" && body.channel.length > 0
      ? body.channel
      : "email";
  const campaignId =
    typeof body.campaign_id === "string" && body.campaign_id.length > 0
      ? body.campaign_id
      : null;
  const replaceCompanies = Boolean(body.replace_companies);
  const sendTimezone =
    typeof body.send_timezone === "string" && body.send_timezone.length > 0
      ? body.send_timezone
      : "UTC";
  const scheduledStartAt =
    typeof body.scheduled_start_at === "string" &&
    body.scheduled_start_at.length > 0
      ? body.scheduled_start_at
      : null;

  // Deduplicate company ids; drop empties.
  const companyIds = Array.from(
    new Set(
      (Array.isArray(body.company_ids) ? body.company_ids : []).filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  );

  // Steps: normalize + validate up-front so a bad payload returns 400
  // before we even open the transaction.
  let normalizedSteps: Record<string, unknown>[];
  try {
    normalizedSteps = (Array.isArray(body.steps) ? body.steps : []).map(
      (s, i) => normalizeStep(s, i),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid step payload";
    log.warn("invalid_step_payload", { user_id: user.id, err: msg });
    return json({ ok: false, error: msg }, 400);
  }

  log.info("save_attempt", {
    user_id: user.id,
    is_edit: campaignId !== null,
    company_count: companyIds.length,
    step_count: normalizedSteps.length,
  });

  // ── Single transactional RPC ─────────────────────────────────────────
  const { data, error } = await admin.rpc("save_campaign_draft", {
    p_user_id: user.id,
    p_campaign_id: campaignId,
    p_name: name,
    p_channel: channel,
    p_metrics: body.metrics ?? {},
    p_scheduled_start_at: scheduledStartAt,
    p_send_timezone: sendTimezone,
    p_company_ids: companyIds,
    p_steps: normalizedSteps,
    p_replace_companies: replaceCompanies,
  });

  if (error) {
    log.error("rpc_failed", {
      user_id: user.id,
      campaign_id: campaignId,
      err: error.message,
      code: error.code,
      details: (error as { details?: string }).details ?? null,
      hint: (error as { hint?: string }).hint ?? null,
    });
    // 42501 = ownership/RLS-style denial inside the RPC.
    const status = error.code === "42501" ? 403 : 400;
    return json(
      {
        ok: false,
        error: error.message,
        code: error.code ?? null,
      },
      status,
    );
  }

  // The RPC returns a jsonb object; Supabase passes it through as `data`.
  const result =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  log.info("save_ok", {
    user_id: user.id,
    campaign_id: (result.campaign_id as string) ?? null,
    is_edit: Boolean(result.is_edit),
    step_count: Number(result.step_count ?? 0),
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
