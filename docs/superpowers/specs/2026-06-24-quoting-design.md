# LIT Quoting Module — Phase 1 Design Spec

**Date:** 2026-06-24
**Branch (origin):** `gating-free-trial` (new work to branch off current `main`)
**Status:** Approved design — pending spec review → implementation plan
**Author:** Claude (brainstorming session with Spark)

---

## 1. Product summary

Rename the discontinued **RFP** concept to **Quoting** and build LIT's revenue
execution layer: users open Quoting, pick a company, build an editable freight
quote (line items, accessorials, fuel, margin, terms), generate a branded PDF,
send it through their connected Gmail/Outlook as a **secure link**, and track
status + revenue KPIs on the company profile and dashboard.

Product arc: **Search finds the opportunity → Company Profile explains it →
Quoting converts it → Dashboard tracks the revenue.**

This spec covers **Phase 1 only**. Phases 2–4 (live rate/benchmark providers,
mileage/DOE APIs, customer approval portal, multi-lane RFP workspace, versioning,
approval workflows, AI pricing, SharePoint/Teams) are explicitly out of scope.

---

## 2. Decisions locked in this session

| Decision | Choice | Rationale |
|---|---|---|
| **DB strategy** | New normalized `lit_quotes` + `lit_quote_line_items` + `lit_quote_events` | `lit_rfps` is effectively dead (no UI, localStorage-only, routes already redirect). Line items need real rows for the financial model, not a single jsonb. `lit_rfps` left untouched. |
| **Send method** | Secure quote link (signed URL) | Reuses existing storage/signed-URL flow, no multipart-MIME surgery on the send path, and enables `viewed` tracking for free. Attachment deferred to a later phase. |
| **Plan gating** | Growth+ create / all view | Mirrors how `rfp_studio` was gated to Growth+. Server-enforced via a new `quoting` feature key + `check_usage_limit`. |
| **Upgrades folded in** | Org quote settings · view-tracking · duplicate quote · audit-grade quote numbering | Cheap to design in now, expensive to retrofit. |
| **PDF generation** | Client-side jsPDF → base64 → edge fn uploads + signs | Deno edge functions cannot run Chromium. Mirrors `email-pulse-report` + `export-company-profile`. |

---

## 3. Audit findings (what exists / reuse / build)

**Reuse (do not rebuild):**
- **PDF engine:** `jsPDF` + `jspdf-autotable` + `html2canvas` already installed; pattern in `frontend/src/lib/pulse/exportPulse*.ts`; brand constants in `frontend/src/lib/pulse/reportBrand.ts`.
- **Storage + export:** `supabase/functions/export-company-profile/index.ts` uploads to `company-exports` bucket, signs 24h URLs, meters `export_pdf` quota.
- **Email send:** Gmail (RFC822 raw) + Outlook (draft→send) in `supabase/functions/send-campaign-email/index.ts`; accounts in `lit_email_accounts`, tokens in `lit_oauth_tokens` (service-role only); listing via `listEmailAccounts()` in `api.ts`.
- **Design system:** `EnhancedKpiCard`, `LitSectionCard`, `Chip`, raw-table pattern, lucide icons, Space Grotesk / DM Sans / JetBrains Mono; tokens in `frontend/tailwind.config.js`.
- **Backend conventions:** `_shared/auth.ts` (`requireUser`, `resolveUserOrg`, `isUserAdmin`), `_shared/logger.ts` (`createLogger`), `check_usage_limit` RPC, org resolution via `org_members`. Templates: `save-company` (create), `pulse-map-selections-list` (list), `company-profile` (detail).
- **Entitlements:** `get-entitlements` edge fn + `useEntitlements()` hook; plan tiers `free_trial · starter · growth · scale · enterprise`.

**Build net-new:** 3 quote tables + counter table, `org_settings.quote_defaults`, 10 edge functions, `quoting` feature key, Quoting dashboard + Quote Builder pages, Company Profile Quotes tab, dashboard revenue KPI, `lib/quoting/exportQuotePdf.ts`.

**Risks flagged:**
1. No server-side PDF (Chromium unavailable) → client-side generation, dictated above.
2. No email attachment support → secure link, dictated above.
3. Route drift — live company profile is `/app/companies/:company_id` (not `/command-center/company/...`); tabs are `VISIBLE_TABS`/`MORE_TABS` arrays in `CompanyProfileV2.tsx`. Wire to the real route.

---

## 4. Data model

All tables org-scoped, RLS = the 4-policy pattern from `lit_campaigns`
(select = active org member or platform_admin; insert = own row + active member;
update/delete = creator or owner/admin). Child tables inherit org via `quote_id`.

### 4.1 `lit_quotes`
Per PRD field list, plus:
- `quote_number text NOT NULL` — `Q-{YYYY}-{NNNN}`, **sequential per org**.
- `status text NOT NULL DEFAULT 'draft'` CHECK in `('draft','sent','viewed','approved','closed_won','closed_lost','expired')`.
- `mode text` in `('ocean','air','drayage','ftl','ltl')`; `service_type text`; `incoterms text NULL` (NULL for domestic modes).
- Both location sets coexist (mode decides which the UI/PDF render): `origin_port`/`destination_port` **and** `origin_city/state/country/zip` + `origin_address`/`destination_address` + `distance_miles`.
- Financials denormalized + recomputed server-side on every save: `subtotal_cost`, `subtotal_sell`, `fuel_surcharge_pct`, `fuel_surcharge_amount`, `accessorial_total`, `total_cost`, `total_sell`, `gross_profit`, `gross_margin_pct`. Division-by-zero guarded.
- Benchmark + revenue opportunity columns (nullable; empty-state when absent).
- `pdf_storage_path`, `pdf_signed_url`, `pdf_expires_at`, `pdf_generated_at`.
- `share_token uuid DEFAULT gen_random_uuid()` — unguessable; powers secure link + view-tracking.
- `sent_at`, `approved_at`, `closed_at`, `valid_until`, timestamps.
- Indexes: `(org_id, status)`, `(company_id)`, unique `(org_id, quote_number)`.

### 4.2 `lit_quote_line_items`
- `quote_id` FK ON DELETE CASCADE, `org_id`, `type`, `name`, `description`, `unit`, `quantity`, `unit_cost`, `unit_sell`.
- `total_cost`/`total_sell` as **generated columns** (`quantity*unit_cost`, `quantity*unit_sell`).
- `is_accessorial bool`, `taxable bool`, `sort_order int`.

### 4.3 `lit_quote_events`
- `quote_id` FK CASCADE, `org_id`, `company_id NULL`, `event_type`, `event_payload jsonb`, `created_by`, `created_at`.
- Event types: `created · updated · pdf_generated · sent · viewed · approved · declined · marked_won · marked_lost`.
- Append-only audit trail. Distinct from `lit_outreach_history` (also written on send for CRM continuity).

### 4.4 `lit_quote_counters` (audit-grade numbering)
- `(org_id, year) PK`, `seq int`. Bumped in a transaction inside `quote-create` to assign `Q-{YYYY}-{NNNN}`. Unique per org.

### 4.5 `org_settings.quote_defaults jsonb`
- `{ currency, fuel_surcharge_pct, payment_terms, terms_text, logo_url, signature_url, prepared_by }`. Powers PDF branding + Builder prefill. No hardcoded values; empty-state if unset.

### 4.6 Safety
`lit_rfps` untouched. No production quote data exists to break.

---

## 5. Mode-aware Lane & Shipment Details (domain rule)

The Lane & Shipment Details section and the PDF render **only the fields valid for
the selected mode**. International forwarding uses ports/airports + incoterms;
domestic brokerage uses city/state/ZIP addresses + miles and **never** ports or
incoterms.

| Mode | Category | Origin/Destination | Key fields | Incoterms |
|---|---|---|---|---|
| Ocean | Freight forwarding · Intl | Origin/Destination **Port** | Equipment (40HC/20GP/Reefer/Flat Rack), Containers, HS Code, Cargo Value | ✅ |
| Air | Freight forwarding · Intl | Origin/Destination **Airport (IATA)** | Chargeable Wt (kg), Pieces, HS Code, Hazmat | ✅ |
| Drayage | Port logistics | Origin **Port/Ramp** → Dest **City/State/ZIP** | Equipment + Chassis, Containers, Distance (mi) | ✗ |
| FTL | **Domestic brokerage** | Origin/Dest **City/State/ZIP** | Truck equipment (53' Dry Van/Reefer/Flatbed/Step Deck), Distance, Weight, Temp Controlled | ✗ |
| LTL | **Domestic brokerage** | Origin/Dest **City/State/ZIP** | Freight Class, Pallets, Weight, Accessorials (Liftgate/Residential), Distance | ✗ |

Service-type options re-populate per mode. A category badge (Freight forwarding /
Port logistics / Domestic brokerage) appears in the section header. Default
line-item suggestions also adapt (ocean → THC/customs/drayage/chassis; domestic →
linehaul/fuel/accessorials).

---

## 6. Backend — edge functions

All: `requireUser` + `createLogger` + CORS preflight + stable `{ok,...}` JSON +
server-side gating on the `quoting` feature key + org verification.

| Function | Job |
|---|---|
| `quote-create` | Resolve company→internal `company_id` (create/link from `source_company_key` if needed), assign quote number via counter txn, gate on `quoting`, write `created` event |
| `quote-update` | Upsert quote + line items in one call; **recompute all totals server-side**; write `updated` event |
| `quote-list` | Org-scoped list w/ status filter (dashboard) |
| `quote-detail` | Quote + line items + events |
| `quote-status-update` | Transition status, write matching event, mirror won/lost to `lit_outreach_history` |
| `quote-generate-pdf` | Accept client base64 → upload to `company-exports/{user}/{company}/quotes/{quote_id}/...` → sign URL → persist path/url, meter `export_pdf`, write `pdf_generated` event |
| `quote-send` | Build email (template §9), send via user's connected Gmail/Outlook with the secure link, set `sent_at` + status `sent`, log `sent` event + `lit_outreach_history` |
| `quote-dashboard-metrics` | Org KPI rollups by status (`SUM(total_sell)`) |
| `quote-company-metrics` | Same, filtered to one company |
| `quote-view` (public) | Unauthenticated; validate `share_token`, log `viewed` event, flip `sent`→`viewed`, redirect to signed PDF |

KPI definitions: Draft = `SUM(total_sell) where status='draft'`; Sent = `status in (sent,viewed)`; Approved = `status='approved'`; Won = `status='closed_won'`; Open Pipeline = `status in (draft,sent,viewed,approved)`. Closed-lost never in pipeline.

---

## 7. Plan gating

Add `quoting` feature key. `growth`/`scale`/`enterprise` → create/edit/PDF/send;
`free_trial`/`starter` → view-only (nav visible, create CTA gated with upgrade
prompt). Enforced **server-side** in every mutating edge fn; frontend gating is UX
hint only. Quote PDF generation continues to meter the existing `export_pdf` quota.

---

## 8. Frontend

**Routes:** `/app/quoting` · `/app/quoting/new` · `/app/quoting/:quote_id`.
Legacy `/app/rfp*` redirects repoint to `/quoting`. Marketing `/rfp` links in
`MarketingHeader.jsx` + `CTABanners.jsx` repointed to `/quoting` (free cleanup).
Nav entry added to **both** sidebars (`AppShell.jsx` flip `showRfp`→`showQuoting`;
admin `AppSidebar.jsx`), gated by `quoting` entitlement.

**`QuotingDashboard`** — `EnhancedKpiCard` row (Draft/Sent/Approved/Won/Open
Pipeline), `LitSectionCard`-wrapped quotes table (raw-table pattern, `Chip` status
pills, mono currency), status filter tabs, "New Quote" CTA.

**`QuoteBuilder`** — 11 PRD sections as collapsible `LitSectionCard`s: Company →
Lane/Shipment (mode-aware §5) → Shipment Details → Benchmark/Revenue Opportunity →
Line Items → Accessorials → Fuel/Mileage → Totals → Terms → PDF Preview → Send.
Live totals recompute locally for UX; **server is source of truth on save**.
Prefill from `org_settings.quote_defaults` + (when launched from a company)
`lit_companies` KPIs/snapshot. Empty states where data is absent — **never
fabricated** ("Benchmark unavailable"; "Not enough data to estimate opportunity").

**Component inventory:** `QuotingDashboard`, `QuoteBuilder`, `QuoteCompanySelector`,
`QuoteLaneShipmentForm` (mode-aware), `QuoteLineItemsTable`, `QuoteAccessorialsTable`,
`QuoteFuelMileagePanel`, `QuoteTotalsPanel`, `QuoteBenchmarkPanel`,
`QuoteRevenueOpportunityPanel`, `QuotePdfPreview`, `QuoteSendBox`, `CompanyQuotesTab`,
`DashboardRevenueKpiCard`. API client in `frontend/src/api/quoting.ts` (NOT `lib/api.ts`).

**Company Profile Quotes tab** — added to `MORE_TABS` in `CompanyProfileV2.tsx`,
real route `/app/companies/:company_id?tab=quotes`. KPI cards + company-scoped quote
table + "New Quote" (prefilled `company_id`); row actions Open/Duplicate/Send/Mark
Won/Mark Lost/Generate PDF.

**Dashboard revenue KPI** — one `EnhancedKpiCard` ("Quoted Pipeline" + "Won
Revenue") added to `KPI_CARDS`, fed by `quote-dashboard-metrics`.

---

## 9. PDF + email

**PDF:** new `frontend/src/lib/quoting/exportQuotePdf.ts` modeled on
`exportPulseExecutivePdf.ts`, pulling `reportBrand.ts` + org logo/signature.
Renders quote number, parties, mode-appropriate lane (§5), line items +
accessorials (`jspdf-autotable`), fuel, totals, terms, signature. Generated
in-browser → base64 → `quote-generate-pdf`.

**Email template (secure link):**
Subject: `Quote for {{lane}} - {{company_name}}`
Body: greeting + `{{quote_total}}` + `{{valid_until}}` + **"View your quote"
button → `/quote-view?token={{share_token}}`**. Sent through the user's connected
mailbox; never from the frontend.

---

## 10. Acceptance criteria (Phase 1)

- `/quoting` loads with KPI cards + quote table + status filter + New Quote.
- Builder: create/select company, enter mode-aware lane + shipment details, add
  line items + accessorials, totals + gross profit + margin compute correctly
  (server-authoritative, div-by-zero safe), save/update draft.
- FTL/LTL never render ports or incoterms; Ocean/Air render ports/airports +
  incoterms.
- PDF generates with logo, quote number, customer, lane, line items, total, terms,
  signature; stored in Supabase Storage; export row metered.
- Send via connected Gmail/Outlook; status → `sent`; `sent` event logged; company
  activity reflects it; opening the link flips → `viewed`.
- Company Profile Quotes tab lists company quotes with correct KPIs; can create
  from profile + open existing.
- Dashboard revenue KPI shows real `total_sell` by status.
- Safety: Search, Intelligence Explorer, Suppliers, Campaigns unaffected; auth
  unchanged; no fake data; no TS/console errors.

---

## 11. Out of scope (Phases 2–4)

Live rate/benchmark providers, automated mileage API, DOE fuel index, customer
approval portal, multi-lane RFP workspace, quote versioning, approval workflows,
SharePoint/OneDrive/Teams, AI-generated pricing, supplier network phase 2,
PDF-as-attachment. (`valid_until`-driven auto-expire cron is Phase 2; the column
supports it now.)

---

## 12. Implementation order

1. Migration: 3 quote tables + counter + `org_settings.quote_defaults` + RLS + `quoting` feature key.
2. Edge functions (create/update/list/detail/status/generate-pdf/send/metrics×2/view).
3. `frontend/src/api/quoting.ts` client.
4. Nav rename RFP→Quoting (both sidebars) + routes + legacy redirects + marketing link fix.
5. Quoting dashboard.
6. Quote Builder (mode-aware lane form, line items, totals).
7. Company Profile Quotes tab.
8. Dashboard revenue KPI.
9. PDF generation (`exportQuotePdf.ts`).
10. Quote send (secure link) + view-tracking.
11. QA checklist against §10.

Visual reference: `~/.gstack/projects/LIT-Intel-logistics-intel/designs/quoting-20260624/`
(`dashboard.html`, `quote-builder.html`).
