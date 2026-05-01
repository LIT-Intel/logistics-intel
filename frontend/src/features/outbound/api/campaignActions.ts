import { supabase } from "@/lib/supabase";

// Outbound-feature-scoped Supabase actions. Kept out of the shared
// frontend/src/lib/api.ts to honor the "don't replace api.ts wholesale" rule
// from the handoff brief, while preserving identical Supabase semantics
// (RLS-scoped writes from the authenticated browser session).

// ---------------------------------------------------------- Status actions

export async function archiveCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("archiveCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .update({ status: "archived" })
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`archiveCampaign${code}: ${error.message}`);
  }
}

export async function unarchiveCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("unarchiveCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .update({ status: "draft" })
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`unarchiveCampaign${code}: ${error.message}`);
  }
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("pauseCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .update({ status: "paused" })
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`pauseCampaign${code}: ${error.message}`);
  }
}

export async function resumeCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("resumeCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .update({ status: "active" })
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`resumeCampaign${code}: ${error.message}`);
  }
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("deleteCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .delete()
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`deleteCampaign${code}: ${error.message}`);
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
        "id, name, status, channel, metrics, created_at, updated_at",
      )
      .eq("id", campaignId)
      .maybeSingle(),
    supabase
      .from("lit_campaign_steps")
      .select(
        "id, step_order, channel, step_type, subject, body, delay_days, delay_hours",
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
  };
}

// ---------------------------------------------------------- Edit-mode writes

export async function updateCampaignBasics(
  campaignId: string,
  patch: { name?: string; channel?: string; metrics?: Record<string, unknown> },
): Promise<void> {
  if (!campaignId) throw new Error("updateCampaignBasics: campaignId required");
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.channel !== undefined) update.channel = patch.channel;
  if (patch.metrics !== undefined) update.metrics = patch.metrics;
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

/**
 * Delete all campaign steps with step_order >= startOrder. Used by edit-mode
 * save to drop steps that the user removed from the sequence (we upsert the
 * new sequence steps 1..N then delete any leftovers > N).
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
