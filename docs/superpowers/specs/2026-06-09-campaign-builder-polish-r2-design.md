# Campaign Builder Polish Round 2 — Design Spec

**Date:** 2026-06-09
**Sub-project:** F (Round 2 — builder hardening)
**Status:** Approved scope, design pending nod
**Lands after E because:** these are polish/feature additions on top of a stable foundation. None blocks customer outcomes the way E's hotfixes do.

---

## Problem

Three issues from Round 2 acceptance:

1. **#3 — Page cut-off + stacked scrollbars** (still). My Variant 2 fix in commit `a047ebbf` had two compounding bugs (investigation `a5adb8d8ef7b7fb28`):
   - `100vh−96px` was wrong arithmetic — should be `100vh−112px` (header `h-20`=80 + main `py-4`=32)
   - Outer `overflow-y-auto` competes with inner column scrollers (TimelineCanvas, PersonaPanel, StepInspector each have their own `h-full overflow-y-auto`) → stacked scrollbars

2. **#2 — Brand colors on KPI hero**. The 6-tile CampaignKpiHero (commit `07326146`) renders plain white tiles with neutral slate text. No brand identity. User wants the LIT brand palette applied so the hero feels native to the app, not like a generic dashboard.

3. **#5 — Click attribution drill-in**. Round 2 hotfix (Sub-project E) fixed the immediate "UUID fragment in activity feed" problem with a label fallback. This sub-project adds the proper drill-in: click any KPI tile → slide-over showing per-recipient engagement with per-link breakdown.

---

## Architecture

### Fix 1 — Page overflow architecture (#3)

**Approach (c) from the investigation**: proper flex chain. The page itself is never a scroll surface — top bar, schedule row, KPI hero render at natural height; only the 3-column working area is bounded; each column owns its own scroll.

Single concrete patch at `frontend/src/pages/CampaignBuilder.jsx:920`:

```jsx
// Before (current Variant 2):
<div className="mx-auto flex h-[calc(100vh-96px)] min-h-[640px] min-h-0 w-full max-w-[1500px] flex-col overflow-y-auto bg-[#F8FAFC]">

// After:
<div className="mx-auto flex h-[calc(100vh-112px)] min-h-[640px] min-h-0 w-full max-w-[1500px] flex-col overflow-hidden bg-[#F8FAFC]">
```

Two changes:
- (a) `100vh−96px` → `100vh−112px` (correct math: header 80 + main py-4 16+16 = 112)
- (b) `overflow-y-auto` → `overflow-hidden` — outer no longer scrolls; the inner 3-column grid (already `flex-1 min-h-0` at line 1188) and its children (each `h-full overflow-y-auto`/`overflow-hidden`) own all scrolling

**Defensive belt-and-suspenders** at `frontend/src/layout/lit/AppLayout.jsx:83`: add `min-h-0` to `<main>`:
```jsx
<main className="flex-1 min-h-0 overflow-x-hidden px-[10px] py-4">
```

Result: exactly one scrollbar per column (Audience / Sequence / Composer), none on the outer page. Top bar + schedule + KPI hero always visible at natural height.

### Fix 2 — Brand colors on KPI hero (#2)

LIT's brand palette per `tailwind.config.js`:
- **Brand blue** (primary): `#2563EB` (`brand.blue.600`) → `#1D4ED8` hover
- **Cyan accent** (Pulse / activity / fresh signal): `#00F0FF` — used in sidebar logo glow + Pulse icon
- **Slate** (neutral chrome): existing `slate-*` tokens
- **Amber** (warnings): existing `amber-*` tokens

Current `CampaignKpiHero` renders 6 plain white tiles. New treatment per tile state:

| Tile | Default tone | Hover/loaded tone | When highlighted |
|---|---|---|---|
| Audience | Slate (neutral chrome) | Slight elevation | Brand blue ring if `> 0` |
| Sent | Slate base + small sparkline color | Brand blue accent line in sparkline | Always shows count + spark |
| Open Rate | Soft blue tint (`bg-blue-50`) + blue accent on value | Deeper blue on hover | Always blue (engagement = first signal) |
| Click Rate | Indigo tint (`bg-indigo-50`) + indigo value | Indigo hover | Indigo (deeper engagement) |
| Reply Rate | Emerald tint (`bg-emerald-50`) + emerald value | Emerald hover | Emerald (best signal) |
| Bounce Rate | Slate base — but turns amber if `> 5%`, rose if `> 10%` | Same | Color = warning level |

Each tile gets:
- A 2px colored bottom border (matching the value color) — single subtle brand anchor
- A consistent `rounded-2xl` corner radius (already there)
- The value in a slightly larger/bolder weight (`text-3xl font-bold tabular-nums` instead of `text-2xl semibold`)
- Sparkline color inherits the tile's accent (e.g. Sent sparkline = brand blue; bounce sparkline = amber)

Implementation: extend `<Tile>` inner component in `CampaignKpiHero.tsx` to accept a `tone` prop (`'neutral' | 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose'`). Map tone → className strings centrally so the design is consistent + tweakable in one place.

For state-specific tone overrides (e.g. bounce rate flipping to amber/rose): compute the tone inline based on funnel data.

### Fix 3 — Per-recipient click attribution drill-in (#5)

**Surface**: tile-click slide-over (per AskUserQuestion investigation A3 recommendation). Each KPI tile (Sent / Open Rate / Click Rate / Reply Rate / Bounce Rate) becomes clickable; opens a right-side slide-over titled "Who [event_type] (last 30d)".

**Backend**: new RPC `lit_campaign_engagement_recipients(p_campaign_id uuid, p_event_type text, p_since timestamptz)`:

```sql
CREATE OR REPLACE FUNCTION public.lit_campaign_engagement_recipients(
  p_campaign_id uuid,
  p_event_type text,
  p_since timestamptz
) RETURNS TABLE (
  recipient_id uuid,
  recipient_email text,
  display_name text,
  event_count bigint,
  first_event_at timestamptz,
  last_event_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    cc.id AS recipient_id,
    cc.email AS recipient_email,
    coalesce(cc.full_name, cc.email) AS display_name,
    count(h.id) AS event_count,
    min(h.created_at) AS first_event_at,
    max(h.created_at) AS last_event_at
    FROM lit_outreach_history h
    JOIN lit_campaign_contacts cc
      ON cc.id::text = h.metadata->>'recipient_id'
   WHERE h.campaign_id = p_campaign_id
     AND h.event_type = p_event_type
     AND h.created_at >= p_since
     AND (
       -- RLS check: campaign's org_id must match user's orgs OR be platform_admin
       EXISTS (SELECT 1 FROM lit_campaigns c
                WHERE c.id = p_campaign_id
                  AND (c.org_id IN (SELECT org_id FROM org_members
                                    WHERE user_id = auth.uid() AND status='active')
                       OR EXISTS (SELECT 1 FROM platform_admins pa
                                  WHERE pa.user_id = auth.uid())))
     )
   GROUP BY cc.id, cc.email, cc.full_name
   ORDER BY last_event_at DESC;
$function$;
```

**Secondary RPC** for per-link breakdown (only used when drilling into "Click Rate" → expanding a row):
```sql
CREATE OR REPLACE FUNCTION public.lit_recipient_link_clicks(
  p_recipient_id uuid,
  p_campaign_id uuid
) RETURNS TABLE (
  link_id uuid,
  original_url text,
  click_count integer,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id AS link_id, original_url, click_count, first_clicked_at, last_clicked_at
    FROM lit_outreach_links
   WHERE recipient_id = p_recipient_id
     AND campaign_id = p_campaign_id
   ORDER BY click_count DESC;
$function$;
```

**Frontend**:
- New component: `frontend/src/features/outbound/components/EngagementDrillIn.tsx` — slide-over panel with header (event type + count + "last 30d" subtitle), recipient list (each row: avatar/initial, name, email, badge with count, last event timestamp), expandable per-link section when drilling into clicks.
- `CampaignKpiHero.tsx` — `<Tile>` accepts optional `onClick` prop; the 5 metric tiles wire it to open the drill-in with the corresponding event_type.
- `useEngagementRecipients(campaignId, eventType, sinceDays = 30)` hook in `frontend/src/features/outbound/hooks/useEngagementRecipients.ts` — TanStack Query wrapper.

---

## Components (files to touch)

| File | Change |
|---|---|
| `frontend/src/pages/CampaignBuilder.jsx:920` | 2-class CSS swap (overflow + calc) |
| `frontend/src/layout/lit/AppLayout.jsx:83` | Add `min-h-0` to `<main>` (defensive) |
| `frontend/src/features/outbound/components/CampaignKpiHero.tsx` | Extend `<Tile>` with `tone` + `onClick`; map tone → classes; compute bounce tone dynamically |
| `supabase/migrations/20260609110000_lit_campaign_engagement_recipients_rpc.sql` | NEW — both RPCs |
| `frontend/src/features/outbound/hooks/useEngagementRecipients.ts` | NEW — typed wrapper |
| `frontend/src/features/outbound/components/EngagementDrillIn.tsx` | NEW — slide-over UI |
| `frontend/src/features/outbound/components/__tests__/CampaignKpiHero.tone.test.tsx` | NEW — Vitest cases for tone variants |
| `frontend/src/features/outbound/components/__tests__/EngagementDrillIn.test.tsx` | NEW — RTL cases for slide-over open/close + per-link expand |

---

## Data flow

**Drill-in path**:
1. User clicks "Click Rate" tile
2. `<Tile onClick={...}>` calls `setDrillIn({ eventType: 'clicked', open: true })`
3. `<EngagementDrillIn campaignId={editId} eventType="clicked" />` mounts
4. `useEngagementRecipients(campaignId, 'clicked', 30)` calls RPC, returns recipients
5. Slide-over renders the list; each row click expands the per-link breakdown (lazy call to `lit_recipient_link_clicks`)

**Brand-color flow**: pure render — tone prop drives className. No data dependency.

---

## Error handling + edge cases

| Case | Behavior |
|---|---|
| RPC returns empty (no events of that type) | Slide-over shows "No [event_type] yet" empty state |
| Click on tile with sent=0 (rate is "—") | Tile is non-clickable when there's nothing to drill in; cursor stays default |
| Per-link RPC fails | Recipient row stays collapsed; small "Failed to load links" inline |
| Page overflow fix collides with future content additions taller than viewport | Inner columns scroll independently — no regression possible |
| Brand color tone choice clashes with future dark-mode rollout | Tones use Tailwind tokens, not hex — auto-flip with `dark:` variants when dark mode lands |

---

## Testing

| Test | Scope |
|---|---|
| Page overflow: bottom reachable at viewport heights 600/800/1080/1440 | Manual + Playwright if available |
| KpiHero `<Tile>` renders correct tone classes for each variant | Vitest snapshot per tone |
| Bounce tone flips amber when bounceRate > 5%, rose > 10% | Vitest case per threshold |
| KpiHero tile click fires onClick | Vitest RTL |
| EngagementDrillIn renders recipient list from RPC mock | Vitest RTL |
| EngagementDrillIn expand per-link works | Vitest RTL with mocked secondary RPC |
| RPC respects org RLS | Integration test: query as user from org B for campaign in org A → 0 rows |

---

## Out of scope

- Conditional sequence editor UI (Sub-project G)
- Inline email preview (separate workstream)
- A/B variant performance drill-in (separate workstream)
- Per-step conversion analytics
- Recipient export from drill-in (separate workstream)
- Mobile responsive layout for the drill-in (drawer is desktop-only for v1)

---

## Open design decisions surfaced

1. **Tile tone mapping** — see table in "Fix 2". Recommend the proposed mapping as v1; user can adjust during acceptance.
2. **Drill-in event types** — only Sent/Open/Click/Reply/Bounce. Suppression doesn't get a drill-in (admin-level concern, not visible enough to merit a tile).
3. **30-day window** — hard-coded for v1. Configurable via dropdown comes later.
