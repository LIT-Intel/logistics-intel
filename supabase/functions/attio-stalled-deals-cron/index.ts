// attio-stalled-deals-cron v3 — daily scan of the Attio LIT workspace for
// Active Pipeline deals untouched for 14+ days. Creates a follow-up Task
// in Attio for each + rolls up the batch into an admin-notify alert.
//
// "Active Pipeline" = stages Qualified, Demo Scheduled, Trial Started,
// Trial Active, Negotiation. Lead is excluded (triage-pending). Won/Lost
// are out of scope.
//
// Filter shape evolution (load-bearing context for the next maintainer):
//   v1 used Mongo-style {$and, $in} — Attio rejected: status type only
//        accepts $eq, not $in. Sentry alert LIT-EDGE-FUNCTIONS-3.
//   v2 used MCP-style {or: [{attribute, op, value}]} — that's only the
//        MCP wrapper shape; REST API doesn't accept it.
//   v3 (this file) uses the actual Attio REST shape: dollar-prefixed
//        combinators ($or) with per-field operator objects
//        {stage: {$eq: "Qualified"}}. Five $eq clauses OR'd together
//        because $in isn't valid for status type.
//
// NULL last_touch is handled client-side: over-fetch all active-pipeline
// deals (≤500 cap is far above realistic Active queue size) and filter
// for null OR < cutoff in code. Simpler than chasing IS NULL filter
// syntax on a date type.
//
// Auth: X-Internal-Cron header against LIT_CRON_SECRET. pg_cron + pg_net
// inject the header from vault.decrypted_secrets on schedule.
//
// Required env: ATTIO_API_KEY (workspace API key).
// Optional env: ATTIO_DEAL_OWNER_ID (default Valesco), ATTIO_STALL_DAYS
// (default 14).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const ATTIO_BASE = "https://api.attio.com/v2";

const ACTIVE_PIPELINE_STAGE_TITLES = [
  "Qualified",
  "Demo Scheduled",
  "Trial Started",
  "Trial Active",
  "Negotiation",
];

// Verified via MCP 2026-06-03: workspace member ID for Valesco Raymond.
const DEFAULT_OWNER_MEMBER_ID = "7970dcda-936b-4837-8666-06a22c6dc788";

type AttioRecordId = { workspace_id: string; object_id: string; record_id: string };
type AttioDealValues = {
  name?: Array<{ value?: string }>;
  stage?: Array<{ status?: { title?: string } }>;
  owner?: Array<{ referenced_actor_id?: string }>;
  last_touch?: Array<{ value?: string | null }>;
};
type AttioDeal = { id: AttioRecordId; values: AttioDealValues };

function attioAuth(): Record<string, string> {
  const key = Deno.env.get("ATTIO_API_KEY") || "";
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}
function daysAgoMs(days: number): number {
  return Date.now() - days * 86400000;
}
function tomorrowIsoDate(): string {
  const d = new Date(Date.now() + 86400000);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Fetch every deal currently in an Active Pipeline stage. Over-fetch
 * intentionally; the client-side filter then picks the stalled ones.
 */
async function fetchActivePipelineDeals(): Promise<AttioDeal[]> {
  const body = {
    filter: {
      $or: ACTIVE_PIPELINE_STAGE_TITLES.map((title) => ({
        stage: { $eq: title },
      })),
    },
    sorts: [{ attribute: "created_at", direction: "asc" }],
    limit: 500,
  };
  const res = await fetch(`${ATTIO_BASE}/objects/deals/records/query`, {
    method: "POST",
    headers: attioAuth(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attio query ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: AttioDeal[] };
  return json.data || [];
}

function isStalled(deal: AttioDeal, stallCutoffMs: number): boolean {
  const raw = deal.values?.last_touch?.[0]?.value;
  if (!raw) return true;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return true;
  return t < stallCutoffMs;
}

async function createFollowUpTask(args: {
  dealRecordId: string;
  ownerMemberId: string;
  dealName: string;
}): Promise<void> {
  const { dealRecordId, ownerMemberId, dealName } = args;
  const body = {
    data: {
      content: `Follow up: ${dealName} — no touch in 14+ days`,
      format: "plaintext",
      deadline_at: tomorrowIsoDate(),
      is_completed: false,
      linked_records: [
        { target_object: "deals", target_record_id: dealRecordId },
      ],
      assignees: [
        {
          referenced_actor_type: "workspace-member",
          referenced_actor_id: ownerMemberId,
        },
      ],
    },
  };
  const res = await fetch(`${ATTIO_BASE}/tasks`, {
    method: "POST",
    headers: attioAuth(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attio task ${res.status}: ${text.slice(0, 240)}`);
  }
}

async function pingAdminNotify(args: {
  stalledCount: number;
  taskCount: number;
  failedCount: number;
  sampleDealNames: string[];
}): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return;
  let secret: string | null = null;
  try {
    const res = await fetch(
      `${url}/rest/v1/lit_internal_secrets?key=eq.admin_notify_secret&select=value`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const rows = (await res.json().catch(() => [])) as Array<{ value: string }>;
    secret = rows?.[0]?.value || null;
  } catch {
    // Soft dependency — admin-notify is nice-to-have.
  }
  if (!secret) return;
  const summary = `${args.stalledCount} stalled deal${args.stalledCount === 1 ? "" : "s"} need follow-up`;
  await fetch(`${url}/functions/v1/admin-notify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "attio_stalled_deals",
      subject: `${summary} (${args.taskCount} tasks created)`,
      summary,
      cta_url: "https://app.attio.com/lit/objects/deals",
      cta_label: "Open Attio Deals",
      details: {
        "Stalled count": args.stalledCount,
        "Tasks created": args.taskCount,
        "Failed task creates": args.failedCount,
        "Sample (first 5)": args.sampleDealNames.slice(0, 5).join(" · "),
      },
    }),
  }).catch(() => {
    // Best-effort
  });
}

serve(async (req: Request) => {
  const log = createLogger("attio-stalled-deals-cron", { request_id: requestId() });

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Internal-Cron",
      },
    });
  }

  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    log.warn("cron_auth_failed", { err: "X-Internal-Cron mismatch or missing" });
    return auth.response;
  }

  if (!Deno.env.get("ATTIO_API_KEY")) {
    log.error("server_misconfigured", { err: "ATTIO_API_KEY env not set" });
    return new Response(JSON.stringify({ error: "missing_attio_api_key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stallDays = Number(Deno.env.get("ATTIO_STALL_DAYS") || "14") || 14;
  const stallCutoffMs = daysAgoMs(stallDays);
  const defaultOwner =
    Deno.env.get("ATTIO_DEAL_OWNER_ID") || DEFAULT_OWNER_MEMBER_ID;

  let active: AttioDeal[];
  try {
    active = await fetchActivePipelineDeals();
  } catch (e: any) {
    log.error("fetch_active_failed", { err: e?.message || String(e) });
    return new Response(
      JSON.stringify({ error: "attio_query_failed", detail: e?.message || String(e) }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const stalled = active.filter((d) => isStalled(d, stallCutoffMs));

  let taskOk = 0;
  let taskFail = 0;
  const sampleDealNames: string[] = [];
  for (const deal of stalled) {
    const dealName = deal.values?.name?.[0]?.value || "Unnamed deal";
    if (sampleDealNames.length < 5) sampleDealNames.push(dealName);
    const ownerId =
      deal.values?.owner?.[0]?.referenced_actor_id || defaultOwner;
    try {
      await createFollowUpTask({
        dealRecordId: deal.id.record_id,
        ownerMemberId: ownerId,
        dealName,
      });
      taskOk++;
    } catch (e: any) {
      taskFail++;
      log.warn("task_create_failed", {
        err: e?.message || String(e),
        deal_id: deal.id.record_id,
      });
    }
  }

  try {
    if (stalled.length > 0) {
      await pingAdminNotify({
        stalledCount: stalled.length,
        taskCount: taskOk,
        failedCount: taskFail,
        sampleDealNames,
      });
    }
  } catch (e: any) {
    log.warn("admin_notify_failed", { err: e?.message || String(e) });
  }

  log.info("tick_completed", {
    active_count: active.length,
    stalled_count: stalled.length,
    tasks_created: taskOk,
    task_failures: taskFail,
    stall_days: stallDays,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      active_count: active.length,
      stalled_count: stalled.length,
      tasks_created: taskOk,
      task_failures: taskFail,
      stall_days: stallDays,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
