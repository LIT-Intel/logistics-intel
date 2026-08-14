/**
 * CRM Phase 1 API — deals + pipeline stages + tasks + deal timeline.
 *
 * Org-scoping model: everything is workspace-scoped. Reads go through the
 * user-scoped supabase client, so RLS (migration
 * 20260814120000_crm_phase1_deals_pipeline_tasks) decides visibility —
 * active members of the owning org see the org's pipeline, no cross-org
 * leakage. Writes stamp `org_id` from the caller's active membership; the
 * RLS INSERT policy re-verifies it.
 *
 * New domain module (not lib/api.ts) per CLAUDE.md: prefer dedicated
 * frontend/src/api/<domain>.ts files over growing the god-object.
 */

import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────
export type DealStage = {
  id: string;
  org_id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  color: string;
};

export type Deal = {
  id: string;
  org_id: string;
  saved_company_id: string | null;
  company_id: string | null;
  title: string;
  value_amount: number | null;
  currency: string;
  stage_id: string;
  status: "open" | "won" | "lost";
  expected_close_date: string | null;
  primary_contact_id: string | null;
  owner_user_id: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type DealCardExtras = {
  companyName?: string | null;
  companyDomain?: string | null;
  companyKey?: string | null;
  contactName?: string | null;
  ownerName?: string | null;
  nextTaskDue?: string | null;
  openTaskCount?: number;
};

export type DealCard = Deal & DealCardExtras;

export type Task = {
  id: string;
  org_id: string;
  deal_id: string | null;
  saved_company_id: string | null;
  contact_id: string | null;
  title: string;
  due_date: string | null;
  status: "open" | "done";
  assignee_user_id: string;
  created_by: string;
  created_at: string;
  completed_at: string | null;
};

export type DealActivity = {
  id: string;
  deal_id: string;
  org_id: string;
  kind: "stage_change" | "note" | "task" | "email" | "meeting" | "created";
  body: Record<string, unknown>;
  actor_user_id: string | null;
  created_at: string;
};

// ── Org / user resolution ──────────────────────────────────────────────
export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the caller's active workspace org. Mirrors the server-side
 * resolution used by get_workspace_kpis (first active org_members row,
 * ordered by joined_at). Returns null for solo users with no active org
 * membership — CRM requires an org, so callers surface a friendly error.
 */
export async function resolveActiveOrgId(): Promise<string | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from("org_members")
      .select("org_id, joined_at")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("joined_at", { ascending: true, nullsFirst: false })
      .limit(1);
    if (error || !data?.length) return null;
    return (data[0] as any).org_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Is the caller an owner/admin of their active workspace? Drives the "view as
 * [member]" affordances — only managers get the dropdown; regular members are
 * already RLS-scoped to their own rows so the filter would be a no-op for them.
 * Cheap single-row read; safe to call from UI hooks.
 */
export async function isOrgManager(): Promise<boolean> {
  const uid = await currentUserId();
  const orgId = await resolveActiveOrgId();
  if (!uid || !orgId) return false;
  try {
    const { data, error } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", uid)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return false;
    return (data as any).role === "owner" || (data as any).role === "admin";
  } catch {
    return false;
  }
}

/** Names for a set of org members (owner avatars / assignee labels). */
export async function loadMemberNames(
  userIds: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return out;
  try {
    const { data } = await supabase
      .from("org_members")
      .select("user_id, full_name, email")
      .in("user_id", ids);
    for (const m of data ?? []) {
      if (!m?.user_id) continue;
      out[m.user_id] =
        (typeof m.full_name === "string" && m.full_name.trim()) ||
        (typeof m.email === "string" && m.email.includes("@")
          ? m.email.split("@")[0]
          : "") ||
        "Teammate";
    }
  } catch {
    /* cosmetic */
  }
  return out;
}

// ── Stages ─────────────────────────────────────────────────────────────
/**
 * List the org's pipeline stages, ordered by position. Auto-seeds the
 * freight defaults on first use (via the SECURITY DEFINER RPC) so a brand
 * new org gets a working board without any admin setup.
 */
export async function listStages(): Promise<DealStage[]> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];
  let { data, error } = await supabase
    .from("lit_deal_stages")
    .select("*")
    .eq("org_id", orgId)
    .order("position", { ascending: true });
  if (error) return [];
  if (!data?.length) {
    // First deal for this org — seed defaults then re-read.
    await supabase.rpc("lit_seed_deal_stages", { p_org_id: orgId });
    const res = await supabase
      .from("lit_deal_stages")
      .select("*")
      .eq("org_id", orgId)
      .order("position", { ascending: true });
    data = res.data ?? [];
  }
  return (data ?? []) as DealStage[];
}

// ── Deals ──────────────────────────────────────────────────────────────
/**
 * List the org's deals for the pipeline board, enriched with company
 * name/domain, primary-contact name, owner name, and next open-task due
 * date so cards render without N+1 fetches.
 */
export async function listDeals(ownerUserId?: string | null): Promise<DealCard[]> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];

  let q = supabase
    .from("lit_deals")
    .select("*")
    .eq("org_id", orgId);
  // Optional "view as [member]" filter. RLS already restricts what the caller
  // can see (members: own rows only; owner/admin: all org rows), so passing an
  // ownerUserId only ever NARROWS an owner/admin's view to one member and is a
  // harmless no-op / self-filter for a regular member.
  if (ownerUserId) q = q.eq("owner_user_id", ownerUserId);
  const { data: deals, error } = await q.order("updated_at", { ascending: false });
  if (error || !deals?.length) return [];

  const savedIds = Array.from(
    new Set(deals.map((d: any) => d.saved_company_id).filter(Boolean)),
  );
  const contactIds = Array.from(
    new Set(deals.map((d: any) => d.primary_contact_id).filter(Boolean)),
  );
  const ownerIds = deals.map((d: any) => d.owner_user_id).filter(Boolean);
  const dealIds = deals.map((d: any) => d.id);

  const [companyMap, contactMap, ownerNames, taskAgg] = await Promise.all([
    (async () => {
      const map: Record<string, { name: string; domain: string | null; key: string | null }> = {};
      if (!savedIds.length) return map;
      const { data } = await supabase
        .from("lit_saved_companies")
        .select("id, company_id, lit_companies(name, domain, source_company_key)")
        .in("id", savedIds);
      for (const r of (data as any[]) ?? []) {
        map[r.id] = {
          name: r.lit_companies?.name ?? "Company",
          domain: r.lit_companies?.domain ?? null,
          key: r.lit_companies?.source_company_key ?? null,
        };
      }
      return map;
    })(),
    (async () => {
      const map: Record<string, string> = {};
      if (!contactIds.length) return map;
      const { data } = await supabase
        .from("lit_contacts")
        .select("id, full_name")
        .in("id", contactIds);
      for (const c of (data as any[]) ?? []) map[c.id] = c.full_name ?? "Contact";
      return map;
    })(),
    loadMemberNames(ownerIds),
    (async () => {
      const map: Record<string, { due: string | null; count: number }> = {};
      if (!dealIds.length) return map;
      const { data } = await supabase
        .from("lit_tasks")
        .select("deal_id, due_date")
        .in("deal_id", dealIds)
        .eq("status", "open");
      for (const t of (data as any[]) ?? []) {
        if (!t.deal_id) continue;
        const cur = map[t.deal_id] ?? { due: null, count: 0 };
        cur.count += 1;
        if (t.due_date && (!cur.due || t.due_date < cur.due)) cur.due = t.due_date;
        map[t.deal_id] = cur;
      }
      return map;
    })(),
  ]);

  return (deals as any[]).map((d) => {
    const company = d.saved_company_id ? companyMap[d.saved_company_id] : null;
    const tasks = taskAgg[d.id];
    return {
      ...(d as Deal),
      companyName: company?.name ?? null,
      companyDomain: company?.domain ?? null,
      companyKey: company?.key ?? d.company_id ?? null,
      contactName: d.primary_contact_id ? contactMap[d.primary_contact_id] ?? null : null,
      ownerName: ownerNames[d.owner_user_id] ?? null,
      nextTaskDue: tasks?.due ?? null,
      openTaskCount: tasks?.count ?? 0,
    } as DealCard;
  });
}

export async function getDeal(id: string): Promise<Deal | null> {
  const { data, error } = await supabase.from("lit_deals").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return (data as Deal) ?? null;
}

export type CreateDealInput = {
  title: string;
  stage_id: string;
  saved_company_id?: string | null;
  company_id?: string | null;
  value_amount?: number | null;
  currency?: string;
  expected_close_date?: string | null;
  primary_contact_id?: string | null;
  owner_user_id?: string | null;
  notes?: string | null;
};

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active workspace — join or create an organization first.");
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("lit_deals")
    .insert({
      org_id: orgId,
      title: input.title,
      stage_id: input.stage_id,
      saved_company_id: input.saved_company_id ?? null,
      company_id: input.company_id ?? null,
      value_amount: input.value_amount ?? null,
      currency: input.currency ?? "USD",
      expected_close_date: input.expected_close_date ?? null,
      primary_contact_id: input.primary_contact_id ?? null,
      owner_user_id: input.owner_user_id ?? uid,
      created_by: uid,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Deal;
}

export async function updateDeal(
  id: string,
  patch: Partial<
    Pick<
      Deal,
      | "title"
      | "value_amount"
      | "currency"
      | "stage_id"
      | "expected_close_date"
      | "primary_contact_id"
      | "owner_user_id"
      | "notes"
    >
  >,
): Promise<Deal> {
  const { data, error } = await supabase
    .from("lit_deals")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Deal;
}

/** Move a deal to a new stage (drag-and-drop / click-to-move). */
export async function moveDealStage(id: string, stageId: string): Promise<Deal> {
  return updateDeal(id, { stage_id: stageId });
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from("lit_deals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Deal timeline ──────────────────────────────────────────────────────
export async function listDealActivity(dealId: string): Promise<DealActivity[]> {
  const { data, error } = await supabase
    .from("lit_deal_activity")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as DealActivity[];
}

export async function addDealNote(dealId: string, text: string): Promise<void> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active workspace.");
  const uid = await currentUserId();
  const { error } = await supabase.from("lit_deal_activity").insert({
    deal_id: dealId,
    org_id: orgId,
    kind: "note",
    body: { text },
    actor_user_id: uid,
  });
  if (error) throw new Error(error.message);
}

// ── Tasks ──────────────────────────────────────────────────────────────
export async function listDealTasks(dealId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("lit_tasks")
    .select("*")
    .eq("deal_id", dealId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as Task[];
}

/** My open tasks across the workspace, due-date sorted (overdue first). */
export async function listMyTasks(): Promise<Task[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("lit_tasks")
    .select("*")
    .eq("assignee_user_id", uid)
    .eq("status", "open")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as Task[];
}

/**
 * Open tasks visible to the caller across the workspace, due-date sorted.
 * RLS decides the base scope: a regular member sees only tasks they're the
 * assignee/creator of; an owner/admin sees ALL org tasks. Owner/admin may pass
 * `ownerUserId` to narrow to a single member ("view as"); for a regular member
 * that argument is a harmless self-filter.
 */
export async function listTasks(ownerUserId?: string | null): Promise<Task[]> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];
  let q = supabase
    .from("lit_tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "open");
  if (ownerUserId) q = q.eq("assignee_user_id", ownerUserId);
  const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as Task[];
}

/** Count of the viewer's overdue open tasks — for the nav/badge surface. */
export async function myOverdueTaskCount(): Promise<number> {
  const uid = await currentUserId();
  if (!uid) return 0;
  const { count, error } = await supabase
    .from("lit_tasks")
    .select("id", { count: "exact", head: true })
    .eq("assignee_user_id", uid)
    .eq("status", "open")
    .lt("due_date", new Date().toISOString());
  if (error) return 0;
  return count ?? 0;
}

export type CreateTaskInput = {
  title: string;
  due_date?: string | null;
  deal_id?: string | null;
  saved_company_id?: string | null;
  contact_id?: string | null;
  assignee_user_id?: string | null;
};

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active workspace.");
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("lit_tasks")
    .insert({
      org_id: orgId,
      title: input.title,
      due_date: input.due_date ?? null,
      deal_id: input.deal_id ?? null,
      saved_company_id: input.saved_company_id ?? null,
      contact_id: input.contact_id ?? null,
      assignee_user_id: input.assignee_user_id ?? uid,
      created_by: uid,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Task;
}

export async function setTaskStatus(id: string, status: "open" | "done"): Promise<Task> {
  const { data, error } = await supabase
    .from("lit_tasks")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Task;
}

// ── Company contacts (for the deal detail's primary-contact picker) ────
export async function listCompanyContacts(
  companyUuid: string | null | undefined,
): Promise<Array<{ id: string; full_name: string; title: string | null; email: string | null }>> {
  if (!companyUuid) return [];
  const { data, error } = await supabase
    .from("lit_contacts")
    .select("id, full_name, title, email")
    .eq("company_id", companyUuid)
    .order("full_name", { ascending: true });
  if (error) return [];
  return (data ?? []) as any;
}

/** Org members for the owner / assignee pickers. */
export async function listOrgMembers(): Promise<Array<{ user_id: string; name: string }>> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("org_members")
    .select("user_id, full_name, email")
    .eq("org_id", orgId)
    .eq("status", "active");
  if (error) return [];
  return (data ?? []).map((m: any) => ({
    user_id: m.user_id,
    name:
      (typeof m.full_name === "string" && m.full_name.trim()) ||
      (typeof m.email === "string" && m.email.includes("@") ? m.email.split("@")[0] : "") ||
      "Teammate",
  }));
}
