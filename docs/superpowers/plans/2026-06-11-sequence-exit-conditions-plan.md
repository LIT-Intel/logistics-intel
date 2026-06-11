# Sub-project O — Sequence Exit Conditions Implementation Plan

> **For agentic workers:** Execute task-by-task on branch `claude/review-dashboard-deploy-3AmMD`. Each task ends with a commit. Spec: `docs/superpowers/specs/2026-06-11-sequence-exit-conditions-design.md`. **HARD GATE: all 7 simulations must PASS before the work is reported DONE.**

**Goal:** Make sequences automatically remove a recipient when their behavior (reply, bounce, unsubscribe) or CRM state (Cal.com booking, Attio Won-stage) means further sends are wrong. Org-wide defaults + per-campaign overrides.

**Architecture:** Schema layer adds `lit_org_exit_settings` + `lit_campaigns.exit_overrides` + `lit_effective_exit_rules()` SQL helper. Five trigger paths each flip recipient.status to a terminal value + null `next_send_at`; the dispatcher's existing `WHERE status IN ('queued','pending')` filter does the rest. No dispatcher code change.

**Supabase project:** `jkmrfiaefxwgbvftohrb`
**Vercel project:** `prj_qB3ZiAubrCCp0oHTZnjjZm6vGmFQ`

---

## Task 1: Migration — exit settings table + override column + helper

**Files:**
- Create: `supabase/migrations/20260611200000_add_sequence_exit_settings.sql`

### Step 1: SQL

```sql
-- Sub-project O — exit settings
CREATE TABLE IF NOT EXISTS lit_org_exit_settings (
  org_id uuid PRIMARY KEY,
  exit_on_reply boolean NOT NULL DEFAULT true,
  exit_on_bounce boolean NOT NULL DEFAULT true,
  exit_on_unsubscribe boolean NOT NULL DEFAULT true,
  exit_on_meeting_booked boolean NOT NULL DEFAULT true,
  exit_on_attio_won boolean NOT NULL DEFAULT true,
  attio_won_stages text[] NOT NULL DEFAULT ARRAY['Won','Closed Won','Customer']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lit_campaigns
  ADD COLUMN IF NOT EXISTS exit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION lit_effective_exit_rules(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  campaign_row lit_campaigns;
  org_rules jsonb;
  overrides jsonb;
BEGIN
  SELECT * INTO campaign_row FROM lit_campaigns WHERE id = p_campaign_id;
  IF campaign_row.id IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT to_jsonb(s) INTO org_rules
  FROM lit_org_exit_settings s
  WHERE s.org_id = campaign_row.org_id;
  -- Lazy-create on first read
  IF org_rules IS NULL THEN
    INSERT INTO lit_org_exit_settings (org_id) VALUES (campaign_row.org_id)
      ON CONFLICT (org_id) DO NOTHING
      RETURNING to_jsonb(lit_org_exit_settings.*) INTO org_rules;
    IF org_rules IS NULL THEN
      SELECT to_jsonb(s) INTO org_rules FROM lit_org_exit_settings s WHERE s.org_id = campaign_row.org_id;
    END IF;
  END IF;

  overrides := COALESCE(campaign_row.exit_overrides, '{}'::jsonb);
  RETURN org_rules || overrides;  -- override wins
END;
$$;

-- RLS on lit_org_exit_settings
ALTER TABLE lit_org_exit_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read own exit settings"
  ON lit_org_exit_settings FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND status='active'));
CREATE POLICY "org owners write exit settings"
  ON lit_org_exit_settings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin') AND status='active'));
```

### Step 2: Apply + verify

```
mcp__claude_ai_Supabase__apply_migration(project_id="jkmrfiaefxwgbvftohrb",
  name="add_sequence_exit_settings", query=<above>)
```

Verify table + column + function exist via information_schema. Commit.

---

## Task 2: send-campaign-email — inject {{unsubscribe_url}} template variable

**Files:**
- Modify: `supabase/functions/send-campaign-email/index.ts`

### Step 1: Generate token + template substitution

Add a helper that creates a signed token for (campaign_id, recipient_id, exp=now+90d) using `Deno.env.get('LIT_UNSUBSCRIBE_SECRET')` for HMAC. Append `{{unsubscribe_url}}` substitution before render. The URL: `https://<supabase-url>/functions/v1/unsubscribe?token=<jwt>`.

Bonus: if the email body has no `{{unsubscribe_url}}` placeholder, append a default footer paragraph:
```html
<p style="font-size:11px;color:#94a3b8;margin-top:24px">
  Don't want these emails? <a href="<url>">Unsubscribe</a>.
</p>
```

Deploy + commit.

---

## Task 3: New edge fn `unsubscribe`

**Files:**
- Create: `supabase/functions/unsubscribe/index.ts`

### Step 1: Source

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyToken } from "../_shared/unsub_token.ts"; // co-locate the helper

const HTML_OK = `<!doctype html><html><body style="font-family:system-ui;padding:48px;text-align:center;color:#0f172a">
  <h1>You're unsubscribed</h1>
  <p>You won't receive any more emails from this campaign.</p>
</body></html>`;
const HTML_EXPIRED = `<!doctype html><html><body style="font-family:system-ui;padding:48px;text-align:center;color:#0f172a">
  <h1>This link has expired</h1>
  <p>Contact the sender directly if you don't want further emails.</p>
</body></html>`;

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });
  const payload = await verifyToken(token, Deno.env.get("LIT_UNSUBSCRIBE_SECRET")!);
  if (!payload) return new Response(HTML_EXPIRED, { status: 410, headers: { "content-type": "text/html" } });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin
    .from("lit_campaign_contacts")
    .update({ status: "unsubscribed", next_send_at: null, updated_at: new Date().toISOString() })
    .eq("id", payload.recipient_id)
    .eq("campaign_id", payload.campaign_id);

  // History event
  await admin.from("lit_outreach_history").insert({
    campaign_id: payload.campaign_id,
    contact_id: null,
    event_type: "unsubscribed",
    status: "unsubscribed",
    occurred_at: new Date().toISOString(),
    metadata: { recipient_id: payload.recipient_id, source: "unsubscribe_link" },
  });

  return new Response(HTML_OK, { status: 200, headers: { "content-type": "text/html" } });
});
```

Deploy with `verify_jwt=false` (public endpoint). Commit.

---

## Task 4: cal-webhook — apply meeting-booked exit per effective rules

**Files:**
- Modify: `supabase/functions/cal-webhook/index.ts`

After Sub-project L's matching logic produces a matched_recipient_id + matched_campaign_id, add:

```ts
// Sub-project O — apply meeting-booked exit if campaign's effective rules permit
const { data: rules } = await admin.rpc("lit_effective_exit_rules", { p_campaign_id: matched_campaign_id });
if (rules?.exit_on_meeting_booked === true) {
  await admin
    .from("lit_campaign_contacts")
    .update({ status: "meeting_booked", next_send_at: null, updated_at: new Date().toISOString() })
    .eq("id", matched_recipient_id);
}
```

Deploy + commit.

---

## Task 5: reply-receiver — apply reply exit to recipient row (not just send row)

**Files:**
- Modify: `supabase/functions/reply-receiver/index.ts`

Today reply-receiver sets `status='replied'` on the SEND row in lit_outreach_history. It may or may not also update the recipient row. Add this:

```ts
// Sub-project O — propagate reply exit to recipient row so dispatcher skips
const { data: rules } = await admin.rpc("lit_effective_exit_rules", { p_campaign_id: matched_campaign_id });
if (rules?.exit_on_reply === true) {
  await admin
    .from("lit_campaign_contacts")
    .update({ status: "replied", next_send_at: null, updated_at: new Date().toISOString() })
    .eq("campaign_id", matched_campaign_id)
    .eq("email", matched_recipient_email);
}
```

(Test Campaign 1.2 vraymond already has this state today, suggesting reply-receiver may already do this — verify and only add if missing.) Deploy + commit.

---

## Task 6: resend-events-webhook — apply bounce exit

**Files:**
- Modify: `supabase/functions/resend-events-webhook/index.ts` (or whatever slug handles email.bounced — grep for it)

Same pattern:

```ts
if (event.type === "email.bounced") {
  const { data: rules } = await admin.rpc("lit_effective_exit_rules", { p_campaign_id });
  if (rules?.exit_on_bounce === true) {
    await admin
      .from("lit_campaign_contacts")
      .update({ status: "bounced", next_send_at: null, updated_at: new Date().toISOString() })
      .eq("campaign_id", p_campaign_id)
      .eq("email", recipient_email);
  }
}
```

Deploy + commit.

---

## Task 7: New edge fn `attio-webhook`

**Files:**
- Create: `supabase/functions/attio-webhook/index.ts`

### Step 1: Source

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";

serve(async (req) => {
  const log = createLogger("attio-webhook", { request_id: requestId() });
  if (req.method !== "POST") return new Response("method", { status: 405 });

  // HMAC verification — Attio signs with `X-Attio-Signature` header
  const secret = Deno.env.get("ATTIO_WEBHOOK_SECRET");
  if (!secret) { log.error("missing_secret", {}); return new Response("config", { status: 500 }); }
  const sig = req.headers.get("X-Attio-Signature") ?? "";
  const rawBody = await req.text();
  const expected = await hmacSha256(secret, rawBody);
  if (sig !== expected) { log.warn("bad_signature", {}); return new Response("forbidden", { status: 401 }); }

  const body = JSON.parse(rawBody);
  // Attio webhook shape: { events: [{ type, data: { record: {...} } }] }
  // We care about deal stage changes — type='record.updated' and changed attribute = 'stage'
  const events = Array.isArray(body?.events) ? body.events : [body];

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let exited = 0;

  for (const ev of events) {
    if (ev.type !== "record.updated") continue;
    const record = ev.data?.record;
    const newStage = record?.attributes?.stage?.value ?? record?.values?.stage?.[0]?.value;
    const email = record?.attributes?.email ?? record?.values?.email?.[0]?.value;
    if (!newStage || !email) continue;

    // For each active campaign with this recipient email, check effective rules
    const { data: recipients } = await admin
      .from("lit_campaign_contacts")
      .select("id, campaign_id")
      .eq("email", email.toLowerCase())
      .in("status", ["queued", "pending"]);

    for (const r of recipients ?? []) {
      const { data: rules } = await admin.rpc("lit_effective_exit_rules", { p_campaign_id: r.campaign_id });
      const wonStages: string[] = rules?.attio_won_stages ?? ["Won", "Closed Won", "Customer"];
      if (rules?.exit_on_attio_won === true && wonStages.includes(newStage)) {
        await admin
          .from("lit_campaign_contacts")
          .update({ status: "funnel_exited", next_send_at: null, updated_at: new Date().toISOString() })
          .eq("id", r.id);
        await admin.from("lit_outreach_history").insert({
          campaign_id: r.campaign_id,
          event_type: "funnel_exit",
          status: "funnel_exited",
          occurred_at: new Date().toISOString(),
          metadata: { attio_deal_id: record.id, new_stage: newStage, recipient_id: r.id },
        });
        exited++;
      }
    }
  }

  return new Response(JSON.stringify({ exited }), { status: 200, headers: { "content-type": "application/json" } });
});

async function hmacSha256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}
```

Deploy with `verify_jwt=false`. Commit. **Document the Attio dashboard setup the user must do** (add this webhook URL + secret in Attio's outbound webhook settings).

---

## Task 8: Manual exit edge fn

**Files:**
- Create: `supabase/functions/recipient-exit-manual/index.ts`

Minimal authed endpoint that accepts `{recipient_id, campaign_id}`, requires authed user with access to the campaign's org, sets status='manual_exit' + nulls next_send_at + writes history event. Deploy + commit.

---

## Task 9: Frontend — Settings tab + Campaign builder panel + Drill-in button

**Files:**
- Modify: `frontend/src/pages/Settings.jsx` (or new sub-component) — add "Sequence Exit Rules" tab
- Create: `frontend/src/features/outbound/components/ExitConditionsPanel.tsx` — campaign builder panel
- Modify: `frontend/src/pages/CampaignBuilder.jsx` — mount the panel below ScheduleStrip
- Modify: `frontend/src/features/outbound/components/EngagementDrillIn.tsx` — "Remove from sequence" button per recipient row

Wire reads via Supabase client + saves via the same `updateCampaignBasics` path J added (extend it to include `exit_overrides`). Commit.

---

## Task 10: SIMULATION MATRIX (HARD GATE)

**Files:**
- Create: `docs/ops/2026-06-11-sub-project-o-simulation-results.md` — record the results

For each of the 7 scenarios in the spec's "Testing — simulation matrix" section, the implementer must:
1. Create a throwaway test campaign with 2 step (day 1, day 2) + 1 test recipient
2. Trigger the synthetic event
3. Query the recipient row + history
4. Wait 90s for dispatcher tick
5. Confirm no further send fired
6. Clean up the throwaway

| # | Trigger | Pass criteria |
|---|---|---|
| 1 | Reply | status='replied', next_send_at=NULL, no follow-up send |
| 2 | Bounce | status='bounced', next_send_at=NULL, no follow-up send |
| 3 | Unsubscribe | status='unsubscribed', next_send_at=NULL, no follow-up send |
| 4 | Meeting booked | status='meeting_booked', next_send_at=NULL, no follow-up send |
| 5 | Attio Won | status='funnel_exited', next_send_at=NULL, no follow-up send |
| 6 | Manual exit | status='manual_exit', next_send_at=NULL, no follow-up send |
| 7 | Per-campaign override OFF (exit_on_meeting_booked=false in exit_overrides) | status UNCHANGED, dispatcher CONTINUES sending |

Record each test's actual SQL + result in the docs/ops file. ALL SEVEN MUST PASS. If any fails, STOP and report BLOCKED — do NOT push to main.

---

## Task 11: Push, merge, verify Vercel

After all 10 tasks PASS:
1. Push branch
2. Cherry-pick to main
3. Confirm Vercel auto-deploy fires
4. List Vercel deploy ID + state in the final report

---

## Self-review

- ✅ Spec coverage: all 5 default exit paths + per-campaign override + manual exit
- ✅ Q1=C (org defaults + per-campaign override) → lit_org_exit_settings + lit_campaigns.exit_overrides + lit_effective_exit_rules() merge
- ✅ Q3=A (Attio push) → attio-webhook fn with HMAC verification
- ✅ Simulation gate is explicit and binding — implementer cannot report DONE without 7/7 pass
- ✅ No dispatcher code change required (all exits flip recipient.status which is already filtered out)
- ✅ Files: 12 (1 migration, 6 edge fns, 5 frontend). Matches spec.
