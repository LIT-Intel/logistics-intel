// crm-automations-tick — server-side execution of the CRM automation rules
// the Tasks tab toggles (lit_automation_rules). Cron-gated (X-Internal-Cron).
//
// SELF-CONTAINED on purpose: the MCP bundler can't ship ../_shared, so the
// cron-auth + client helpers are inlined (mirrors share-map / other MCP-
// deployed fns). Only deterministic, idempotent rules run here — nothing
// sends email or moves a deal to a closed state automatically.
//
// Rules honored (per org, only when lit_automation_rules.enabled):
//   stale_flag        — open deals with no activity in 14+ days → is_stale=true
//   quoted_followup   — deal in a "Quoted" stage with no open follow-up task
//                       → create a call task "Follow up on quote" due +2 days
// Each rule bumps lit_automation_rules.run_count by the number of rows it
// actually changed, so the Tasks card shows real activity.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const DAY = 864e5;

Deno.serve(async (req) => {
  // Cron-only: match the shared secret in X-Internal-Cron.
  const secret = req.headers.get("X-Internal-Cron");
  if (!secret || secret !== Deno.env.get("LIT_CRON_SECRET")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const sb = admin();
  const now = Date.now();
  const summary: Record<string, number> = { stale_flag: 0, quoted_followup: 0 };

  // Enabled rules, grouped by org.
  const { data: rules } = await sb
    .from("lit_automation_rules")
    .select("id, org_id, rule_key, enabled, run_count")
    .eq("enabled", true);
  if (!rules?.length) return json({ ok: true, summary, note: "no enabled rules" });

  const byOrg = new Map<string, Map<string, { id: string; run_count: number }>>();
  for (const r of rules as any[]) {
    const m = byOrg.get(r.org_id) ?? new Map();
    m.set(r.rule_key, { id: r.id, run_count: r.run_count ?? 0 });
    byOrg.set(r.org_id, m);
  }

  for (const [orgId, ruleMap] of byOrg) {
    // ── stale_flag ──────────────────────────────────────────────────────
    if (ruleMap.has("stale_flag")) {
      const cutoff = new Date(now - 14 * DAY).toISOString();
      const { data: stale } = await sb
        .from("lit_deals")
        .select("id")
        .eq("org_id", orgId)
        .eq("status", "open")
        .lt("last_activity_at", cutoff)
        .or("is_stale.is.null,is_stale.eq.false");
      const ids = (stale ?? []).map((d: any) => d.id);
      if (ids.length) {
        await sb.from("lit_deals").update({ is_stale: true }).in("id", ids);
        summary.stale_flag += ids.length;
      }
    }

    // ── quoted_followup ────────────────────────────────────────────────
    if (ruleMap.has("quoted_followup")) {
      // "Quoted"-like stages for this org (by name).
      const { data: stages } = await sb
        .from("lit_deal_stages")
        .select("id, name")
        .eq("org_id", orgId);
      const quotedIds = (stages ?? [])
        .filter((s: any) => /quot/i.test(String(s.name)))
        .map((s: any) => s.id);
      if (quotedIds.length) {
        const { data: deals } = await sb
          .from("lit_deals")
          .select("id, owner_user_id, saved_company_id, primary_contact_id, stage_entered_at")
          .eq("org_id", orgId)
          .eq("status", "open")
          .in("stage_id", quotedIds);
        for (const d of (deals ?? []) as any[]) {
          // Skip if an automation follow-up task already exists for this deal.
          const { data: existing } = await sb
            .from("lit_tasks")
            .select("id")
            .eq("deal_id", d.id)
            .eq("source", "automation")
            .eq("trigger_label", "Stage → Quoted")
            .limit(1);
          if (existing?.length) continue;
          const due = new Date(now + 2 * DAY).toISOString().slice(0, 10);
          const { error } = await sb.from("lit_tasks").insert({
            org_id: orgId,
            deal_id: d.id,
            saved_company_id: d.saved_company_id ?? null,
            contact_id: d.primary_contact_id ?? null,
            title: "Follow up on quote",
            due_date: due,
            status: "open",
            assignee_user_id: d.owner_user_id ?? null,
            created_by: d.owner_user_id ?? null,
            task_type: "call",
            source: "automation",
            trigger_label: "Stage → Quoted",
          });
          if (!error) summary.quoted_followup += 1;
        }
      }
    }

    // Bump run_count by rows changed (best-effort).
    for (const key of ["stale_flag", "quoted_followup"] as const) {
      const rule = ruleMap.get(key);
      const delta = key === "stale_flag" ? summary.stale_flag : summary.quoted_followup;
      if (rule && delta) {
        await sb
          .from("lit_automation_rules")
          .update({ run_count: rule.run_count + delta, updated_at: new Date().toISOString() })
          .eq("id", rule.id);
      }
    }
  }

  return json({ ok: true, summary });
});
