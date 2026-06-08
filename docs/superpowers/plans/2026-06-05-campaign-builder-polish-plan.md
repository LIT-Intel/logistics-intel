# Campaign Builder Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the visible polish layer on the campaign builder — fix the audience-count bug (manual emails ignored), fix the page-overflow bug (content clipped below viewport), make the Sample box render manual-email chips, give Test send / Launch buttons real visual hierarchy with brand-blue Launch + amber Test send + pre-launch "test first" nudge.

**Architecture:** Surgical fixes — no new architecture. Two prop changes (audience count includes manual emails), one PersonaPanel prop addition (`manualEmails`) + small JSX branch to render manual-email chips, one CSS class swap on the page container, two button restyles, one new `LaunchButton` wrapper component that owns the disabled-tooltip + pre-launch-nudge logic so `CampaignBuilder.jsx` stays focused.

**Tech Stack:** React + TypeScript/JSX, Tailwind, lucide-react, Vitest + RTL.

**Branch:** `claude/review-dashboard-deploy-3AmMD`.

**Spec:** [docs/superpowers/specs/2026-06-05-campaign-builder-polish-design.md](../specs/2026-06-05-campaign-builder-polish-design.md)

**Depends on:** None for the bug fixes (Tasks 1-3 can land standalone). Tasks 4-6 (visual hierarchy + Launch button rework) read cleanest after Sub-project B's `CampaignKpiHero` lands because the Launch button sits next to the new hero — but they don't strictly require it.

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `frontend/src/features/outbound/components/LaunchButton.tsx` | Encapsulates Launch button styling, disabled-state tooltip, pre-launch nudge |
| `frontend/src/features/outbound/components/__tests__/LaunchButton.test.tsx` | RTL tests for the wrapper component |

### Files to modify

| Path | Change |
|---|---|
| `frontend/src/pages/CampaignBuilder.jsx` line 868 | Drop `h-[calc(100vh-72px)]` + `overflow-hidden` (Variant 1 fix) |
| `frontend/src/pages/CampaignBuilder.jsx` line 1029 | `audienceCount={selectedIds.size + manualEmails.length}` |
| `frontend/src/pages/CampaignBuilder.jsx` lines 1138-1148 | Pass `manualEmails` to `<PersonaPanel />`; same audienceCount fix |
| `frontend/src/pages/CampaignBuilder.jsx` lines 979-993 | Test send button → amber styling |
| `frontend/src/pages/CampaignBuilder.jsx` lines 1005-1025 | Replace inline Launch button with `<LaunchButton />` wrapper |
| `frontend/src/features/outbound/components/PersonaPanel.tsx` | Accept `manualEmails` prop; dynamic denominator label; render manual-email chips in Sample · Selected box when no companies selected |

---

## Task 1: Fix audience count to include manual emails

**Files:**
- Modify: `frontend/src/pages/CampaignBuilder.jsx` (lines 1029, 1138)
- Test: existing `frontend/src/features/outbound/components/__tests__/ForecastStrip.test.tsx` (verify behavior with a count > 0)

This is the simplest fix — two prop expressions change. PersonaPanel changes are larger and live in Task 3.

- [ ] **Step 1: Confirm both call sites**

```bash
grep -nE "ForecastStrip|PersonaPanel" frontend/src/pages/CampaignBuilder.jsx | head -10
```

Expected: import at line 28, mount at line 1029 (ForecastStrip); import + mount near line 1138 (PersonaPanel).

- [ ] **Step 2: Update ForecastStrip mount at line 1029**

Edit `frontend/src/pages/CampaignBuilder.jsx`. Find line 1029:

```jsx
<ForecastStrip audienceCount={selectedIds.size} />
```

Replace with:

```jsx
<ForecastStrip audienceCount={selectedIds.size + manualEmails.length} />
```

NOTE: If Sub-project B's Task 9 lands first, the entire `<ForecastStrip />` line is replaced by `<CampaignKpiHero />` and the `audienceCount` prop already uses the corrected expression. In that case this task's line 1029 change is a no-op and only the PersonaPanel change at step 3 matters.

- [ ] **Step 3: Update PersonaPanel mount around line 1138**

Edit `frontend/src/pages/CampaignBuilder.jsx`. Find the PersonaPanel mount (around lines 1138-1148). Update the `audienceCount` prop:

```jsx
<PersonaPanel
  audienceCount={selectedIds.size + manualEmails.length}
  selectedCompanies={selectedCompanies}
  // ...rest of props unchanged for now; manualEmails prop added in Task 3
/>
```

- [ ] **Step 4: Manual smoke test**

```bash
cd frontend && npm run dev
```

Open `/app/campaigns`, create a new campaign, open Pick recipients drawer → Manual emails tab → add 2 test emails → confirm. Expected:

- ForecastStrip (top KPI strip) shows `2` for AUDIENCE SIZE — not `—`
- PersonaPanel header reads `2` not `0`

The Sample · Selected box still shows "No recipients selected yet" — that's fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CampaignBuilder.jsx
git commit -m "fix(campaigns): include manual emails in audience count

ForecastStrip + PersonaPanel were reading only selectedIds.size,
ignoring manualEmails added via the Manual emails tab in the picker
drawer. Two prop expressions now sum both buckets. Sample box
rendering for manual entries lands in a follow-up task."
```

---

## Task 2: Fix page overflow — drop fixed-viewport shell

**Files:**
- Modify: `frontend/src/pages/CampaignBuilder.jsx` (line 868)

The investigation (agent `af53260a3de6ec61c`) identified `h-[calc(100vh-72px)]` (wrong — real header offset is 96px) + `overflow-hidden` (clips content with no scrollbar) as the bug. The spec recommends Variant 1 (drop the fixed shell entirely; let AppLayout's `<main>` scroll) with Variant 2 (corrected calc + `overflow-y-auto` + `min-h-0`) as a fallback if inner column scrollers depend on a bounded parent.

- [ ] **Step 1: Pre-check — does any inner column rely on `h-full`?**

```bash
grep -rnE "h-full|h-\[100%\]" frontend/src/features/outbound/components/ 2>/dev/null | grep -vE "test|__tests__" | head -10
```

If matches reference any component mounted under the CampaignBuilder body (TimelineCanvas, AudiencePicker pane, StepInspector, PersonaPanel, etc.), skip ahead to "Variant 2" in step 3 below. If no matches in mounted children, Variant 1 is safe.

- [ ] **Step 2: Confirm the target line**

```bash
grep -n "h-\[calc(100vh-72px)\]" frontend/src/pages/CampaignBuilder.jsx
```

Expected: single hit at line 868 with the full class string `mx-auto flex h-[calc(100vh-72px)] min-h-[640px] w-full max-w-[1500px] flex-col overflow-hidden bg-[#F8FAFC]`.

- [ ] **Step 3: Apply Variant 1 (preferred) OR Variant 2 (fallback)**

Edit `frontend/src/pages/CampaignBuilder.jsx`. Find line 868:

```jsx
<div className="mx-auto flex h-[calc(100vh-72px)] min-h-[640px] w-full max-w-[1500px] flex-col overflow-hidden bg-[#F8FAFC]">
```

**Variant 1 (default):** Replace with content-driven height:

```jsx
<div className="mx-auto flex min-h-[640px] w-full max-w-[1500px] flex-col bg-[#F8FAFC]">
```

Changes: drop `h-[calc(100vh-72px)]` (let content flow); drop `overflow-hidden` (let `AppLayout`'s `<main>` handle scroll). Keep `min-h-[640px]` for the empty-state edge case.

**Variant 2 (if step 1 found `h-full` dependents):** Replace with corrected calc + scroll:

```jsx
<div className="mx-auto flex h-[calc(100vh-96px)] min-h-[640px] min-h-0 w-full max-w-[1500px] flex-col overflow-y-auto bg-[#F8FAFC]">
```

Changes: corrects `100vh-72px` → `100vh-96px` (real offset is `h-20` AppHeader + `py-4` main); switches `overflow-hidden` → `overflow-y-auto`; adds `min-h-0` (flex children need this to allow internal scroll).

- [ ] **Step 4: Manual smoke test at three viewport heights**

```bash
cd frontend && npm run dev
```

Open `/app/campaigns/new` (or any existing campaign). Resize browser to these heights and verify the bottom of the page is reachable:
- 900px tall (typical laptop) — should scroll to bottom, no clipping
- 1080px tall (typical desktop)
- 1440px tall (4K display)

Also verify on width: at the smallest (≥1280px desktop minimum), the 3-column body still fits without horizontal scrollbar.

If any viewport clips content, you've taken Variant 1 but a child component does require a bounded parent. Revert step 3 to Variant 2.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CampaignBuilder.jsx
git commit -m "fix(campaigns): drop fixed-viewport shell that clipped bottom of page

CampaignBuilder.jsx:868 had h-[calc(100vh-72px)] (wrong — real header
offset is 96px) + overflow-hidden, which clipped any content past the
miscalculated height with no scrollbar to recover. Now content-driven
height + min-h-[640px] floor, letting AppLayout's main element scroll
naturally."
```

---

## Task 3: Render manual-email chips in PersonaPanel's Sample · Selected box

**Files:**
- Modify: `frontend/src/features/outbound/components/PersonaPanel.tsx`
- Modify: `frontend/src/pages/CampaignBuilder.jsx` (PersonaPanel mount around line 1138)
- Test: `frontend/src/features/outbound/components/__tests__/PersonaPanel.manualEmails.test.tsx` (NEW)

- [ ] **Step 1: Inspect current PersonaPanel structure**

```bash
sed -n '1,30p' frontend/src/features/outbound/components/PersonaPanel.tsx
```

Confirm the prop interface around line 14-20. We're adding one optional prop: `manualEmails?: ManualRecipient[]`.

Also locate the "Sample · Selected" empty-state branch (around lines 167-191 per the investigation) and the dark "0 of 290 saved" tile (around lines 95-104).

- [ ] **Step 2: Write the failing test**

Create `frontend/src/features/outbound/components/__tests__/PersonaPanel.manualEmails.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonaPanel } from "../PersonaPanel";

const baseProps = {
  audienceCount: 0,
  selectedCompanies: [],
  manualEmails: [],
  totalSavedCompanies: 290,
  onOpenPicker: () => {},
  // Adjust this object to satisfy whatever other required props PersonaPanel has.
  // Locate the component's props interface and copy the required fields here.
};

describe("PersonaPanel — manualEmails rendering", () => {
  it("renders manual-email chips in Sample box when no companies selected", () => {
    render(<PersonaPanel
      {...baseProps}
      audienceCount={2}
      manualEmails={[
        { email: "alice@example.com" },
        { email: "bob@example.com" },
      ] as any}
    />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("denominator tile reads 'N manual recipients' when manual-only", () => {
    render(<PersonaPanel
      {...baseProps}
      audienceCount={3}
      manualEmails={[
        { email: "a@b.com" }, { email: "c@d.com" }, { email: "e@f.com" },
      ] as any}
    />);
    expect(screen.getByText(/3 manual recipients/i)).toBeInTheDocument();
  });

  it("denominator tile reads 'N of M saved companies' when companies present", () => {
    render(<PersonaPanel
      {...baseProps}
      audienceCount={2}
      selectedCompanies={[
        { company_id: "c1", name: "Alpha" },
        { company_id: "c2", name: "Beta" },
      ] as any}
    />);
    expect(screen.getByText(/2 of 290/i)).toBeInTheDocument();
  });

  it("shows 'Pick recipients' label when empty", () => {
    render(<PersonaPanel {...baseProps} />);
    expect(screen.getByText(/Pick recipients/i)).toBeInTheDocument();
  });
});
```

NOTE: the `baseProps` object needs the full required-props shape from `PersonaPanel.tsx`. Read the interface at lines 14-20 and copy any required fields (e.g. `personaId`, `personaLabel`, `onPersonaChange`, etc.) into `baseProps` with reasonable defaults before running the test.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/PersonaPanel.manualEmails.test.tsx
```

Expected: FAIL — prop not accepted, chips not rendered, dynamic denominator not implemented.

- [ ] **Step 4: Add `manualEmails` to the props interface**

Edit `frontend/src/features/outbound/components/PersonaPanel.tsx`. Find the props interface around lines 14-20. Add:

```ts
interface PersonaPanelProps {
  // ...existing fields...
  manualEmails?: Array<{ email: string }>;
}
```

(Use the same `ManualRecipient` type that `CampaignBuilder.jsx` imports if it's exported. If it's defined inline in CampaignBuilder, just use `Array<{ email: string }>` here — minimal surface needed for the chips.)

Update the function signature to destructure `manualEmails = []`:

```tsx
export function PersonaPanel({
  audienceCount,
  selectedCompanies,
  manualEmails = [],
  // ...rest
}: PersonaPanelProps) {
```

- [ ] **Step 5: Update the dynamic denominator label (around lines 95-104)**

Find the dark "0 of 290 saved" tile. Replace its label expression with the dynamic version. Pattern (adapt to the actual JSX structure in the file):

```tsx
{/* Inside the dark tile */}
{(() => {
  const hasCompanies = selectedCompanies.length > 0;
  const hasManual = manualEmails.length > 0;
  if (!hasCompanies && !hasManual) return "Pick recipients";
  if (hasCompanies && !hasManual) return `${selectedCompanies.length} of ${totalSavedCompanies} saved`;
  if (!hasCompanies && hasManual) return `${manualEmails.length} manual recipients`;
  return `${selectedCompanies.length} saved + ${manualEmails.length} manual`;
})()}
```

(The actual JSX structure may need this inlined as a small `const denominatorLabel = ...` declared at the top of the function body and then referenced inside the tile.)

- [ ] **Step 6: Render manual-email chips in the Sample · Selected box (around lines 167-191)**

Find the empty-state check `if (sample.length === 0)` (where `sample = selectedCompanies.slice(0, 6)`). Replace the empty branch with a manual-emails-first fallback:

```tsx
{(() => {
  const companySample = selectedCompanies.slice(0, 6);
  const manualSample = manualEmails.slice(0, 6);
  if (companySample.length === 0 && manualSample.length === 0) {
    return (
      <div className="text-xs text-slate-400">No recipients selected yet</div>
    );
  }
  if (companySample.length === 0) {
    // Manual-only: render email chips
    return (
      <div className="flex flex-wrap gap-1.5">
        {manualSample.map((m) => (
          <span
            key={m.email}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
          >
            <span className="text-[10px]">📧</span>
            <span className="truncate max-w-[180px]">{m.email}</span>
          </span>
        ))}
        {manualEmails.length > manualSample.length && (
          <span className="text-[11px] text-slate-400">
            +{manualEmails.length - manualSample.length} more
          </span>
        )}
      </div>
    );
  }
  // Existing company-sample render (preserve the existing JSX here).
  return (
    <div className="flex flex-col gap-1">
      {companySample.map((c) => (
        <div key={c.company_id ?? c.name} className="...existing classes...">
          {c.name}
        </div>
      ))}
    </div>
  );
})()}
```

The "...existing classes..." in the company-sample branch is whatever JSX is already there at lines 167-191. Preserve it verbatim — only the empty/manual-only branches are new.

- [ ] **Step 7: Update PersonaPanel mount in CampaignBuilder to pass manualEmails**

Edit `frontend/src/pages/CampaignBuilder.jsx` PersonaPanel mount (around lines 1138-1148):

```jsx
<PersonaPanel
  audienceCount={selectedIds.size + manualEmails.length}
  selectedCompanies={selectedCompanies}
  manualEmails={manualEmails}
  totalSavedCompanies={companies.length}
  // ...rest of existing props unchanged
/>
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/PersonaPanel.manualEmails.test.tsx
```

Expected: all 4 cases PASS.

- [ ] **Step 9: Manual smoke test**

```bash
cd frontend && npm run dev
```

Repeat Task 1's smoke test (Pick recipients → Manual emails tab → add 2 emails). Now expected:

- ForecastStrip: AUDIENCE SIZE = 2 ✓ (from Task 1)
- PersonaPanel dark tile: "2 manual recipients" ✓
- Sample · Selected box: 2 email chips with 📧 prefix ✓

Then test mixed mode (add 1 company + 1 manual): dark tile reads "1 saved + 1 manual"; Sample box renders the company (companies-first preference).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/outbound/components/PersonaPanel.tsx frontend/src/features/outbound/components/__tests__/PersonaPanel.manualEmails.test.tsx frontend/src/pages/CampaignBuilder.jsx
git commit -m "fix(campaigns): PersonaPanel renders manual-email chips + dynamic denominator

Adds optional manualEmails prop. Dynamic denominator label switches
between 'Pick recipients' / 'N of M saved' / 'N manual recipients' /
'N saved + N manual' so user always sees what they actually added.
Sample box renders email chips with 📧 prefix when manual-only.
Companies still take priority when present. 4 RTL cases."
```

---

## Task 4: Restyle Test send button to amber warning treatment

**Files:**
- Modify: `frontend/src/pages/CampaignBuilder.jsx` (lines 979-993)

- [ ] **Step 1: Confirm the current button JSX**

The current button at lines 979-993:

```jsx
<button
  type="button"
  onClick={handleTestSend}
  disabled={testSending || !primaryEmail}
  title={
    !primaryEmail
      ? "Connect a Gmail or Outlook mailbox in Settings first."
      : "Send the currently-selected email step to your inbox with sample variables."
  }
  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
  style={{ fontFamily: fontDisplay }}
>
  <FlaskConical className="h-2.5 w-2.5" />
  {testSending ? "Sending…" : "Test send"}
</button>
```

- [ ] **Step 2: Replace with amber styling**

Change only the `className` attribute:

```jsx
className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-400"
```

The rest of the JSX (icon, label, handlers, title) stays identical. Disabled state falls back to neutral white so it doesn't shout when there's no mailbox connected.

- [ ] **Step 3: Manual smoke test**

```bash
cd frontend && npm run dev
```

Load any campaign. Expected:
- Test send button: amber background, amber text, FlaskConical icon — clearly warning-toned without being alarming
- Hover: slight darken (`bg-amber-100`)
- Disabled (no mailbox): neutral white, slate text

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CampaignBuilder.jsx
git commit -m "feat(campaigns): amber styling for Test send button

Border/background/text shift to amber palette so users notice it
before clicking Launch. Disabled state falls back to neutral white
to avoid shouting when the mailbox isn't connected yet."
```

---

## Task 5: Extract LaunchButton component (no behavior change yet)

**Files:**
- Create: `frontend/src/features/outbound/components/LaunchButton.tsx`
- Create: `frontend/src/features/outbound/components/__tests__/LaunchButton.test.tsx`
- Modify: `frontend/src/pages/CampaignBuilder.jsx` (lines 1005-1025)

Extract first, restyle/add-nudge second. Keeping the diff reviewable.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/outbound/components/__tests__/LaunchButton.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LaunchButton } from "../LaunchButton";

describe("LaunchButton", () => {
  it("calls onLaunch when enabled and clicked", () => {
    const onLaunch = vi.fn();
    render(<LaunchButton onLaunch={onLaunch} canLaunch hasTestSendOccurred />);
    fireEvent.click(screen.getByRole("button", { name: /Launch/i }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it("does not call onLaunch when disabled", () => {
    const onLaunch = vi.fn();
    render(
      <LaunchButton
        onLaunch={onLaunch}
        canLaunch={false}
        disabledReason="Save the campaign first."
        hasTestSendOccurred
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Launch/i }));
    expect(onLaunch).not.toHaveBeenCalled();
  });

  it("renders 'Launching…' when launching is true", () => {
    render(<LaunchButton onLaunch={() => {}} canLaunch launching hasTestSendOccurred />);
    expect(screen.getByText(/Launching…/i)).toBeInTheDocument();
  });

  it("renders the pre-launch nudge when no test send has occurred", () => {
    render(<LaunchButton onLaunch={() => {}} canLaunch hasTestSendOccurred={false} />);
    expect(screen.getByText(/haven.t tested/i)).toBeInTheDocument();
  });

  it("does NOT render the pre-launch nudge once a test send has occurred", () => {
    render(<LaunchButton onLaunch={() => {}} canLaunch hasTestSendOccurred />);
    expect(screen.queryByText(/haven.t tested/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/LaunchButton.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/features/outbound/components/LaunchButton.tsx`:

```tsx
/**
 * LaunchButton — encapsulates Launch CTA styling, disabled-state
 * tooltip, and the pre-launch "you haven't tested" nudge.
 *
 * Brand-blue primary CTA when enabled. Disabled state degrades to
 * neutral slate with cursor-not-allowed + the disabledReason in the
 * title attribute. Pre-launch nudge renders inline above the button
 * when hasTestSendOccurred=false; persists every render until a test
 * send has been logged.
 */
import { Rocket } from "lucide-react";

interface Props {
  onLaunch: () => void;
  canLaunch: boolean;
  launching?: boolean;
  disabledReason?: string;
  hasTestSendOccurred: boolean;
}

const BRAND_BLUE = "#2563EB"; // Tailwind blue-600 — see spec note on confirming tailwind.config.js
const BRAND_BLUE_HOVER = "#1D4ED8"; // blue-700

export function LaunchButton({
  onLaunch,
  canLaunch,
  launching = false,
  disabledReason,
  hasTestSendOccurred,
}: Props) {
  const disabled = !canLaunch || launching;
  const title = disabled
    ? (disabledReason ?? "Launch unavailable")
    : "Queue recipients and start sending.";

  return (
    <div className="relative flex flex-col items-end gap-1">
      {!hasTestSendOccurred && canLaunch && !launching && (
        <div className="absolute -top-7 right-0 z-10 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 shadow-sm">
          <span aria-hidden>⚠️</span>
          You haven't tested this email yet
        </div>
      )}
      <button
        type="button"
        onClick={() => { if (!disabled) onLaunch(); }}
        disabled={disabled}
        title={title}
        className={
          disabled
            ? "inline-flex items-center gap-1 rounded-md bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm cursor-not-allowed"
            : "inline-flex items-center gap-1 rounded-md px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition"
        }
        style={
          disabled
            ? undefined
            : { backgroundColor: BRAND_BLUE }
        }
        onMouseEnter={(e) => {
          if (!disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = BRAND_BLUE_HOVER;
        }}
        onMouseLeave={(e) => {
          if (!disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = BRAND_BLUE;
        }}
      >
        <Rocket className="h-2.5 w-2.5" />
        {launching ? "Launching…" : "Launch"}
      </button>
    </div>
  );
}
```

NOTE on brand-blue: the spec recommends using `tailwind.config.js`'s `brand.blue` token if defined. Quick check:

```bash
grep -nE "brand|blue" frontend/tailwind.config.js 2>/dev/null | head -10
```

If a `brand.blue` exists, replace the inline `BRAND_BLUE = "#2563EB"` with the Tailwind class (e.g. `bg-brand-blue hover:bg-brand-blue-dark`) and drop the inline style + mouseEnter/Leave handlers. The hex fallback above is correct if no token exists.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/LaunchButton.test.tsx
```

Expected: all 5 cases PASS.

- [ ] **Step 5: Replace inline Launch button with LaunchButton in CampaignBuilder**

Edit `frontend/src/pages/CampaignBuilder.jsx`. Add to imports (near line 28):

```jsx
import { LaunchButton } from "@/features/outbound/components/LaunchButton";
```

Find the existing Launch button at lines 1005-1025. Replace the entire `<button type="button" onClick={handleLaunch} ...>...</button>` block with:

```jsx
<LaunchButton
  onLaunch={handleLaunch}
  canLaunch={canLaunch}
  launching={launching}
  disabledReason={
    !editId
      ? "Save the campaign first."
      : !primaryEmail
        ? "Connect a Gmail or Outlook mailbox in Settings first."
        : !hasRecipients
          ? "Add at least one recipient — pick a company with enriched contacts, or type emails into the Manual tab."
          : "Add at least one filled step first."
  }
  hasTestSendOccurred={hasTestSendOccurred}
/>
```

The `hasTestSendOccurred` variable doesn't exist yet — add it to the component's state with a default of `false`. The simplest approach: track it locally, flip true after `handleTestSend` succeeds. Inside the existing `handleTestSend` function (around lines 701-770), after a successful test send, add:

```jsx
setHasTestSendOccurred(true);
```

And near other useState declarations (~line 346 area):

```jsx
const [hasTestSendOccurred, setHasTestSendOccurred] = useState(false);
```

This is per-session — opening the campaign in a fresh tab resets it. Acceptable for v1; persistence across sessions can come from querying `lit_outreach_history` for test events (out of scope here, called out in the spec).

- [ ] **Step 6: Manual smoke test**

```bash
cd frontend && npm run dev
```

Open any campaign. Expected:
- Launch button: bright brand-blue background, white text, rocket icon, hover darkens to blue-700
- Disabled (e.g. no recipients): slate-200 background, slate-500 text, cursor-not-allowed, tooltip shows the reason
- Pre-launch nudge: amber chip "You haven't tested this email yet" appears above the button when enabled AND no test-send has occurred this session
- After clicking Test send (successful): chip disappears

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/outbound/components/LaunchButton.tsx frontend/src/features/outbound/components/__tests__/LaunchButton.test.tsx frontend/src/pages/CampaignBuilder.jsx
git commit -m "feat(campaigns): brand-blue Launch button + pre-launch test-first nudge

Extracts Launch into LaunchButton wrapper. Brand-blue (#2563EB) primary
CTA when enabled; slate-200 disabled state with cursor-not-allowed +
tooltip. Pre-launch nudge ('You haven't tested this email yet') renders
as an amber chip above the button until a test send has occurred in
the current session. Per-session tracking (out-of-scope: lit_outreach
historical lookup). 5 RTL cases."
```

---

## Task 6: E2E acceptance verification

**Files:**
- None (pure verification)

This is the human/manual acceptance gate before sub-project C is done.

- [ ] **Step 1: Audience count fix**

Open `/app/campaigns/new`. Open Pick recipients → Manual emails tab → add 2 emails → confirm. Expected:
- Top "AUDIENCE SIZE" tile (KpiHero or ForecastStrip): shows `2`
- PersonaPanel dark tile: shows `2 manual recipients`
- Sample · Selected box: shows 2 email chips with 📧 prefix

- [ ] **Step 2: Page overflow fix at three viewport heights**

- Resize browser to 900px tall: bottom of page reachable, no clip
- Resize to 1080px tall: same
- Resize to 1440px tall: same

- [ ] **Step 3: Test send button amber styling**

Visual: button is amber-bg/amber-text with FlaskConical icon. Hover darkens slightly. Disabled (disconnect mailbox to test) goes neutral.

- [ ] **Step 4: Launch button brand-blue + disabled states**

- Enabled: bright blue button, white text, rocket
- Hover: darker blue
- Disabled (no recipients): slate, cursor-not-allowed, tooltip explains why

- [ ] **Step 5: Pre-launch nudge**

- Fresh campaign with recipients added but no test-send: amber nudge chip visible above Launch
- Click Test send (successful): nudge disappears
- Reload page: nudge reappears (per-session tracking, expected v1 behavior)

- [ ] **Step 6: Mixed audience mode**

- Add 1 company + 1 manual email: dark tile reads "1 saved + 1 manual"; Sample box shows the company (companies take priority)

- [ ] **Step 7: Document acceptance**

```bash
git commit --allow-empty -m "chore(campaigns): sub-project C acceptance verified

All 6 polish gripes resolved. Audience count includes manual emails.
Page no longer clips. Sample box renders manual chips. Test send is
amber, Launch is brand-blue, pre-launch nudge appears when untested."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Bug 1 (Audience Size "—") | Task 1 |
| Bug 2 (Sample · Selected empty) | Task 3 |
| Bug 3 (page cuts off) | Task 2 |
| Bug 4 (Test send button) | Task 4 |
| Bug 5 (Launch button) | Task 5 |
| Bug 6 (persona panel denominator) | Task 3 (denominator label) |
| Pre-launch "test first" nudge | Task 5 |
| LaunchButton wrapper component | Task 5 |
| Variant 1 vs Variant 2 page-overflow fix | Task 2 step 1 (pre-check) + step 3 (branch) |
| Dynamic denominator: "0 of 290" / "N manual" / mixed | Task 3 step 5 |
| Sample box: companies-first preference | Task 3 step 6 |
| Brand-blue exact hex with token fallback | Task 5 step 3 (note) |

No gaps.

**Placeholder scan:** Scanned for "TODO" / "TBD" / "implement later" / "Add appropriate" / "Similar to". One pragmatic note in Task 3 step 2 ("baseProps needs the full required-props shape from PersonaPanel.tsx") — intentional because the test scaffold can't know which other props are required without reading the file. Engineer reads the interface and fills baseProps; this is a 30-second job, not a placeholder.

**Type consistency:**
- `manualEmails: Array<{ email: string }>` consistent in Tasks 1, 3
- `LaunchButton` props (`onLaunch`, `canLaunch`, `launching`, `disabledReason`, `hasTestSendOccurred`) consistent between Task 5 step 3 (impl) and step 5 (call site)
- `hasTestSendOccurred` state added in Task 5 step 5 and consumed in same task

No drift.

---

## Out of scope (deferred)

- `lit_outreach_history` query to persist `hasTestSendOccurred` across page reloads (per-session is v1)
- Multi-step composer redesign
- A/B variant editor UI
- Inline email preview rendering (currently shows token strings)
- Persona library management
