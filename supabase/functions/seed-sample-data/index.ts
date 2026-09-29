// seed-sample-data — onboarding examples for a new org. Idempotent per org
// (guarded by organizations.sample_seeded_at). Inserts 5 well-known saved
// companies + deals across pipeline stages + one DRAFT campaign + tasks, all
// tagged is_sample so the UI marks them "Example", they never skew real
// analytics, and the campaign can never send (status='draft', no recipients).
//
// action:"seed"  → create the examples once.
// action:"clear" → delete all is_sample rows for the org + reset the flag.
//
// SELF-CONTAINED (MCP bundler can't ship ../_shared): inlined requireUser +
// service-role client. Deals/tasks set owner/creator explicitly because the
// service role has no auth.uid().
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const env = (k: string) => Deno.env.get(k) ?? "";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

async function caller(req: Request): Promise<string | null> {
  const authz = req.headers.get("Authorization");
  if (!authz?.startsWith("Bearer ")) return null;
  const c = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authz } },
  });
  const { data } = await c.auth.getUser();
  return data?.user?.id ?? null;
}

// Real lit_companies rows (verified) — real domains so logo.dev renders.
const SAMPLES = [
  { company_id: "e4858637-7f15-4511-9994-7315b2a01f42", label: "Home Depot Usa", stageName: "Negotiation",
    value: 500000, service: "ocean", origin: "Vietnam", dest: "Atlanta, GA",
    next: "Send revised rate sheet", nextDays: 2, task: "Confirm contract terms with Home Depot" },
  { company_id: "70b362ac-627b-4617-aa30-87161db08579", label: "Walmart", stageName: "Quoted",
    value: 1000000, service: "ocean", origin: "Chile", dest: "Bentonville, AR",
    next: "Walk Walmart through the quote", nextDays: 1, task: "Follow up on Walmart quote" },
  { company_id: "55a6485b-7f22-4c32-a2b2-7377df6851a7", label: "Tesla", stageName: "Qualified",
    value: 340000, service: "drayage", origin: "Spain", dest: "Fremont, CA",
    next: "Get 90-day volume forecast", nextDays: 3, task: null },
  { company_id: "c7794653-9b70-4b85-85e0-508619a96315", label: "Nike Usa", stageName: "New",
    value: 120000, service: "air", origin: "Honduras", dest: "Beaverton, OR",
    next: null, nextDays: 0, task: null },
  { company_id: "9e1d6010-0656-43bf-a305-0328f198d31a", label: "Costco Wholesale Canada", stageName: "Won",
    value: 260000, service: "ocean", origin: "China", dest: "Canada",
    next: null, nextDays: 0, task: null },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const uid = await caller(req);
  if (!uid) return json({ ok: false, error: "unauthorized" }, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* default seed */ }
  const action = body?.action === "clear" ? "clear" : "seed";

  const sb = admin();

  // Resolve the caller's active org (prefer owner/admin membership).
  const { data: mems } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", uid)
    .eq("status", "active");
  const orgId = (mems ?? []).sort((a: any, b: any) =>
    (a.role === "owner" ? -2 : a.role === "admin" ? -1 : 0) - (b.role === "owner" ? -2 : b.role === "admin" ? -1 : 0),
  )[0]?.org_id;
  if (!orgId) return json({ ok: false, error: "no_org" }, 400);

  // ── clear ────────────────────────────────────────────────────────────
  if (action === "clear") {
    await sb.from("lit_tasks").delete().eq("org_id", orgId).eq("is_sample", true);
    await sb.from("lit_deals").delete().eq("org_id", orgId).eq("is_sample", true);
    await sb.from("lit_campaigns").delete().eq("org_id", orgId).eq("is_sample", true);
    await sb.from("lit_saved_companies").delete().eq("user_id", uid).eq("is_sample", true);
    // Keep sample_seeded_at SET (not null) so the examples never re-seed
    // after the user clears them — clearing is permanent.
    await sb.from("organizations").update({ sample_seeded_at: new Date().toISOString() }).eq("id", orgId);
    return json({ ok: true, cleared: true });
  }

  // ── seed (idempotent) ──────────────────────────────────────────────────
  const { data: org } = await sb
    .from("organizations")
    .select("sample_seeded_at")
    .eq("id", orgId)
    .maybeSingle();
  if (org?.sample_seeded_at) return json({ ok: true, seeded: false, reason: "already_seeded" });

  // Ensure the org's pipeline stages exist (same RPC the app uses).
  await sb.rpc("lit_seed_deal_stages", { p_org_id: orgId });
  const { data: stages } = await sb
    .from("lit_deal_stages")
    .select("id, name")
    .eq("org_id", orgId);
  const stageByName = new Map((stages ?? []).map((s: any) => [String(s.name).toLowerCase(), s.id]));
  const firstStage = (stages ?? [])[0]?.id;
  const stageId = (name: string) => stageByName.get(name.toLowerCase()) ?? firstStage;

  const now = Date.now();
  const counts = { companies: 0, deals: 0, campaigns: 0, tasks: 0 };

  for (const s of SAMPLES) {
    // Saved company (user-owned).
    const { data: sc } = await sb
      .from("lit_saved_companies")
      .insert({ user_id: uid, company_id: s.company_id, stage: "lead", source: "sample", is_sample: true })
      .select("id")
      .single();
    if (sc) counts.companies++;

    // Deal on the mapped stage.
    if (firstStage) {
      const won = s.stageName === "Won";
      const dueIso = s.next ? new Date(now + s.nextDays * 864e5).toISOString().slice(0, 10) : null;
      const { data: deal } = await sb
        .from("lit_deals")
        .insert({
          org_id: orgId,
          saved_company_id: sc?.id ?? null,
          company_id: s.company_id,
          title: `${s.label} · ${s.service === "ocean" ? "Ocean" : s.service === "air" ? "Air" : "Drayage"} · ${s.origin} → US`,
          value_amount: s.value,
          currency: "USD",
          stage_id: stageId(s.stageName),
          status: won ? "won" : "open",
          service_type: s.service,
          origin: s.origin,
          destination: s.dest,
          owner_user_id: uid,
          created_by: uid,
          source: "sample",
          is_sample: true,
          next_step_text: s.next,
          next_step_due: dueIso,
          last_activity_at: new Date(now - 3 * 864e5).toISOString(),
        })
        .select("id")
        .single();
      if (deal) {
        counts.deals++;
        // A sample lane line item so the deal panel shows the lanes table.
        await sb.from("lit_deal_line_items").insert({
          org_id: orgId,
          deal_id: deal.id,
          lane_label: `${s.origin} → US`,
          origin_code: s.origin.slice(0, 2).toUpperCase(),
          mode: s.service === "ocean" ? "FCL" : s.service === "air" ? "Air Freight" : "Drayage",
          teu: 40,
          rate_usd: 2950,
          value_usd: s.value,
        });
        // A sample task for the deals that call for one.
        if (s.task) {
          await sb.from("lit_tasks").insert({
            org_id: orgId,
            deal_id: deal.id,
            saved_company_id: sc?.id ?? null,
            title: s.task,
            due_date: new Date(now + 864e5).toISOString().slice(0, 10),
            status: "open",
            assignee_user_id: uid,
            created_by: uid,
            task_type: "call",
            source: "sample",
            is_sample: true,
          });
          counts.tasks++;
        }
      }
    }
  }

  // One DRAFT example campaign (never sends) + a 3-step sequence.
  const { data: camp } = await sb
    .from("lit_campaigns")
    .insert({
      user_id: uid,
      org_id: orgId,
      name: "Example · Q4 Peak Season Capacity",
      status: "draft",
      channel: "email",
      is_sample: true,
      metrics: { channels: ["email", "linkedin"], play: "Lane launch" },
    })
    .select("id")
    .single();
  if (camp) {
    counts.campaigns++;
    await sb.from("lit_campaign_steps").insert([
      { campaign_id: camp.id, user_id: uid, step_order: 1, channel: "email", step_type: "email",
        subject: "Capacity on your {{top_lane}} lane", body: "Hi {{first_name}}, we have weekly space on {{top_lane}} through peak season. Worth a quick look?", delay_days: 0 },
      { campaign_id: camp.id, user_id: uid, step_order: 2, channel: "linkedin", step_type: "linkedin_invite",
        subject: null, body: "Connection request with a note about {{company}}'s lanes.", delay_days: 2 },
      { campaign_id: camp.id, user_id: uid, step_order: 3, channel: "email", step_type: "email",
        subject: "Re: Q4 space on {{top_lane}}", body: "Following up with a rate sheet for {{company}}.", delay_days: 4 },
    ]);
  }

  await sb.from("organizations").update({ sample_seeded_at: new Date().toISOString() }).eq("id", orgId);
  return json({ ok: true, seeded: true, counts });
});
