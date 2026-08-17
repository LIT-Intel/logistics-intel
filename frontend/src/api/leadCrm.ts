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
  // Manually-editable contact + company details (migration 20260817100000).
  phone: string | null;
  title: string | null;
  website: string | null;
  address: string | null;
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
  // Phase 5 — hygiene lifecycle (soft archive / soft delete).
  archived_at: string | null;
  deleted_at: string | null;
};

/** Lead lifecycle view filter for the list (server enforces the actual filter). */
export type LeadStatusFilter = "active" | "archived" | "deleted" | "all";

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

/** Full pipeline summary object — the whole `lit_leadcrm_pipeline_summary()` envelope. */
export type PipelineSummary = {
  stages: { stage_id: string | null; stage: string | null; color: string | null; position: number | null; count: number }[];
  totals: {
    total_leads: number | null;
    contacted: number | null;
    engaged: number | null;
    trial: number | null;
    subscriber: number | null;
    lost: number | null;
    new_this_week: number | null;
    unassigned: number | null;
    avg_score: number | null;
  };
  conversion_rates: {
    lead_to_contacted: number | null;
    lead_to_engaged: number | null;
    lead_to_trial: number | null;
    lead_to_subscriber: number | null;
    trial_to_subscriber: number | null;
  };
};

/** A single kanban column — `lit_leadcrm_board()`. */
export type BoardColumn = {
  stage_id: string;
  stage_name: string | null;
  color: string | null;
  position: number | null;
  is_won: boolean;
  is_lost: boolean;
  total: number;
  leads: Lead[];
};

/** A lead task row — `lit_leadcrm_lead_tasks()` / `lit_leadcrm_my_tasks()`. */
export type LeadTask = {
  id: string;
  lead_id: string;
  title: string | null;
  due_date: string | null;
  status: string | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
  completed_at: string | null;
  created_at: string | null;
  overdue: boolean;
  // Present only on my_tasks (joined lead context for the shell Tasks tab).
  lead_name?: string | null;
  lead_company?: string | null;
  lead_email?: string | null;
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
  /** Lifecycle view: 'active' (default) hides merged+archived+deleted. */
  status?: LeadStatusFilter | null;
};

/** Paginated result of `lit_leadcrm_list_leads()` — `{ ok, total, leads }`. */
export type ListLeadsResult = { leads: Lead[]; total: number };

/** A company row from `lit_leadcrm_search_companies()` (the "Add from LIT" picker). */
export type CompanySearchResult = {
  id: string | null;
  source_company_key: string | null;
  name: string;
  domain: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  origin: "companies" | "directory" | string;
  has_snapshot: boolean;
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

/**
 * Pipeline stages ordered by position (New → … → Subscriber → Lost).
 * Shape (verified vs pg_get_functiondef): `lit_leadcrm_stages()` returns a
 * jsonb ARRAY directly (jsonb_agg over the stages) — read `data` as the array.
 */
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

/**
 * Paginated, filtered lead list. Silent-fail → empty array.
 *
 * SHAPE (verified vs pg_get_functiondef): `lit_leadcrm_list_leads()` returns a
 * jsonb OBJECT `{ ok, total, leads: [...] }` — NOT a bare array. Reading `data`
 * as an array (the previous bug) always yielded `[]`, so the list rendered
 * "No leads yet" even with 69 rows. Read `data.leads`.
 */
export async function listLeads(params: ListLeadsParams = {}): Promise<Lead[]> {
  return (await listLeadsPage(params)).leads;
}

/** Same as `listLeads` but also returns the server `total` for pagination. */
export async function listLeadsPage(params: ListLeadsParams = {}): Promise<ListLeadsResult> {
  const empty: ListLeadsResult = { leads: [], total: 0 };
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_list_leads", {
      p_stage_id: params.stageId ?? null,
      p_source: params.source ?? null,
      p_assignee: params.assignee ?? null,
      p_q: params.q ?? null,
      p_limit: params.limit ?? 100,
      p_offset: params.offset ?? 0,
      p_status: params.status ?? "active",
    });
    if (error || !data || typeof data !== "object") return empty;
    const obj = data as any;
    const rows = Array.isArray(obj.leads) ? obj.leads : [];
    return { leads: rows.map(normalizeLead), total: Number(obj.total ?? rows.length) };
  } catch {
    return empty;
  }
}

/**
 * Resolve one lead + its subscription/plan/activation summary.
 *
 * SHAPE (verified vs pg_get_functiondef): `lit_leadcrm_get_lead()` returns
 * `{ ok, lead, user, subscription, activation }` (or `{ ok:false, reason }`).
 * The previous code passed the WHOLE envelope to `normalizeLead`, so `id` etc.
 * were undefined. Read `data.lead`, and fold `activation.current_plan` /
 * `current_status` (which live on the `activation` sub-object here, unlike the
 * flat list rows) onto the returned Lead so the drawer's Subscription panel and
 * list filters keep working from one shape.
 */
export async function getLead(leadId: string): Promise<Lead | null> {
  if (!leadId) return null;
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_get_lead", {
      p_lead_id: leadId,
    });
    if (error || !data) return null;
    const obj = data as any;
    if (obj.ok === false || !obj.lead) return null;
    return normalizeLead({
      ...obj.lead,
      // Flatten activation-derived plan/status so Lead shape stays uniform.
      current_plan: obj.activation?.current_plan ?? obj.lead.current_plan ?? null,
      current_status: obj.activation?.current_status ?? obj.lead.current_status ?? null,
      // Prefer the lead's own signup/trial timestamps; fall back to activation.
      signup_at: obj.lead.signup_at ?? obj.activation?.signup_at ?? null,
      trial_started_at: obj.lead.trial_started_at ?? obj.activation?.trial_started_at ?? null,
      converted_at: obj.lead.converted_at ?? obj.activation?.converted_paid_at ?? null,
    });
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
    phone: row.phone ?? null,
    title: row.title ?? null,
    website: row.website ?? null,
    address: row.address ?? null,
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
    archived_at: row.archived_at ?? null,
    deleted_at: row.deleted_at ?? null,
  };
}

// ── Timeline ────────────────────────────────────────────────────────────

/**
 * Lead activity timeline, newest first. Silent-fail → empty.
 *
 * SHAPE (verified vs pg_get_functiondef): `lit_leadcrm_lead_timeline()` returns
 * `{ ok, timeline: [...] }` — read `data.timeline`, not `data` as an array.
 */
export async function getLeadTimeline(leadId: string): Promise<LeadTimelineEntry[]> {
  if (!leadId) return [];
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_lead_timeline", {
      p_lead_id: leadId,
    });
    const rows = (data as any)?.timeline;
    if (error || !Array.isArray(rows)) return [];
    return (rows as any[]).map((e) => ({
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

/**
 * Per-stage counts + conversion rates. Silent-fail → empty.
 *
 * SHAPE (verified vs pg_get_functiondef): `lit_leadcrm_pipeline_summary()`
 * returns an OBJECT `{ ok, generated_at, stages:[{stage_id, stage, position,
 * count}], totals, conversion_rates }`. Per-stage rows key the name as `stage`
 * and the count as `count` (NOT `stage_name`/`lead_count`), and carry no
 * per-stage `color`/`conversion_rate`. Map to the UI's PipelineStageSummary.
 * The previous code read `data` as an array → always empty.
 */
export async function pipelineSummary(): Promise<PipelineStageSummary[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_pipeline_summary");
    const stages = (data as any)?.stages;
    if (error || !Array.isArray(stages)) return [];
    return (stages as any[]).map((r) => ({
      stage_id: r.stage_id != null ? String(r.stage_id) : null,
      stage_name: r.stage ?? r.stage_name ?? null,
      color: r.color ?? null,
      position: r.position != null ? Number(r.position) : null,
      lead_count: Number(r.count ?? r.lead_count ?? 0),
      conversion_rate: r.conversion_rate != null ? Number(r.conversion_rate) : null,
    }));
  } catch {
    return [];
  }
}

/**
 * Full pipeline summary envelope (totals + conversion_rates + stages) for the
 * KPI row. Null-safe: any error → a zeroed shape so the KPI cards render "—"
 * rather than crashing. Coerces every numeric so a jsonb string can't leak
 * through as a React child.
 */
export async function getPipelineSummary(): Promise<PipelineSummary> {
  const empty: PipelineSummary = {
    stages: [],
    totals: {
      total_leads: null, contacted: null, engaged: null, trial: null,
      subscriber: null, lost: null, new_this_week: null, unassigned: null, avg_score: null,
    },
    conversion_rates: {
      lead_to_contacted: null, lead_to_engaged: null, lead_to_trial: null,
      lead_to_subscriber: null, trial_to_subscriber: null,
    },
  };
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_pipeline_summary");
    if (error || !data || typeof data !== "object") return empty;
    const obj = data as any;
    const n = (v: any): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
    const t = obj.totals ?? {};
    const c = obj.conversion_rates ?? {};
    return {
      stages: Array.isArray(obj.stages)
        ? obj.stages.map((s: any) => ({
            stage_id: s.stage_id != null ? String(s.stage_id) : null,
            stage: s.stage ?? s.stage_name ?? null,
            color: s.color ?? null,
            position: s.position != null ? Number(s.position) : null,
            count: Number(s.count ?? 0),
          }))
        : [],
      totals: {
        total_leads: n(t.total_leads), contacted: n(t.contacted), engaged: n(t.engaged),
        trial: n(t.trial), subscriber: n(t.subscriber), lost: n(t.lost),
        new_this_week: n(t.new_this_week), unassigned: n(t.unassigned), avg_score: n(t.avg_score),
      },
      conversion_rates: {
        lead_to_contacted: n(c.lead_to_contacted), lead_to_engaged: n(c.lead_to_engaged),
        lead_to_trial: n(c.lead_to_trial), lead_to_subscriber: n(c.lead_to_subscriber),
        trial_to_subscriber: n(c.trial_to_subscriber),
      },
    };
  } catch {
    return empty;
  }
}

// ── Kanban board ────────────────────────────────────────────────────────────

/**
 * Stage-grouped, per-column-capped board for the Pipeline kanban. One RPC round
 * trip; each column carries its true `total` plus up to `limitPerStage` leads.
 * Silent-fail → empty columns.
 */
export async function getBoard(limitPerStage = 50): Promise<BoardColumn[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_board", {
      p_limit_per_stage: limitPerStage,
    });
    const stages = (data as any)?.stages;
    if (error || !Array.isArray(stages)) return [];
    return (stages as any[])
      .map((s) => ({
        stage_id: String(s.stage_id),
        stage_name: s.stage_name ?? null,
        color: s.color ?? null,
        position: s.position != null ? Number(s.position) : null,
        is_won: Boolean(s.is_won),
        is_lost: Boolean(s.is_lost),
        total: Number(s.total ?? 0),
        leads: Array.isArray(s.leads) ? s.leads.map(normalizeLead) : [],
      }))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  } catch {
    return [];
  }
}

// ── Tasks ───────────────────────────────────────────────────────────────────

function normalizeTask(row: any): LeadTask {
  return {
    id: String(row.id),
    lead_id: String(row.lead_id),
    title: row.title ?? null,
    due_date: row.due_date ?? null,
    status: row.status ?? null,
    assignee_user_id: row.assignee_user_id != null ? String(row.assignee_user_id) : null,
    assignee_name: row.assignee_name ?? null,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at ?? null,
    overdue: Boolean(row.overdue),
    lead_name: row.lead_name ?? null,
    lead_company: row.lead_company ?? null,
    lead_email: row.lead_email ?? null,
  };
}

/** Tasks for one lead (drawer). Silent-fail → empty. */
export async function getLeadTasks(leadId: string): Promise<LeadTask[]> {
  if (!leadId) return [];
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_lead_tasks", { p_lead_id: leadId });
    const rows = (data as any)?.tasks;
    if (error || !Array.isArray(rows)) return [];
    return (rows as any[]).map(normalizeTask);
  } catch {
    return [];
  }
}

/** My (or a member's) open/overdue/done tasks for the shell Tasks tab. Silent-fail → empty. */
export async function getMyTasks(
  status: "open" | "overdue" | "done" | "all" = "open",
  assignee?: string | null,
): Promise<LeadTask[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_my_tasks", {
      p_assignee: assignee ?? null,
      p_status: status,
    });
    const rows = (data as any)?.tasks;
    if (error || !Array.isArray(rows)) return [];
    return (rows as any[]).map(normalizeTask);
  } catch {
    return [];
  }
}

/**
 * Create a follow-up task. `leadId` is OPTIONAL — a null lead creates a
 * standalone personal task (supported since migration
 * 20260816930000_lit_leadcrm_standalone_tasks). Throws on transport error;
 * returns {ok,reason}.
 */
export async function createTask(params: {
  leadId?: string | null;
  title: string;
  dueDate?: string | null;
  assignee?: string | null;
}): Promise<{ ok: boolean; task_id?: string; reason?: string }> {
  const { data, error } = await supabase.rpc("lit_leadcrm_create_task", {
    p_lead_id: params.leadId ?? null,
    p_title: params.title,
    p_due_date: params.dueDate ?? null,
    p_assignee: params.assignee ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return {
    ok: Boolean(row?.ok),
    task_id: row?.task_id != null ? String(row.task_id) : undefined,
    reason: row?.reason,
  };
}

/** Complete / reopen a task. Throws on transport error. */
export async function completeTask(taskId: string, done = true): Promise<void> {
  const { error } = await supabase.rpc("lit_leadcrm_complete_task", {
    p_task_id: taskId,
    p_done: done,
  });
  if (error) throw new Error(error.message);
}

// ── Member management (platform-admin only) ─────────────────────────────

/**
 * List lead-CRM members. Platform-admin only (RPC re-checks server-side).
 *
 * SHAPE (verified vs pg_get_functiondef): `lit_admin_list_lead_crm_members()`
 * returns `{ ok, members:[{user_id, role, email, full_name, added_by,
 * created_at}] }` — read `data.members`, not `data` as an array. The row keys
 * `created_at` (mapped → `added_at`) and has NO `enabled` column: a revoked
 * member has its row DELETED (see `setMember(..., false)`), so every row
 * present is an enabled member (`enabled: true`).
 */
export async function listMembers(): Promise<LeadCrmMember[]> {
  try {
    const { data, error } = await supabase.rpc("lit_admin_list_lead_crm_members");
    const rows = (data as any)?.members;
    if (error || !Array.isArray(rows)) return [];
    return (rows as any[]).map((m) => ({
      user_id: String(m.user_id),
      email: m.email ?? null,
      full_name: m.full_name ?? null,
      role: m.role ?? null,
      // Membership is presence-based: listed ⇒ enabled.
      enabled: true,
      added_at: m.added_at ?? m.created_at ?? null,
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

/** A user candidate for the Team picker (lit_admin_search_users). */
export type CrmUserSearchResult = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  is_member: boolean;
  is_platform_admin: boolean;
};

/**
 * Search existing LIT users by name/email/company for the Team member picker —
 * so the admin picks a real person instead of pasting a UUID. Platform-admin
 * only (RPC self-gates). RPC returns { ok, users:[...] }; read `data.users`.
 */
export async function searchUsers(q: string, limit = 20): Promise<CrmUserSearchResult[]> {
  const term = (q ?? "").trim();
  if (term.length < 2) return [];
  try {
    const { data, error } = await supabase.rpc("lit_admin_search_users", { p_q: term, p_limit: limit });
    const rows = (data as any)?.users;
    if (error || !Array.isArray(rows)) return [];
    return (rows as any[]).map((u) => ({
      user_id: String(u.user_id),
      email: u.email ?? null,
      full_name: u.full_name ?? null,
      company_name: u.company_name ?? null,
      is_member: Boolean(u.is_member),
      is_platform_admin: Boolean(u.is_platform_admin),
    }));
  } catch {
    return [];
  }
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
 * Manually add an opportunity (or merge into an existing lead).
 *
 * Email is now OPTIONAL (server requires email OR company_name). When email is
 * omitted, the lead is created company-first and deduped on normalized company
 * name. Auto-runs company recognition server-side. Throws on transport error.
 */
export async function createLead(params: {
  email?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  stageId?: string | null;
  assignee?: string | null;
  notes?: string | null;
}): Promise<CreateLeadResult> {
  const { data, error } = await supabase.rpc("lit_leadcrm_create_lead", {
    p_email: params.email?.trim() || null,
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

/** Result of `lit_leadcrm_update_lead()`. */
export type UpdateLeadResult = { ok: boolean; lead_id?: string; reason?: string };

/**
 * Manually PATCH a lead's contact + company details (`lit_leadcrm_update_lead`).
 *
 * PATCH semantics: pass `undefined` (or omit) to leave a field untouched; pass a
 * string (including "") to set/clear it. We forward `undefined` → null so the RPC
 * treats it as "keep existing". Setting a `website` server-derives company_domain
 * + refreshes the logo when no explicit domain is given, which also unblocks the
 * Contacts "Enrich" button. Returns {ok:false, reason:'email_in_use'} on a
 * partial-unique(email) conflict instead of throwing. Throws only on transport error.
 */
export async function updateLead(
  leadId: string,
  fields: {
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    title?: string | null;
    companyName?: string | null;
    website?: string | null;
    companyDomain?: string | null;
    address?: string | null;
    companyCity?: string | null;
    companyState?: string | null;
    companyCountry?: string | null;
  },
): Promise<UpdateLeadResult> {
  // `undefined` → null (PATCH: keep existing). An explicit "" is forwarded as ""
  // so the RPC clears that field.
  const nz = (v: string | null | undefined): string | null => (v === undefined ? null : v);
  const { data, error } = await supabase.rpc("lit_leadcrm_update_lead", {
    p_lead_id: leadId,
    p_full_name: nz(fields.fullName),
    p_email: nz(fields.email),
    p_phone: nz(fields.phone),
    p_title: nz(fields.title),
    p_company_name: nz(fields.companyName),
    p_website: nz(fields.website),
    p_company_domain: nz(fields.companyDomain),
    p_address: nz(fields.address),
    p_company_city: nz(fields.companyCity),
    p_company_state: nz(fields.companyState),
    p_company_country: nz(fields.companyCountry),
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return {
    ok: Boolean(row?.ok),
    lead_id: row?.lead_id != null ? String(row.lead_id) : undefined,
    reason: row?.reason,
  };
}

// ── Phase 3: Communication & Nurture ────────────────────────────────────────

/** Lead email + suppression state — `lit_leadcrm_lead_email()`. Drives composer. */
export type LeadEmailInfo = {
  ok: boolean;
  email: string | null;
  full_name: string | null;
  has_email: boolean;
  suppressed: boolean;
  suppressed_reason: string | null;
};

/** A compact inbox thread for the lead — `lit_leadcrm_lead_threads()`. */
export type LeadThread = {
  id: string;
  subject: string | null;
  participants: unknown;
  last_message_at: string | null;
  message_count: number | null;
  unread_count: number | null;
  provider: string | null;
  status: string | null;
  last_snippet: string | null;
};

/** An enrollable campaign — `lit_leadcrm_list_campaigns()`. */
export type LeadCampaign = { id: string; name: string | null; status: string | null };

/** Cal.com booking config — `lit_leadcrm_cal_config()`. */
export type CalConfig = {
  ok: boolean;
  configured: boolean;
  cal_url: string | null;
  can_configure: boolean;
};

/** Resolve the lead's email + suppression flag. Null-safe → no-email default. */
export async function getLeadEmailInfo(leadId: string): Promise<LeadEmailInfo> {
  const fallback: LeadEmailInfo = {
    ok: false, email: null, full_name: null, has_email: false, suppressed: false, suppressed_reason: null,
  };
  if (!leadId) return fallback;
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_lead_email", { p_lead_id: leadId });
    if (error || !data) return fallback;
    const row = (Array.isArray(data) ? data[0] : data) as any;
    if (!row || row.ok === false) return fallback;
    return {
      ok: true,
      email: row.email ?? null,
      full_name: row.full_name ?? null,
      has_email: Boolean(row.has_email),
      suppressed: Boolean(row.suppressed),
      suppressed_reason: row.suppressed_reason ?? null,
    };
  } catch {
    return fallback;
  }
}

/**
 * Send a one-off branded email to the lead via the `lead-crm-send-email` edge
 * fn (reuses Resend + records to lit_outreach_history + lit_lead_activity).
 * Returns the (possibly !ok) result so the caller can surface no-email /
 * suppressed / send-failed messages. Throws only on transport error.
 */
export async function sendLeadEmail(params: {
  leadId: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; sent?: boolean; message_id?: string | null; error?: string; code?: string }> {
  const { data, error } = await supabase.functions.invoke("lead-crm-send-email", {
    body: { lead_id: params.leadId, subject: params.subject, body: params.body },
  });
  if (error) {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        return { ok: false, error: b?.error ?? error.message, code: b?.code };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: error.message };
  }
  return (data as any) ?? { ok: false, error: "No response" };
}

/** Inbox threads where the lead is a participant. Silent-fail → empty. */
export async function getLeadThreads(
  leadId: string,
): Promise<{ hasEmail: boolean; threads: LeadThread[] }> {
  if (!leadId) return { hasEmail: false, threads: [] };
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_lead_threads", { p_lead_id: leadId });
    if (error || !data) return { hasEmail: false, threads: [] };
    const row = (Array.isArray(data) ? data[0] : data) as any;
    if (!row || row.ok === false) return { hasEmail: false, threads: [] };
    const threads = Array.isArray(row.threads)
      ? row.threads.map((t: any) => ({
          id: String(t.id),
          subject: t.subject ?? null,
          participants: t.participants ?? null,
          last_message_at: t.last_message_at ?? null,
          message_count: t.message_count != null ? Number(t.message_count) : null,
          unread_count: t.unread_count != null ? Number(t.unread_count) : null,
          provider: t.provider ?? null,
          status: t.status ?? null,
          last_snippet: t.last_snippet ?? null,
        }))
      : [];
    return { hasEmail: Boolean(row.has_email), threads };
  } catch {
    return { hasEmail: false, threads: [] };
  }
}

/** Send a demo invite for the lead via `send-demo-invite`, then log the touch. */
export async function sendLeadDemoInvite(params: {
  leadId: string;
  email: string;
  name?: string | null;
  company?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; sent?: boolean; error?: string; code?: string }> {
  const { data, error } = await supabase.functions.invoke("send-demo-invite", {
    body: {
      email: params.email,
      name: params.name ?? "",
      company: params.company ?? "",
      note: params.note ?? "",
    },
  });
  if (error) {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        return { ok: false, error: b?.error ?? error.message, code: b?.code };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: error.message };
  }
  const res = (data as any) ?? {};
  if (res.ok && (res.sent ?? true)) {
    // Log the demo-invite touch onto the lead timeline (best-effort).
    try {
      await supabase.rpc("lit_leadcrm_log_demo_invite", { p_lead_id: params.leadId });
    } catch {
      /* non-fatal */
    }
  }
  return { ok: Boolean(res.ok), sent: Boolean(res.sent), error: res.error, code: res.code };
}

/** Campaigns the team can enroll this lead into. Silent-fail → empty. */
export async function listLeadCampaigns(): Promise<LeadCampaign[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_list_campaigns");
    const rows = (data as any)?.campaigns;
    if (error || !Array.isArray(rows)) return [];
    return (rows as any[]).map((c) => ({
      id: String(c.id),
      name: c.name ?? null,
      status: c.status ?? null,
    }));
  } catch {
    return [];
  }
}

/** Enroll the lead's email into a campaign. Returns the (possibly !ok) result. */
export async function addLeadToCampaign(
  leadId: string,
  campaignId: string,
): Promise<{ ok: boolean; enrolled?: boolean; already_enrolled?: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("lit_leadcrm_add_to_campaign", {
    p_lead_id: leadId,
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return {
    ok: Boolean(row?.ok),
    enrolled: Boolean(row?.enrolled),
    already_enrolled: Boolean(row?.already_enrolled),
    reason: row?.reason,
  };
}

/** Read the Cal.com booking config. Null-safe → unconfigured default. */
export async function getCalConfig(): Promise<CalConfig> {
  const fallback: CalConfig = { ok: false, configured: false, cal_url: null, can_configure: false };
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_cal_config");
    if (error || !data) return fallback;
    const row = (Array.isArray(data) ? data[0] : data) as any;
    if (!row || row.ok === false) return fallback;
    return {
      ok: true,
      configured: Boolean(row.configured),
      cal_url: row.cal_url ?? null,
      can_configure: Boolean(row.can_configure),
    };
  } catch {
    return fallback;
  }
}

/** Set the Cal.com booking URL (platform-admin only). Throws on transport error. */
export async function setCalUrl(url: string): Promise<{ ok: boolean; cal_url?: string; reason?: string }> {
  const { data, error } = await supabase.rpc("lit_admin_set_cal_url", { p_url: url });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { ok: Boolean(row?.ok), cal_url: row?.cal_url ?? undefined, reason: row?.reason };
}

/** Log that a rep opened the Cal.com booking link for a lead (best-effort). */
export async function logCallBookingOpened(leadId: string): Promise<void> {
  try {
    await supabase.rpc("lit_leadcrm_log_call_booking_opened", { p_lead_id: leadId });
  } catch {
    /* non-fatal — the link still opened */
  }
}

// ── "Add from LIT" company picker (structural: pull from existing LIT data) ──

/**
 * Membership-gated typeahead over LIT's existing company data
 * (`lit_leadcrm_search_companies`): lit_companies + the 78k-row
 * lit_company_directory (brokers / forwarders / importers). Cached reads only —
 * 0 provider credits. Returns `data.companies`. Silent-fail → empty.
 */
export async function searchCompanies(q: string, limit = 20): Promise<CompanySearchResult[]> {
  const term = (q ?? "").trim();
  if (term.length < 2) return [];
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_search_companies", {
      p_q: term,
      p_limit: limit,
    });
    const rows = (data as any)?.companies;
    if (error || !Array.isArray(rows)) return [];
    return (rows as any[]).map((c) => ({
      id: c.id != null ? String(c.id) : null,
      source_company_key: c.source_company_key ?? null,
      name: c.name ?? "Company",
      domain: c.domain ?? null,
      city: c.city ?? null,
      state: c.state ?? null,
      country: c.country ?? null,
      industry: c.industry ?? null,
      origin: c.origin ?? "directory",
      has_snapshot: Boolean(c.has_snapshot),
    }));
  } catch {
    return [];
  }
}

/**
 * Create a lead from an existing LIT company (broker/forwarder/directory row) —
 * NO email required (`lit_leadcrm_create_lead_from_company`). Auto-populates
 * company_* columns via the recognizer (cached reads, 0 credits) and dedupes on
 * company. Enrich contacts afterward to get people + emails. Throws on transport
 * error.
 */
export async function createLeadFromCompany(params: {
  companyId?: string | null;
  sourceCompanyKey?: string | null;
  companyName?: string | null;
  stageId?: string | null;
  assignee?: string | null;
}): Promise<CreateLeadResult> {
  const { data, error } = await supabase.rpc("lit_leadcrm_create_lead_from_company", {
    p_company_id: params.companyId ?? null,
    p_source_company_key: params.sourceCompanyKey ?? null,
    p_company_name: params.companyName ?? null,
    p_stage_id: params.stageId ?? null,
    p_assignee: params.assignee ?? null,
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

// ── Phase 4: Reporting · Hygiene · Attio cutover ────────────────────────────

const num = (v: any): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const int0 = (v: any): number => Number(v ?? 0) || 0;

// ── Reports ──────────────────────────────────────────────────────────────

export type FunnelStep = { key: string; label: string; count: number };
export type FunnelReport = {
  steps: FunnelStep[];
  lost: number;
  conversions: {
    leads_to_contacted: number | null;
    contacted_to_engaged: number | null;
    engaged_to_trial: number | null;
    trial_to_subscriber: number | null;
    leads_to_subscriber: number | null;
  };
};

/** Lifecycle funnel counts + conversion % between stages. Null-safe → empty. */
export async function reportFunnel(days = 30): Promise<FunnelReport> {
  const empty: FunnelReport = {
    steps: [], lost: 0,
    conversions: {
      leads_to_contacted: null, contacted_to_engaged: null, engaged_to_trial: null,
      trial_to_subscriber: null, leads_to_subscriber: null,
    },
  };
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_report_funnel", { p_days: days });
    if (error || !data || typeof data !== "object") return empty;
    const o = data as any;
    const c = o.conversions ?? {};
    return {
      steps: Array.isArray(o.steps)
        ? o.steps.map((s: any) => ({ key: String(s.key ?? ""), label: String(s.label ?? ""), count: int0(s.count) }))
        : [],
      lost: int0(o.lost),
      conversions: {
        leads_to_contacted: num(c.leads_to_contacted),
        contacted_to_engaged: num(c.contacted_to_engaged),
        engaged_to_trial: num(c.engaged_to_trial),
        trial_to_subscriber: num(c.trial_to_subscriber),
        leads_to_subscriber: num(c.leads_to_subscriber),
      },
    };
  } catch {
    return empty;
  }
}

export type SourceRow = {
  source: string; leads: number; trials: number; subscribers: number; conversion: number | null;
};

/** Per-source (utm/primary) leads/trials/subscribers + conversion%. Null-safe → []. */
export async function reportBySource(days = 30): Promise<SourceRow[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_report_by_source", { p_days: days });
    const rows = (data as any)?.rows;
    if (error || !Array.isArray(rows)) return [];
    return rows.map((r: any) => ({
      source: String(r.source ?? "unknown"),
      leads: int0(r.leads), trials: int0(r.trials), subscribers: int0(r.subscribers),
      conversion: num(r.conversion),
    }));
  } catch {
    return [];
  }
}

export type RepRow = {
  user_id: string | null; name: string; email: string | null;
  assigned: number; worked: number; trials: number; subscribers: number;
  open_tasks: number; overdue_tasks: number;
};

/** Per-rep performance. Null-safe → []. */
export async function reportByRep(days = 30): Promise<RepRow[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_report_by_rep", { p_days: days });
    const rows = (data as any)?.rows;
    if (error || !Array.isArray(rows)) return [];
    return rows.map((r: any) => ({
      user_id: r.user_id != null ? String(r.user_id) : null,
      name: String(r.name ?? "Teammate"),
      email: r.email ?? null,
      assigned: int0(r.assigned), worked: int0(r.worked), trials: int0(r.trials),
      subscribers: int0(r.subscribers), open_tasks: int0(r.open_tasks), overdue_tasks: int0(r.overdue_tasks),
    }));
  } catch {
    return [];
  }
}

export type VelocityReport = {
  avg_days_lead_to_trial: number | null;
  avg_days_trial_to_subscriber: number | null;
  series: { date: string; created: number; converted: number }[];
};

/** Velocity (avg days between milestones) + daily created/converted series. */
export async function reportVelocity(days = 30): Promise<VelocityReport> {
  const empty: VelocityReport = { avg_days_lead_to_trial: null, avg_days_trial_to_subscriber: null, series: [] };
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_report_velocity", { p_days: days });
    if (error || !data || typeof data !== "object") return empty;
    const o = data as any;
    return {
      avg_days_lead_to_trial: num(o.avg_days_lead_to_trial),
      avg_days_trial_to_subscriber: num(o.avg_days_trial_to_subscriber),
      series: Array.isArray(o.series)
        ? o.series.map((p: any) => ({ date: String(p.date ?? ""), created: int0(p.created), converted: int0(p.converted) }))
        : [],
    };
  } catch {
    return empty;
  }
}

export type WonLostReport = {
  won: number; lost: number; lost_reasons: { reason: string; count: number }[];
};

/** Won vs lost + lost reasons. Null-safe → zeroed. */
export async function reportWonLost(days = 30): Promise<WonLostReport> {
  const empty: WonLostReport = { won: 0, lost: 0, lost_reasons: [] };
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_report_won_lost", { p_days: days });
    if (error || !data || typeof data !== "object") return empty;
    const o = data as any;
    return {
      won: int0(o.won), lost: int0(o.lost),
      lost_reasons: Array.isArray(o.lost_reasons)
        ? o.lost_reasons.map((r: any) => ({ reason: String(r.reason ?? "Unspecified"), count: int0(r.count) }))
        : [],
    };
  } catch {
    return empty;
  }
}

export type AuditRow = {
  occurred_at: string | null; kind: string | null; source: string | null;
  lead_id: string | null; lead_label: string | null;
  actor_name: string | null; actor_email: string | null;
};

/** Audit trail (platform-admin only). Null-safe → []. */
export async function reportAudit(days = 30, limit = 200): Promise<AuditRow[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_audit", { p_days: days, p_limit: limit });
    const rows = (data as any)?.rows;
    if (error || !Array.isArray(rows)) return [];
    return rows.map((r: any) => ({
      occurred_at: r.occurred_at ?? null,
      kind: r.kind ?? null,
      source: r.source ?? null,
      lead_id: r.lead_id != null ? String(r.lead_id) : null,
      lead_label: r.lead_label ?? null,
      actor_name: r.actor_name ?? null,
      actor_email: r.actor_email ?? null,
    }));
  } catch {
    return [];
  }
}

// ── Tags ─────────────────────────────────────────────────────────────────

export type LeadTag = { id: string; name: string; color: string | null; lead_count?: number };

export async function listTags(): Promise<LeadTag[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_list_tags");
    const rows = (data as any)?.tags;
    if (error || !Array.isArray(rows)) return [];
    return rows.map((t: any) => ({
      id: String(t.id), name: String(t.name ?? ""), color: t.color ?? null,
      lead_count: t.lead_count != null ? Number(t.lead_count) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function createTag(name: string, color?: string | null): Promise<{ ok: boolean; tag_id?: string; reason?: string }> {
  const { data, error } = await supabase.rpc("lit_leadcrm_create_tag", { p_name: name, p_color: color ?? null });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { ok: Boolean(row?.ok), tag_id: row?.tag_id != null ? String(row.tag_id) : undefined, reason: row?.reason };
}

export async function getLeadTags(leadId: string): Promise<LeadTag[]> {
  if (!leadId) return [];
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_lead_tags", { p_lead_id: leadId });
    const rows = (data as any)?.tags;
    if (error || !Array.isArray(rows)) return [];
    return rows.map((t: any) => ({ id: String(t.id), name: String(t.name ?? ""), color: t.color ?? null }));
  } catch {
    return [];
  }
}

export async function addLeadTag(leadId: string, tagId: string): Promise<void> {
  const { error } = await supabase.rpc("lit_leadcrm_add_tag", { p_lead_id: leadId, p_tag_id: tagId });
  if (error) throw new Error(error.message);
}

export async function removeLeadTag(leadId: string, tagId: string): Promise<void> {
  const { error } = await supabase.rpc("lit_leadcrm_remove_tag", { p_lead_id: leadId, p_tag_id: tagId });
  if (error) throw new Error(error.message);
}

// ── Dedupe / merge ─────────────────────────────────────────────────────────

export type DuplicateLead = {
  id: string; full_name: string | null; company_name: string | null;
  lead_score: number | null; created_at: string | null; last_activity_at: string | null;
};
export type DuplicateGroup = {
  key_kind: string; key_val: string | null; count: number; leads: DuplicateLead[];
};

export async function findDuplicates(): Promise<DuplicateGroup[]> {
  try {
    const { data, error } = await supabase.rpc("lit_leadcrm_find_duplicates");
    const groups = (data as any)?.groups;
    if (error || !Array.isArray(groups)) return [];
    return groups.map((g: any) => ({
      key_kind: String(g.key_kind ?? ""),
      key_val: g.key_val ?? null,
      count: int0(g.count),
      leads: Array.isArray(g.leads)
        ? g.leads.map((l: any) => ({
            id: String(l.id),
            full_name: l.full_name ?? null,
            company_name: l.company_name ?? null,
            lead_score: l.lead_score != null ? Number(l.lead_score) : null,
            created_at: l.created_at ?? null,
            last_activity_at: l.last_activity_at ?? null,
          }))
        : [],
    }));
  } catch {
    return [];
  }
}

export async function mergeLeads(primaryId: string, duplicateId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("lit_leadcrm_merge_leads", {
    p_primary_id: primaryId, p_duplicate_id: duplicateId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { ok: Boolean(row?.ok), reason: row?.reason };
}

// ── Archive / soft-delete / restore (hygiene lifecycle) ──────────────────────

export type LeadLifecycleResult = { ok: boolean; reason?: string };

/** Archive or un-archive a lead. Membership-gated. Throws on transport error. */
export async function archiveLead(leadId: string, archived = true): Promise<LeadLifecycleResult> {
  const { data, error } = await supabase.rpc("lit_leadcrm_archive_lead", {
    p_lead_id: leadId,
    p_archived: archived,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { ok: Boolean(row?.ok), reason: row?.reason };
}

/**
 * Soft-delete a lead — sets deleted_at and preserves all activity. The lead is
 * hidden from the active list/board/summary but recoverable via restoreLead.
 * Membership-gated. Throws on transport error.
 */
export async function deleteLead(leadId: string): Promise<LeadLifecycleResult> {
  const { data, error } = await supabase.rpc("lit_leadcrm_delete_lead", {
    p_lead_id: leadId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { ok: Boolean(row?.ok), reason: row?.reason };
}

/** Restore a lead from archived and/or (soft-)deleted state. Throws on transport error. */
export async function restoreLead(leadId: string): Promise<LeadLifecycleResult> {
  const { data, error } = await supabase.rpc("lit_leadcrm_restore_lead", {
    p_lead_id: leadId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { ok: Boolean(row?.ok), reason: row?.reason };
}

/**
 * HARD delete (platform-admin only) — permanently purges the lead + its
 * activity/tasks. Requires an explicit confirm flag server-side. Throws on
 * transport error; returns {ok:false, reason:'confirm_required'} if not confirmed.
 */
export async function purgeLead(leadId: string, confirm: boolean): Promise<LeadLifecycleResult> {
  const { data, error } = await supabase.rpc("lit_leadcrm_purge_lead", {
    p_lead_id: leadId,
    p_confirm: confirm,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { ok: Boolean(row?.ok), reason: row?.reason };
}

// ── Attio cutover ──────────────────────────────────────────────────────────

export type AttioSyncStatus = { ok: boolean; enabled: boolean; updated_at: string | null };

/** Read the Attio push flag (platform-admin). Null-safe → enabled default. */
export async function getAttioSyncStatus(): Promise<AttioSyncStatus> {
  const fallback: AttioSyncStatus = { ok: false, enabled: true, updated_at: null };
  try {
    const { data, error } = await supabase.rpc("lit_admin_attio_sync_status");
    if (error || !data) return fallback;
    const row = (Array.isArray(data) ? data[0] : data) as any;
    if (!row || row.ok === false) return fallback;
    return { ok: true, enabled: row.enabled !== false, updated_at: row.updated_at ?? null };
  } catch {
    return fallback;
  }
}

/** Flip the Attio push flag (platform-admin). Throws on error. */
export async function setAttioSync(enabled: boolean): Promise<{ ok: boolean; enabled: boolean }> {
  const { data, error } = await supabase.rpc("lit_admin_set_attio_sync", { p_enabled: enabled });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { ok: Boolean(row?.ok), enabled: row?.enabled !== false };
}

export type AttioImportResult = {
  ok: boolean; total?: number; created?: number; updated?: number;
  skipped?: number; failed?: number; notes_added?: number; errors?: string[]; error?: string; code?: string;
};

/** Import an Attio export (JSON array) or pull via API. Platform-admin. */
export async function importAttio(params: {
  records?: unknown[];
  mode?: "records" | "api";
}): Promise<AttioImportResult> {
  const { data, error } = await supabase.functions.invoke("lead-crm-attio-import", {
    body: params.mode === "api" ? { mode: "api" } : { records: params.records ?? [] },
  });
  if (error) {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        return { ok: false, error: b?.error ?? error.message, code: b?.code };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: error.message };
  }
  return (data as AttioImportResult) ?? { ok: false, error: "No response" };
}
