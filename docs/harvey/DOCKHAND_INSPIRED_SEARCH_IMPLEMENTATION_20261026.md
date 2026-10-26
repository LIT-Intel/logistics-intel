# Harvey Intelligence Search — evidence-backed List / Map / Grid implementation brief
Date: 2026-10-26
Status: scoped implementation branch; NOT deployed
Reference: user-supplied Revenue Vessel Dockhand screenshot. Benchmark functionality only, do not reproduce proprietary UI.

## Product goal
One natural-language Search experience. User asks multi-filter freight question; Harvey interprets filters, executes bounded tenant-authorized source queries, writes a sourced summary and improvement suggestions, and exposes the SAME result_set_id in List, Map, and Grid. Open CompanyProfileV2, save selected companies to Command Center, and export matching result set with provenance.

## Baseline discovered
- frontend/src/components/search/SearchViewToggle.tsx supports grid/list only and is not evidence of a fully integrated AI result list.
- frontend/src/features/pulse/explore/InsightsPanel.jsx currently uses the Explorer selection; do not use the displayed subset as source for complete ranking.
- frontend/src/features/coach/PulseCoachWidget.tsx and frontend/src/api/harveyCopilot.ts handle Harvey questions, including constrained provider matching.
- supabase/functions/harvey-copilot/index.ts handles authenticated Harvey context/ask/search_forwarders.
- supabase/functions/_shared/harvey_forwarder_plan.ts and harvey_forwarder_search.ts are narrowly scoped to historical provider directory data.
- docs/harvey/HARVEY_INTELLIGENCE_V2_EXECUTION_PLAN.md is the approved upstream plan; dependencies #175, #178, #182, #183, #184, #185, #186, #187 still govern release.

## Owner directive: preserve existing Map (2026-10-26)
- The current Explorer implementation, frontend/src/components/explorer/CompanySearchTab.jsx, **already keeps the map always visible** and overlays a collapsible result panel. The result panel already has LIST and CARDS controls.
- **Do not remove, replace, or hide the map by default.** Map remains the primary interactive visualization, with List as an optional expanded/full-width research view. Cards remain supported.
- Reuse CompanySearchTab's existing result rows, mapPoints, selected-company actions, and CompanyDetailPanel; do not create parallel independent result data.
- Full-width List mode is an enhancement to existing LIST, not a new search route. Switching list/map preserves selected companies, filters, search session, map camera when possible, and Company Profile link.
- Distinguish current existing *inline/collapsible list* from new research-focused *full-width list*, which must be built and tested before it can be claimed delivered.

## Deferred research: CBP air waybill source investigation (NOT started)
After all pending implementation, authenticated end-to-end tests, data quality gates and release verification are completed, conduct a separate public-source investigation of US CBP air manifest/air-waybill reporting, lawful access, geographical granularity (ZIP/city/state/airport), identities, dates, mode, and limitations. Inspect actual legally obtainable source records before hypothesizing how Revenue Vessel creates its outputs. User reports RV air estimates as accurate, but their method and underlying licensed sources are unverified. Do not begin this research or spend provider credits until the preceding work is complete.

## Screenshot-inspired behavior
- Chat question and follow-up refinement on left; research summary with exact interpreted filters, data-through timestamp, caveats, suggested refinements.
- On right, named saved result set with configurable columns, sortable/searchable rows, selection, CSV, Save to Command Center, and per-company drawer.
- Map/List/Grid are synchronized presentations of a canonical server result set; never silently narrow rankings to currently loaded first 50.
- Geographic labels distinguish company office/headquarters, import destination, arrival airport, and warehouse; these are not interchangeable.
- User can ask 'include companies with a Georgia office', 'only Turkey', 'exclude freight forwarders', 'top 25', and 'find decision makers'. Follow-ups replan, rerun, and maintain a versioned result set. Enrichment requires entitlement and credit approval.
- Export includes dataset, timestamps, mode, window, metric quality/estimated-vs-verified, source, filter definition, and count; display matches CSV.

## Server contract (design; do not assume already deployed)
POST /functions/v1/harvey-copilot
action: research_search
question, prior_result_set_id?, page_context?
Returns {ok, plan, result_set_id, result_count, rows, next_cursor, evidence, summary, suggestions, quality, trace_id}.
Plan: {mode, location:{company_state, city, location_type}, origin_countries, destination, date_window:{start,end}, industry_exclusions, sort:{field,direction}, limit}.
Evidence per metric: {dataset, as_of, period_start, period_end, mode, unit, source_record_ids, quality_status, coverage_scope, inference}.
Use strict schema validation, bounded query and row/page limits, org-scoped JWT, plan/credit gating, rate limits, and deterministic SQL functions. Never allow model-generated SQL. Do not persist full sensitive result sets in public tables.

## Non-negotiable air freight rules
- ImportYeti ocean BOLs do NOT establish verified air-waybill activity.
- If no licensed air source with accessible date, origin and destination fields exists, mark air volume unavailable and do NOT fabricate a top 50.
- Do not conflate US office location with airport of arrival or company HQ.
- Historical directory forwarder associations do NOT establish current incumbent or specific air lane.
- All rankings must reference a validated dataset + time window or explicitly state that ranking cannot be performed.

## Frontend work
1. Extend existing SearchViewToggle to map/list/grid WITHOUT breaking current props, or compose a backward-compatible tri-mode control where Search renders it.
2. Add HarveyResearchPanel with question/history, interpreted filters, source coverage, caveats and one-click follow-ups.
3. Add IntelligenceResultsTable with server paging, stable sortable keys, row selection, configurable columns, accessible responsive presentation, and verified/estimated/unavailable badges.
4. Use existing CompanyProfileV2 drawer/route APIs; company key mapping must preserve source_company_key vs internal UUID.
5. Share canonical filtered results with Map; no separate frontend filter engines.
6. CRM save must deduplicate existing companies and respect org RLS; preview count before bulk action. CSV generated server-side from the same filtered query.
7. Handle empty, partial, loading, timeout and unsupported modes honestly.

## Backend work
1. Verify availability and license rights for air freight datasets; trace sample records.
2. Implement constrained HarveyQueryPlanV1 and tool routing, not more prompt-only replies.
3. Separate source-specific tools for company discovery, shipment aggregates, provider relationships and contact enrich.
4. Add per-result fact lineage and quality status.
5. Build repeatable analytic queries with deterministic sort, pagination, count and export.
6. Enforce tenant scope, plan entitlements, quotas and no unauthorised outbound actions.

## Acceptance examples
A. 'Find top 50 Georgia office companies importing air from Europe and Turkey over last 12 complete months' must either return real source-backed 50 with linked evidence, OR explain precisely that air coverage is unavailable and offer an ocean-only or non-volume-scored company directory alternative. Never invent 942/767/etc.
B. User selects 8 rows, switches Map then List; selection, count, filters and result_set_id remain consistent.
C. Refinement to 'Turkey only' runs a new server plan and updates table, map, summary and CSV.
D. Inferences are visually distinguished from shipment counts; airport ≠ office ≠ HQ.
E. No cross-org records, no unauthorized enrichment, zero unapproved sends.
F. QA: >=95% filter/tool plan accuracy, >=98% verified numerical validity, no unsafe provider claims, signed-in E2E, mobile, performance p95 targets as in canonical plan.

## Release sequence
Data source audit (#183, #178, #182, #175) -> deterministic tools / planner (#184 #185) -> regression/evaluation (#186) -> frontend and QA (#187). Feature-flag internally; staging preview first. No merge/deployment to main before proven authenticated E2E and data checks.

## Separately observed campaign risk (do not change here)
send-campaign-email currently auto-backfills legacy consent records at dispatch. Review outreach eligibility policy and add explicit deterministic send gate before live changes; avoid sending any test campaigns.
