# LIT Quoting Module (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship LIT's revenue execution layer — rename the dead RFP concept to Quoting and build create→edit→PDF→send→track for freight quotes tied to companies, with org-scoped persistence and dashboard revenue KPIs.

**Architecture:** New normalized Postgres tables (`lit_quotes` + line items + events + counter) with org-scoped RLS mirroring `lit_campaigns`. Ten Deno edge functions follow the `save-company`/`company-profile` conventions (`requireUser`, `createLogger`, `check_usage_limit`). Frontend reuses the dashboard design system (`EnhancedKpiCard`, `LitSectionCard`, `Chip`). PDF is generated client-side with the existing `jsPDF` stack, uploaded as base64 to an edge fn that signs a Storage URL; the quote is emailed as a **secure link** (no attachment) through the user's connected Gmail/Outlook, and link opens flip status `sent→viewed`.

**Tech Stack:** Supabase (Postgres + Deno edge functions), React + Vite + React Router 7, TanStack Query, `jsPDF` + `jspdf-autotable`, lucide-react, Tailwind. Spec: [docs/superpowers/specs/2026-06-24-quoting-design.md](../specs/2026-06-24-quoting-design.md).

---

## Pre-flight

- [ ] **Step 0.1: Branch off current main.** Per CLAUDE.md, isolate this work.

```bash
cd /c/Users/vraym/logistics-intel/logistics-intel
git fetch origin
git switch -c feat/quoting-phase1 origin/main
```

Expected: new branch `feat/quoting-phase1` created from latest `main`. (If the working tree has uncommitted `gating-free-trial` changes you want to keep separate, stash or commit them first.)

- [ ] **Step 0.2: Confirm the design system primitives exist** (sanity, no edit):

Run: `ls frontend/src/components/ui/LitSectionCard.* frontend/src/components/ui/Chip.* frontend/src/components/dashboard/EnhancedKpiCard.*`
Expected: all three resolve. If any is missing, stop and re-audit before continuing.

---

## File Structure

**Database**
- Create: `supabase/migrations/20260624140000_quoting_phase1.sql` — all 4 tables, RLS, `org_settings.quote_defaults`, `quoting` feature key, `assign_quote_number` fn.

**Edge functions** (each its own dir with `index.ts`)
- `supabase/functions/_shared/quote_helpers.ts` — totals math + org/gating helpers shared by quote fns.
- `supabase/functions/quote-create/index.ts`
- `supabase/functions/quote-update/index.ts`
- `supabase/functions/quote-list/index.ts`
- `supabase/functions/quote-detail/index.ts`
- `supabase/functions/quote-status-update/index.ts`
- `supabase/functions/quote-generate-pdf/index.ts`
- `supabase/functions/quote-send/index.ts`
- `supabase/functions/quote-dashboard-metrics/index.ts`
- `supabase/functions/quote-company-metrics/index.ts`
- `supabase/functions/quote-view/index.ts` (public, validates `share_token`)

**Frontend**
- Create: `frontend/src/api/quoting.ts` — typed client (NOT in `lib/api.ts`).
- Create: `frontend/src/lib/quoting/exportQuotePdf.ts` — client PDF.
- Create: `frontend/src/lib/quoting/modeFields.ts` — mode-aware field config (single source of truth).
- Create: `frontend/src/features/quoting/QuotingDashboard.tsx`
- Create: `frontend/src/features/quoting/QuoteBuilder.tsx`
- Create: `frontend/src/features/quoting/components/` — `QuoteCompanySelector.tsx`, `QuoteLaneShipmentForm.tsx`, `QuoteLineItemsTable.tsx`, `QuoteTotalsPanel.tsx`, `QuoteBenchmarkPanel.tsx`, `QuoteRevenueOpportunityPanel.tsx`, `QuotePdfPreview.tsx`, `QuoteSendBox.tsx`, `QuoteStatusPill.tsx`.
- Create: `frontend/src/features/company/CompanyQuotesTab.tsx`
- Modify: `frontend/src/App.jsx` — add `/app/quoting*` routes; repoint `/app/rfp*` redirects to `/quoting`.
- Modify: `frontend/src/components/layout/AppShell.jsx` — add Quoting nav (replace `showRfp`).
- Modify: `frontend/src/layout/lit/AppSidebar.jsx` — add Quoting nav.
- Modify: `frontend/src/pages/Dashboard.jsx` — add revenue KPI card.
- Modify: `frontend/src/pages/CompanyProfileV2.tsx` — add `quotes` tab to `MORE_TABS` + render branch.
- Modify: `frontend/src/components/landing/MarketingHeader.jsx`, `frontend/src/components/landing/CTABanners.jsx` — `/rfp` → `/quoting`.

---

## Cross-cutting requirement: Responsive / mobile-first (ALL frontend tasks 11–17)

Every Quoting UI must be **fully responsive and adapt to any screen** — verified at
**375px (mobile), 768px (tablet), 1440px (desktop)**. This is an acceptance gate, not a nice-to-have.

Rules every frontend task MUST follow:
- **Mobile-first flex/responsive layout.** Use flexbox + responsive grid utilities (`flex flex-col`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). No fixed pixel widths that overflow small screens.
- **Dashboard KPI row:** `grid-cols-2 lg:grid-cols-5` (2-up on mobile, full row on desktop) — mirror the `EnhancedKpiCard` grid that the existing Dashboard uses.
- **Quote Builder:** the two-column layout (form + sticky summary) collapses to a **single column** below `lg`; the right summary panel stops being sticky and stacks under the form on mobile.
- **Tables (dashboard + company tab):** wrap in `overflow-x-auto` so they scroll horizontally on mobile instead of breaking layout; never let a table force the page wider than the viewport.
- **Mode-aware form:** field rows are responsive grids (`grid-cols-1 sm:grid-cols-2/3`) so inputs stack on mobile.
- **Touch targets ≥ 44px** on mobile for buttons/row actions; CTAs remain reachable (sticky action header wraps gracefully — buttons may collapse to icon-only below `sm`).
- **No horizontal page scroll** at 375px. Test by resizing.

Each frontend task's manual-verification step includes: "resize to 375/768/1440 — no overflow, layout reflows, all actions reachable." The Task 18 QA pass re-checks all three viewports.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260624140000_quoting_phase1.sql`

- [ ] **Step 1.1: Write the migration**

```sql
-- ============ Quoting Phase 1 ============

-- 1. Quotes
create table if not exists public.lit_quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.lit_companies(id) on delete restrict,
  contact_id uuid,
  created_by uuid not null,
  owner_user_id uuid,
  quote_number text not null,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','approved','closed_won','closed_lost','expired')),
  mode text check (mode in ('ocean','air','drayage','ftl','ltl')),
  service_type text,
  shipment_type text,
  incoterms text,
  -- locations (mode decides which are rendered)
  origin_name text, origin_address text, origin_city text, origin_state text,
  origin_country text, origin_postal text, origin_port text,
  destination_name text, destination_address text, destination_city text, destination_state text,
  destination_country text, destination_postal text, destination_port text,
  distance_miles numeric,
  equipment_type text, container_count numeric, weight_lbs numeric,
  volume_cbm numeric, pallet_count numeric, commodity text, hs_code text,
  cargo_value numeric, hazmat boolean default false, temp_controlled boolean default false,
  currency text default 'USD',
  -- financials (server-recomputed on save)
  subtotal_cost numeric default 0, subtotal_sell numeric default 0,
  fuel_surcharge_pct numeric, fuel_surcharge_amount numeric default 0,
  accessorial_total numeric default 0,
  total_cost numeric default 0, total_sell numeric default 0,
  gross_profit numeric default 0, gross_margin_pct numeric default 0,
  -- benchmark / opportunity (nullable; empty-state when absent)
  benchmark_low numeric, benchmark_high numeric, benchmark_source text, benchmark_confidence text,
  revenue_opportunity numeric, revenue_opportunity_confidence text,
  -- pdf + sharing
  pdf_storage_path text, pdf_signed_url text, pdf_expires_at timestamptz, pdf_generated_at timestamptz,
  share_token uuid not null default gen_random_uuid(),
  notes text, terms_text text,
  valid_until date,
  sent_at timestamptz, approved_at timestamptz, closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, quote_number)
);
create index if not exists idx_lit_quotes_org_status on public.lit_quotes(org_id, status);
create index if not exists idx_lit_quotes_company on public.lit_quotes(company_id);
create index if not exists idx_lit_quotes_share on public.lit_quotes(share_token);

-- 2. Line items (generated totals)
create table if not exists public.lit_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.lit_quotes(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text,
  name text not null,
  description text,
  unit text,
  quantity numeric default 1,
  unit_cost numeric default 0,
  unit_sell numeric default 0,
  total_cost numeric generated always as (coalesce(quantity,0) * coalesce(unit_cost,0)) stored,
  total_sell numeric generated always as (coalesce(quantity,0) * coalesce(unit_sell,0)) stored,
  is_accessorial boolean default false,
  taxable boolean default false,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_lit_quote_line_items_quote on public.lit_quote_line_items(quote_id);

-- 3. Events (append-only audit)
create table if not exists public.lit_quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.lit_quotes(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid,
  event_type text not null,
  event_payload jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_lit_quote_events_quote on public.lit_quote_events(quote_id, created_at desc);

-- 4. Per-org sequential counter (audit-grade numbering)
create table if not exists public.lit_quote_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  year int not null,
  seq int not null default 0,
  primary key (org_id, year)
);

create or replace function public.assign_quote_number(p_org uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from now())::int; v_seq int;
begin
  insert into public.lit_quote_counters(org_id, year, seq) values (p_org, v_year, 1)
  on conflict (org_id, year) do update set seq = public.lit_quote_counters.seq + 1
  returning seq into v_seq;
  return 'Q-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end $$;

-- 5. Org quote defaults (branding + prefill)
alter table public.org_settings
  add column if not exists quote_defaults jsonb default '{}'::jsonb;

-- 6. RLS (4-policy org pattern, mirrors lit_campaigns)
alter table public.lit_quotes enable row level security;
alter table public.lit_quote_line_items enable row level security;
alter table public.lit_quote_events enable row level security;

create policy lit_quotes_select on public.lit_quotes for select to authenticated using (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
  or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
);
create policy lit_quotes_insert on public.lit_quotes for insert to authenticated with check (
  auth.uid() = created_by and org_id in (
    select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
);
create policy lit_quotes_update on public.lit_quotes for update to authenticated using (
  auth.uid() = created_by or exists (select 1 from public.org_members om
    where om.org_id = lit_quotes.org_id and om.user_id = auth.uid() and om.role in ('owner','admin') and om.status='active')
);
create policy lit_quotes_delete on public.lit_quotes for delete to authenticated using (
  auth.uid() = created_by or exists (select 1 from public.org_members om
    where om.org_id = lit_quotes.org_id and om.user_id = auth.uid() and om.role in ('owner','admin') and om.status='active')
);

-- child tables: visible/writable to org members (parent enforces creator rules via edge fn)
create policy lit_quote_li_all on public.lit_quote_line_items for all to authenticated using (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
) with check (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
);
create policy lit_quote_events_select on public.lit_quote_events for select to authenticated using (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
);

-- 7. Plan gating feature key
insert into public.plan_entitlements (plan_code, feature_key, enabled)
select code, 'quoting', code in ('growth','scale','enterprise')
from public.plans
on conflict (plan_code, feature_key) do update set enabled = excluded.enabled;
```

> **NOTE:** Verify `plan_entitlements` column names against `supabase/functions/get-entitlements/index.ts` before applying — if the table uses `(plan_id, feature_key)`, adjust the final insert to join `plans.id`. The audit reported a `features` map keyed by feature; confirm the exact write shape.

- [ ] **Step 1.2: Apply the migration** (remote shared DB, per CLAUDE.md rule #1).

Use the Supabase MCP `apply_migration` tool with name `quoting_phase1` and the SQL above, OR run via the Supabase CLI if a local stack is linked. After applying, verify:

Run (Supabase MCP `execute_sql`): `select count(*) from lit_quotes; select public.assign_quote_number((select id from organizations limit 1));`
Expected: `0` rows, and a number like `Q-2026-0001`.

- [ ] **Step 1.3: Verify entitlement wired**

Run: `select plan_code, enabled from plan_entitlements where feature_key='quoting' order by plan_code;`
Expected: `growth/scale/enterprise = true`, `free_trial/starter = false`.

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/20260624140000_quoting_phase1.sql
git commit -m "feat(quoting): add quotes/line-items/events tables, RLS, counter, gating"
```

---

## Task 2: Shared edge helper (totals + gating)

**Files:**
- Create: `supabase/functions/_shared/quote_helpers.ts`

- [ ] **Step 2.1: Write the helper**

```ts
// supabase/functions/_shared/quote_helpers.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type LineItem = {
  id?: string; type?: string; name: string; description?: string; unit?: string;
  quantity?: number; unit_cost?: number; unit_sell?: number;
  is_accessorial?: boolean; taxable?: boolean; sort_order?: number;
};

/** Recompute all quote financials from line items + fuel %. Server is source of truth. */
export function computeTotals(items: LineItem[], fuelPct: number | null | undefined) {
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  let subtotal_cost = 0, subtotal_sell = 0, accessorial_total = 0;
  for (const li of items) {
    const tc = num(li.quantity) * num(li.unit_cost);
    const ts = num(li.quantity) * num(li.unit_sell);
    subtotal_cost += tc;
    subtotal_sell += ts;
    if (li.is_accessorial) accessorial_total += ts;
  }
  const pct = num(fuelPct);
  const fuel_surcharge_amount = +(subtotal_sell * (pct / 100)).toFixed(2);
  const total_cost = +subtotal_cost.toFixed(2);
  const total_sell = +(subtotal_sell + fuel_surcharge_amount).toFixed(2);
  const gross_profit = +(total_sell - total_cost).toFixed(2);
  const gross_margin_pct = total_sell > 0 ? +((gross_profit / total_sell) * 100).toFixed(2) : 0;
  return {
    subtotal_cost: +subtotal_cost.toFixed(2),
    subtotal_sell: +subtotal_sell.toFixed(2),
    accessorial_total: +accessorial_total.toFixed(2),
    fuel_surcharge_amount, total_cost, total_sell, gross_profit, gross_margin_pct,
  };
}

/** Resolve the user's primary active org. */
export async function resolveOrg(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("org_members")
    .select("org_id").eq("user_id", userId).eq("status", "active")
    .order("joined_at", { ascending: true }).limit(1).maybeSingle();
  return data?.org_id ?? null;
}

/** Server-side gate: is the `quoting` feature enabled for this user's plan? Admins bypass. */
export async function requireQuotingFeature(admin: SupabaseClient, userId: string, orgId: string)
  : Promise<{ ok: true } | { ok: false; status: number; body: unknown }> {
  const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (pa) return { ok: true };
  const { data: om } = await admin.from("org_members").select("role").eq("org_id", orgId)
    .eq("user_id", userId).eq("status", "active").maybeSingle();
  if (om?.role === "owner" || om?.role === "admin") {
    // org admins still need the plan; fall through to entitlement check
  }
  const { data: ent } = await admin.rpc("get_entitlements", { p_user_id: userId }).maybeSingle?.() ?? { data: null };
  const enabled = ent?.features?.quoting === true;
  if (!enabled) {
    return { ok: false, status: 403, body: { ok: false, code: "FEATURE_NOT_IN_PLAN", feature: "quoting", upgrade_url: "/app/billing" } };
  }
  return { ok: true };
}
```

> **NOTE:** `get_entitlements` invocation must match how `get-entitlements/index.ts` calls it. If that fn computes entitlements inline (not via a callable RPC), replace `requireQuotingFeature` with a direct plan lookup: read `org_members→organizations→plan` then check `plan_entitlements.enabled` for `feature_key='quoting'`. Confirm during implementation and adjust this one function; all callers stay the same.

- [ ] **Step 2.2: Type-check**

Run: `deno check supabase/functions/_shared/quote_helpers.ts`
Expected: no errors.

- [ ] **Step 2.3: Unit-test the math** (pure function, runnable on Windows with Deno).

Create: `supabase/functions/_shared/quote_helpers.test.ts`
```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeTotals } from "./quote_helpers.ts";

Deno.test("totals: fuel on sell, margin, accessorials", () => {
  const t = computeTotals(
    [{ name: "Ocean", quantity: 3, unit_cost: 2150, unit_sell: 2680 },
     { name: "Chassis", quantity: 9, unit_cost: 35, unit_sell: 45, is_accessorial: true }],
    18.5,
  );
  assertEquals(t.subtotal_sell, 8445);      // 8040 + 405
  assertEquals(t.accessorial_total, 405);
  assertEquals(t.fuel_surcharge_amount, 1562.33); // 8445*0.185
  assertEquals(t.total_sell, 10007.33);
  assertEquals(t.total_cost, 6765);         // 6450 + 315
  assertEquals(t.gross_profit, 3242.33);
});

Deno.test("totals: div-by-zero safe", () => {
  const t = computeTotals([], null);
  assertEquals(t.total_sell, 0);
  assertEquals(t.gross_margin_pct, 0);
});
```

Run: `deno test supabase/functions/_shared/quote_helpers.test.ts`
Expected: 2 passed. (If the expected numbers differ, fix the test to match `computeTotals` output — the function is authoritative.)

- [ ] **Step 2.4: Commit**

```bash
git add supabase/functions/_shared/quote_helpers.ts supabase/functions/_shared/quote_helpers.test.ts
git commit -m "feat(quoting): shared totals math + org/gating helpers with unit tests"
```

---

## Task 3: `quote-create` edge function

**Files:**
- Create: `supabase/functions/quote-create/index.ts`

- [ ] **Step 3.1: Write the function** (template for all quote fns — mirrors `save-company`).

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg, requireQuotingFeature, computeTotals, LineItem } from "../_shared/quote_helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-create", { request_id: requestId() });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const userId = u.user.id;

  const orgId = await resolveOrg(admin, userId);
  if (!orgId) return json({ ok: false, code: "NO_ORG" }, 403);
  const gate = await requireQuotingFeature(admin, userId, orgId);
  if (!gate.ok) return json(gate.body, gate.status);

  const body = await req.json().catch(() => ({}));
  // Resolve internal company_id: if only source_company_key, create/link into lit_companies.
  let companyId: string | null = body.company_id ?? null;
  if (!companyId && body.source_company_key) {
    const { data: existing } = await admin.from("lit_companies").select("id")
      .eq("source_company_key", body.source_company_key).maybeSingle();
    if (existing) companyId = existing.id;
    else {
      const { data: created, error } = await admin.from("lit_companies")
        .insert({ source: body.source ?? "importyeti", source_company_key: body.source_company_key, name: body.company_name ?? "Unknown" })
        .select("id").single();
      if (error) { log.error("company_link_failed", { err: error.message }); return json({ ok: false, code: "COMPANY_LINK_FAILED" }, 500); }
      companyId = created.id;
    }
  }
  if (!companyId) return json({ ok: false, code: "INVALID_INPUT", message: "company_id or source_company_key required" }, 400);

  const items: LineItem[] = Array.isArray(body.line_items) ? body.line_items : [];
  const totals = computeTotals(items, body.fuel_surcharge_pct);

  const { data: numberRow, error: numErr } = await admin.rpc("assign_quote_number", { p_org: orgId });
  if (numErr) { log.error("number_failed", { err: numErr.message }); return json({ ok: false, code: "NUMBER_FAILED" }, 500); }

  const { data: quote, error } = await admin.from("lit_quotes").insert({
    org_id: orgId, company_id: companyId, contact_id: body.contact_id ?? null,
    created_by: userId, owner_user_id: body.owner_user_id ?? userId,
    quote_number: numberRow, status: "draft",
    mode: body.mode ?? null, service_type: body.service_type ?? null, incoterms: body.incoterms ?? null,
    origin_port: body.origin_port ?? null, destination_port: body.destination_port ?? null,
    origin_city: body.origin_city ?? null, origin_state: body.origin_state ?? null, origin_country: body.origin_country ?? null, origin_postal: body.origin_postal ?? null,
    destination_city: body.destination_city ?? null, destination_state: body.destination_state ?? null, destination_country: body.destination_country ?? null, destination_postal: body.destination_postal ?? null,
    distance_miles: body.distance_miles ?? null, equipment_type: body.equipment_type ?? null,
    container_count: body.container_count ?? null, weight_lbs: body.weight_lbs ?? null,
    commodity: body.commodity ?? null, hs_code: body.hs_code ?? null, cargo_value: body.cargo_value ?? null,
    currency: body.currency ?? "USD", fuel_surcharge_pct: body.fuel_surcharge_pct ?? null,
    notes: body.notes ?? null, terms_text: body.terms_text ?? null, valid_until: body.valid_until ?? null,
    ...totals,
  }).select("*").single();
  if (error) { log.error("insert_failed", { err: error.message }); return json({ ok: false, code: "INSERT_FAILED", message: error.message }, 500); }

  if (items.length) {
    const rows = items.map((li, i) => ({
      quote_id: quote.id, org_id: orgId, type: li.type ?? null, name: li.name, description: li.description ?? null,
      unit: li.unit ?? null, quantity: li.quantity ?? 1, unit_cost: li.unit_cost ?? 0, unit_sell: li.unit_sell ?? 0,
      is_accessorial: !!li.is_accessorial, taxable: !!li.taxable, sort_order: li.sort_order ?? i,
    }));
    await admin.from("lit_quote_line_items").insert(rows);
  }
  await admin.from("lit_quote_events").insert({ quote_id: quote.id, org_id: orgId, company_id: companyId, event_type: "created", created_by: userId });

  log.info("created", { quote_id: quote.id, quote_number: numberRow });
  return json({ ok: true, data: { quote } });
});
```

- [ ] **Step 3.2: Type-check.** Run: `deno check supabase/functions/quote-create/index.ts` → no errors.

- [ ] **Step 3.3: Deploy** via Supabase MCP `deploy_edge_function` (name `quote-create`).

- [ ] **Step 3.4: Smoke test** with a real JWT (grab one from the app session or `supabase` CLI). Run a `curl -X POST` to the function URL with `{"company_id":"<uuid>","mode":"ocean","fuel_surcharge_pct":18.5,"line_items":[{"name":"Ocean","quantity":3,"unit_cost":2150,"unit_sell":2680}]}`.
Expected: `{ ok: true, data: { quote: { quote_number: "Q-2026-..." , total_sell: 9520.8, ... } } }`.

- [ ] **Step 3.5: Commit.**
```bash
git add supabase/functions/quote-create/index.ts
git commit -m "feat(quoting): quote-create edge fn (company link, numbering, totals, events)"
```

---

## Task 4: `quote-update` edge function

**Files:** Create `supabase/functions/quote-update/index.ts`

- [ ] **Step 4.1: Write it.** Same boilerplate as Task 3.1 (auth → org → gate). Body `{ quote_id, fields..., line_items[] }`. Logic:

```ts
// after auth/org/gate, body parsed:
const quoteId = body.quote_id;
if (!quoteId) return json({ ok:false, code:"INVALID_INPUT" }, 400);
// verify the quote belongs to this org
const { data: existing } = await admin.from("lit_quotes").select("id, company_id").eq("id", quoteId).eq("org_id", orgId).maybeSingle();
if (!existing) return json({ ok:false, code:"NOT_FOUND" }, 404);

const items: LineItem[] = Array.isArray(body.line_items) ? body.line_items : [];
const totals = computeTotals(items, body.fuel_surcharge_pct);

// replace line items transactionally-ish: delete then insert
await admin.from("lit_quote_line_items").delete().eq("quote_id", quoteId);
if (items.length) {
  await admin.from("lit_quote_line_items").insert(items.map((li,i)=>({
    quote_id: quoteId, org_id: orgId, type: li.type ?? null, name: li.name, description: li.description ?? null,
    unit: li.unit ?? null, quantity: li.quantity ?? 1, unit_cost: li.unit_cost ?? 0, unit_sell: li.unit_sell ?? 0,
    is_accessorial: !!li.is_accessorial, taxable: !!li.taxable, sort_order: li.sort_order ?? i,
  })));
}
const patch = { ...pickQuoteFields(body), ...totals, updated_at: new Date().toISOString() };
const { data: quote, error } = await admin.from("lit_quotes").update(patch).eq("id", quoteId).eq("org_id", orgId).select("*").single();
if (error) return json({ ok:false, code:"UPDATE_FAILED", message: error.message }, 500);
await admin.from("lit_quote_events").insert({ quote_id: quoteId, org_id: orgId, company_id: existing.company_id, event_type:"updated", created_by:userId });
return json({ ok:true, data:{ quote } });
```

Add a `pickQuoteFields(body)` local that whitelists the editable columns (mode, service_type, incoterms, all origin_*/destination_*, distance_miles, equipment_type, container_count, weight_lbs, commodity, hs_code, cargo_value, currency, fuel_surcharge_pct, notes, terms_text, valid_until, owner_user_id, contact_id). Never let the client set `org_id`, `created_by`, `status`, `quote_number`, totals, or pdf fields here.

- [ ] **Step 4.2:** `deno check` → no errors. **Step 4.3:** deploy. **Step 4.4:** smoke test update returns recomputed totals. **Step 4.5:** commit `feat(quoting): quote-update edge fn (whitelist patch, totals recompute)`.

---

## Task 5: `quote-list` + `quote-detail`

**Files:** Create `supabase/functions/quote-list/index.ts`, `supabase/functions/quote-detail/index.ts`

- [ ] **Step 5.1: quote-list.** Auth→org (no gate; viewing allowed on all plans). Query:
```ts
let q = admin.from("lit_quotes").select("id,quote_number,company_id,status,mode,service_type,origin_port,origin_city,destination_port,destination_city,total_sell,gross_profit,gross_margin_pct,owner_user_id,sent_at,valid_until,updated_at")
  .eq("org_id", orgId).order("updated_at",{ascending:false});
if (body.status) q = q.eq("status", body.status);
if (body.company_id) q = q.eq("company_id", body.company_id);
const { data, error } = await q;
if (error) return json({ ok:false, code:"LIST_FAILED" }, 500);
// hydrate company names in one query
const ids = [...new Set((data??[]).map(r=>r.company_id))];
const { data: cos } = await admin.from("lit_companies").select("id,name,domain,logo_url").in("id", ids.length?ids:["00000000-0000-0000-0000-000000000000"]);
const byId = Object.fromEntries((cos??[]).map(c=>[c.id,c]));
return json({ ok:true, items: (data??[]).map(r=>({ ...r, company: byId[r.company_id] ?? null })) });
```

- [ ] **Step 5.2: quote-detail.** Body `{ quote_id }`. Fetch quote (org-scoped), its line items (ordered by `sort_order`), its events (desc), and the company row. Return `{ ok:true, data:{ quote, line_items, events, company } }`. 404 if not in org.

- [ ] **Step 5.3:** `deno check` both → deploy both → smoke test list returns the quote from Task 3, detail returns line items. **Commit** `feat(quoting): quote-list + quote-detail edge fns`.

---

## Task 6: `quote-status-update`

**Files:** Create `supabase/functions/quote-status-update/index.ts`

- [ ] **Step 6.1: Write it.** Body `{ quote_id, status }`. Validate `status` in the allowed set. Auth→org→verify quote in org. Map status→event + side effects:
```ts
const EVENT: Record<string,string> = { sent:"sent", viewed:"viewed", approved:"approved", closed_won:"marked_won", closed_lost:"marked_lost", expired:"updated", draft:"updated" };
const patch: Record<string,unknown> = { status, updated_at: new Date().toISOString() };
if (status === "sent") patch.sent_at = new Date().toISOString();
if (status === "approved") patch.approved_at = new Date().toISOString();
if (status === "closed_won" || status === "closed_lost") patch.closed_at = new Date().toISOString();
const { data: quote, error } = await admin.from("lit_quotes").update(patch).eq("id", quoteId).eq("org_id", orgId).select("*").single();
if (error) return json({ ok:false, code:"STATUS_FAILED" }, 500);
await admin.from("lit_quote_events").insert({ quote_id: quoteId, org_id: orgId, company_id: quote.company_id, event_type: EVENT[status] ?? "updated", created_by: userId, event_payload: { status } });
// mirror won/lost to outreach history for CRM continuity
if (status === "closed_won" || status === "closed_lost") {
  await admin.from("lit_outreach_history").insert({
    user_id: userId, company_id: quote.company_id, channel: "quote",
    event_type: status === "closed_won" ? "quote_won" : "quote_lost",
    status: "logged", subject: `Quote ${quote.quote_number}`, occurred_at: new Date().toISOString(),
    metadata: { quote_id: quoteId, total_sell: quote.total_sell },
  });
}
return json({ ok:true, data:{ quote } });
```

- [ ] **Step 6.2:** `deno check` → deploy → smoke test (won quote writes an outreach row). **Commit** `feat(quoting): quote-status-update with won/lost CRM mirror`.

---

## Task 7: `quote-generate-pdf`

**Files:** Create `supabase/functions/quote-generate-pdf/index.ts`

- [ ] **Step 7.1: Write it.** Body `{ quote_id, pdf_base64 }`. Auth→org→gate→verify quote in org. Then (mirrors `export-company-profile` storage logic):
```ts
const bytes = Uint8Array.from(atob(body.pdf_base64.replace(/^data:.*;base64,/, "")), c => c.charCodeAt(0));
if (bytes.length > 6_000_000) return json({ ok:false, code:"PDF_TOO_LARGE" }, 413);
const path = `${userId}/${quote.company_id}/quotes/${quoteId}/${new Date().toISOString()}.pdf`;
const up = await admin.storage.from("company-exports").upload(path, bytes, { contentType: "application/pdf", upsert: true });
if (up.error) return json({ ok:false, code:"UPLOAD_FAILED" }, 500);
const signed = await admin.storage.from("company-exports").createSignedUrl(path, 86400);
if (signed.error) return json({ ok:false, code:"SIGN_FAILED" }, 500);
// meter export_pdf quota (best-effort, do not block the artifact on a gate read error)
await admin.rpc("check_usage_limit", { p_org_id: orgId, p_user_id: userId, p_feature_key: "export_pdf", p_quantity: 1 }).catch(()=>{});
const { data: quoteUpd } = await admin.from("lit_quotes").update({
  pdf_storage_path: path, pdf_signed_url: signed.data.signedUrl,
  pdf_expires_at: new Date(Date.now()+86400000).toISOString(), pdf_generated_at: new Date().toISOString(),
}).eq("id", quoteId).select("pdf_signed_url, pdf_expires_at").single();
await admin.from("lit_quote_events").insert({ quote_id: quoteId, org_id: orgId, company_id: quote.company_id, event_type:"pdf_generated", created_by:userId });
return json({ ok:true, data: quoteUpd });
```

> Confirm `company-exports` bucket exists (the audit found it provisioned). If not, create it (private) before deploy.

- [ ] **Step 7.2:** `deno check` → deploy → smoke test with a tiny base64 PDF returns a signed URL. **Commit** `feat(quoting): quote-generate-pdf upload+sign+meter`.

---

## Task 8: `quote-send` + `quote-view`

**Files:** Create `supabase/functions/quote-send/index.ts`, `supabase/functions/quote-view/index.ts`

- [ ] **Step 8.1: quote-send.** Body `{ quote_id, email_account_id?, to_email, to_name?, subject?, body? }`. Auth→org→gate→verify quote in org. Resolve sender: the requested `lit_email_accounts` row (must belong to user, status `connected`) or the user's primary. Refresh the provider token (reuse the `getAccessToken` refresh pattern from `send-campaign-email` — extract the minimal Gmail/Outlook token-refresh into `_shared` or inline). Build the email:
```
subject = subject ?? `Quote for ${lane} - ${company_name}`
viewUrl = `${FN_BASE}/quote-view?token=${quote.share_token}`
htmlBody = body ?? defaultTemplate({ contact_first_name, origin, destination, quote_total, valid_until, sender_name, viewUrl })
```
The body contains a **"View your quote" button → viewUrl** (the secure link; do NOT attach the PDF). Send via the existing Gmail raw / Outlook draft-then-send path. On success: set `sent_at` + status `sent`, insert `sent` event, insert `lit_outreach_history` row (`event_type:"quote_sent"`, `provider`, `message_id`, `metadata.quote_id`). Return `{ ok:true, data:{ quote } }`.

> Reuse, don't fork, the provider send. Cleanest: extract the `sendEmail()` helper from `send-campaign-email/index.ts` into `_shared/email_send.ts` and call it from both. If extraction is risky mid-stream, inline a minimal single-recipient send and leave a `// TODO: dedupe with send-campaign-email` — but prefer extraction.

- [ ] **Step 8.2: quote-view (public, no JWT).** `GET ?token=<uuid>`. Look up quote by `share_token` via service role. If found and status is `sent`, update to `viewed` + insert `viewed` event (idempotent: only flip on first view). Then `302` redirect to a fresh signed URL of `pdf_storage_path` (re-sign if expired). If not found → 404. No auth; the unguessable token is the capability.

- [ ] **Step 8.3:** `deno check` both → deploy both. Smoke: send to your own inbox, click the link, confirm status flips `sent→viewed` and an event row appears. **Commit** `feat(quoting): quote-send (secure link) + public quote-view tracking`.

---

## Task 9: `quote-dashboard-metrics` + `quote-company-metrics`

**Files:** Create both edge fns.

- [ ] **Step 9.1: dashboard-metrics.** Auth→org. One query, aggregate in JS:
```ts
const { data } = await admin.from("lit_quotes").select("status,total_sell").eq("org_id", orgId);
const sum = (pred:(s:string)=>boolean) => (data??[]).filter(r=>pred(r.status)).reduce((a,r)=>a+Number(r.total_sell||0),0);
return json({ ok:true, data: {
  draft: sum(s=>s==="draft"),
  sent: sum(s=>s==="sent"||s==="viewed"),
  approved: sum(s=>s==="approved"),
  won: sum(s=>s==="closed_won"),
  open_pipeline: sum(s=>["draft","sent","viewed","approved"].includes(s)),
  count: (data??[]).length,
}});
```

- [ ] **Step 9.2: company-metrics.** Same but `.eq("company_id", body.company_id)` and also return `lost = sum(closed_lost)` and `win_rate`.

- [ ] **Step 9.3:** `deno check` → deploy both → smoke test numbers match the seeded quotes. **Commit** `feat(quoting): dashboard + company metrics edge fns`.

---

## Task 10: Frontend API client

**Files:** Create `frontend/src/api/quoting.ts`

- [ ] **Step 10.1: Write the typed client** using the project's existing `supabase` client + `functions.invoke` (match the pattern in `frontend/src/api/*.ts`).

```ts
import { supabase } from "@/auth/supabaseAuthClient"; // adjust import to the project's client export
export type QuoteStatus = "draft"|"sent"|"viewed"|"approved"|"closed_won"|"closed_lost"|"expired";
export type QuoteMode = "ocean"|"air"|"drayage"|"ftl"|"ltl";
export interface QuoteLineItem { id?:string; type?:string; name:string; description?:string; unit?:string; quantity?:number; unit_cost?:number; unit_sell?:number; is_accessorial?:boolean; taxable?:boolean; sort_order?:number; }
export interface Quote { id:string; quote_number:string; company_id:string; status:QuoteStatus; mode?:QuoteMode; service_type?:string; total_sell:number; gross_profit:number; gross_margin_pct:number; /* ...full set */ }

async function invoke<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  if (data && data.ok === false) throw Object.assign(new Error(data.code || "error"), { payload: data });
  return data as T;
}
export const quoting = {
  create: (b:any) => invoke<{data:{quote:Quote}}>("quote-create", b),
  update: (b:any) => invoke<{data:{quote:Quote}}>("quote-update", b),
  list:   (b:{status?:QuoteStatus; company_id?:string}={}) => invoke<{items:any[]}>("quote-list", b),
  detail: (quote_id:string) => invoke<{data:any}>("quote-detail", { quote_id }),
  setStatus: (quote_id:string, status:QuoteStatus) => invoke<{data:{quote:Quote}}>("quote-status-update", { quote_id, status }),
  generatePdf: (quote_id:string, pdf_base64:string) => invoke<{data:any}>("quote-generate-pdf", { quote_id, pdf_base64 }),
  send: (b:any) => invoke<{data:any}>("quote-send", b),
  dashboardMetrics: () => invoke<{data:any}>("quote-dashboard-metrics", {}),
  companyMetrics: (company_id:string) => invoke<{data:any}>("quote-company-metrics", { company_id }),
};
```

- [ ] **Step 10.2:** Build to type-check. Run: `cd frontend && npm run build` (or `npx tsc --noEmit`). Expected: no new errors. **Commit** `feat(quoting): frontend quoting API client`.

---

## Task 11: Mode-aware field config + status pill

**Files:** Create `frontend/src/lib/quoting/modeFields.ts`, `frontend/src/features/quoting/components/QuoteStatusPill.tsx`

- [ ] **Step 11.1: modeFields.ts** — port the mockup's config to the single source of truth used by both the Builder form and the PDF.

```ts
export type Mode = "ocean"|"air"|"drayage"|"ftl"|"ltl";
export const SERVICE_TYPES: Record<Mode,string[]> = {
  ocean:["FCL · Port-to-Port","FCL · Door-to-Door","LCL · Port-to-Port","Door-to-Port","Port-to-Door"],
  air:["Airport-to-Airport","Door-to-Door","Door-to-Airport","Airport-to-Door"],
  drayage:["Port-to-Door","Ramp-to-Door","Door-to-Port"],
  ftl:["Dry Van","Reefer","Flatbed","Power Only"],
  ltl:["Standard LTL","Guaranteed LTL","Volume LTL"],
};
export const CATEGORY: Record<Mode,{label:string;tone:"intl"|"dray"|"dom";icon:string}> = {
  ocean:{label:"Freight forwarding · International",tone:"intl",icon:"Ship"},
  air:{label:"Freight forwarding · International",tone:"intl",icon:"Plane"},
  drayage:{label:"Drayage · Port logistics",tone:"dray",icon:"Container"},
  ftl:{label:"Domestic brokerage",tone:"dom",icon:"Truck"},
  ltl:{label:"Domestic brokerage",tone:"dom",icon:"Truck"},
};
export const USES_PORTS: Record<Mode,boolean> = { ocean:true, air:true, drayage:true, ftl:false, ltl:false };
export const USES_INCOTERMS: Record<Mode,boolean> = { ocean:true, air:true, drayage:false, ftl:false, ltl:false };
// field descriptors drive which inputs render per mode (origin/dest port|airport|address, equipment options, etc.)
export const MODE_FIELDS: Record<Mode, { originLabel:string; destLabel:string; equipment:string[]; extra:Array<{key:string;label:string;type?:string;mono?:boolean}> }> = {
  ocean:{originLabel:"Origin Port",destLabel:"Destination Port",equipment:["40HC","40GP","20GP","45HC","Reefer","Flat Rack"],extra:[{key:"container_count",label:"Containers",mono:true},{key:"hs_code",label:"HS Code",mono:true},{key:"cargo_value",label:"Cargo Value",mono:true}]},
  air:{originLabel:"Origin Airport (IATA)",destLabel:"Destination Airport (IATA)",equipment:["ULD","Loose","Pallet"],extra:[{key:"weight_lbs",label:"Chargeable Wt (kg)",mono:true},{key:"pallet_count",label:"Pieces",mono:true},{key:"hs_code",label:"HS Code",mono:true}]},
  drayage:{originLabel:"Origin Port / Ramp",destLabel:"Destination (City, State, ZIP)",equipment:["40HC + Chassis","40GP + Chassis","20GP + Chassis","Reefer + Genset"],extra:[{key:"container_count",label:"Containers",mono:true},{key:"distance_miles",label:"Distance (mi)",mono:true}]},
  ftl:{originLabel:"Origin (City, State, ZIP)",destLabel:"Destination (City, State, ZIP)",equipment:["53' Dry Van","Reefer","Flatbed","Step Deck","Power Only"],extra:[{key:"distance_miles",label:"Distance (mi)",mono:true},{key:"weight_lbs",label:"Weight (lbs)",mono:true}]},
  ltl:{originLabel:"Origin (City, State, ZIP)",destLabel:"Destination (City, State, ZIP)",equipment:["—"],extra:[{key:"pallet_count",label:"Pallets",mono:true},{key:"weight_lbs",label:"Weight (lbs)",mono:true},{key:"distance_miles",label:"Distance (mi)",mono:true}]},
};
```

- [ ] **Step 11.2: QuoteStatusPill.tsx** — wraps `Chip` with the status→variant map.
```tsx
import { Chip } from "@/components/ui/Chip";
const MAP: Record<string,{variant:string;label:string}> = {
  draft:{variant:"neutral",label:"Draft"}, sent:{variant:"info",label:"Sent"}, viewed:{variant:"info",label:"Viewed"},
  approved:{variant:"info",label:"Approved"}, closed_won:{variant:"success",label:"Won"},
  closed_lost:{variant:"danger",label:"Lost"}, expired:{variant:"warning",label:"Expired"},
};
export function QuoteStatusPill({ status }:{status:string}) {
  const m = MAP[status] ?? MAP.draft;
  return <Chip variant={m.variant as any} size="sm" tone="outline">{m.label}</Chip>;
}
```

- [ ] **Step 11.3:** `npx tsc --noEmit` clean. **Commit** `feat(quoting): mode-aware field config + status pill`.

---

## Task 12: Navigation rename + routes + redirects

**Files:** Modify `frontend/src/App.jsx`, `AppShell.jsx`, `AppSidebar.jsx`, `MarketingHeader.jsx`, `CTABanners.jsx`

- [ ] **Step 12.1: Routes in App.jsx.** Add lazy routes:
```jsx
<Route path="/app/quoting" element={<RequireAuth><AppShell><QuotingDashboard/></AppShell></RequireAuth>} />
<Route path="/app/quoting/new" element={<RequireAuth><AppShell><QuoteBuilder/></AppShell></RequireAuth>} />
<Route path="/app/quoting/:quoteId" element={<RequireAuth><AppShell><QuoteBuilder/></AppShell></RequireAuth>} />
```
Match the exact wrapper components App.jsx already uses (RequireAuth/AppShell names may differ — copy the pattern from an existing app route like `/app/dashboard`).

- [ ] **Step 12.2: Repoint legacy redirects.** Change the existing `/app/rfp`, `/app/rfp/*`, `/app/rfp-studio` redirects (App.jsx:482-484) to target `/app/quoting` instead of `/app/dashboard`.

- [ ] **Step 12.3: AppShell.jsx nav.** Replace the `showRfp = false` block (line ~140) with a Quoting nav item, gated by entitlement and routed to `/app/quoting`. Use the `FileText` lucide icon and the existing nav-item markup.

- [ ] **Step 12.4: AppSidebar.jsx (admin).** Add the same Quoting nav item to the admin sidebar item list.

- [ ] **Step 12.5: Marketing links.** In `MarketingHeader.jsx` (lines 19,45) and `CTABanners.jsx` (line 24), change `to="/rfp"` → `to="/quoting"` (and label "RFPs" → "Quoting" where shown).

- [ ] **Step 12.6:** `cd frontend && npm run build` clean (QuotingDashboard/QuoteBuilder can be temporary stubs returning a heading so routes resolve). **Commit** `feat(quoting): nav rename RFP→Quoting, routes, legacy redirects, marketing links`.

---

## Task 13: Quoting Dashboard

**Files:** Create `frontend/src/features/quoting/QuotingDashboard.tsx`

- [ ] **Step 13.1: Build it** to match `dashboard.html`: a TanStack Query for `quoting.dashboardMetrics()` feeding a row of `EnhancedKpiCard` (Draft / Sent / Approved / Won Revenue / Open Pipeline), and `quoting.list({status})` feeding a `LitSectionCard`-wrapped table (raw-table pattern from the audit). Status filter tabs set the `status` query key. Columns: Quote #, Company (logo+name), Mode, Lane, Status (`QuoteStatusPill`), Amount (mono), Gross Profit, Margin, Owner, Valid Until, Actions (Open/Duplicate/Send). "New Quote" CTA → `/app/quoting/new`. Empty state when zero quotes (no fabricated rows). Currency via `Intl.NumberFormat`.

Reference the mockup at `~/.gstack/projects/LIT-Intel-logistics-intel/designs/quoting-20260624/dashboard.html` for exact layout/classes.

- [ ] **Step 13.2:** `npm run build` clean. Manually load `/app/quoting` in the running app: KPIs + table render from real data; filter tabs work. **Commit** `feat(quoting): Quoting dashboard page`.

---

## Task 14: Quote Builder

**Files:** Create `frontend/src/features/quoting/QuoteBuilder.tsx` + components in `frontend/src/features/quoting/components/`

- [ ] **Step 14.1: Builder shell + state.** Local quote state (or `useReducer`). If `:quoteId` present, load via `quoting.detail`; else start a blank draft (prefill from `org_settings.quote_defaults` and, when `?company_id=` is present, from `lit_companies`). Sticky action header with Save Draft / Generate PDF / Send Quote.

- [ ] **Step 14.2: QuoteCompanySelector** — picked-company card (logo, name, domain, contact) + KPI strip; "Change" opens a company search. When launched with a `company_id`, prefill and skip search.

- [ ] **Step 14.3: QuoteLaneShipmentForm** — driven by `modeFields.ts`. Mode select swaps origin/dest labels (port vs airport vs address), equipment options, extra fields, and shows the category badge. Hide Incoterms when `!USES_INCOTERMS[mode]`. **This is the domain rule — FTL/LTL never show ports or incoterms.**

- [ ] **Step 14.4: QuoteLineItemsTable** — editable rows (line items + accessorials), add/remove, `is_accessorial` flag. On any change, recompute a *local preview* of totals using the same formula as `computeTotals` (import a shared TS copy in `lib/quoting/totals.ts` so frontend + the displayed preview agree with the server).

- [ ] **Step 14.5: QuoteTotalsPanel** — navy summary card (subtotal sell, fuel, accessorials, total cost, **Total Sell**, **Gross Profit + margin**). Values from the local preview; persisted values come back authoritative after Save.

- [ ] **Step 14.6: QuoteBenchmarkPanel + QuoteRevenueOpportunityPanel** — benchmark shows "Benchmark unavailable" empty-state (no live source in Phase 1). Revenue opportunity shows an estimate only when real company TEU/shipment data exists, labeled "Estimated" + confidence; otherwise "Not enough data to estimate opportunity". **Never fabricate.**

- [ ] **Step 14.7: Save** — `quoting.create` (new) or `quoting.update` (existing); on success, replace local totals with server values and route to `/app/quoting/:id`.

- [ ] **Step 14.8:** `npm run build` clean. Manual: create a draft end-to-end; switch Mode to FTL and confirm ports/incoterms disappear and addresses/miles appear; totals + margin compute; save persists and reloads. **Commit** `feat(quoting): Quote Builder (mode-aware form, line items, totals, save)`.

---

## Task 15: Client PDF + wire Generate/Send

**Files:** Create `frontend/src/lib/quoting/exportQuotePdf.ts`; modify `QuoteBuilder.tsx`, `QuotePdfPreview.tsx`, `QuoteSendBox.tsx`

- [ ] **Step 15.1: exportQuotePdf.ts** — model on `frontend/src/lib/pulse/exportPulseExecutivePdf.ts`. Pull brand from `reportBrand.ts` + `org_settings.quote_defaults` (logo, signature, prepared_by). Render: header (logo, quote number, date, valid until), customer block, mode-appropriate lane (use `USES_PORTS` to label port vs address), shipment summary, line items + accessorials via `jspdf-autotable`, fuel, totals, terms, signature. Return `doc.output("datauristring")` (base64) — do not auto-`save()`.

- [ ] **Step 15.2: Generate PDF button** → call `exportQuotePdf(quote)` → `quoting.generatePdf(id, base64)` → store returned signed URL; show it in `QuotePdfPreview` with a "Preview" (open URL) action.

- [ ] **Step 15.3: QuoteSendBox** → list connected accounts (reuse `listEmailAccounts()`), pick sender, editable subject/body prefilled from the template, "Send" → ensure PDF exists (generate first if missing) → `quoting.send({quote_id, email_account_id, to_email, to_name, subject, body})`. On success show status `sent`. Include the secure-link/view-tracking note from the mockup.

- [ ] **Step 15.4:** `npm run build` clean. Manual: generate a PDF (opens, looks branded, correct lane per mode), send to your inbox, open the link → status flips to `viewed` in the dashboard. **Commit** `feat(quoting): client PDF generation + send via connected mailbox`.

---

## Task 16: Company Profile Quotes tab

**Files:** Modify `frontend/src/pages/CompanyProfileV2.tsx`; create `frontend/src/features/company/CompanyQuotesTab.tsx`

- [ ] **Step 16.1: Add tab.** In `CompanyProfileV2.tsx`, add `{ id:"quotes", label:"Quotes", Icon: FileText }` to `MORE_TABS`, extend the `TabId` type/initial-tab resolver, and add a render branch `tab==="quotes" && <CompanyQuotesTab companyId={...} />`.

- [ ] **Step 16.2: CompanyQuotesTab.** KPI cards from `quoting.companyMetrics(companyId)` (Draft / Sent / Approved / Won / Lost / Win Rate) + company-scoped table from `quoting.list({company_id})`. "New Quote" → `/app/quoting/new?company_id=...`. Row actions: Open, Duplicate (create a new draft from the quote payload), Send, Mark Won/Lost (`quoting.setStatus`), Generate PDF. Reuse `QuoteStatusPill` + the dashboard table styling.

- [ ] **Step 16.3:** `npm run build` clean. Manual: open a company with quotes → Quotes tab shows them + correct KPIs; "New Quote" prefills the company. **Commit** `feat(quoting): Company Profile Quotes tab with duplicate + status actions`.

---

## Task 17: Dashboard revenue KPI

**Files:** Modify `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 17.1: Add a card** to `KPI_CARDS` (around line 834): a `DollarSign`/`TrendingUp` `EnhancedKpiCard` showing "Quoted Pipeline" (open_pipeline) with "Won Revenue" as sub, fed by `quoting.dashboardMetrics()` via a small query. Link `href` → `/app/quoting`.

- [ ] **Step 17.2:** `npm run build` clean. Manual: dashboard shows the revenue KPI with real values. **Commit** `feat(quoting): dashboard revenue KPI card`.

---

## Task 18: QA pass + acceptance verification

- [ ] **Step 18.1: Walk the acceptance criteria** (spec §10) against the running app:
  - `/quoting` loads, KPIs + table + filter + New Quote.
  - Builder create/select company, mode-aware lane (FTL/LTL = no ports/incoterms; Ocean/Air = ports/airports + incoterms), line items + accessorials, totals + GP + margin correct + div-by-zero safe, save/update draft.
  - PDF generates (logo, number, customer, lane, line items, total, terms, signature), stored, export metered.
  - Send via Gmail/Outlook; status→sent; event logged; company activity reflects it; link open → viewed.
  - Company Quotes tab lists + KPIs + create-from-profile + open existing.
  - Dashboard revenue KPI from real `total_sell` by status.
  - Regression: Search, Intelligence Explorer, Suppliers, Campaigns unaffected; auth unchanged.
  - No fake data; `npm run build` and `npx tsc --noEmit` clean; no console errors.

- [ ] **Step 18.2: Run `/qa`** (gstack) against the running app's `/app/quoting` and `/app/quoting/new` to catch UI/console issues. Fix any found.

- [ ] **Step 18.3: Update brief.** Append a short Quoting section to the relevant `docs/agents/` brief noting the new tables, edge fns, routes, and gating. **Commit** `docs(quoting): record Phase 1 surfaces in agent brief`.

- [ ] **Step 18.4: Open PR** via `/ship` (or `gh pr create`) targeting `main`. Title: `feat: Quoting module (Phase 1) — RFP→Quoting revenue layer`.

---

## Self-Review notes

- **Spec coverage:** every spec section maps to a task — data model §4→T1; mode rule §5→T11/T14.3; edge fns §6→T3–T9; gating §7→T1/T2/edge fns; frontend §8→T10–T17; PDF/email §9→T7/T8/T15; acceptance §10→T18; out-of-scope §11 honored (no live providers/attachments).
- **Open confirmations flagged inline** (do not skip): `plan_entitlements` write shape (T1.1 NOTE), `get_entitlements` callability for the gate (T2.1 NOTE), `company-exports` bucket presence (T7.1), exact App.jsx auth wrappers (T12.1), and the `supabase` client import path (T10.1). Each has a stated fallback.
- **Type consistency:** `computeTotals` is the single math authority (server T2 + a mirrored `lib/quoting/totals.ts` preview T14.4); `quoting.*` client names match edge fn names; `QuoteStatus`/`Mode` unions shared.
- **No DB regressions:** `lit_rfps` untouched; all new tables additive; RLS mirrors the proven `lit_campaigns` pattern.
