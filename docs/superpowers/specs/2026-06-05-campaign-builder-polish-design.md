# Campaign Builder Polish — Design Spec

**Date:** 2026-06-05
**Sub-project:** C (of A/B/C decomposition)
**Status:** Approved decomposition, design pending user nod
**Lands after A + B because:** Polish goes on a stable foundation. The "Launch" button visual hierarchy lands cleanest when the hero it's next to is the real KPI hero (sub-project B), not the audience-size-only strip.

---

## Problem

Four discrete bugs + two visual-hierarchy gripes the user surfaced from the screenshot:

1. **Audience Size tile shows "—"** even after adding 2 recipients via Manual emails tab
2. **Sample · Selected box shows "No recipients selected yet"** in the same scenario
3. **Page cuts off on Mac + Windows** — content below ~viewport-height is unreachable
4. **Test send button looks like every other secondary button** — no warning treatment to remind users to test before launch
5. **Launch button is generic green** — should pop in LIT brand blue, become the unmissable primary action
6. **(implicit)** "0 of 290 saved" tile in the persona panel is misleading when user used Manual emails tab — it's reading from the wrong denominator

---

## Architecture

### Bug 1 + 2: audience count + sample box

Root cause (investigation `af17a7b3d9b9edb6c`): `CampaignBuilder.jsx` keeps two recipient buckets — `selectedIds: Set<string>` (saved companies) and `manualEmails: ManualRecipient[]` (typed emails). The `ForecastStrip` and `PersonaPanel` read only `selectedIds.size`, ignoring `manualEmails`. The picker drawer's own footer correctly counts both, which is why users see "N emails will be queued" inside the drawer but the outer chrome stays empty.

**Fix:**

```jsx
// CampaignBuilder.jsx:1029 — ForecastStrip
<ForecastStrip audienceCount={selectedIds.size + manualEmails.length} />

// CampaignBuilder.jsx:1138 — PersonaPanel
<PersonaPanel
  audienceCount={selectedIds.size + manualEmails.length}
  selectedCompanies={selectedCompanies}
  manualEmails={manualEmails}  // NEW prop
  ...
/>
```

Then in `PersonaPanel.tsx`:

- The "Sample · Selected" box (`:167-191`) renders `sample = selectedCompanies.slice(0, 6)`. Extend to also render manual-email chips when `selectedCompanies.length === 0` (or interleave both). For uniformity: if `selectedCompanies.length > 0`, show those; else show manual-email chips with a 📧 icon to distinguish.
- The "0 of 290 saved" dark tile (`:95-104`) — change label to dynamic: when manual-only, show "N manual recipients". When mixed or company-only, show "N of M saved companies". When empty, show "Pick recipients".

### Bug 3: page overflow

Root cause (investigation `af53260a3de6ec61c`): `CampaignBuilder.jsx:868` has `h-[calc(100vh-72px)]` (wrong — real header offset is 96px = `h-20` AppHeader + `py-4` main) + `overflow-hidden` (clips everything past the wrong height with no scrollbar).

**Fix** (Variant 1 — simplest, preferred):

```jsx
// CampaignBuilder.jsx:868
<div className="mx-auto flex min-h-[640px] w-full max-w-[1500px] flex-col bg-[#F8FAFC]">
```

Drops `h-[calc(100vh-72px)]` (let content flow) + drops `overflow-hidden` (let `AppLayout`'s `<main>` handle scroll). Keeps `min-h-[640px]` for the empty-state edge case.

**Risk check** (one-time grep before landing): the 3 inner column scrollers (TimelineCanvas, AudiencePicker pane, StepInspector) may rely on `h-full` and need a bounded parent. If `grep -n "h-full" frontend/src/features/outbound/components/` shows them depending on parent height, use Variant 2 instead:

```jsx
<div className="mx-auto flex h-[calc(100vh-96px)] min-h-[640px] min-h-0 w-full max-w-[1500px] flex-col overflow-y-auto bg-[#F8FAFC]">
```

(corrects the offset 72→96, switches `overflow-hidden`→`overflow-y-auto`, adds `min-h-0` for flex children).

### Bug 4 + 5: Test send + Launch visual hierarchy

Current: both buttons render as plain `border border-slate-200` ghost buttons. Equal weight. User reports: "change the color of the Test Send button to remind the user to test the email first and change the color of launch campaign to our color blue or something that stands out."

**Visual treatment:**

| Button | State | Treatment |
|---|---|---|
| Test send | default | Amber outline — `border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100`. Warning-toned without screaming. Icon: 🧪 (or lucide `FlaskConical`) |
| Test send | hover | Slight darken, `bg-amber-100` |
| Launch | default | LIT brand blue — `bg-[#2563EB] text-white font-semibold hover:bg-[#1D4ED8]`. Primary CTA, no outline, fills its container. Icon: 🚀 (or lucide `Rocket`). Box-shadow elevation `shadow-sm` |
| Launch | disabled (no recipients / no body / etc.) | `bg-slate-200 text-slate-500 cursor-not-allowed`, tooltip on hover: "Pick recipients and write the email body before launching" |
| Launch | hover (when no test-send has occurred yet) | Inline yellow caret-tooltip above the button: *"You haven't tested this email yet — Test send first?"* with a "Test now" inline link. Non-blocking — user can still click Launch and confirm. |

The "Test send first" pre-launch nudge addresses the user's intent ("remind the user to test the email first") without putting a hard gate on launch.

Brand-blue exact hex: confirm in `tailwind.config.js` — if a `brand.blue` token exists, use that. Otherwise use `#2563EB` (Tailwind `blue-600`) which matches the existing CTAs on the dashboard.

### Bug 6: persona panel denominator

The "0 of 290 saved" tile in the dark persona-panel hero is misleading when user added 2 manual emails — they see "0 of 290" and assume nothing's selected. Already addressed by the Bug 1+2 fix above (dynamic label switches to "2 manual recipients" when manual-only).

---

## Components (files to touch)

| File | Change |
|---|---|
| `frontend/src/pages/CampaignBuilder.jsx:868` | CSS fix — drop fixed-viewport shell |
| `frontend/src/pages/CampaignBuilder.jsx:1029` | Audience count includes manualEmails |
| `frontend/src/pages/CampaignBuilder.jsx:1138-1148` | Pass `manualEmails` prop to PersonaPanel |
| `frontend/src/features/outbound/components/ForecastStrip.tsx` | (No change — already takes a count prop, just gets a different number) |
| `frontend/src/features/outbound/components/PersonaPanel.tsx:95-104` | Dynamic denominator label |
| `frontend/src/features/outbound/components/PersonaPanel.tsx:167-191` | Render manual-email chips in Sample box when no companies selected |
| `frontend/src/pages/CampaignBuilder.jsx` (header bar — locate `Test send`/`Launch`) | Apply new button classes + tooltip behaviors |
| `frontend/src/features/outbound/components/LaunchButton.tsx` | NEW — encapsulates the disabled-state tooltip + pre-launch-nudge logic |

---

## Data flow

For Bug 1 + 2:
1. User opens picker → Manual emails tab → types 2 emails → confirms
2. Picker fires `setManualEmails([...])`
3. `selectedIds.size + manualEmails.length` re-derives to 2
4. ForecastStrip + PersonaPanel re-render with audienceCount=2
5. Sample box: `selectedCompanies.length === 0` → render manual-email chips instead

For Bug 4 + 5 pre-launch nudge:
1. CampaignBuilder tracks `lastTestSendAt: Date | null` (from `lit_outreach_history` filtered to test events, or local state if simpler)
2. On Launch button hover, if `lastTestSendAt === null`, show inline tooltip
3. User clicks "Test now" → opens test-send modal; user clicks Launch anyway → modal asks "You haven't tested this email. Send anyway?"

---

## Error handling + edge cases

| Case | Behavior |
|---|---|
| User pastes 1000 emails into Manual emails tab | ForecastStrip shows 1000; no error. Validation happens at Launch (each must be a valid email) |
| User adds 100 companies + 50 manual emails | Audience count = 150; Sample box shows the 6 companies (existing behavior); chips don't displace if companies present |
| User toggles Variant 1 page-overflow fix and inner scrollers break | Roll back to Variant 2 (the `overflow-y-auto` + `min-h-0` variant). 30-second `grep` audit before merge prevents this. |
| User on a very tall display (e.g. 4K vertical) | With Variant 1, content fills naturally; no awkward fixed-height ghost space. Better than current. |
| User clicks Launch with disabled state | Tooltip shows what's missing; click is no-op |
| User has done a test send 10 days ago | Show "Last tested 10 days ago — test again?" instead of "You haven't tested" |

---

## Testing

| Test | Scope |
|---|---|
| ForecastStrip + PersonaPanel show correct count when manualEmails > 0 | Component test with mock state |
| Sample box renders manual-email chips when no companies selected | Component test |
| Page no longer clips on viewport heights 600/800/1080/1440 | Manual QA + screenshot diff |
| Test send button has amber styling | Visual regression test |
| Launch button has brand-blue styling + correct disabled states | Visual regression test |
| Pre-launch nudge appears when no test-send has occurred | E2E test |

---

## Out of scope

- Multi-step composer redesign — separate workstream
- A/B variant editor UI — separate workstream
- Persona library management — separate workstream
- Inline email preview rendering (currently shows token strings) — separate workstream

---

## Open design decisions surfaced for user

1. **Pre-launch nudge persistence.** Should "You haven't tested" be a one-time hint (dismissable, then never shown for this campaign) or every-time-until-tested? Recommend every-time-until-tested — testing email is high-leverage; nudge stays until done.
2. **Brand blue source.** Will use `tailwind.config.js`'s `brand.blue` if defined, else `#2563EB`. Confirm at implementation time.
3. **Variant 1 vs 2 page-overflow fix.** Default to Variant 1 (simpler); fall back to Variant 2 if inner scrollers depend on bounded parent. 30-sec grep before merge.
