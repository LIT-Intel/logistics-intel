# Sub-project K — Activity Timeline Drawer

**Date:** 2026-06-10
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Scope:** Convert the inline always-on activity timeline into a slide-over drawer triggered by an "Activity (N)" button in the campaign header.

## Problem

Today the timeline mounts at [CampaignBuilder.jsx:1109](../../frontend/src/pages/CampaignBuilder.jsx#L1109) directly below the KPI hero as an always-on `<section>`. This causes two regressions:

1. **Page-scroll break.** The timeline participates in the parent flex chain. Each new event makes the page grow; the 3-column workspace below it gets pushed past viewport and becomes unreachable.
2. **No scale path.** Hard-cap of 10 rows before "Show all"; an active campaign with 100+ recipients would either truncate forever or blow the page out further.

User feedback (verbatim, 2026-06-10): *"no way I will approve this new timeline feature. Timeline is fine, but perhaps offer it as a pop up or something that will not break the entire page as it did now."*

## Decision

**Convert to right-anchored slide-over drawer** following the exact pattern already shipped by `EngagementDrillIn.tsx`. No new dependencies. Two files modified.

### Architecture

- **Drawer is portal-style positioned** (`fixed inset-y-0 right-0 z-50 w-full max-w-[480px]`) — does not participate in the page flex chain. Mounting/unmounting cannot grow the page.
- **Internal scroll** — `<ul>` lives inside `flex-1 min-h-0 overflow-y-auto`. 2000 events scroll inside the drawer; the page itself never changes height.
- **Open state lives in CampaignBuilder** — `useState(false)` near other UI state. Button toggles; drawer auto-closes on ESC or overlay click.
- **Activity hook is lifted to CampaignBuilder** — same `useCampaignActivityTimeline(campaignId)` call as today, just relocated. Count is available immediately for the button label `Activity (N)`; events are passed down to the drawer as props (no double-fetching).
- **"Show all" toggle dropped** — drawer scrolls unbounded, the toggle was only there to manage inline overflow.

### Components touched (2 files)

| File | Action |
|---|---|
| `frontend/src/features/outbound/components/CampaignActivityTimeline.tsx` | MODIFY — root `<section>` becomes drawer shell. Add `open: boolean` + `onClose: () => void` props. Accept `events`, `isLoading`, `error` as props instead of calling the hook internally. Wrap list in `flex-1 min-h-0 overflow-y-auto`. Render overlay (`fixed inset-0 z-40 bg-slate-900/40`) when open. Drop "Show all" toggle + `initialRows` prop. Add ESC handler. |
| `frontend/src/pages/CampaignBuilder.jsx` | MODIFY — (1) add `useCampaignActivityTimeline(editId)` import + call near other hooks. (2) Add `const [activityOpen, setActivityOpen] = useState(false)` near other UI state. (3) Add "Activity (N)" button to the header action cluster (between Preview-as-contact and Test-send). (4) Replace inline render at line 1109 with drawer mount passing `open={activityOpen}`, `onClose={() => setActivityOpen(false)}`, events from hook. |

## Data flow

Unchanged from current implementation, only relocated:

1. CampaignBuilder calls `useCampaignActivityTimeline(editId)` → returns `{ data, isLoading, error }`
2. Header button reads `data?.length ?? 0` → renders `Activity (N)` with badge styling
3. Clicking the button flips `activityOpen` → drawer mounts visible
4. Drawer renders the same `TimelineRow` per event as before
5. Close (ESC, overlay click, X button) → `activityOpen=false` → drawer hides

## Error handling + edge cases

| Case | Behavior |
|---|---|
| editId is null (new campaign, not saved yet) | Don't render button; don't call hook (`enabled: !!campaignId` in hook). |
| Hook returns 0 events | Button shows `Activity (0)` greyed; clicking opens drawer with existing empty-state copy. |
| Hook is loading | Button shows `Activity (…)` with skeleton; drawer can still open and show loading state. |
| Hook errors | Button shows `Activity` (no count); drawer shows existing error state. |
| User opens drawer mid-page-scroll | Drawer overlays; body scroll lock prevents background scroll. |
| Drawer open while campaign refetches | Hook reruns; events update inside drawer without close. |
| 2000+ events | List scrolls inside drawer; page unaffected. |
| Mobile (narrow viewport) | `w-full max-w-[480px]` collapses to full-width on small screens. |

## Visual

```
+----------------------------------------------+
|  Header buttons:                             |
|  [Preview] [Activity (47)] [Test send] [Save]|
+----------------------------------------------+
|                                              |
|  KPI Hero (unchanged)                        |
|                                              |
|  [3-column workspace] ← reachable again      |
|                                              |
+----------------------------------------------+

                Drawer (when open):
                +-------------------+
                | Activity timeline |
                | 47 events      ✕ |
                +-------------------+
                | 📤 Sent to ...    |
                | 👁 Opened by ...  |
                | 🔗 Clicked ...    |
                |   ...             |
                |   (scrolls)       |
                +-------------------+
```

## Testing

| Test | Method |
|---|---|
| Page below KPI hero is reachable | Manual: open `/app/campaigns/<id>`; scroll page; 3-col workspace visible |
| Drawer opens on button click | RTL: render builder with editId; click Activity button; assert drawer in DOM |
| Drawer closes on overlay click | RTL: open drawer; click overlay; assert drawer not in DOM |
| Drawer closes on ESC | RTL: open drawer; fire keydown Escape; assert closed |
| Button shows count when events load | RTL: mock hook with 5 events; assert button text "Activity (5)" |
| Existing TimelineRow tests still pass | Update mocks to pass events as prop instead of via hook |

## Out of scope

- "Unread" count tracking (last-viewed timestamp per user)
- Drawer animation polish beyond default Tailwind transitions
- Mobile-specific overrides beyond `w-full` collapse
- Keyboard navigation through events (arrow keys)

## Approvals locked

User confirmed all three:
1. Activity button placed to the **right** of Preview, before Test-send
2. Drawer **closed** by default on campaign load
3. **Drop** the "Show all" toggle

## Acceptance

- [ ] Inline timeline `<section>` no longer renders below KPI hero
- [ ] Header action cluster includes `Activity (N)` button
- [ ] Clicking button opens drawer with full event list
- [ ] Page-scroll regression resolved — workspace below KPI hero is reachable
- [ ] Boss Man campaign with current events: drawer renders all rows; page does not grow
- [ ] Vercel production deploy READY on main
