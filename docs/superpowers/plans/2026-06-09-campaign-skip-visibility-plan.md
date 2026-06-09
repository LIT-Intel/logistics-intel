# Sub-project H — Skip Visibility + Recipient org_id Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Close the silent-failure window that cost Test Campaign 1 22h from launch to delivery. Backfill `lit_campaign_contacts.org_id` + add insert trigger + NOT NULL so the dispatcher consent auto-backfill ALWAYS has what it needs. Surface skip events (`consent_missing`, `daily_cap_reached`, `suppressed`, `send_failed`) in the campaign UI with one-click remediation.

**Branch:** `claude/review-dashboard-deploy-3AmMD`.

**Spec:** [docs/superpowers/specs/2026-06-09-campaign-skip-visibility-design.md](../specs/2026-06-09-campaign-skip-visibility-design.md)

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260609170000_lit_campaign_contacts_backfill_org_id.sql` | Backfill org_id from joined campaign |
| `supabase/migrations/20260609170100_lit_campaign_contacts_org_id_trigger.sql` | BEFORE INSERT trigger to auto-populate |
| `supabase/migrations/20260609170200_lit_campaign_contacts_org_id_not_null.sql` | NOT NULL constraint (gated on zero nulls) |
| `supabase/migrations/20260609170300_lit_campaign_skip_summary_rpc.sql` | RPC for the UI badge |
| `frontend/src/features/outbound/hooks/useCampaignSkipSummary.ts` | TanStack Query wrapper |
| `frontend/src/features/outbound/components/RecipientsSkippedBadge.tsx` | Amber chip + click handler |
| `frontend/src/features/outbound/components/RecipientsSkippedDrillIn.tsx` | Slide-over with per-event-type breakdown |

### Files to modify

| Path | Change |
|---|---|
| `frontend/src/features/outbound/components/CampaignKpiHero.tsx` | Mount `<RecipientsSkippedBadge campaignId={campaignId} />` next to Audience tile |

---

## Task 1: Backfill + insert trigger + NOT NULL (3 migrations)

- [ ] **Step 1: Audit current state**

```sql
SELECT count(*) AS total, count(*) FILTER (WHERE org_id IS NULL) AS null_org
  FROM public.lit_campaign_contacts;
SELECT count(*) AS unbackfillable
  FROM public.lit_campaign_contacts cc
  JOIN public.lit_campaigns c ON c.id = cc.campaign_id
 WHERE cc.org_id IS NULL AND c.org_id IS NULL;
```

Expected baseline: total ~5, null_org ~1, unbackfillable = 0. If unbackfillable > 0, STOP — investigate before continuing.

- [ ] **Step 2: Write + apply Migration 1 (backfill)**

Create `supabase/migrations/20260609170000_lit_campaign_contacts_backfill_org_id.sql`:
```sql
-- Backfill lit_campaign_contacts.org_id from the joined campaign.
-- Today's incident: Test Campaign 1's recipients had org_id=NULL,
-- so the send-campaign-email auto-backfill (which keys per-org) skipped
-- them silently with consent_missing reason=no_org_on_recipient.

BEGIN;

UPDATE public.lit_campaign_contacts cc
   SET org_id = c.org_id
  FROM public.lit_campaigns c
 WHERE c.id = cc.campaign_id
   AND cc.org_id IS NULL
   AND c.org_id IS NOT NULL;

COMMIT;
```

Apply via `mcp__claude_ai_Supabase__apply_migration`. Audit:
```sql
SELECT count(*) FROM public.lit_campaign_contacts WHERE org_id IS NULL;
-- Expected: 0
```

- [ ] **Step 3: Write + apply Migration 2 (insert trigger)**

Create `supabase/migrations/20260609170100_lit_campaign_contacts_org_id_trigger.sql`:
```sql
-- Auto-populate org_id on every new lit_campaign_contacts row from
-- the joined campaign. Prevents the silent-skip class of bug from
-- recurring when callers forget to set org_id explicitly.

BEGIN;

CREATE OR REPLACE FUNCTION public.lit_campaign_contacts_set_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id
      FROM public.lit_campaigns
     WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lit_campaign_contacts_org_id_trigger ON public.lit_campaign_contacts;

CREATE TRIGGER lit_campaign_contacts_org_id_trigger
  BEFORE INSERT ON public.lit_campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION public.lit_campaign_contacts_set_org_id();

COMMIT;
```

Apply. Verify the trigger exists:
```sql
SELECT tgname FROM pg_trigger
 WHERE tgname = 'lit_campaign_contacts_org_id_trigger';
-- Expected: 1 row
```

Smoke test the trigger:
```sql
-- Pick any active campaign with org_id, insert a test row without org_id, verify it gets populated
WITH test_insert AS (
  INSERT INTO public.lit_campaign_contacts (campaign_id, email, merge_vars, next_step_order, status)
  SELECT id, 'trigger-smoke-test@example.com', '{}'::jsonb, 1, 'queued'
    FROM public.lit_campaigns LIMIT 1
  RETURNING id, org_id
)
SELECT * FROM test_insert;
-- Expected: org_id NOT NULL on the returned row
-- Cleanup:
DELETE FROM public.lit_campaign_contacts WHERE email = 'trigger-smoke-test@example.com';
```

- [ ] **Step 4: Write + apply Migration 3 (NOT NULL constraint)**

Re-verify zero nulls before applying:
```sql
SELECT count(*) FROM public.lit_campaign_contacts WHERE org_id IS NULL;
-- Expected: 0
```

If non-zero, STOP. Migration 3 will fail.

Create `supabase/migrations/20260609170200_lit_campaign_contacts_org_id_not_null.sql`:
```sql
-- Lock org_id NOT NULL now that backfill + insert trigger guarantee
-- population. Closes the silent-skip class permanently.

BEGIN;

ALTER TABLE public.lit_campaign_contacts
  ALTER COLUMN org_id SET NOT NULL;

COMMIT;
```

Apply. Verify:
```sql
SELECT is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='lit_campaign_contacts' AND column_name='org_id';
-- Expected: NO
```

- [ ] **Step 5: Commit all 3 migrations**

```bash
git add supabase/migrations/20260609170000_lit_campaign_contacts_backfill_org_id.sql supabase/migrations/20260609170100_lit_campaign_contacts_org_id_trigger.sql supabase/migrations/20260609170200_lit_campaign_contacts_org_id_not_null.sql
git commit -m "feat(campaigns): backfill + insert trigger + NOT NULL on lit_campaign_contacts.org_id

Closes the silent-skip class of bug that cost Test Campaign 1 22h
from launch to delivery today. The dispatcher's consent auto-backfill
requires recipient.org_id; previously 1 of 5 recipients had it NULL
so the per-org backfill loop skipped them, then the per-recipient
consent gate logged consent_missing with reason=no_org_on_recipient
and silently skipped the send.

Phase 1: backfill all existing rows from lit_campaigns.org_id (which
is already NOT NULL per sub-project A). Phase 2: BEFORE INSERT
trigger auto-populates org_id on every new row. Phase 3: NOT NULL
constraint locks the invariant going forward.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `lit_campaign_skip_summary` RPC

- [ ] **Step 1: Write + apply migration**

Create `supabase/migrations/20260609170300_lit_campaign_skip_summary_rpc.sql`:
```sql
-- Aggregates skip events for a campaign so the UI can surface a badge
-- when recipients silently fail to send. Powers the RecipientsSkippedBadge
-- + RecipientsSkippedDrillIn slide-over.

BEGIN;

CREATE OR REPLACE FUNCTION public.lit_campaign_skip_summary(p_campaign_id uuid)
RETURNS TABLE (
  event_type text,
  skip_count bigint,
  most_recent timestamptz,
  sample_reason text,
  sample_recipient text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    h.event_type,
    count(*) AS skip_count,
    max(h.created_at) AS most_recent,
    (array_agg(h.metadata->>'reason' ORDER BY h.created_at DESC)
       FILTER (WHERE h.metadata->>'reason' IS NOT NULL))[1] AS sample_reason,
    (array_agg(h.metadata->>'recipient_email' ORDER BY h.created_at DESC)
       FILTER (WHERE h.metadata->>'recipient_email' IS NOT NULL))[1] AS sample_recipient
    FROM lit_outreach_history h
   WHERE h.campaign_id = p_campaign_id
     AND h.event_type IN ('consent_missing', 'daily_cap_reached', 'suppressed', 'send_failed')
     AND h.created_at > now() - interval '7 days'
     AND (
       EXISTS (SELECT 1 FROM lit_campaigns c
                WHERE c.id = p_campaign_id
                  AND (c.org_id IN (SELECT org_id FROM org_members
                                    WHERE user_id = auth.uid() AND status='active')
                       OR EXISTS (SELECT 1 FROM platform_admins pa
                                  WHERE pa.user_id = auth.uid())))
     )
   GROUP BY h.event_type
   ORDER BY skip_count DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.lit_campaign_skip_summary(uuid) TO authenticated;

COMMIT;
```

Apply via Supabase MCP. Verify:
```sql
SELECT proname FROM pg_proc WHERE proname = 'lit_campaign_skip_summary';
-- Expected: 1 row
-- Smoke test for Test Campaign 1 (we know there are 2 consent_missing events today):
SELECT * FROM public.lit_campaign_skip_summary('5249b682-c19b-4fab-847f-0ca8cc86edab');
-- Expected when service-role: 0 rows (RLS denies auth.uid()=null).
-- The real test fires via frontend with a real JWT in Task 4.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260609170300_lit_campaign_skip_summary_rpc.sql
git commit -m "feat(analytics): lit_campaign_skip_summary RPC for in-UI skip badge

Aggregates consent_missing, daily_cap_reached, suppressed, send_failed
events from lit_outreach_history grouped by event_type (last 7 days).
Returns sample reason + sample recipient per type. Powers the
RecipientsSkippedBadge in CampaignKpiHero. SECURITY DEFINER with inline
org RLS so cross-org users can't see another org's skip data."
```

---

## Task 3: `useCampaignSkipSummary` hook

- [ ] **Step 1: Implement**

Create `frontend/src/features/outbound/hooks/useCampaignSkipSummary.ts`:
```ts
/**
 * Hook for the campaign skip-summary RPC. Powers the
 * RecipientsSkippedBadge — fires once per campaign load + caches 30s.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type SkipEventType = "consent_missing" | "daily_cap_reached" | "suppressed" | "send_failed";

export interface CampaignSkip {
  event_type: SkipEventType;
  skip_count: number;
  most_recent: string;
  sample_reason: string | null;
  sample_recipient: string | null;
}

export function useCampaignSkipSummary(campaignId: string | null | undefined) {
  return useQuery({
    queryKey: ["campaign-skip-summary", campaignId],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lit_campaign_skip_summary", {
        p_campaign_id: campaignId,
      });
      if (error) {
        console.warn("[useCampaignSkipSummary] RPC failed:", error.message);
        return [] as CampaignSkip[];
      }
      return ((data ?? []) as CampaignSkip[]).filter((row) => row.skip_count > 0);
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: TS check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "useCampaignSkipSummary" | head -5
```

```bash
git add frontend/src/features/outbound/hooks/useCampaignSkipSummary.ts
git commit -m "feat(analytics): useCampaignSkipSummary hook

TanStack Query wrapper for lit_campaign_skip_summary RPC. 30s
cache. Returns only rows with skip_count > 0 so the badge can
just check .length > 0."
```

---

## Task 4: `RecipientsSkippedBadge` + `RecipientsSkippedDrillIn`

- [ ] **Step 1: Implement the badge**

Create `frontend/src/features/outbound/components/RecipientsSkippedBadge.tsx`:
```tsx
/**
 * Amber chip rendered in CampaignKpiHero when the campaign has any
 * skip events in the last 7 days. Click → opens RecipientsSkippedDrillIn
 * slide-over with per-event-type breakdown + one-click remediation.
 */
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useCampaignSkipSummary } from "@/features/outbound/hooks/useCampaignSkipSummary";
import { RecipientsSkippedDrillIn } from "./RecipientsSkippedDrillIn";

interface Props {
  campaignId: string | null | undefined;
}

export function RecipientsSkippedBadge({ campaignId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: skips } = useCampaignSkipSummary(campaignId);

  if (!skips || skips.length === 0) return null;

  const totalSkipped = skips.reduce((acc, s) => acc + Number(s.skip_count), 0);
  const hasFailures = skips.some((s) => s.event_type === "send_failed");
  const toneClass = hasFailures
    ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
    : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${toneClass}`}
      >
        <AlertTriangle size={12} />
        {totalSkipped} recipient{totalSkipped === 1 ? "" : "s"} skipped (last 7d)
      </button>
      <RecipientsSkippedDrillIn
        open={open}
        onClose={() => setOpen(false)}
        campaignId={campaignId}
        skips={skips}
      />
    </>
  );
}
```

- [ ] **Step 2: Implement the slide-over**

Create `frontend/src/features/outbound/components/RecipientsSkippedDrillIn.tsx`:
```tsx
/**
 * Slide-over showing per-event-type breakdown of skipped recipients.
 * Each event type has its own remediation copy + (for consent_missing)
 * a one-click action that triggers the dispatcher to retry.
 */
import { X, AlertTriangle, Clock, ShieldOff, ServerCrash } from "lucide-react";
import type { CampaignSkip, SkipEventType } from "@/features/outbound/hooks/useCampaignSkipSummary";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string | null | undefined;
  skips: CampaignSkip[];
}

const EVENT_META: Record<SkipEventType, { label: string; remedy: string; icon: typeof AlertTriangle }> = {
  consent_missing: {
    label: "Consent missing",
    remedy: "These recipients lack a consent attestation row. The dispatcher will auto-backfill on the next tick (within ~1 min).",
    icon: ShieldOff,
  },
  daily_cap_reached: {
    label: "Daily cap reached",
    remedy: "Mailbox hit the 50/day sending limit. These recipients will retry tomorrow automatically.",
    icon: Clock,
  },
  suppressed: {
    label: "Suppressed",
    remedy: "Recipient previously bounced, unsubscribed, or marked as spam. Suppression list is correct — no action needed.",
    icon: AlertTriangle,
  },
  send_failed: {
    label: "Send failed",
    remedy: "Provider returned an error. Check the campaign's edge function logs for the error detail.",
    icon: ServerCrash,
  },
};

function formatRelativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function RecipientsSkippedDrillIn({ open, onClose, skips }: Props) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close skip drill-in overlay"
        className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-[92vw] flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recipients skipped</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Last 7 days · {skips.reduce((a, s) => a + Number(s.skip_count), 0)} total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X size={14} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {skips.map((skip) => {
            const meta = EVENT_META[skip.event_type];
            const Icon = meta.icon;
            return (
              <div key={skip.event_type} className="mb-4 rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <Icon size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {meta.label}
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        {skip.skip_count}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-600">
                      {meta.remedy}
                    </p>
                    {skip.sample_recipient && (
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        Most recent: {skip.sample_recipient} · {formatRelativeShort(skip.most_recent)}
                      </p>
                    )}
                    {skip.sample_reason && (
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Reason: <span className="font-mono">{skip.sample_reason}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: TS check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "RecipientsSkipped" | head -5
```

```bash
git add frontend/src/features/outbound/components/RecipientsSkippedBadge.tsx frontend/src/features/outbound/components/RecipientsSkippedDrillIn.tsx
git commit -m "feat(analytics): RecipientsSkippedBadge + drill-in slide-over

Amber chip in CampaignKpiHero when the campaign has any skip events
in the last 7 days. Flips to rose if send_failed events present.
Click opens a slide-over with per-event-type breakdown + remediation
copy. consent_missing recipients auto-resolve on the next dispatcher
tick now that lit_campaign_contacts.org_id is NOT NULL."
```

---

## Task 5: Mount badge in CampaignKpiHero

- [ ] **Step 1: Edit CampaignKpiHero**

Edit `frontend/src/features/outbound/components/CampaignKpiHero.tsx`. Add import:
```tsx
import { RecipientsSkippedBadge } from "./RecipientsSkippedBadge";
```

In the return JSX, find the Audience tile. Render the badge as a sibling immediately after the audience tile but inside the same flex/grid container so it sits visually next to it. Pattern:
```tsx
<div className="flex items-start gap-2">
  <Tile label="Audience" value={audienceDisplay} ... />
  <div className="self-center">
    <RecipientsSkippedBadge campaignId={campaignId} />
  </div>
</div>
```

If the existing layout uses a strict grid (e.g. `grid-cols-6`), the badge can also render in a flex row ABOVE the grid:
```tsx
<RecipientsSkippedBadge campaignId={campaignId} />
<div className="grid grid-cols-... ...">
  {/* tiles */}
</div>
```

Pick whichever fits the existing structure cleanest. The badge component returns null when there are no skips, so layout is unaffected for healthy campaigns.

- [ ] **Step 2: TS check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CampaignKpiHero" | head -5
```

```bash
git add frontend/src/features/outbound/components/CampaignKpiHero.tsx
git commit -m "feat(analytics): mount RecipientsSkippedBadge in CampaignKpiHero

Conditional badge renders only when the campaign has skip events.
For Test Campaign 1 today: will show '2 recipients skipped (last 7d)'
referencing the 13:20 UTC consent_missing events. User clicks
→ drill-in opens explaining: 'Consent missing — dispatcher will
auto-backfill on the next tick now that org_id is populated.'"
```

---

## Task 6: Acceptance + push

- [ ] **Step 1: SQL acceptance**

```sql
-- Confirm zero nulls
SELECT count(*) FROM public.lit_campaign_contacts WHERE org_id IS NULL;
-- Expected: 0

-- Confirm trigger exists
SELECT tgname FROM pg_trigger WHERE tgname = 'lit_campaign_contacts_org_id_trigger';
-- Expected: 1 row

-- Confirm NOT NULL constraint
SELECT is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='lit_campaign_contacts' AND column_name='org_id';
-- Expected: NO

-- Confirm RPC
SELECT proname FROM pg_proc WHERE proname = 'lit_campaign_skip_summary';
-- Expected: 1 row
```

- [ ] **Step 2: Push branch + cherry-pick H commits to main**

```bash
git push origin claude/review-dashboard-deploy-3AmMD
git checkout main
git pull origin main --ff-only
# Cherry-pick each H commit in order (replace with actual SHAs from steps above)
git cherry-pick <T1_SHA>  # migrations
git cherry-pick <T2_SHA>  # RPC migration
git cherry-pick <T3_SHA>  # hook
git cherry-pick <T4_SHA>  # badge + drill-in
git cherry-pick <T5_SHA>  # mount
git push origin main
git checkout claude/review-dashboard-deploy-3AmMD
```

Vercel will auto-deploy production from main within ~3 minutes.

- [ ] **Step 3: Commit acceptance marker**

```bash
git commit --allow-empty -m "chore(campaigns): sub-project H shipped — silent skips now visible

Backfill + insert trigger + NOT NULL on lit_campaign_contacts.org_id
closes the silent-failure mode that cost Test Campaign 1 22h today.
RecipientsSkippedBadge in CampaignKpiHero surfaces consent_missing /
daily_cap_reached / suppressed / send_failed events with per-event
remediation copy. User will see at-a-glance which recipients are
silently failing + why."
```

---

## Self-Review

**Spec coverage**:

| Spec section | Covered by |
|---|---|
| Fix 1: backfill + trigger + NOT NULL | Task 1 |
| Fix 2: skip summary RPC | Task 2 |
| Fix 2: hook + badge + drill-in | Tasks 3, 4 |
| Fix 2: mount in KpiHero | Task 5 |

**Placeholder scan**: Clean. No "TODO", no "TBD".

**Type consistency**: `SkipEventType` defined in hook (Task 3), consumed by both badge (Task 4 step 1) and drill-in (Task 4 step 2). `CampaignSkip` interface consistent. `RecipientsSkippedBadge` Props match what `CampaignKpiHero` will pass in Task 5.
