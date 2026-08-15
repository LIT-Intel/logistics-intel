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
  // Phase 2 — company recognition (cached on the lead row).
  company_id: string | null;
  source_company_key: string | null;
  company_domain: string | null;
  company_logo_url: string | null;
  company_country: string | null;
  company_city: string | null;
  company_state: string | null;
  company_recognized_at: string | null;
};

/** Company intelligence snapshot — `lit_leadcrm_company_snapshot()`. */
export type LeadCompanySnapshot = {
  ok: boolean;
  has_snapshot: boolean;
  company_name: string | null;
  domain: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  shipments_12m: number | null;
  total_teu: number | null;
  top_origin_countries: string[];
  top_us_ports: string[];
  top_lane: string | null;
  monthly_trend: { month: string; shipments: number }[];
  profile_href: string | null;
  source_company_key: string | null;
};

/** A company contact row — `lit_leadcrm_lead_contacts()`. */
export type LeadContact = {
  id: string;
  full_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  email_verification_status: string | null;
  enrichment_status: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
};

/** Result of the enrich edge function. */
export type EnrichResult = {
  ok: boolean;
  provider?: string;
  count?: number;
  pending?: boolean;
  exhausted?: boolean;
  credits_note?: string;
  error?: string;
  code?: string;
};

/** Result of `lit_leadcrm_create_lead()`. */
export type CreateLeadResult = {
  ok: boolean;
  lead_id?: string;
  created?: boolean;
  merged?: boolean;
  reason?: string;
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
    company_id: row.company_id != null ? String(row.company_id) : null,
    source_company_key: row.source_company_key ?? null,
    company_domain: row.company_domain ?? null,
    company_logo_url: row.company_logo_url ?? null,
    company_country: row.company_country ?? null,
    company_city: row.company_city ?? null,
    company_state: row.company_state ?? null,
    company_recognized_at: row.company_recognized_at ?? null,
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

// ── Phase 2: company intelligence + contacts + manual create ────────────────

/**
 * Re-run company recognition for a lead (cached reads, 0 provider credits).
 * Returns the recognition result; caller should refresh the lead afterward.
 */
export async function recognizeCompany(leadId: string): Promise<{ ok: boolean; recognized?: boolean }> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_recognize_company", { p_lead_id: leadId });
    if (error || !data) return { ok: false };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), recognized: Boolean(row?.recognized) };
  } catch {
    return { ok: false };
  }
}

/** Cached company intelligence snapshot for a lead's recognized company. */
export async function getCompanySnapshot(leadId: string): Promise<LeadCompanySnapshot | null> {
  if (!leadId) return null;
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_company_snapshot", { p_lead_id: leadId });
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as any;
    if (!row || row.ok === false) return null;
    return {
      ok: true,
      has_snapshot: Boolean(row.has_snapshot),
      company_name: row.company_name ?? null,
      domain: row.domain ?? null,
      logo_url: row.logo_url ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      country: row.country ?? null,
      shipments_12m: row.shipments_12m != null ? Number(row.shipments_12m) : null,
      total_teu: row.total_teu != null ? Number(row.total_teu) : null,
      top_origin_countries: Array.isArray(row.top_origin_countries) ? row.top_origin_countries : [],
      top_us_ports: Array.isArray(row.top_us_ports) ? row.top_us_ports : [],
      top_lane: row.top_lane ?? null,
      monthly_trend: Array.isArray(row.monthly_trend)
        ? row.monthly_trend.map((m: any) => ({ month: String(m.month), shipments: Number(m.shipments ?? 0) }))
        : [],
      profile_href: row.profile_href ?? null,
      source_company_key: row.source_company_key ?? null,
    };
  } catch {
    return null;
  }
}

/** Existing lit_contacts for the lead's recognized company. Read-only. */
export async function getLeadContacts(
  leadId: string,
): Promise<{ companyLinked: boolean; contacts: LeadContact[] }> {
  if (!leadId) return { companyLinked: false, contacts: [] };
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_lead_contacts", { p_lead_id: leadId });
    if (error || !data) return { companyLinked: false, contacts: [] };
    const row = (Array.isArray(data) ? data[0] : data) as any;
    const contacts = Array.isArray(row?.contacts)
      ? row.contacts.map((c: any) => ({
          id: String(c.id),
          full_name: c.full_name ?? null,
          title: c.title ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          linkedin_url: c.linkedin_url ?? null,
          email_verification_status: c.email_verification_status ?? null,
          enrichment_status: c.enrichment_status ?? null,
          city: c.city ?? null,
          state: c.state ?? null,
          country_code: c.country_code ?? null,
        }))
      : [];
    return { companyLinked: Boolean(row?.company_linked), contacts };
  } catch {
    return { companyLinked: false, contacts: [] };
  }
}

/**
 * Trigger contact enrichment for a lead's recognized company via the
 * `lead-crm-enrich-contacts` edge function. This meters credits (Apollo) and
 * respects the plan quota — the returned `credits_note` explains the cost.
 * Throws on transport failure; returns the (possibly !ok) result on app errors
 * so the caller can surface quota / not-recognized messages.
 */
export async function enrichLeadContacts(
  leadId: string,
  opts?: { revealPhone?: boolean },
): Promise<EnrichResult> {
  const { data, error } = await supabase.functions.invoke("lead-crm-enrich-contacts", {
    body: { lead_id: leadId, reveal_phone_number: opts?.revealPhone === true },
  });
  if (error) {
    // Edge fn returns 4xx with a JSON body for quota / not-recognized; surface it.
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        return { ok: false, error: body?.error ?? error.message, code: body?.code };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: error.message };
  }
  return (data as EnrichResult) ?? { ok: false, error: "No response" };
}

/**
 * Manually add an opportunity (or merge into an existing lead by email).
 * Auto-runs company recognition server-side. Throws on transport error.
 */
export async function createLead(params: {
  email: string;
  fullName?: string | null;
  companyName?: string | null;
  stageId?: string | null;
  assignee?: string | null;
  notes?: string | null;
}): Promise<CreateLeadResult> {
  const { data, error } = await supabase.rpc("lit_leadcrm_create_lead", {
    p_email: params.email,
    p_full_name: params.fullName ?? null,
    p_company_name: params.companyName ?? null,
    p_stage_id: params.stageId ?? null,
    p_assignee: params.assignee ?? null,
    p_notes: params.notes ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return {
    ok: Boolean(row?.ok),
    lead_id: row?.lead_id != null ? String(row.lead_id) : undefined,
    created: Boolean(row?.created),
    merged: Boolean(row?.merged),
    reason: row?.reason,
  };
}
