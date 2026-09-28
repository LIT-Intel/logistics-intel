/**
 * CRM v2 API — line items, buying committee, automation rules and deal patch
 * helpers on top of src/api/crm.ts (which owns deals/stages/tasks CRUD).
 *
 * Tables (org RLS, migrated):
 *   lit_deal_line_items(id, org_id, deal_id, lane_label, origin_code, teu, rate_usd, value_usd, created_at)
 *   lit_deal_committee(id, org_id, deal_id, contact_id, name, title, role, created_at)
 *   lit_automation_rules(id, org_id, rule_key, enabled, run_count, updated_at) unique(org_id, rule_key)
 * lit_deals gained: next_step_text, next_step_due, lost_reason, source,
 *   source_campaign_id, stage_entered_at (plus existing is_stale, last_activity_at).
 * lit_tasks gained: task_type, source, trigger_label, snoozed_until, outcome.
 */
import { supabase } from "@/lib/supabase";
import {
  resolveActiveOrgId,
  currentUserId,
  type Deal,
  type DealCard,
  type DealStage,
  type Task,
  type DealActivity,
} from "@/api/crm";

// ── v2 row types (existing fields NEVER renamed — intersections only) ──
export type DealV2Extras = {
  next_step_text: string | null;
  next_step_due: string | null; // date (YYYY-MM-DD)
  lost_reason: string | null;
  source: string; // 'manual' default | 'signal' | 'outbound' | ...
  source_campaign_id: string | null;
  stage_entered_at: string | null;
  is_stale: boolean | null;
  last_activity_at: string | null;
};
export type DealV2 = Deal & DealV2Extras;
export type DealCardV2 = DealCard & DealV2Extras;

export type TaskV2 = Task & {
  task_type: "call" | "email" | "linkedin" | "meeting" | string;
  source: "manual" | "signal" | "automation" | string;
  trigger_label: string | null;
  snoozed_until: string | null; // date
  outcome: string | null;
};

export type DealLineItem = {
  id: string;
  org_id: string;
  deal_id: string;
  lane_label: string;
  origin_code: string | null;
  /** Per-lane freight mode (FCL/LCL/FTL/LTL/Drayage/Air Freight/Intermodal/Other). */
  mode: string | null;
  teu: number | null;
  rate_usd: number | null;
  value_usd: number | null;
  created_at: string;
};

export type CommitteeRole = "Decision maker" | "Champion" | "Influencer" | "User";
export type DealCommitteeMember = {
  id: string;
  org_id: string;
  deal_id: string;
  contact_id: string | null;
  name: string;
  title: string | null;
  role: CommitteeRole | string;
  created_at: string;
};

export type AutomationRule = {
  rule_key: string;
  enabled: boolean;
  run_count: number;
  when: string;
  then: string;
};

// ── Automation rules (spec §Tasks A — 5 default rules) ─────────────────
/** Defaults per spec: all on except rule 5 (lost re-check) which is off. */
export const DEFAULT_AUTOMATION_RULES: Array<Omit<AutomationRule, "enabled" | "run_count"> & { defaultOn: boolean }> = [
  { rule_key: "quoted_followup", when: "deal moves to Quoted", then: "create call task “Follow up on quote” due in 2 days", defaultOn: true },
  { rule_key: "stale_14d", when: "deal has no activity for 14 days", then: "flag as stale and notify the owner", defaultOn: true },
  { rule_key: "volume_drop_15", when: "saved company volume drops 15% or more", then: "create a task for the account owner", defaultOn: true },
  { rule_key: "interested_reply_deal", when: "campaign reply is tagged Interested", then: "create a deal in Qualified", defaultOn: true },
  { rule_key: "lost_recheck_90", when: "deal moves to Lost", then: "require a reason and re-check in 90 days", defaultOn: false },
];

/** Merge stored org rows over the spec defaults (no row = default state). */
export async function listAutomationRules(): Promise<AutomationRule[]> {
  const orgId = await resolveActiveOrgId();
  const byKey: Record<string, { enabled: boolean; run_count: number }> = {};
  if (orgId) {
    const { data } = await supabase
      .from("lit_automation_rules")
      .select("rule_key, enabled, run_count")
      .eq("org_id", orgId);
    for (const r of (data as any[]) ?? []) {
      byKey[r.rule_key] = { enabled: !!r.enabled, run_count: Number(r.run_count) || 0 };
    }
  }
  return DEFAULT_AUTOMATION_RULES.map((d) => ({
    rule_key: d.rule_key,
    when: d.when,
    then: d.then,
    enabled: byKey[d.rule_key]?.enabled ?? d.defaultOn,
    run_count: byKey[d.rule_key]?.run_count ?? 0,
  }));
}

/** Upsert (org_id, rule_key) → enabled. run_count untouched on conflict. */
export async function toggleAutomationRule(ruleKey: string, enabled: boolean): Promise<void> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active workspace.");
  const { error } = await supabase
    .from("lit_automation_rules")
    .upsert(
      { org_id: orgId, rule_key: ruleKey, enabled, updated_at: new Date().toISOString() },
      { onConflict: "org_id,rule_key" },
    );
  if (error) throw new Error(error.message);
}

/** Best-effort run counter bump when a rule actually fires. */
export async function incrementRuleRunCount(ruleKey: string): Promise<void> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) return;
  try {
    const { data } = await supabase
      .from("lit_automation_rules")
      .select("run_count")
      .eq("org_id", orgId)
      .eq("rule_key", ruleKey)
      .maybeSingle();
    const next = (Number((data as any)?.run_count) || 0) + 1;
    await supabase
      .from("lit_automation_rules")
      .upsert(
        { org_id: orgId, rule_key: ruleKey, run_count: next, updated_at: new Date().toISOString() },
        { onConflict: "org_id,rule_key" },
      );
  } catch {
    /* cosmetic counter */
  }
}

// ── Line items ─────────────────────────────────────────────────────────
export async function listLineItems(dealId: string): Promise<DealLineItem[]> {
  const { data, error } = await supabase
    .from("lit_deal_line_items")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as DealLineItem[];
}

export async function addLineItem(
  dealId: string,
  input: { lane_label: string; origin_code?: string | null; mode?: string | null; teu?: number | null; rate_usd?: number | null; value_usd?: number | null },
): Promise<DealLineItem> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active workspace.");
  const value =
    input.value_usd ??
    (input.teu != null && input.rate_usd != null ? Math.round(input.teu * input.rate_usd) : null);
  const { data, error } = await supabase
    .from("lit_deal_line_items")
    .insert({
      org_id: orgId,
      deal_id: dealId,
      lane_label: input.lane_label,
      origin_code: input.origin_code ?? null,
      mode: input.mode ?? null,
      teu: input.teu ?? null,
      rate_usd: input.rate_usd ?? null,
      value_usd: value,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as DealLineItem;
}

export async function deleteLineItem(id: string): Promise<void> {
  const { error } = await supabase.from("lit_deal_line_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Buying committee ───────────────────────────────────────────────────
export async function listCommittee(dealId: string): Promise<DealCommitteeMember[]> {
  const { data, error } = await supabase
    .from("lit_deal_committee")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as DealCommitteeMember[];
}

export async function addCommitteeMember(
  dealId: string,
  input: { contact_id?: string | null; name: string; title?: string | null; role: CommitteeRole | string },
): Promise<DealCommitteeMember> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active workspace.");
  const { data, error } = await supabase
    .from("lit_deal_committee")
    .insert({
      org_id: orgId,
      deal_id: dealId,
      contact_id: input.contact_id ?? null,
      name: input.name,
      title: input.title ?? null,
      role: input.role,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as DealCommitteeMember;
}

export async function removeCommitteeMember(id: string): Promise<void> {
  const { error } = await supabase.from("lit_deal_committee").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Activity (same table addDealNote uses; richer kinds/bodies) ────────
/**
 * Insert a lit_deal_activity row. Only the kinds already accepted by the
 * table are used ('stage_change' | 'note' | 'email' | 'meeting' | ...).
 * Logged calls use kind 'note' with body.subkind = 'call' so no new kind
 * is introduced; the timeline renders the phone icon off body.subkind.
 */
export async function logDealActivity(
  dealId: string,
  kind: DealActivity["kind"],
  body: Record<string, unknown>,
): Promise<void> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active workspace.");
  const uid = await currentUserId();
  const { error } = await supabase.from("lit_deal_activity").insert({
    deal_id: dealId,
    org_id: orgId,
    kind,
    body,
    actor_user_id: uid,
  });
  if (error) throw new Error(error.message);
}

/** Recent org-wide stage_change activity — feeds Reports stage conversion. */
export type StageChangeEvent = {
  deal_id: string;
  to_name: string | null;
  from_name: string | null;
  created_at: string;
};
export async function listStageChangeActivity(days = 90): Promise<StageChangeEvent[]> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("lit_deal_activity")
    .select("deal_id, body, created_at")
    .eq("org_id", orgId)
    .eq("kind", "stage_change")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) return [];
  return ((data as any[]) ?? []).map((r) => ({
    deal_id: r.deal_id,
    to_name: typeof r.body?.to === "string" ? r.body.to : null,
    from_name: typeof r.body?.from === "string" ? r.body.from : null,
    created_at: r.created_at,
  }));
}

// ── Deal patch helpers ─────────────────────────────────────────────────
export async function setNextStep(dealId: string, text: string, due?: string | null): Promise<void> {
  const { error } = await supabase
    .from("lit_deals")
    .update({ next_step_text: text, next_step_due: due ?? null })
    .eq("id", dealId);
  if (error) throw new Error(error.message);
}

/** Done → logs "Completed: {text}" to the timeline, then clears the step. */
export async function clearNextStep(dealId: string, opts?: { completedText?: string | null }): Promise<void> {
  if (opts?.completedText) {
    await logDealActivity(dealId, "note", { text: `Completed: ${opts.completedText}` });
  }
  const { error } = await supabase
    .from("lit_deals")
    .update({ next_step_text: null, next_step_due: null })
    .eq("id", dealId);
  if (error) throw new Error(error.message);
}

/**
 * Move a deal to a stage: stage_id + stage_entered_at=now + status/closed_at
 * bookkeeping + a 'stage_change' activity row (spec: every move logs
 * "Moved to {stage}").
 */
export async function setStage(
  dealId: string,
  toStage: DealStage,
  fromStageName?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const status = toStage.is_won ? "won" : toStage.is_lost ? "lost" : "open";
  const patch: Record<string, unknown> = {
    stage_id: toStage.id,
    stage_entered_at: now,
    status,
    closed_at: toStage.is_won || toStage.is_lost ? now : null,
  };
  if (!toStage.is_lost) patch.lost_reason = null;
  const { error } = await supabase.from("lit_deals").update(patch).eq("id", dealId);
  if (error) throw new Error(error.message);
  await logDealActivity(dealId, "stage_change", {
    text: `Moved to ${toStage.name}`,
    from: fromStageName ?? null,
    to: toStage.name,
  });
}

/** Lost-reason modal confirm: reason + move to the org's lost stage + log. */
export async function markLost(dealId: string, reason: string, lostStage: DealStage, fromStageName?: string | null): Promise<void> {
  const { error } = await supabase
    .from("lit_deals")
    .update({ lost_reason: reason })
    .eq("id", dealId);
  if (error) throw new Error(error.message);
  await setStage(dealId, lostStage, fromStageName);
}

// ── Tasks v2 (task_type / source / trigger_label / snooze / outcome) ───
export async function createTaskV2(input: {
  title: string;
  task_type?: string;
  due_date?: string | null;
  deal_id?: string | null;
  saved_company_id?: string | null;
  contact_id?: string | null;
  assignee_user_id?: string | null;
  source?: string;
  trigger_label?: string | null;
}): Promise<TaskV2> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active workspace.");
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("lit_tasks")
    .insert({
      org_id: orgId,
      title: input.title,
      task_type: input.task_type ?? "call",
      due_date: input.due_date ?? null,
      deal_id: input.deal_id ?? null,
      saved_company_id: input.saved_company_id ?? null,
      contact_id: input.contact_id ?? null,
      assignee_user_id: input.assignee_user_id ?? uid,
      created_by: uid,
      source: input.source ?? "manual",
      trigger_label: input.trigger_label ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as TaskV2;
}

/**
 * Cheap head-count of OPEN deals for the org (optionally a single owner) —
 * feeds the Pipeline tab badge (item 5). Head-only count, no rows fetched.
 */
export async function openDealCount(ownerUserId?: string | null): Promise<number> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) return 0;
  let q = supabase
    .from("lit_deals")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "open");
  if (ownerUserId) q = q.eq("owner_user_id", ownerUserId);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export async function snoozeTask(id: string, untilDate: string): Promise<void> {
  const { error } = await supabase
    .from("lit_tasks")
    .update({ snoozed_until: untilDate })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setTaskOutcome(id: string, outcome: string | null): Promise<void> {
  const { error } = await supabase.from("lit_tasks").update({ outcome }).eq("id", id);
  if (error) throw new Error(error.message);
}
