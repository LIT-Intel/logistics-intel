# Campaign Skip Visibility + Recipient org_id Fix — Design Spec

**Date:** 2026-06-09
**Sub-project:** H (Round 2 incident hardening)
**Status:** Approved scope, design pending nod
**Lands today** — same-day ship to close the silent-failure window that just cost Test Campaign 1 ~22 hours from launch to delivery.

---

## Problem

Test Campaign 1 went silently broken from yesterday 19:36 UTC to today 17:29 UTC — a 22-hour window where Step 2 should have fired and didn't. Three compounding silent failures:

1. **BulkEnrich safety hold blocked dispatcher 4.5h** — closed yesterday by `expires_at` column shipped in Sub-project E
2. **Consent gate skipped silently at 13:20 UTC today** — 2 `consent_missing` events with `reason: 'no_org_on_recipient'` logged, but no UI surface. The dispatcher's auto-backfill code requires `recipient.org_id`, and these 2 recipients had `org_id = NULL`
3. **Something populated `recipient.org_id` between 13:20 and 17:28** (unknown trigger) → dispatcher then backfilled consent and sent successfully at 17:29

Audit: of 5 total recipients across all campaigns, 1 has `org_id = NULL` (Test Campaign 1's Evan or Vraymond contact). 100% are backfillable from joining `lit_campaigns.org_id`.

User-visible problem in all three stages: **"emails just didn't go out and nothing in the UI told me why."**

---

## Architecture

### Fix 1 — `lit_campaign_contacts.org_id` backfill + insert trigger + NOT NULL

**Migration 1**: backfill existing rows from the campaign's org:
```sql
UPDATE public.lit_campaign_contacts cc
   SET org_id = c.org_id
  FROM public.lit_campaigns c
 WHERE c.id = cc.campaign_id
   AND cc.org_id IS NULL
   AND c.org_id IS NOT NULL;
```

After the backfill, audit zero nulls:
```sql
SELECT count(*) FROM public.lit_campaign_contacts WHERE org_id IS NULL;
-- Expected: 0
```

**Migration 2**: insert trigger to auto-populate `org_id` on every new row:
```sql
CREATE OR REPLACE FUNCTION public.lit_campaign_contacts_set_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.lit_campaigns WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lit_campaign_contacts_org_id_trigger
  BEFORE INSERT ON public.lit_campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION public.lit_campaign_contacts_set_org_id();
```

**Migration 3** (gated on Migration 1 + 2 succeeding):
```sql
ALTER TABLE public.lit_campaign_contacts
  ALTER COLUMN org_id SET NOT NULL;
```

After Fix 1, the silent failure mode from today literally cannot recur — every new recipient row gets `org_id` automatically, so the dispatcher's auto-backfill always has what it needs.

### Fix 2 — Surface skip reasons in the campaign UI

**Backend**: new RPC `lit_campaign_skip_summary(p_campaign_id uuid)` returns aggregates of `consent_missing` + `daily_cap_reached` + `suppressed` events from `lit_outreach_history` for the campaign, grouped by event type:

```sql
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
    (array_agg(h.metadata->>'reason' ORDER BY h.created_at DESC) FILTER (WHERE h.metadata->>'reason' IS NOT NULL))[1] AS sample_reason,
    (array_agg(h.metadata->>'recipient_email' ORDER BY h.created_at DESC) FILTER (WHERE h.metadata->>'recipient_email' IS NOT NULL))[1] AS sample_recipient
    FROM lit_outreach_history h
   WHERE h.campaign_id = p_campaign_id
     AND h.event_type IN ('consent_missing', 'daily_cap_reached', 'suppressed', 'send_failed')
     AND h.created_at > now() - interval '7 days'
   GROUP BY h.event_type
   ORDER BY skip_count DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.lit_campaign_skip_summary(uuid) TO authenticated;
```

**Frontend**: new `RecipientsSkippedBadge` component rendered in the CampaignKpiHero (next to the audience tile) when the RPC returns any rows.

UX:
- Amber badge: "⚠️ N recipients skipped in the last 7 days"
- Click → opens a slide-over (reuse the `EngagementDrillIn` pattern) showing per-event-type breakdown + reason + sample recipient
- Each event type has its own remediation copy:
  - **consent_missing** → "These recipients lack consent attestation. [Auto-backfill all]" button (calls the dispatcher's backfill code path directly via an edge fn)
  - **daily_cap_reached** → "Mailbox hit 50/day. These will retry tomorrow. [View deferred recipients]"
  - **suppressed** → "Suppressed via [bounce/unsubscribe/complaint]. [Review suppressions]"
  - **send_failed** → "Provider error. [View error log]"

### Out of scope

- Dispatcher health Sentry alert (#4 from prevention plan — separate workstream)
- Pre-launch dry-run modal (#3 — separate workstream, requires UI design)
- Edge fn drift audit/CI gate (#5 — drift-audit subagent running in background; CI gate is a future workstream)

---

## Components (files to touch)

| Path | Action |
|---|---|
| `supabase/migrations/20260609170000_lit_campaign_contacts_backfill_org_id.sql` | NEW — backfill |
| `supabase/migrations/20260609170100_lit_campaign_contacts_org_id_trigger.sql` | NEW — insert trigger |
| `supabase/migrations/20260609170200_lit_campaign_contacts_org_id_not_null.sql` | NEW — NOT NULL constraint |
| `supabase/migrations/20260609170300_lit_campaign_skip_summary_rpc.sql` | NEW — skip summary RPC |
| `frontend/src/features/outbound/hooks/useCampaignSkipSummary.ts` | NEW — TanStack Query wrapper |
| `frontend/src/features/outbound/components/RecipientsSkippedBadge.tsx` | NEW — amber badge + click handler |
| `frontend/src/features/outbound/components/RecipientsSkippedDrillIn.tsx` | NEW — slide-over with per-event-type breakdown |
| `frontend/src/features/outbound/components/CampaignKpiHero.tsx` | Mount the badge next to the Audience tile |

---

## Data flow

**On dispatcher tick (unchanged behavior, just now reliable):**
1. Cron picks recipients due to send
2. Per-org backfill block sees missing consent rows + writes them (now ALWAYS works because every recipient has `org_id`)
3. Per-recipient gate passes
4. Send fires

**On user viewing campaign:**
1. CampaignBuilder/Row queries `lit_campaign_skip_summary(campaignId)` via `useCampaignSkipSummary` hook
2. If RPC returns any rows → render amber badge in KpiHero
3. User clicks badge → slide-over opens with per-event-type breakdown
4. For `consent_missing` rows → user can click "Auto-backfill all" → calls existing backfill code → next dispatcher tick succeeds

---

## Error handling + edge cases

| Case | Behavior |
|---|---|
| Backfill leaves a row with `null org_id` because its campaign also has `null org_id` | Sub-project A made `lit_campaigns.org_id NOT NULL` already, so this can't happen. If somehow it does, NOT NULL migration fails loudly and Phase 1+2 stay landed. |
| Insert trigger fires but `campaign_id` references a deleted campaign | The SELECT returns no row → `NEW.org_id` stays NULL → NOT NULL constraint rejects the insert. Correct fail-loud behavior. |
| Skip RPC returns zero rows (healthy campaign) | Badge not rendered. KpiHero unchanged. |
| Skip RPC fails | Badge not rendered (graceful degradation). The skip events still exist in DB — admin can query directly. |
| User clicks "Auto-backfill all" but they're not the campaign owner | RLS on insert path rejects. UI shows error toast. |

---

## Testing

| Test | Scope |
|---|---|
| Migration 1 backfill leaves zero nulls | SQL audit |
| Migration 2 trigger auto-populates org_id on new inserts | INSERT new row without org_id, SELECT confirms it got set |
| Migration 3 NOT NULL constraint rejects null inserts | INSERT with explicit NULL → fails |
| `useCampaignSkipSummary` returns hook data correctly | Vitest mock |
| `RecipientsSkippedBadge` renders only when summary has rows | Component test |
| `RecipientsSkippedDrillIn` slide-over opens + renders per-event-type breakdown | RTL |
| E2E: dispatcher skips a recipient → badge appears → user clicks "Auto-backfill" → next tick sends | Manual |

---

## Open design decisions

1. **Auto-backfill action surface** — recommend a one-click button per event-type in the drill-in (not a global "fix all" button). Lets the user understand what's being fixed.
2. **Badge color** — amber for any skip count > 0. Rose if `send_failed > 0` (genuine errors deserve a louder color). Defer if this gets noisy in production.
3. **7-day window** — hardcoded for v1. Matches the existing `EngagementDrillIn` 30-day default but tighter because skips are noisier signals.
