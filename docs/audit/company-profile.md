# Company Profile — Phase 0 Audit

**Branch:** `claude/review-dashboard-deploy-3AmMD`
**Date:** 2026-05-06
**Scope:** Read-only audit of the Company Profile data flow. No code changes, no migrations, no deploys.
**Companion artifact:** [`company-profile.manifest.json`](./company-profile.manifest.json)

> ## ⚠️ Phase 0.5 Correction (verified against live Supabase project `jkmrfiaefxwgbvftohrb`)
>
> Two findings in the original Phase 0 audit below were wrong. They are corrected in-place
> in this section. The original sections are preserved unedited so the diff is clear.
>
> **Correction 1 — five "missing" tables exist with row data:**
>
> | Table | Status | Rows | Key columns |
> |---|---|---|---|
> | `lit_company_directory` | EXISTS | **12,749** | `id`, `company_key`, `canonical_name`, `canonical_domain`, `normalized_name`, `domain`, `city`, `state`, `country`, `industry`, `employee_count`, `revenue`, `raw_json`, `normalized_json`, `enrichment_status`, `enriched_at` |
> | `lit_company_source_metrics` | EXISTS | **20,000** | `id`, `company_key`, `company_name`, `source`, `shipments`, `kg`, `value_usd`, `teu`, `lcl`, `country`, `domain`, `raw_json` |
> | `lit_company_index` | EXISTS | **1,179** | search-bar fast-lookup |
> | `lit_company_search_results` | EXISTS | **1,179** | search-bar fast-lookup |
> | `lit_company_contact_previews` | EXISTS | **18** | Apollo preview cache with `expires_at` TTL |
>
> The original audit relied on local migration files which were stale. The tables were
> created/loaded directly in production. Phase 1 maps to these real tables.
>
> **Correction 2 — the CDP shell is NOT orphaned:**
>
> [`frontend/src/pages/Company.jsx`](../../frontend/src/pages/Company.jsx) already imports and
> mounts all six CDP components: `CDPHeader` (line 38, mounted line 1150), `CDPDetailsPanel`
> (39, 1332), `CDPSupplyChain` (41, 1235), `CDPContacts` (42, 1244), `CDPResearch` (43, 1253),
> and `CDPActivity` (44, 1325). The page docstring (lines 1-23) calls itself the "Phase 3
> Company Profile rebuild against the approved design bundle." The legacy `PreCallBriefing`
> reference in §2.2 of the original audit was wrong — that page exists but is mounted at
> a different route (`/app/pre-call`), not at `/company/:id`.
>
> Both `/company/:id` and `/app/companies/:id` already render this same `Company.jsx` page
> (App.jsx lines 149-156 and 279-288). The "container page" Phase 1 deliverable therefore
> already exists; Phase 1 ships the **data-layer plumbing** that Phase 2 can swap in.
>
> **Routing stack:** confirmed Vite + React Router v7 (not Next.js). The aggregator must be
> a Supabase Edge Function — `supabase/functions/company-profile/index.ts` — not a Next
> route handler.
>
> **Override store:** `lit_company_overrides` is **NOT yet created** (verified in live DB).
> Phase 1 does not create it.
>
> **Pulse cache:** `lit_saved_companies.gemini_brief` confirmed (column exists). LLM-generated
> Pulse briefs cache there per-user. For unsaved companies, the new aggregator returns
> `pulse: null` and the UI is expected to render a deterministic local synthesis (Phase 4).

---

## 1. TL;DR

The "premium CDP" architecture is **already drafted in code but not wired up.** Six fully-built tab components (`CDPHeader`, `CDPSupplyChain`, `CDPContacts`, `CDPResearch`, `CDPActivity`, `CDPDetailsPanel`) exist under [frontend/src/components/company/](../../frontend/src/components/company/) — none of them are imported by any page. The live profile experience runs on a legacy `/company/[id]` page plus the `CompanyDrawer` modal launched from search/command-center. Phase 1 is therefore not a refactor of UI; it's a **container page + resolver + aggregated endpoint** that mounts the orphaned CDP components.

Entitlements infrastructure is **mature and centrally managed** — `useEntitlements()` + `check-entitlements` edge fn + 23 `FeatureKey`s. We use it; we do not reinvent it.

Three spec tables (`lit_company_directory`, `lit_company_source_metrics`, `lit_company_contact_previews`) **do not exist.** Their semantics live elsewhere (see §6). No generic telemetry helper exists — that's a real gap to surface to you.

---

## 2. Live Routes & Components

### 2.1 Active routes today

| Route | File | Status |
|---|---|---|
| `/company/[company_id]` | [frontend/src/pages/company/[company_id].tsx](../../frontend/src/pages/company/[company_id].tsx) | **Legacy.** Reads `id` from `window.location.pathname.split('/').pop()` (line 11) — no UUID guard, no slug normalization. |
| `/companies` | [frontend/src/pages/companies/index.tsx](../../frontend/src/pages/companies/index.tsx) | Workspace list, localStorage-backed. |
| `/command-center` | [frontend/src/app/command-center/page.tsx](../../frontend/src/app/command-center/page.tsx) | Active hub. Opens `CompanyDrawer` modal for inline preview. |
| `/app/search` | [frontend/src/pages/Search.tsx](../../frontend/src/pages/Search.tsx) | Search results; "Open" navigates to `/app/companies/{slug}` — but **no page handles that route yet.** |

### 2.2 Components — wired vs orphaned

**Wired (currently in use):**

- [CompanyDrawer.tsx](../../frontend/src/components/company/CompanyDrawer.tsx) — right-side modal preview from search/command-center. ImportYeti shipments only.
- [PreCallBriefing.tsx](../../frontend/src/components/company/PreCallBriefing.tsx) — used by legacy `/company/[id]`.
- [Workspace.tsx](../../frontend/src/components/company/Workspace.tsx) — companies list at `/companies`.
- [CompanyHeader.tsx](../../frontend/src/components/company/CompanyHeader.tsx) — minimal header used in a few legacy spots.

**Orphaned (built, never imported):**

- [CDPHeader.tsx](../../frontend/src/components/company/CDPHeader.tsx) — full premium header with KPI strip, action buttons, breadcrumb. ~432 LOC.
- [CDPSupplyChain.tsx](../../frontend/src/components/company/CDPSupplyChain.tsx) — Supply Chain tab with Summary / Lanes / Shipments / Products sub-tabs.
- [CDPContacts.tsx](../../frontend/src/components/company/CDPContacts.tsx) — Contacts tab with enrichment, dual-list state, Apollo preview integration.
- [CDPResearch.tsx](../../frontend/src/components/company/CDPResearch.tsx) — Pulse AI tab calling `pulse-ai-enrich` edge fn.
- [CDPActivity.tsx](../../frontend/src/components/company/CDPActivity.tsx) — Activity timeline reading `lit_activity_events` directly.
- [CDPDetailsPanel.tsx](../../frontend/src/components/company/CDPDetailsPanel.tsx) — right-rail (Account Details, Lists & Campaigns, Firmographics, Trade Intelligence, Verified Contacts).

**Implication for Phase 1:** Build a single container page that mounts these. No need to write the tab UIs from scratch.

---

## 3. Existing Data Layer

### 3.1 Tables actually queried by profile-related code

| Table | Used by | Notes |
|---|---|---|
| `lit_importyeti_company_snapshot` | [api.ts:3505–3690](../../frontend/src/lib/api.ts) (`getSavedCompanyShellOnly`) | **System of record** for shipment intel. 7-day staleness check. JSONB `parsed_summary` + `raw_payload`. |
| `lit_companies` | [api.ts:3589](../../frontend/src/lib/api.ts), `save-company` edge fn | Identity + KPI cache (`shipments_12m`, `teu_12m`, `top_route_12m`, `most_recent_shipment_date`). Slug→UUID resolution target. |
| `lit_company_index` | search UI only | Fast ILIKE search. Not used in profile detail. |
| `lit_saved_companies` | `save-company` edge fn, `getSavedCompanies` | Per-user CRM record. Holds `gemini_brief` + `gemini_brief_updated_at` (Pulse cache lives here today). |
| `lit_contacts` | [CDPContacts.tsx](../../frontend/src/components/company/CDPContacts.tsx), `listContacts()` | Canonical contact store. Written by `enrich-contacts`, `apollo-contact-enrich`, `lusha-enrichment`. |
| `lit_saved_contacts` | RLS-gated user contact list | Filter for "saved-only" view. |
| `lit_activity_events` | [CDPActivity.tsx:57+](../../frontend/src/components/company/CDPActivity.tsx) | Single timeline table. event_types: `shipment`, `enrich`, `note`, `campaign_added`, `pulse_generated`, `crm_stage`, `export`, `bookmark`. Already supports the unified shape. |
| `lit_email_threads`, `lit_email_messages` | inbox feature; queryable by `company_id` | Replaces spec's `lit_outreach_history`. |
| `campaign_contacts` (no `lit_` prefix) | `addCompanyToCampaign()` | Inconsistent name; not blocking. |
| `lit_campaigns`, `lit_campaign_companies` | Add-to-campaign modal | OK. |

### 3.2 Tables in the spec that DO NOT EXIST

| Spec name | Reality | Action |
|---|---|---|
| `lit_company_directory` | No migration. `lit_company_index` (search) + `lit_companies` cover identity. | **Treat spec as aspirational.** Map to `lit_companies` for Phase 1. |
| `lit_company_source_metrics` | No migration. KPIs live in `lit_importyeti_company_snapshot.parsed_summary` (JSONB) and denormalized columns on `lit_companies`. | **Use snapshot JSONB.** No migration in Phase 1. |
| `lit_company_search_results` | No migration. Search built ad-hoc via gateway. | Not blocking the profile. Defer. |
| `lit_company_contact_previews` | No migration. Apollo previews returned in-session by `apollo-contact-search` edge fn. | Profile uses `lit_contacts` (saved) + ephemeral preview state. No table needed. |
| `lit_outreach_history` | Implemented as `lit_email_threads` + `lit_email_messages`. | Use the actual tables. |

### 3.3 Override / manual-edit table

**None exists.** Grep across migrations and frontend returns zero hits for `override`, `manual_edit`, `field_edit`, `company_meta`. Free-form notes live on `lit_saved_companies.notes` only.

**Phase 1 does NOT create this table** (per your instruction). Phase 1 surfaces the gap; we propose `lit_company_overrides` (your shape) when we can demonstrate a UI flow that needs it.

### 3.4 Pulse brief cache

Currently `lit_saved_companies.gemini_brief` (JSONB) + `gemini_brief_updated_at`. The orphaned `CDPResearch.tsx` calls `pulse-ai-enrich` directly **without consulting this cache** — every visit to a hypothetical Pulse tab would burn LLM credits. This is exactly the cost-control gap you flagged.

**Phase 4 fix:** read cache → render → only call edge fn on explicit "Generate / Refresh." No new table needed unless we want per-section invalidation, which we don't yet.

---

## 4. CompanyResolver — current state

The closest thing to a resolver lives in [api.ts:4423–4462](../../frontend/src/lib/api.ts) as `resolveCompanyUuid(company_id_or_slug)`:

1. UUID regex check → direct `lit_companies.id` lookup.
2. Slug path: strip `company/` prefix, try `["company/{bare}", "{bare}", original]` against `lit_companies.source_company_key` with `.in(...)`.
3. Returns `{ id, name?, domain?, website? }` or throws.

Helpers: `normalizeCompanyIdToSlug()` (api.ts:1029), `ensureCompanyKey()`, `inferDomainFromSlug()` (api.ts:555), `deriveDomainCandidate()` (api.ts:1050).

**Gaps vs spec:**

- No `canonical_domain` matching (despite `lit_companies.domain` existing).
- No name + city/state matching.
- No name + country matching.
- Returns minimal shell — no merged `CompanyEntity { sources: { saved, importyeti, directory, metrics } }`.
- Scattered: every consumer (`listContacts`, `getSavedCompanyShellOnly`, the orphaned tabs) re-implements its own fetch on top.

### Phase 1 proposal: `resolveCompany(input) → CompanyEntity`

Single server-side function (Supabase RPC or Next.js route handler) that returns:

```ts
type CompanyEntity = {
  id: string;                    // canonical lit_companies.id (UUID)
  key: string;                   // source_company_key (e.g. "company/sony-electronics")
  name: string;
  domain: string | null;
  display: {                     // merged for UI, override-aware
    name: string;
    domain: string | null;
    website: string | null;
    address: { line1?: string; city?: string; state?: string; country?: string };
    industry: string | null;
    headcount: number | null;
  };
  sources: {
    saved:      { present: boolean; stage?: string; notes?: string; last_viewed_at?: string };
    importyeti: { present: boolean; updated_at?: string; is_stale?: boolean };
    metrics:    { shipments_12m: number; teu_12m: number; est_spend_12m: number; last_shipment?: string; top_route?: string };
    contacts:   { count: number; saved_count: number };
  };
  resolved_via: 'uuid' | 'company_key' | 'domain' | 'name+city' | 'name+country';
};
```

Resolution priority (per your direction):
1. Saved company / company_id (UUID)
2. `company_key` / `source_company_key`
3. `canonical_domain` / `domain` (new)
4. Normalized name + city + state (new)
5. Normalized name + country (new)

Saved/CRM identity wins on conflict; ImportYeti / metrics / future Panjiva enrich the `sources` blocks.

---

## 5. Aggregated profile endpoint — proposal

**Today:** Each tab fetches independently. Four spinners, four failure modes, race conditions on enrichment.

**Phase 1 proposal:** single Next.js route handler

```
GET /api/companies/[id]/profile?include=identity,shipments,contacts,activity,pulse
```

- `id` accepts UUID or slug. Server calls `resolveCompany(id)` first; 404 fast on miss.
- `include` is comma-separated; default = `identity,shipments,contacts,activity` (Pulse opt-in only, never auto-fetched).
- Response shape:

```ts
{
  identity:  CompanyEntity,
  shipments: { kpis, monthly, top_routes, top_origins, top_destinations, recent_bols } | null,
  contacts:  { saved: Contact[], count: number } | null,  // previews stay client-side
  activity:  { events: CompanyEvent[], next_cursor: string | null } | null,
  pulse:     { brief: PulseBrief | null, cached_at: string | null, is_stale: boolean } | null,
}
```

- Backed by 1 SQL round-trip via `Promise.all` of: snapshot read, `lit_contacts` count + top-N, `lit_activity_events` last-60, `lit_saved_companies.gemini_brief` read.
- Client uses `useCompanyProfile(id)` hook with per-section `loading`/`error`/`data` so tabs render independently as data arrives.

**Why it works:** Pulse is opt-in (no LLM cost on load), TEU/lanes always come from a known source, non-UUID input is guarded once at the resolver, and the orphaned tabs become pure presentational components fed by one hook.

---

## 6. Activity tab — unified shape

`lit_activity_events` already has the shape we need. Proposed mapping to `CompanyEvent`:

```ts
type CompanyEvent = {
  type: 'shipment' | 'contact_enriched' | 'campaign_added' | 'email_sent' | 'email_opened'
      | 'email_clicked' | 'email_replied' | 'note' | 'crm_stage' | 'pulse_generated'
      | 'export' | 'list_added' | 'company_saved' | 'company_refreshed';
  at: string;            // created_at
  actor: { user_id: string; name?: string } | { source: 'system' };
  title: string;         // human-readable headline
  description?: string;
  payload: Record<string, unknown>;  // metadata column
  source_table: 'lit_activity_events' | 'lit_email_messages' | 'lit_email_threads';
};
```

Most types come straight from `lit_activity_events.event_type`. Email events (`email_opened`, `email_clicked`, `email_replied`) need a join/union with `lit_email_messages` + `lit_email_threads` (filtered by `company_id`). Server function `getCompanyActivity(companyId, { limit, cursor })` does the union and normalizes.

---

## 7. Plan gating — use what exists

**Mature, centralized, ready to use.** Do not reimplement.

| Helper | Path |
|---|---|
| Client hook | [frontend/src/hooks/useEntitlements.ts](../../frontend/src/hooks/useEntitlements.ts) |
| Client lib | [frontend/src/lib/entitlements.ts](../../frontend/src/lib/entitlements.ts) — `FeatureKey` union, `PLAN_ENTITLEMENTS` matrix |
| Server lib | [frontend/src/lib/serverEntitlements.ts](../../frontend/src/lib/serverEntitlements.ts) |
| Plan config | [frontend/src/lib/planLimits.ts](../../frontend/src/lib/planLimits.ts), [plan.ts](../../frontend/src/lib/plan.ts) |
| Usage tracking | [frontend/src/lib/usage.ts](../../frontend/src/lib/usage.ts), [useUsageSummary.ts](../../frontend/src/hooks/useUsageSummary.ts) |
| Access lib | [frontend/src/lib/access.ts](../../frontend/src/lib/access.ts) |
| UI gate | [frontend/src/components/common/UpgradeGate.tsx](../../frontend/src/components/common/UpgradeGate.tsx) |
| Edge fn | [supabase/functions/check-entitlements/index.ts](../../supabase/functions/check-entitlements/index.ts) + [get-entitlements](../../supabase/functions/get-entitlements/index.ts) |
| Migration | [supabase/migrations/20260427100000_usage_enforcement.sql](../../supabase/migrations/20260427100000_usage_enforcement.sql) |

Existing `FeatureKey`s relevant to Company Profile: `profile_access`, `contact_enrichment_access`, `ai_brief_access`, `export_pdf_access`, `similar_companies_access`, `credit_rating_access`, `command_center_access`. **All needed gates already exist.**

Phase 1+ usage: wrap premium cards with `<UpgradeGate feature="ai_brief_access">…</UpgradeGate>`; server-side, validate inside the aggregated endpoint via `serverEntitlements`.

---

## 8. Telemetry — gap

**No general-purpose telemetry helper exists.** Grep returns zero hits for `useAnalytics`, `trackEvent`, `posthog`, `mixpanel`, `segment`, `amplitude`. Only campaign-specific click tracking in [migration 20260504230000](../../supabase/migrations/20260504230000_phase4_click_tracking_and_phase5_ab.sql) and analytics counters in `CampaignAnalytics.jsx`.

**Recommended Phase 0 finding (not Phase 0 work):**

We should introduce a thin `lib/telemetry.ts` shim — `track(event: string, props?)` — backed by either a new `lit_product_events` table or an existing logging endpoint. Until then, Company Profile telemetry is **deferred to a later phase** so we don't block on this. Proposed event names if/when added:

- `profile.tab_view` (props: tab, company_id)
- `profile.refresh_clicked` (props: source)
- `profile.contact_enrich_clicked` (props: count)
- `profile.pulse_generated` (props: cached, llm_called)
- `profile.outreach_started` (props: campaign_id)

Decision needed from you: do we add the helper in a side phase, or proceed without telemetry through Phase 5?

---

## 9. Apollo branding — relabel scope

**~115 references across ~30 files.** Categorized:

- **UI strings (must relabel):** ~30 occurrences in `CDPContacts.tsx`, `LeadProspecting.jsx`, `Pulse.jsx`, `PulseResults.jsx`, `AdminSettings.jsx`, `SavedCompaniesPicker.tsx`, `SettingsSections.tsx`. Includes provider option labels, error messages ("Apollo API permission issue"), badge component names rendered as JSX.
- **Variable / function / type names (keep — internal):** ~50 occurrences. State names like `apolloOpen`, `apolloResults`; types `ApolloContactPreview`, `ApolloSearchPayload`; functions `searchApolloContacts`, `enrichApolloContacts`. These don't appear in UI output.
- **Comments (keep):** ~20 occurrences. Internal documentation.
- **Backend / edge fn names (keep):** `apollo-contact-search`, `apollo-contact-enrich`. Internal-only.

**Phase 3 work:** sweep UI strings → "LIT contact search", "LIT match", "LIT preview", "LIT enrichment", "Find contacts with LIT". Code identifiers untouched. Full list with file:line is in the JSON manifest.

---

## 10. Bug triage (from spec list)

| # | Bug | File:line | Severity | Phase fix |
|---|---|---|---|---|
| 1 | First-name-only fallback | [CDPContacts.tsx:1007–1013](../../frontend/src/components/company/CDPContacts.tsx) — line 1012 has bug fallback; lines 2222 & 2579 use correct join logic | M | Phase 3 |
| 2 | Enrichment wipes preview | [CDPContacts.tsx:465–556](../../frontend/src/components/company/CDPContacts.tsx) — preview & saved are separate states; bug is the **full replace** at line 556 after refetch | M | Phase 3 |
| 3 | Apollo branding | ~30 UI files | H | Phase 3 |
| 4 | Non-UUID crash | [pages/company/[company_id].tsx:11](../../frontend/src/pages/company/[company_id].tsx) — no validation; falls through silently in resolver | M | Phase 1 (router guard + resolver) |
| 5 | Refresh burns API | [Workspace.tsx:328–333](../../frontend/src/components/company/Workspace.tsx) — no `enrichment_status` check before calling `enrichCompany()`; row-level enrichment at line 584 has the guard | M | Phase 3 / Phase 4 |
| 6 | TEU / lanes / last-shipment missing | [CDPSupplyChain.tsx:1916–1986](../../frontend/src/components/company/CDPSupplyChain.tsx) — reads `profile.topRoutes` but no guarantee backend populates it | L | Phase 3 (resolver fills via `lit_companies` denormalized columns) |
| 7 | Saved Companies → Contacts blanks | [api.ts:3934–3957](../../frontend/src/lib/api.ts) `getSavedCompanies()` joins only `lit_companies`; no contact embed; `shipments: []` hardcoded at line 3990 | L | Phase 3 (separate `listContacts` call per row, or embed via aggregator) |
| 8 | Marketing-audience leakage | None found — `lit_marketing_audience_*` tables are absent from codebase | OK | No action |
| 9 | Pulse on page load burns LLM | [CDPResearch.tsx](../../frontend/src/components/company/CDPResearch.tsx) calls `pulse-ai-enrich` without consulting `lit_saved_companies.gemini_brief` | M | Phase 4 |
| 10 | Profile duplicates from saved/local/external | No dedupe in resolver | M | Phase 1 (resolver merges, saved wins) |
| 11 | Local Panjiva data not in profile | Tables don't exist; spec aspirational | n/a | Defer |

---

## 11. Risks & blockers

1. **Three spec tables don't exist.** Spec assumes `lit_company_directory` / `lit_company_source_metrics` / `lit_company_contact_previews`. Reality: snapshot JSONB + `lit_companies` columns + ephemeral preview state. **Phase 1 maps to reality, no migrations.** If you later want a real `lit_company_directory` for Panjiva ingest, that's a separate ingestion track.
2. **No telemetry helper.** Decision needed (§8) before Phase 5.
3. **No override table.** Acceptable for Phases 1–5; user edits beyond `notes` are not yet possible. Flag in final report.
4. **`/app/companies/{slug}` route does not exist** but `Search.tsx:660` already navigates there. **Hot bug:** anyone clicking "Open" from search hits a 404 today. Phase 1 fixes by creating that route.
5. **Legacy `/company/[id]` page** must be redirected once new route lands, not deleted, to preserve any external links.
6. **`gemini_brief` on `lit_saved_companies`** — Pulse cache only exists for users who **saved** the company. Trial users / unsaved companies regenerate every time. Acceptable for Phase 4 if we gate Pulse to saved companies only; otherwise we need a non-user-scoped cache table.
7. **`resolveCompanyUuid` is a Supabase client call from frontend.** Phase 1 should move this server-side (route handler) to enforce RLS-aware identity and avoid exposing the resolution surface.

---

## 12. Files Phase 1 will touch

**New:**

- `frontend/src/app/companies/[id]/page.tsx` — container page mounting CDP shell + tabs.
- `frontend/src/app/api/companies/[id]/profile/route.ts` — aggregated profile endpoint.
- `frontend/src/lib/companyResolver.ts` — server-side `resolveCompany()` returning `CompanyEntity`.
- `frontend/src/hooks/useCompanyProfile.ts` — client hook over the aggregator with per-section state.
- `frontend/src/lib/companyProfile.types.ts` — `CompanyEntity`, `CompanyEvent`, `PulseBrief` types.

**Modified:**

- `frontend/src/pages/company/[company_id].tsx` — turn into a redirect to the new route (preserve old links).
- `frontend/src/pages/Search.tsx` — verify slug encoding into new route; no logic change expected.

**Touched read-only (imported by new container):**

- `CDPHeader.tsx`, `CDPSupplyChain.tsx`, `CDPContacts.tsx`, `CDPResearch.tsx`, `CDPActivity.tsx`, `CDPDetailsPanel.tsx` — props refactored in Phase 2/3; Phase 1 just imports them with stub data.

**NOT touched in Phase 1:**

- Any `apollo-*` edge function.
- Any billing / Stripe / Resend code.
- Any marketing-audience table or function.
- `entitlements.ts` / `planLimits.ts` / `useEntitlements.ts` (used as-is).
- Migrations (no new tables).

---

## 13. Phase 1 acceptance criteria

- `GET /api/companies/[id]/profile` returns 200 for UUID, slug, and `company/{slug}` shapes; 404 for unknown.
- Hitting `/app/companies/{slug}` from search no longer 404s.
- Non-UUID input does not crash; resolver returns a clean error structure.
- Container page mounts and renders all 4 tab shells without throwing — even with empty data.
- No new tables, no LLM calls, no Apollo string changes (those land Phase 3 / Phase 4).
- One commit on `claude/review-dashboard-deploy-3AmMD`. No deploy.

---

## 14. Open questions for you

1. **Telemetry:** add a thin `lib/telemetry.ts` as a side phase (no-op shim that we can wire to a real backend later), or proceed without telemetry through Phase 5?
2. **Pulse cache for unsaved companies:** Phase 4 — gate Pulse to saved-only (cache lives on `lit_saved_companies.gemini_brief`), or add a separate cache table?
3. **Legacy route handling:** redirect `/company/[id]` → `/app/companies/[id]` permanently in Phase 1, or keep both running?
4. **Container route path:** confirm `/app/companies/[id]` (matches what `Search.tsx` already navigates to). Alternative `/dashboard/company/[id]` would require updating Search nav.
