/**
 * Lead-CRM Phase 1 API — typed wrappers over the SECURITY DEFINER RPCs that
 * back the internal, shared "work leads toward subscriber" workspace.
 *
 * Access model (server-authoritative): every RPC below is SECURITY DEFINER +
 * gated on lead-CRM membership. The frontend NEVER decides who gets in — it
 * calls `lit_my_lead_crm_access()` for the route gate and renders a friendly
 * "no access" screen when `is_member` is false. Reps (a dedicated SALES-REP
 * role) get ONLY this workspace; platform admins additionally get the member-
 * management surface.
 *
 * Dedicated domain module per CLAUDE.md (prefer `frontend/src/api/<domain>.ts`
 * over growing lib/api.ts). Mirrors the style of `frontend/src/api/crm.ts`:
 * thin wrappers, null-safe defaults, never throw on reads (return empty),
 * surface errors on mutations so the UI can toast.
 */

import { supabase } from "@/lib/supabase";

// ── Types ───────────────────────────────────────────────────────────────

/** Route gate shape — `lit_my_lead_crm_access()`. */
export type LeadCrmAccess = {
  is_member: boolean;
  role: "rep" | "manager" | null;
  is_platform_admin: boolean;
};

/** A pipeline stage — `lit_leadcrm_stages()`. */
export type LeadStage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  color: string | null;
  win_probability: number | null;
};

/** A lead row from `lit_leadcrm_list_leads()`. */
export type Lead = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  primary_source: string | null;
  magnet_slug: string | null;
  utm_source: string | null;
  stage_id: string | null;
  stage_name: string | null;
  status: string | null;
  lead_score: number | null;
  assigned_to: string | null;
  assignee_name: string | null;
  current_plan: string | null;
  current_status: string | null;
  last_activity_at: string | null;
  first_seen_at: string | null;
  signup_at: string | null;
  trial_started_at: string | null;
  converted_at: string | null;
};

/** A single timeline entry — `lit_leadcrm_lead_timeline()`. */
export type LeadTimelineEntry = {
  occurred_at: string | null;
  kind: string | null;
  source: "magnet" | "product" | "email" | "demo" | "manual" | "system" | string | null;
  title: string | null;
  detail: string | null;
};

/** A member row — `lit_admin_list_lead_crm_members()`. */
export type LeadCrmMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: "rep" | "manager" | string | null;
  enabled: boolean | null;
  added_at: string | null;
};

/** Per-stage pipeline summary — `lit_leadcrm_pipeline_summary()`. */
export type PipelineStageSummary = {
  stage_id: string | null;
  stage_name: string | null;
  color: string | null;
  position: number | null;
  lead_count: number;
  conversion_rate: number | null;
};

/** Assignee option for the pickers (derived from members). */
export type Assignee = { user_id: string; name: string };

export type ListLeadsParams = {
  stageId?: string | null;
  source?: string | null;
  assignee?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
};

// ── Route gate ──────────────────────────────────────────────────────────

/**
 * THE route gate. Called on mount by the `useLeadCrmAccess()` hook. Returns a
 * clean "no access" default on any error / unauth so the gate renders the
 * friendly screen instead of crashing.
 */
export async function myLeadCrmAccess(): Promise<LeadCrmAccess> {
  const fallback: LeadCrmAccess = { is_member: false, role: null, is_platform_admin: false };
  try {
    const { data, error } = await supabase.rpc("lit_my_lead_crm_access");
    if (error || !data) return fallback;
    // RPC may return a bare object or a single-row array depending on shape.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return fallback;
    return {
      is_member: Boolean((row as any).is_member),
      role: ((row as any).role as LeadCrmAccess["role"]) ?? null,
      is_platform_admin: Boolean((row as any).is_platform_admin),
    };
  } catch {
    return fallback;
  }
}

// ── Stages ──────────────────────────────────────────────────────────────

/** Pipeline stages ordered by position (New → … → Subscriber → Lost). */
export async function listStages(): Promise<LeadStage[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_stages");
    if (error || !Array.isArray(data)) return [];
    return (data as any[])
      .map((s) => ({
        id: String(s.id),
        name: s.name ?? "Stage",
        position: Number(s.position ?? 0),
        is_won: Boolean(s.is_won),
        is_lost: Boolean(s.is_lost),
        color: s.color ?? null,
        win_probability: s.win_probability != null ? Number(s.win_probability) : null,
      }))
      .sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

// ── Leads ───────────────────────────────────────────────────────────────

/** Paginated, filtered lead list. Silent-fail → empty array. */
export async function listLeads(params: ListLeadsParams = {}): Promise<Lead[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_list_leads", {
      p_stage_id: params.stageId ?? null,
      p_source: params.source ?? null,
      p_assignee: params.assignee ?? null,
      p_q: params.q ?? null,
      p_limit: params.limit ?? 100,
      p_offset: params.offset ?? 0,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as any[]).map(normalizeLead);
  } catch {
    return [];
  }
}

/** Resolve one lead + its subscription/plan/activation summary. */
export async function getLead(leadId: string): Promise<Lead | null> {
  if (!leadId) return null;
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_get_lead", {
      p_lead_id: leadId,
    });
    if (error || !data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return normalizeLead(row);
  } catch {
    return null;
  }
}

function normalizeLead(row: any): Lead {
  return {
    id: String(row.id),
    email: row.email ?? null,
    full_name: row.full_name ?? null,
    company_name: row.company_name ?? null,
    primary_source: row.primary_source ?? null,
    magnet_slug: row.magnet_slug ?? null,
    utm_source: row.utm_source ?? null,
    stage_id: row.stage_id != null ? String(row.stage_id) : null,
    stage_name: row.stage_name ?? null,
    status: row.status ?? null,
    lead_score: row.lead_score != null ? Number(row.lead_score) : null,
    assigned_to: row.assigned_to != null ? String(row.assigned_to) : null,
    assignee_name: row.assignee_name ?? null,
    current_plan: row.current_plan ?? null,
    current_status: row.current_status ?? null,
    last_activity_at: row.last_activity_at ?? null,
    first_seen_at: row.first_seen_at ?? null,
    signup_at: row.signup_at ?? null,
    trial_started_at: row.trial_started_at ?? null,
    converted_at: row.converted_at ?? null,
  };
}

// ── Timeline ────────────────────────────────────────────────────────────

/** Lead activity timeline, newest first. Silent-fail → empty. */
export async function getLeadTimeline(leadId: string): Promise<LeadTimelineEntry[]> {
  if (!leadId) return [];
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_lead_timeline", {
      p_lead_id: leadId,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as any[]).map((e) => ({
      occurred_at: e.occurred_at ?? null,
      kind: e.kind ?? null,
      source: e.source ?? null,
      title: e.title ?? null,
      detail: e.detail ?? null,
    }));
  } catch {
    return [];
  }
}

// ── Mutations ───────────────────────────────────────────────────────────

/** Move a lead to a new stage. Throws on failure (UI toasts). */
export async function setStage(
  leadId: string,
  stageId: string,
  reason?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("lit_leadcrm_set_stage", {
    p_lead_id: leadId,
    p_stage_id: stageId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Assign the lead to a member. Throws on failure. */
export async function assignLead(leadId: string, assigneeUserId: string): Promise<void> {
  const { error } = await supabase.rpc("lit_leadcrm_assign", {
    p_lead_id: leadId,
    p_assignee_user_id: assigneeUserId,
  });
  if (error) throw new Error(error.message);
}

/** Add a free-text note to the lead. Throws on failure. */
export async function addNote(leadId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("lit_leadcrm_add_note", {
    p_lead_id: leadId,
    p_body: body,
  });
  if (error) throw new Error(error.message);
}

/** Log a manual touch (call / email). Throws on failure. */
export async function logTouch(
  leadId: string,
  channel: "call" | "email" | string,
  body: string,
): Promise<void> {
  const { error } = await supabase.rpc("lit_leadcrm_log_touch", {
    p_lead_id: leadId,
    p_channel: channel,
    p_body: body,
  });
  if (error) throw new Error(error.message);
}

// ── Pipeline summary ────────────────────────────────────────────────────

/** Per-stage counts + conversion rates. Silent-fail → empty. */
export async function pipelineSummary(): Promise<PipelineStageSummary[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_pipeline_summary");
    if (error || !Array.isArray(data)) return [];
    return (data as any[]).map((r) => ({
      stage_id: r.stage_id != null ? String(r.stage_id) : null,
      stage_name: r.stage_name ?? null,
      color: r.color ?? null,
      position: r.position != null ? Number(r.position) : null,
      lead_count: Number(r.lead_count ?? 0),
      conversion_rate: r.conversion_rate != null ? Number(r.conversion_rate) : null,
    }));
  } catch {
    return [];
  }
}

// ── Member management (platform-admin only) ─────────────────────────────

/** List lead-CRM members. Platform-admin only (RLS enforces). */
export async function listMembers(): Promise<LeadCrmMember[]> {
  try {
    const { data, error } = await supabase.rpc("lit_admin_list_lead_crm_members");
    if (error || !Array.isArray(data)) return [];
    return (data as any[]).map((m) => ({
      user_id: String(m.user_id),
      email: m.email ?? null,
      full_name: m.full_name ?? null,
      role: m.role ?? null,
      enabled: m.enabled != null ? Boolean(m.enabled) : null,
      added_at: m.added_at ?? null,
    }));
  } catch {
    return [];
  }
}

/** Grant / revoke / re-role a member. Platform-admin only. Throws on failure. */
export async function setMember(
  userId: string,
  enabled: boolean,
  role?: "rep" | "manager" | null,
): Promise<void> {
  const { error } = await supabase.rpc("lit_admin_set_lead_crm_member", {
    p_user_id: userId,
    p_enabled: enabled,
    p_role: role ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Assignee options for the leads-list filter + drawer assignee picker.
 * Derived from the member list (enabled members only). Best-effort: any error
 * yields an empty list and the pickers degrade to "Unassigned" only.
 */
export async function listAssignees(): Promise<Assignee[]> {
  const members = await listMembers();
  return members
    .filter((m) => m.enabled !== false)
    .map((m) => ({
      user_id: m.user_id,
      name:
        (typeof m.full_name === "string" && m.full_name.trim()) ||
        (typeof m.email === "string" && m.email.includes("@") ? m.email.split("@")[0] : "") ||
        "Teammate",
    }));
}
