import { supabase } from "@/lib/supabase";

// Outbound-feature-scoped Supabase actions. Kept out of the shared
// frontend/src/lib/api.ts to honor the "don't replace api.ts wholesale" rule
// from the handoff brief, while preserving identical Supabase semantics
// (RLS-scoped writes from the authenticated browser session).

// ---------------------------------------------------------- Status actions

// Each status mutation chains `.select("id")` so the response carries the
// affected rows. RLS silently strips rows the user can't see, which used
// to mean: error=null + 0 rows = "success" toast for an action that never
// happened. Now we treat empty result as "not-found-or-forbidden" and
// throw, so Campaigns.jsx's catch fires the danger toast.

async function runStatusMutation(
  campaignId: string,
  fn: string,
  status: string,
): Promise<void> {
  if (!campaignId) throw new Error(`${fn}: campaignId required`);
  const { data, error } = await supabase
    .from("lit_campaigns")
    .update({ status })
    .eq("id", campaignId)
    .select("id");
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`${fn}${code}: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${fn}: not found or you don't have permission to change it.`);
  }
}

export async function archiveCampaign(campaignId: string): Promise<void> {
  return runStatusMutation(campaignId, "archiveCampaign", "archived");
}

export async function unarchiveCampaign(campaignId: string): Promise<void> {
  return runStatusMutation(campaignId, "unarchiveCampaign", "draft");
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  return runStatusMutation(campaignId, "pauseCampaign", "paused");
}

export async function resumeCampaign(campaignId: string): Promise<void> {
  return runStatusMutation(campaignId, "resumeCampaign", "active");
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("deleteCampaign: campaignId required");
  // .select("id") on a delete returns the rows that were deleted. Same
  // anti-silent-success guard as the status mutations above.
  const { data, error } = await supabase
    .from("lit_campaigns")
    .delete()
    .eq("id", campaignId)
    .select("id");
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`deleteCampaign${code}: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(
      "deleteCampaign: not found or you don't have permission to delete it.",
    );
  }
}

// ---------------------------------------------------------- Edit-mode loads

export interface CampaignDetails {
  id: string;
  name: string;
  status: string;
  channel: string | null;
  metrics: Record<string, unknown>;
  steps: CampaignStepRow[];
  companyIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
  // Sub-project J: persisted launch anchor.
  scheduled_start_at: string | null;
  send_timezone: string;
}

export interface CampaignStepRow {
  id: string;
  step_order: number;
  channel: string;
  step_type: string;
  subject: string | null;
  body: string | null;
  delay_days: number;
  delay_hours: number;
  // P0-5: SELECT had been silently dropping these three columns, so on
  // edit-load the builder lost the A/B subject variant, the signature
  // toggle reset, and minute-precision delays got rounded away. The
  // schema column types (verified against the live DB): delay_minutes
  // int NOT NULL (0-59), subject_b text NULL, include_signature bool
  // NOT NULL.
  delay_minutes: number;
  subject_b: string | null;
  include_signature: boolean;
  // J.2: schedule hints must hydrate too; otherwise a saved "send at
  // 9:00 AM" step appears unset after navigating away and back.
  time_of_day_local: string | null;
  weekdays_only: boolean | null;
}

export async function getCampaignWithDetails(
  campaignId: string,
): Promise<CampaignDetails> {
  if (!campaignId)
    throw new Error("getCampaignWithDetails: campaignId required");

  const [campaignResp, stepsResp, companiesResp] = await Promise.all([
    supabase
      .from("lit_campaigns")
      .select(
        "id, name, status, channel, metrics, created_at, updated_at, scheduled_start_at, send_timezone",
      )
      .eq("id", campaignId)
      .maybeSingle(),
    supabase
      .from("lit_campaign_steps")
      .select(
        // Include the full scheduling surface so dbStepToBuilder can
        // faithfully rehydrate the builder after navigation/reload.
        "id, step_order, channel, step_type, subject, body, delay_days, delay_hours, delay_minutes, subject_b, include_signature, time_of_day_local, weekdays_only",
      )
      .eq("campaign_id", campaignId)
      .order("step_order", { ascending: true }),
    supabase
      .from("lit_campaign_companies")
      .select("company_id")
      .eq("campaign_id", campaignId),
  ]);

  if (campaignResp.error) throw new Error(campaignResp.error.message);
  if (!campaignResp.data) throw new Error("Campaign not found");
  if (stepsResp.error) throw new Error(stepsResp.error.message);
  if (companiesResp.error) throw new Error(companiesResp.error.message);

  const c = campaignResp.data as any;
  return {
    id: String(c.id),
    name: String(c.name ?? "Untitled campaign"),
    status: String(c.status ?? "draft"),
    channel: c.channel ?? null,
    metrics: c.metrics ?? {},
    steps: (stepsResp.data ?? []) as CampaignStepRow[],
    companyIds: (companiesResp.data ?? []).map(
      (r: { company_id: string }) => r.company_id,
    ),
    createdAt: c.created_at ?? null,
    updatedAt: c.updated_at ?? null,
    scheduled_start_at: c.scheduled_start_at ?? null,
    send_timezone: c.send_timezone ?? "UTC",
  };
}

// ---------------------------------------------------------- Edit-mode writes

export async function updateCampaignBasics(
  campaignId: string,
  patch: {
    name?: string;
    channel?: string;
    metrics?: Record<string, unknown>;
    // Sub-project J: persisted launch anchor + TZ.
    scheduled_start_at?: string | null;
    send_timezone?: string;
  },
): Promise<void> {
  if (!campaignId) throw new Error("updateCampaignBasics: campaignId required");
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.channel !== undefined) update.channel = patch.channel;
  if (patch.metrics !== undefined) update.metrics = patch.metrics;
  if (patch.scheduled_start_at !== undefined) update.scheduled_start_at = patch.scheduled_start_at;
  if (patch.send_timezone !== undefined) update.send_timezone = patch.send_timezone;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase
    .from("lit_campaigns")
    .update(update)
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`updateCampaignBasics${code}: ${error.message}`);
  }
}

/**
 * Replace the campaign's company set: detach removed company_ids, add new
 * ones. Preserves existing rows (their added_at timestamps don't change).
 */
export async function setCampaignCompanies(
  campaignId: string,
  desired: string[],
): Promise<void> {
  if (!campaignId) throw new Error("setCampaignCompanies: campaignId required");
  const cleanIds = Array.from(
    new Set(
      (desired || []).filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  );

  const { data: existing, error: selErr } = await supabase
    .from("lit_campaign_companies")
    .select("company_id")
    .eq("campaign_id", campaignId);
  if (selErr) {
    const code = selErr.code ? ` ${selErr.code}` : "";
    throw new Error(`setCampaignCompanies select${code}: ${selErr.message}`);
  }
  const have = new Set(
    ((existing ?? []) as Array<{ company_id: string }>).map(
      (r) => r.company_id,
    ),
  );
  const want = new Set(cleanIds);

  const toRemove = [...have].filter((id) => !want.has(id));
  const toAdd = [...want].filter((id) => !have.has(id));

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from("lit_campaign_companies")
      .delete()
      .eq("campaign_id", campaignId)
      .in("company_id", toRemove);
    if (delErr) {
      const code = delErr.code ? ` ${delErr.code}` : "";
      throw new Error(`setCampaignCompanies delete${code}: ${delErr.message}`);
    }
  }
  if (toAdd.length > 0) {
    const rows = toAdd.map((company_id) => ({
      campaign_id: campaignId,
      company_id,
    }));
    const { error: insErr } = await supabase
      .from("lit_campaign_companies")
      .insert(rows);
    if (insErr) {
      const code = insErr.code ? ` ${insErr.code}` : "";
      // 23505 means a concurrent writer already inserted — desired state
      // already achieved.
      if (insErr.code !== "23505") {
        throw new Error(`setCampaignCompanies insert${code}: ${insErr.message}`);
      }
    }
  }
}

// ---------------------------------------------------------- Atomic save
//
// CR P0-3: single-call atomic create/update for a campaign draft. Replaces
// the legacy 4-step client sequence (createCampaignDraft + companies + N
// step upserts + cleanup-deletes) which left campaigns in a partial state
// when one step failed mid-sequence. The server-side `save-campaign-draft`
// edge function wraps everything in a Postgres SECURITY DEFINER function
// that runs inside a single implicit transaction — any failure rolls back
// ALL writes.
//
// On the success path, returns the campaign id + the persisted step ids in
// 1-based order so the caller can flip its URL / state. On failure throws
// with a clean error message (or whatever the edge function bubbles up
// from the RPC), so the caller can surface it without worrying about
// partial state on the server.

export interface SaveCampaignDraftStep {
  channel: string;
  step_type: string;
  subject?: string | null;
  subject_b?: string | null;
  body?: string | null;
  delay_days?: number;
  delay_hours?: number;
  delay_minutes?: number;
  include_signature?: boolean;
  time_of_day_local?: string | null;
  weekdays_only?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SaveCampaignDraftInput {
  campaign_id?: string | null;
  name: string;
  channel?: string;
  metrics?: Record<string, unknown>;
  scheduled_start_at?: string | null;
  send_timezone?: string;
  company_ids: string[];
  steps: SaveCampaignDraftStep[];
  /** true = edit mode (full company diff). false = create mode (additive). */
  replace_companies: boolean;
}

export interface SaveCampaignDraftResult {
  campaign_id: string;
  is_edit: boolean;
  step_ids: string[];
  step_count: number;
}

export async function saveCampaignDraft(
  input: SaveCampaignDraftInput,
): Promise<SaveCampaignDraftResult> {
  const { data, error } = await supabase.functions.invoke(
    "save-campaign-draft",
    { body: input },
  );
  if (error) {
    // supabase-js wraps non-2xx into FunctionsHttpError; pull the JSON body
    // out so the user sees the real RPC error instead of a generic 400.
    let detail = error.message || "save_failed";
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx?.json) {
      try {
        const parsed = (await ctx.json()) as { error?: string };
        if (parsed?.error) detail = parsed.error;
      } catch {
        // fall back to the plain message
      }
    }
    throw new Error(`saveCampaignDraft: ${detail}`);
  }
  if (!data || (data as { ok?: boolean }).ok === false) {
    const detail = (data as { error?: string })?.error ?? "save_failed";
    throw new Error(`saveCampaignDraft: ${detail}`);
  }
  const result = data as SaveCampaignDraftResult & { ok?: boolean };
  if (!result.campaign_id) {
    throw new Error("saveCampaignDraft: missing campaign_id in response");
  }
  return {
    campaign_id: result.campaign_id,
    is_edit: Boolean(result.is_edit),
    step_ids: Array.isArray(result.step_ids) ? result.step_ids : [],
    step_count: Number(result.step_count ?? 0),
  };
}

/**
 * Delete all campaign steps with step_order >= startOrder. Used by edit-mode
 * save to drop steps that the user removed from the sequence (we upsert the
 * new sequence steps 1..N then delete any leftovers > N).
 *
 * Kept exported for callers other than the Builder's main save flow.
 * The Builder itself now goes through `saveCampaignDraft` (CR P0-3) which
 * handles step cleanup atomically server-side.
 */
export async function deleteCampaignStepsFrom(
  campaignId: string,
  startOrder: number,
): Promise<void> {
  if (!campaignId) throw new Error("deleteCampaignStepsFrom: campaignId required");
  const { error } = await supabase
    .from("lit_campaign_steps")
    .delete()
    .eq("campaign_id", campaignId)
    .gte("step_order", startOrder);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`deleteCampaignStepsFrom${code}: ${error.message}`);
  }
}

// ---------------------------------------------------------- Templates

export interface CreateTemplateInput {
  title: string;
  subject: string | null;
  body: string | null;
  channel: string;
  stage?: string;
  mode?: string;
  persona_id?: string | null;
}

/**
 * Create a workspace template. Writes to lit_outreach_templates. Requires
 * RLS policies on the table that permit org members to INSERT with their
 * own org_id. If policies aren't configured yet, this throws a 42501
 * (insufficient_privilege) error which the caller surfaces as a clean
 * "RLS policy missing" toast.
 *
 * org_id resolution: pulled from public.org_members for the current user.
 * If the user belongs to multiple orgs, the first active membership wins —
 * follow-up: surface a per-template org picker.
 */
export async function createWorkspaceTemplate(
  input: CreateTemplateInput,
): Promise<{ id: string }> {
  const trimmedTitle = (input.title ?? "").trim();
  if (!trimmedTitle) throw new Error("createWorkspaceTemplate: title required");

  // Resolve current user's org_id from org_members. RLS on org_members must
  // allow the user to read their own membership rows for this to succeed.
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) {
    throw new Error(
      "createWorkspaceTemplate: not signed in — sign in before creating templates.",
    );
  }
  const { data: memberships, error: memErr } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  if (memErr) {
    throw new Error(
      `createWorkspaceTemplate: couldn't resolve your org (${memErr.message}).`,
    );
  }
  const orgId = memberships?.[0]?.org_id ?? null;
  if (!orgId) {
    throw new Error(
      "createWorkspaceTemplate: no active org membership found for your account.",
    );
  }

  const payload = {
    org_id: orgId,
    persona_id: input.persona_id ?? null,
    mode: input.mode ?? "general",
    channel: input.channel ?? "email",
    stage: input.stage ?? "cold",
    title: trimmedTitle,
    subject_template: input.subject ?? null,
    body_template: input.body ?? null,
    is_active: true,
  };

  const { data, error } = await supabase
    .from("lit_outreach_templates")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    if (error.code === "42501") {
      throw new Error(
        "Saving custom templates needs an RLS policy on lit_outreach_templates. Apply migration 20260501_outbound_templates_rls and try again.",
      );
    }
    throw new Error(`createWorkspaceTemplate${code}: ${error.message}`);
  }
  return { id: data.id };
}
