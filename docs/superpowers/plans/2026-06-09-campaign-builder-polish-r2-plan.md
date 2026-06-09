# Campaign Builder Polish Round 2 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix the page-overflow / stacked-scrollbar architecture (Variant 2 didn't solve it), apply LIT brand colors to the 6-tile KPI hero, and add a per-recipient drill-in slide-over so users can see WHO engaged with each event type.

**Architecture:** Pure frontend + 1 migration (engagement RPC). Three independent surfaces — page CSS (2-line fix), KPI hero tone system (Tile prop extension), drill-in slide-over (new component + new hook + new RPC).

**Branch:** `claude/review-dashboard-deploy-3AmMD`.

**Spec:** [docs/superpowers/specs/2026-06-09-campaign-builder-polish-r2-design.md](../specs/2026-06-09-campaign-builder-polish-r2-design.md)

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260609110000_lit_campaign_engagement_recipients_rpc.sql` | `lit_campaign_engagement_recipients` + `lit_recipient_link_clicks` RPCs |
| `frontend/src/features/outbound/hooks/useEngagementRecipients.ts` | TanStack Query wrapper for the RPC |
| `frontend/src/features/outbound/components/EngagementDrillIn.tsx` | Slide-over with recipient list + per-link expand |
| `frontend/src/features/outbound/components/__tests__/EngagementDrillIn.test.tsx` | RTL cases |
| `frontend/src/features/outbound/components/__tests__/CampaignKpiHero.tone.test.tsx` | Tone variant tests |

### Files to modify

| Path | Change |
|---|---|
| `frontend/src/pages/CampaignBuilder.jsx:920` | 2-class CSS swap (overflow + calc) |
| `frontend/src/layout/lit/AppLayout.jsx:83` | Add `min-h-0` to `<main>` (defensive) |
| `frontend/src/features/outbound/components/CampaignKpiHero.tsx` | Extend `<Tile>` with `tone` + `onClick`; compute bounce tone dynamically; wire drill-in mount |

---

## Task 1: Page overflow architecture fix

**Files:**
- Modify: `frontend/src/pages/CampaignBuilder.jsx` (locate via grep — line was 917-920 after Variant 2)
- Modify: `frontend/src/layout/lit/AppLayout.jsx` (line 83, the `<main>` element)

- [ ] **Step 1: Confirm the target line**

```bash
grep -n "h-\[calc(100vh-96px)\]" frontend/src/pages/CampaignBuilder.jsx
```
Expected: 1 hit with class string `mx-auto flex h-[calc(100vh-96px)] min-h-[640px] min-h-0 w-full max-w-[1500px] flex-col overflow-y-auto bg-[#F8FAFC]`.

- [ ] **Step 2: Replace with the correct calc + restored overflow-hidden**

Change to:
```jsx
<div className="mx-auto flex h-[calc(100vh-112px)] min-h-[640px] min-h-0 w-full max-w-[1500px] flex-col overflow-hidden bg-[#F8FAFC]">
```

Two changes:
- `100vh−96px` → `100vh−112px` (correct math: header `h-20`=80 + main `py-4`=32)
- `overflow-y-auto` → `overflow-hidden`

- [ ] **Step 3: Add `min-h-0` to AppLayout `<main>` (defensive)**

```bash
grep -n "<main className" frontend/src/layout/lit/AppLayout.jsx
```
Expected: 1 hit at line ~83 with `className="flex-1 overflow-x-hidden px-[10px] py-4"`. Change to:
```jsx
<main className="flex-1 min-h-0 overflow-x-hidden px-[10px] py-4">
```

- [ ] **Step 4: TS check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CampaignBuilder|AppLayout" | head -5
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CampaignBuilder.jsx frontend/src/layout/lit/AppLayout.jsx
git commit -m "fix(campaigns): proper flex chain — no outer scroll, columns own theirs

Variant 2 had wrong math (96 vs 112) AND outer overflow-y-auto
competed with inner column scrollers (TimelineCanvas/PersonaPanel/
StepInspector each have their own). Result: stacked scrollbars +
bottom still clipped on short viewports.

Now: outer container = 100vh-112px (correct math), overflow-hidden.
Inner 3-column grid (already flex-1 min-h-0) and its children own
all scroll. Belt-and-suspenders: AppLayout <main> gets min-h-0.

Result: exactly one scrollbar per column (Audience/Sequence/Composer),
none on the outer page. Top bar + schedule + KPI hero always visible
at natural height."
```

---

## Task 2: Brand colors on KPI hero tiles

**Files:**
- Modify: `frontend/src/features/outbound/components/CampaignKpiHero.tsx`
- Create: `frontend/src/features/outbound/components/__tests__/CampaignKpiHero.tone.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/outbound/components/__tests__/CampaignKpiHero.tone.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CampaignKpiHero } from "../CampaignKpiHero";
import type { CampaignFunnel } from "../../types";

function f(over: Partial<CampaignFunnel> = {}): CampaignFunnel {
  return {
    enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, suppressed: 0,
    openRate: null, clickRate: null, replyRate: null, bounceRate: null, lastEventAt: null,
    ...over,
  };
}

describe("CampaignKpiHero — brand tones", () => {
  afterEach(() => cleanup());

  it("Open Rate tile uses blue tone", () => {
    const funnel = f({ sent: 80, opened: 40, openRate: 50 });
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={funnel} sparkData={[]} />);
    const openTile = screen.getByText(/OPEN RATE/i).closest("div");
    expect(openTile?.className).toMatch(/blue/);
  });

  it("Click Rate tile uses indigo tone", () => {
    const funnel = f({ sent: 80, clicked: 8, clickRate: 10 });
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={funnel} sparkData={[]} />);
    const clickTile = screen.getByText(/CLICK RATE/i).closest("div");
    expect(clickTile?.className).toMatch(/indigo/);
  });

  it("Reply Rate tile uses emerald tone", () => {
    const funnel = f({ sent: 80, replied: 4, replyRate: 5 });
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={funnel} sparkData={[]} />);
    const replyTile = screen.getByText(/REPLY RATE/i).closest("div");
    expect(replyTile?.className).toMatch(/emerald/);
  });

  it("Bounce Rate tile uses neutral slate tone when rate <= 5%", () => {
    const funnel = f({ sent: 80, bounced: 2, bounceRate: 2.5 });
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={funnel} sparkData={[]} />);
    const bounceTile = screen.getByText(/BOUNCE RATE/i).closest("div");
    expect(bounceTile?.className).not.toMatch(/amber|rose/);
  });

  it("Bounce Rate tile flips amber when rate > 5%", () => {
    const funnel = f({ sent: 80, bounced: 5, bounceRate: 6.25 });
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={funnel} sparkData={[]} />);
    const bounceTile = screen.getByText(/BOUNCE RATE/i).closest("div");
    expect(bounceTile?.className).toMatch(/amber/);
  });

  it("Bounce Rate tile flips rose when rate > 10%", () => {
    const funnel = f({ sent: 80, bounced: 10, bounceRate: 12.5 });
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={funnel} sparkData={[]} />);
    const bounceTile = screen.getByText(/BOUNCE RATE/i).closest("div");
    expect(bounceTile?.className).toMatch(/rose/);
  });
});
```

- [ ] **Step 2: Verify FAIL**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/CampaignKpiHero.tone.test.tsx
```

- [ ] **Step 3: Extend `<Tile>` with tone prop + update tile usages**

Read `frontend/src/features/outbound/components/CampaignKpiHero.tsx`. Find the inline `<Tile>` component (search `function Tile`).

Add a `tone` prop. Define a tone → className map at module top:
```ts
type TileTone = "neutral" | "blue" | "indigo" | "emerald" | "amber" | "rose";

const TONE_CLASSES: Record<TileTone, { bg: string; border: string; value: string; spark: string }> = {
  neutral: { bg: "bg-white", border: "border-slate-200", value: "text-slate-900", spark: "#3B82F6" },
  blue:    { bg: "bg-blue-50/40", border: "border-blue-200", value: "text-blue-900", spark: "#3B82F6" },
  indigo:  { bg: "bg-indigo-50/40", border: "border-indigo-200", value: "text-indigo-900", spark: "#6366F1" },
  emerald: { bg: "bg-emerald-50/40", border: "border-emerald-200", value: "text-emerald-900", spark: "#10B981" },
  amber:   { bg: "bg-amber-50/40", border: "border-amber-300", value: "text-amber-900", spark: "#F59E0B" },
  rose:    { bg: "bg-rose-50/40", border: "border-rose-300", value: "text-rose-900", spark: "#F43F5E" },
};
```

Update `<Tile>` signature: `function Tile({ label, value, hint, spark, tone = "neutral", onClick }: TileProps)`. Use the tone class strings in the rendered className. The outer div becomes:
```tsx
<div
  onClick={onClick}
  className={`flex min-w-[120px] flex-col gap-1 rounded-2xl border ${classes.bg} ${classes.border} px-4 py-3 shadow-sm ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
>
```

Value text gets `text-2xl font-bold tabular-nums ${classes.value}` (bumped from semibold; value color follows tone).

Sparkline `color` prop uses `classes.spark`.

- [ ] **Step 4: Assign tones to each tile**

In the `CampaignKpiHero` function body, compute bounce tone dynamically:
```ts
const bounceTone: TileTone = (funnel?.bounceRate ?? 0) > 10
  ? "rose"
  : (funnel?.bounceRate ?? 0) > 5
    ? "amber"
    : "neutral";
```

Update each Tile usage to pass tone. Draft state stays neutral. Active state:
- Audience: `tone="neutral"`
- Sent: `tone="neutral"` (sparkline accent is brand blue already)
- Open Rate: `tone="blue"`
- Click Rate: `tone="indigo"`
- Reply Rate: `tone="emerald"`
- Bounce Rate: `tone={bounceTone}`

- [ ] **Step 5: Run tests**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/CampaignKpiHero.tone.test.tsx
```
Expected: 6/6 PASS.

Also re-run existing KpiHero tests to verify no regression:
```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/CampaignKpiHero.test.tsx
```
Expected: 4/4 still PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/outbound/components/CampaignKpiHero.tsx frontend/src/features/outbound/components/__tests__/CampaignKpiHero.tone.test.tsx
git commit -m "feat(metrics): LIT brand-color tones on KPI hero tiles

Open=blue, Click=indigo, Reply=emerald, Bounce=neutral→amber>5%
→rose>10%. Tile component accepts a `tone` prop mapped to a central
className table — single source of truth for the palette. Value
text bumped to text-2xl font-bold (was font-semibold) so numbers
read as primary content not labels. 6 Vitest cases."
```

---

## Task 3: Engagement RPCs migration

**Files:**
- Create: `supabase/migrations/20260609110000_lit_campaign_engagement_recipients_rpc.sql`

- [ ] **Step 1: Write the migration**

Create the migration:
```sql
-- 20260609110000_lit_campaign_engagement_recipients_rpc.sql
-- RPCs powering the per-recipient engagement drill-in slide-over.

BEGIN;

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

GRANT EXECUTE ON FUNCTION public.lit_campaign_engagement_recipients(uuid, text, timestamptz) TO authenticated;

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

GRANT EXECUTE ON FUNCTION public.lit_recipient_link_clicks(uuid, uuid) TO authenticated;

COMMIT;
```

NOTE: the engagement RPC assumes `lit_campaign_contacts.full_name` exists. If it doesn't (verify with `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='lit_campaign_contacts' AND column_name='full_name';`), change `coalesce(cc.full_name, cc.email)` to just `cc.email`.

- [ ] **Step 2: Apply via Supabase MCP**

`mcp__claude_ai_Supabase__apply_migration` with name `20260609110000_lit_campaign_engagement_recipients_rpc`.

- [ ] **Step 3: Verify RPCs exist + smoke-test**

```sql
SELECT proname FROM pg_proc WHERE proname IN ('lit_campaign_engagement_recipients', 'lit_recipient_link_clicks');
-- Expected: 2 rows

-- Smoke test (will return empty under service-role due to inline RLS; that's correct)
SELECT * FROM public.lit_campaign_engagement_recipients(
  '5249b682-c19b-4fab-847f-0ca8cc86edab'::uuid,
  'clicked',
  now() - interval '30 days'
);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260609110000_lit_campaign_engagement_recipients_rpc.sql
git commit -m "feat(analytics): engagement drill-in RPCs

lit_campaign_engagement_recipients(campaign_id, event_type, since)
returns per-recipient aggregates from lit_outreach_history joined
against lit_campaign_contacts. SECURITY DEFINER with inline org RLS.

lit_recipient_link_clicks(recipient_id, campaign_id) returns
per-link breakdown from lit_outreach_links for the click drill-in
expand state."
```

---

## Task 4: `useEngagementRecipients` hook

**Files:**
- Create: `frontend/src/features/outbound/hooks/useEngagementRecipients.ts`

(No standalone test — verified via EngagementDrillIn component test in Task 5.)

- [ ] **Step 1: Implement**

Create `frontend/src/features/outbound/hooks/useEngagementRecipients.ts`:

```ts
/**
 * Typed wrapper for the lit_campaign_engagement_recipients RPC.
 * Powers the per-recipient drill-in slide-over.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type EngagementEventType = "sent" | "opened" | "clicked" | "replied" | "bounced";

export interface EngagementRecipient {
  recipient_id: string;
  recipient_email: string;
  display_name: string;
  event_count: number;
  first_event_at: string;
  last_event_at: string;
}

export function useEngagementRecipients(
  campaignId: string | null | undefined,
  eventType: EngagementEventType,
  sinceDays: number = 30,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ["engagement-recipients", campaignId, eventType, sinceDays],
    enabled: enabled && Boolean(campaignId),
    queryFn: async () => {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.rpc("lit_campaign_engagement_recipients", {
        p_campaign_id: campaignId,
        p_event_type: eventType,
        p_since: since,
      });
      if (error) {
        console.warn("[useEngagementRecipients] RPC failed:", error.message);
        return [] as EngagementRecipient[];
      }
      return (data ?? []) as EngagementRecipient[];
    },
    staleTime: 30_000,
  });
}

export interface RecipientLinkClick {
  link_id: string;
  original_url: string;
  click_count: number;
  first_clicked_at: string;
  last_clicked_at: string;
}

export function useRecipientLinkClicks(
  recipientId: string | null | undefined,
  campaignId: string | null | undefined,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ["recipient-link-clicks", recipientId, campaignId],
    enabled: enabled && Boolean(recipientId) && Boolean(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lit_recipient_link_clicks", {
        p_recipient_id: recipientId,
        p_campaign_id: campaignId,
      });
      if (error) {
        console.warn("[useRecipientLinkClicks] RPC failed:", error.message);
        return [] as RecipientLinkClick[];
      }
      return (data ?? []) as RecipientLinkClick[];
    },
  });
}
```

- [ ] **Step 2: TS check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "useEngagementRecipients" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/outbound/hooks/useEngagementRecipients.ts
git commit -m "feat(analytics): useEngagementRecipients + useRecipientLinkClicks hooks

TanStack Query wrappers over lit_campaign_engagement_recipients
and lit_recipient_link_clicks RPCs. Engagement query caches 30s;
link-click query lazy (enabled prop) so it only fires when a
recipient row is expanded in the drill-in."
```

---

## Task 5: `EngagementDrillIn` component

**Files:**
- Create: `frontend/src/features/outbound/components/EngagementDrillIn.tsx`
- Create: `frontend/src/features/outbound/components/__tests__/EngagementDrillIn.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/outbound/components/__tests__/EngagementDrillIn.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const useEngagementMock = vi.hoisted(() => vi.fn());
const useLinksMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/outbound/hooks/useEngagementRecipients", () => ({
  useEngagementRecipients: useEngagementMock,
  useRecipientLinkClicks: useLinksMock,
}));

import { EngagementDrillIn } from "../EngagementDrillIn";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("EngagementDrillIn", () => {
  beforeEach(() => {
    useEngagementMock.mockReset();
    useLinksMock.mockReset();
    useLinksMock.mockReturnValue({ data: [], isLoading: false });
  });
  afterEach(() => cleanup());

  it("renders nothing when not open", () => {
    useEngagementMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(
      <EngagementDrillIn open={false} onClose={() => {}} campaignId="c1" eventType="clicked" />,
      { wrapper: wrap() },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 'who clicked' title for click event", () => {
    useEngagementMock.mockReturnValue({ data: [], isLoading: false });
    render(
      <EngagementDrillIn open onClose={() => {}} campaignId="c1" eventType="clicked" />,
      { wrapper: wrap() },
    );
    expect(screen.getByText(/clicked/i)).toBeInTheDocument();
  });

  it("renders recipient rows from the hook", () => {
    useEngagementMock.mockReturnValue({
      data: [
        { recipient_id: "r1", recipient_email: "alice@example.com", display_name: "Alice",
          event_count: 3, first_event_at: "2026-06-01T00:00:00Z", last_event_at: "2026-06-08T00:00:00Z" },
        { recipient_id: "r2", recipient_email: "bob@example.com", display_name: "Bob",
          event_count: 1, first_event_at: "2026-06-07T00:00:00Z", last_event_at: "2026-06-07T00:00:00Z" },
      ],
      isLoading: false,
    });
    render(
      <EngagementDrillIn open onClose={() => {}} campaignId="c1" eventType="clicked" />,
      { wrapper: wrap() },
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows empty state when no recipients", () => {
    useEngagementMock.mockReturnValue({ data: [], isLoading: false });
    render(
      <EngagementDrillIn open onClose={() => {}} campaignId="c1" eventType="opened" />,
      { wrapper: wrap() },
    );
    expect(screen.getByText(/no.*yet/i)).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    useEngagementMock.mockReturnValue({ data: [], isLoading: false });
    const onClose = vi.fn();
    render(
      <EngagementDrillIn open onClose={onClose} campaignId="c1" eventType="clicked" />,
      { wrapper: wrap() },
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Verify FAIL**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/EngagementDrillIn.test.tsx
```

- [ ] **Step 3: Implement**

Create `frontend/src/features/outbound/components/EngagementDrillIn.tsx`:

```tsx
/**
 * EngagementDrillIn — right-side slide-over showing per-recipient
 * engagement for a given event type (sent/opened/clicked/replied/bounced).
 * Opens from a CampaignKpiHero tile click.
 *
 * For "clicked" event type, each recipient row is expandable to show
 * the per-link breakdown (which specific URLs were clicked, how often,
 * when first/last).
 */
import { useState } from "react";
import { X, Mail, ChevronRight, ChevronDown } from "lucide-react";
import {
  useEngagementRecipients,
  useRecipientLinkClicks,
  type EngagementEventType,
} from "@/features/outbound/hooks/useEngagementRecipients";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string | null | undefined;
  eventType: EngagementEventType;
  sinceDays?: number;
}

const EVENT_TITLES: Record<EngagementEventType, string> = {
  sent: "Who received this campaign",
  opened: "Who opened",
  clicked: "Who clicked",
  replied: "Who replied",
  bounced: "Bounced recipients",
};

function formatRelativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function RecipientRow({
  campaignId,
  recipient,
  expandable,
}: {
  campaignId: string | null | undefined;
  recipient: { recipient_id: string; display_name: string; recipient_email: string; event_count: number; last_event_at: string };
  expandable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: links } = useRecipientLinkClicks(
    recipient.recipient_id,
    campaignId,
    expanded && expandable,
  );

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={() => expandable && setExpanded((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${expandable ? "hover:bg-slate-50" : "cursor-default"}`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
          {recipient.display_name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            {recipient.display_name}
          </div>
          <div className="truncate text-xs text-slate-500">{recipient.recipient_email}</div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
            {recipient.event_count}×
          </span>
          <span className="text-[10px] text-slate-400">{formatRelativeShort(recipient.last_event_at)}</span>
        </div>
        {expandable && (
          expanded ? <ChevronDown size={14} className="text-slate-400" />
                   : <ChevronRight size={14} className="text-slate-400" />
        )}
      </button>
      {expanded && expandable && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2">
          {links && links.length > 0 ? (
            <ul className="space-y-1.5">
              {links.map((l) => (
                <li key={l.link_id} className="flex items-center gap-2 text-xs">
                  <span className="inline-flex h-5 min-w-[28px] items-center justify-center rounded bg-indigo-100 px-1.5 font-semibold text-indigo-700">
                    {l.click_count}
                  </span>
                  <span className="truncate text-slate-700">{l.original_url}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-slate-400">No per-link data</div>
          )}
        </div>
      )}
    </div>
  );
}

export function EngagementDrillIn({ open, onClose, campaignId, eventType, sinceDays = 30 }: Props) {
  const { data: recipients, isLoading } = useEngagementRecipients(
    campaignId,
    eventType,
    sinceDays,
    open,
  );

  if (!open) return null;

  const isClickEvent = eventType === "clicked";

  return (
    <>
      {/* Overlay */}
      <button
        type="button"
        aria-label="Close drill-in overlay"
        className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* Slide-over */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[92vw] flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {EVENT_TITLES[eventType]}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Last {sinceDays} days · {recipients?.length ?? 0} recipient{(recipients?.length ?? 0) === 1 ? "" : "s"}
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
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-slate-400">Loading…</div>
          ) : !recipients || recipients.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-slate-400">
              <Mail size={20} className="opacity-40" />
              <div>No {eventType === "sent" ? "sends" : eventType + "s"} yet in the last {sinceDays} days</div>
            </div>
          ) : (
            recipients.map((r) => (
              <RecipientRow
                key={r.recipient_id}
                campaignId={campaignId}
                recipient={r}
                expandable={isClickEvent}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 4: Verify PASS**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/EngagementDrillIn.test.tsx
```
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/outbound/components/EngagementDrillIn.tsx frontend/src/features/outbound/components/__tests__/EngagementDrillIn.test.tsx
git commit -m "feat(analytics): EngagementDrillIn slide-over

Right-side panel showing per-recipient engagement for a given
event type. Each recipient row: avatar/initial + name + email +
event count badge + last-event timestamp. Click rows in 'clicked'
mode expand to show per-link breakdown (URL + click count) from
lit_outreach_links. 5 RTL cases."
```

---

## Task 6: Wire drill-in into CampaignKpiHero

**Files:**
- Modify: `frontend/src/features/outbound/components/CampaignKpiHero.tsx`

- [ ] **Step 1: Make `<Tile>` accept onClick (already done in Task 2)**

Confirm the `onClick` prop is wired to the outer div with `cursor-pointer hover:shadow-md` when defined.

- [ ] **Step 2: Add drill-in state + import in CampaignKpiHero**

At the top of the file, add:
```tsx
import { useState } from "react";
import { EngagementDrillIn } from "./EngagementDrillIn";
import type { EngagementEventType } from "../hooks/useEngagementRecipients";
```

In the `CampaignKpiHero` function body, add a state slot. The hero needs to know the current campaign's ID to drill into; add it as a new prop:

Update the `Props` interface:
```ts
interface Props {
  status: CampaignStatus;
  audienceCount: number;
  funnel: CampaignFunnel | null;
  sparkData: number[];
  scheduledLabel?: string;
  campaignId?: string | null; // NEW
}
```

And the destructure:
```tsx
export function CampaignKpiHero({
  status,
  audienceCount,
  funnel,
  sparkData,
  scheduledLabel,
  campaignId,
}: Props) {
```

Add state at top of function body:
```tsx
const [drill, setDrill] = useState<EngagementEventType | null>(null);
```

- [ ] **Step 3: Wire each metric tile's onClick**

For each of the 5 metric tiles in the active branch (Sent / Open Rate / Click Rate / Reply Rate / Bounce Rate), add `onClick`. Only enable when funnel exists AND the relevant count > 0:

```tsx
<Tile
  label="Sent"
  value={formatCount(funnel?.sent ?? null)}
  spark={sparkData}
  tone="neutral"
  onClick={campaignId && (funnel?.sent ?? 0) > 0 ? () => setDrill("sent") : undefined}
/>
<Tile
  label="Open Rate"
  value={formatRate(funnel?.openRate ?? null)}
  hint={funnel ? `${formatCount(funnel.opened)} opened` : undefined}
  tone="blue"
  onClick={campaignId && (funnel?.opened ?? 0) > 0 ? () => setDrill("opened") : undefined}
/>
<Tile
  label="Click Rate"
  value={formatRate(funnel?.clickRate ?? null)}
  hint={funnel ? `${formatCount(funnel.clicked)} clicked` : undefined}
  tone="indigo"
  onClick={campaignId && (funnel?.clicked ?? 0) > 0 ? () => setDrill("clicked") : undefined}
/>
<Tile
  label="Reply Rate"
  value={formatRate(funnel?.replyRate ?? null)}
  hint={funnel ? `${formatCount(funnel.replied)} replied` : undefined}
  tone="emerald"
  onClick={campaignId && (funnel?.replied ?? 0) > 0 ? () => setDrill("replied") : undefined}
/>
<Tile
  label="Bounce Rate"
  value={formatRate(funnel?.bounceRate ?? null)}
  hint={funnel ? `${formatCount(funnel.bounced)} bounced` : undefined}
  tone={bounceTone}
  onClick={campaignId && (funnel?.bounced ?? 0) > 0 ? () => setDrill("bounced") : undefined}
/>
```

- [ ] **Step 4: Mount the drill-in at the bottom of the return JSX**

After the closing `</div>` of the tiles grid (still inside the relative container), add:
```tsx
<EngagementDrillIn
  open={drill !== null}
  onClose={() => setDrill(null)}
  campaignId={campaignId ?? null}
  eventType={drill ?? "clicked"}
/>
```

(The `?? "clicked"` is a fallback for when `open=false`; the eventType prop is required but won't render.)

- [ ] **Step 5: Update the CampaignBuilder mount to pass campaignId**

Find the `<CampaignKpiHero ... />` mount in `frontend/src/pages/CampaignBuilder.jsx`:
```bash
grep -n "<CampaignKpiHero" frontend/src/pages/CampaignBuilder.jsx
```

Add the prop:
```jsx
<CampaignKpiHero
  status={...}
  audienceCount={...}
  funnel={campaignFunnel}
  sparkData={campaignSparkData}
  campaignId={editId}
/>
```

- [ ] **Step 6: TS check + run all hero tests**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CampaignKpiHero|CampaignBuilder|EngagementDrillIn" | head -10
cd frontend && npx vitest run src/features/outbound/components/__tests__/CampaignKpiHero
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/outbound/components/CampaignKpiHero.tsx frontend/src/pages/CampaignBuilder.jsx
git commit -m "feat(analytics): tile-click drill-in wired into KpiHero

Each metric tile is clickable when funnel data exists AND that
metric > 0 (e.g. Click Rate clickable only if clicked > 0).
Opens EngagementDrillIn slide-over scoped to that event_type.
campaignId threaded from CampaignBuilder."
```

---

## Task 7: Acceptance verification

**Files:** none — manual checks.

- [ ] **Step 1: Page overflow**

Open `/app/campaigns/<id>` at viewport heights 800 / 1080 / 1440. Verify:
- No outer page scrollbar
- Each of the 3 columns (Audience / Sequence / Composer) scrolls independently when its content overflows
- Top bar + schedule row + KPI hero always visible at natural height

- [ ] **Step 2: KPI tile colors**

Open any active campaign. Verify visually:
- Open Rate tile: light blue tint, blue value text
- Click Rate tile: light indigo tint, indigo value text
- Reply Rate tile: light emerald tint, emerald value text
- Bounce Rate tile: neutral white (if ≤5% bounce), amber (>5%), rose (>10%)
- Cursor changes to pointer when hovering tiles that have > 0 events

- [ ] **Step 3: Drill-in**

Click the Click Rate tile on Test Campaign 1 (has 2 clicked events).
- Slide-over opens from the right
- Shows recipients who clicked (should be the user who clicked — vraymond@logisticintel.com)
- Click row → expands per-link breakdown
- Close (X button OR overlay click) → slide-over closes

Click each other clickable tile (Sent / Open / Reply / Bounce) — verify each opens with appropriate title.

- [ ] **Step 4: Commit acceptance**

```bash
git commit --allow-empty -m "chore(campaigns): round 2 F shipped — page overflow + brand colors + drill-in

Single-scrollbar layout, branded KPI tiles, per-recipient engagement
drill-in via tile click. Ready for sub-project G (conditional
sequences — architecture spec already shipped, no plan yet)."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Fix 1 — Page overflow architecture | Task 1 |
| Fix 2 — Brand colors on KPI hero | Task 2 |
| Fix 3 — Per-recipient drill-in | Tasks 3, 4, 5, 6 |

No gaps.

**Placeholder scan:** Clean.

**Type consistency:** `EngagementEventType` defined in hooks/useEngagementRecipients (Task 4), consumed by EngagementDrillIn (Task 5) and CampaignKpiHero (Task 6). `TileTone` defined in CampaignKpiHero (Task 2); consistent through tone tests (Task 2) and onClick wires (Task 6). RPC names + signatures consistent between migration (Task 3) and client (Task 4).

---

## Out of scope (deferred)

- Conditional sequences (Sub-project G — architecture only)
- Drill-in for `suppressed` events (admin concern, not visible enough to merit a tile)
- Configurable date range on drill-in (hardcoded 30 days for v1)
- Recipient export from drill-in (CSV download — future enhancement)
- Mobile responsive drill-in layout (desktop-only for v1)
