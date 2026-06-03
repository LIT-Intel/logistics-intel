// attio-stalled-deals-cron — daily scan of the Attio LIT workspace looking
// for Active Pipeline deals that haven't been touched in 14+ days. For each
// stalled deal we:
//   1. Create a follow-up Task in Attio assigned to the deal owner with a
//      due date of tomorrow, linked to the deal.
//   2. Roll up the batch into an admin-notify "X stalled deals" alert so
//      the founder sees the queue at a glance.
//
// "Active Pipeline" = stages 2-6 (Qualified, Demo Scheduled, Trial Started,
// Trial Active, Negotiation). Lead-stage deals are NOT pinged — those are
// triage-pending. Won / Lost deals are out of scope.
//
// "Stalled" = `last_touch` is null OR < (today - 14 days). The Last Touch
// field is the human-curated "I talked to them on this date" field; if
// nobody's been updating it, that's exactly the signal we want to catch.
//
// Auth: X-Internal-Cron header against LIT_CRON_SECRET (the standard LIT
// cron auth pattern). pg_cron + pg_net inject the header from
// current_setting('app.lit_cron_secret') on schedule.
//
// Required env:
//   ATTIO_API_KEY          — same key used by marketing/lib/attio.ts
//   ATTIO_DEAL_OWNER_ID    — workspace member ID of the default deal owner
//                            (Valesco). Used to fall back to when a deal
//                            has no explicit owner. Defaults to the
//                            ship-date single-member workspace.
//
// Optional env:
//   ATTIO_STALL_DAYS       — defaults to 14. Tune via env without redeploy.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const ATTIO_BASE = "https://api.attio.com/v2";

// Pipeline stage IDs — verified via MCP 2026-06-03. If you re-order stages
// in the Attio UI the IDs persist, but if you rename or recreate stages
// the IDs change and this list needs an update.
const ACTIVE_PIPELINE_STAGE_IDS = [
  "984f4e8b-5f31-4854-9bf5-2b0f978b9fdf", // Qualified
  "1b835bac-2c91-44a7-a416-f02765cc2869", // Demo Scheduled
  "db795dc0-7213-4916-8637-7b5a7d4cb104", // Trial Started
  "41b2542b-9ffa-40bb-a95d-faadfd735ff5", // Trial Active
  "9fd300be-2e86-40be-8124-d37bf6fa5e4e", // Negotiation
];

const DEFAULT_OWNER_MEMBER_ID = "7970dcda-936b-4837-8666-06a22c6dc788";

type AttioRecordId = { workspace_id: string; object_id: string; record_id: string };

type AttioDealValues = {
  name?: Array<{ value?: string }>;
  stage?: Array<{ status?: { id: { status_id: string }; title: string } }>;
  owner?: Array<{ referenced_actor_id?: string; referenced_actor_type?: string }>;
  last_touch?: Array<{ value?: string | null }>;
  associated_company?: Array<{ target_record_id?: string }>;
  associated_people?: Array<{ target_record_id?: string }>;
  created_at?: Array<{ value?: string }>;
};

type AttioDeal = {
  id: AttioRecordId;
  values: AttioDealValues;
};

function attioAuth(): Record<string, string> {
  const key = Deno.env.get("ATTIO_API_KEY") || "";
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function tomorrowIsoDate(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Query Attio for stalled deals. Single page request — 500-deal cap is far
 * above realistic stall queue size (if you have 500 stalled deals,
 * "automation" is not your bottleneck).
 */
async function fetchStalledDeals(stallDays: number): Promise<AttioDeal[]> {
  const cutoff = daysAgoIso(stallDays);
  const body = {
    filter: {
      $and: [
        { stage: { $in: ACTIVE_PIPELINE_STAGE_IDS } },
        {
          $or: [
            { last_touch: { $is_empty: true } },
            { last_touch: { $lt: cutoff } },
          ],
        },
      ],
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
    throw new Error(`Attio query ${res.status}: ${text.slice(0, 240)}`);
  }
  const json = (await res.json()) as { data?: AttioDeal[] };
  return json.data || [];
}

/**
 * Create a Task in Attio assigned to the given workspace member, due
 * tomorrow at 9 AM, linked to the stalled deal.
 */
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
        {
          target_object: "deals",
          target_record_id: dealRecordId,
        },
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

/**
 * Roll up the batch into an admin-notify alert. Best-effort — if the
 * Supabase admin-notify endpoint isn't reachable, the tasks are still in
 * Attio and the founder will see them on next login.
 */
async function pingAdminNotify(args: {
  stalledCount: number;
  taskCount: number;
  failedCount: number;
  sampleDealNames: string[];
}): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return;

  // Look up the admin-notify shared secret from the existing internal
  // secrets table — same pattern the marketing-side fans use.
  let secret: string | null = null;
  try {
    const res = await fetch(
      `${url}/rest/v1/lit_internal_secrets?key=eq.admin_notify_secret&select=value`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const rows = (await res.json().catch(() => [])) as Array<{ value: string }>;
    secret = rows?.[0]?.value || null;
  } catch {
    // Swallow — admin-notify is a soft dependency.
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
  const defaultOwner =
    Deno.env.get("ATTIO_DEAL_OWNER_ID") || DEFAULT_OWNER_MEMBER_ID;

  let stalled: AttioDeal[];
  try {
    stalled = await fetchStalledDeals(stallDays);
  } catch (e: any) {
    log.error("fetch_stalled_failed", { err: e?.message || String(e) });
    return new Response(JSON.stringify({ error: "attio_query_failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  // Roll up the batch — soft dependency, doesn't fail the run.
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
    stalled_count: stalled.length,
    tasks_created: taskOk,
    task_failures: taskFail,
    stall_days: stallDays,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      stalled_count: stalled.length,
      tasks_created: taskOk,
      task_failures: taskFail,
      stall_days: stallDays,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
