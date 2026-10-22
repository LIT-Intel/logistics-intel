# Harvey Intelligence 2.0 — Execution Control Plan

**Approved:** 2026-10-21  |  **Product:** Logistics Intel  |  **Target:** production `main` only after tested release gates

## Mission
Turn Harvey from an answer generator layered over a limited browser result set into a tenant-aware, evidence-led freight intelligence analyst. A user can ask a complex natural-language question, inspect exactly how it was interpreted, receive complete filter-correct analytics and source-attributed opportunities, refine the answer conversationally, and take approved CRM actions. **No fake data, no invented TEU, no inferred forwarder incumbents disguised as facts.**

## Confirmed starting facts
- `lit_company_directory` has **78,177 companies**, and **31,022 populated `top_forwarders` JSON arrays**, about 39.7%. Entries carry names, source-reported TEU and percentage. Some names are intermediaries, some are carriers; `BCO (Direct)` and `BCO - Direct to Carrier` also occur. The field is real but not yet verified as a specific time-window or origin-lane metric.
- **1,823** company-directory rows explicitly contain a `BCO (Direct)` label; this excludes other variants.
- `lit_unified_shipments` has raw BOL payload, SCAC, vessel carrier and notify-party fields, but no first-class forwarder_name. Raw literal occurrences of 'forwarder' are scarce; the company directory is presently the stronger source for company-level forwarder summaries.
- `harvey-copilot` is currently a one-turn structured answer path, `pulse-search` a three-intent parser, and `InsightsPanel` draws upon the already-present Explorer companies instead of a server-driven agent tool sequence.
- **Blocking data defects:** #178 invalid TEU source data (265 anomalous monthly rows across 26 companies at a conservative review threshold); #182 inconsistent 12-month reporting windows; #175 recent 50-BOL detailed snapshots versus broader monthly history. These must be disclosed and fixed, not masked with a stronger model.

## Task sequence / owners / dependencies

| Order | Owner | Delivery | GitHub | Required gate |
| --- | --- | --- | --- | --- |
| **0A** | Agent 5 Data + Agent 3 Integrations | Audit raw ImportYeti source paths, `top_forwarders` semantics, type aliases, booking and evidence windows; test representative accounts | [#183](https://github.com/LIT-Intel/logistics-intel/issues/183) | 30 traced examples, no conflation of vessel carrier/forwarder/NVOCC/customs broker |
| **0B** | Agent 5 Data + Agent 6 QA | Repair #178 TEU, align #182 windows; document #175 paid history backfill economics; propagate flags to all downstream metrics | [#178](https://github.com/LIT-Intel/logistics-intel/issues/178), [#182](https://github.com/LIT-Intel/logistics-intel/issues/182), [#175](https://github.com/LIT-Intel/logistics-intel/issues/175) | Trusted source totals and as-of coverage, no unapproved API-credit consumption |
| **1A** | Agent 1 Control Tower + Agent 3 Backend | `HarveyQueryPlanV1`, bounded planner/orchestrator, tool registry, multistep state, auth and quota boundaries | [#184](https://github.com/LIT-Intel/logistics-intel/issues/184) | Repeatable, logged tool traces; explicit source and date evidence |
| **1B** | Agent 5 Data + Agent 3 Backend | Parameterized analytical tools for company filters, German port data, verified TEU and incumbent lookup | [#185](https://github.com/LIT-Intel/logistics-intel/issues/185) | Geography, roles, and dates exact; counts, ranks, CSV match server query |
| **2** | Agent 6 QA + Agent 1 | 300-case evaluation corpus + scored execution trace assertions; stage-gate canary | [#186](https://github.com/LIT-Intel/logistics-intel/issues/186) | >=98% numerical validity of audited facts, >=95% correct filters/tool choice, 0 cross-tenant violations |
| **3** | Agent 2 Frontend + Agent 3 Integrations + Agent 7 GTM | One Harvey UX with explanation, multi-turn followups, research links, interactive grid, CRM approvals and exports | [#187](https://github.com/LIT-Intel/logistics-intel/issues/187) | Signed-in desktop/mobile E2E; no broken legacy flows; mainline launch with rollback |

## Reference acceptance query
> Find Georgia-based companies that imported ocean freight loaded in German ports during the last 12 complete months. Exclude freight forwarders and logistics competitors. Rank by verified Germany-lane TEU and show the primary freight forwarder for each. Explain who already uses DSV and suggest high-potential accounts.

**The engine must:**
1. Preserve **Georgia company location** distinct from destination port and Georgia deliveries; distinguish **German load port** from supplier country/ultimate origin.
2. Clarify/explicitly label `last 12 complete months` as a source-backed window, not arbitrary `now()-365`.
3. Exclude competitors using classified **company role**, not by excluding every company that has a forwarder.
4. Compute **lane-specific** shipments/TEU by authorized SQL and verified source; if TEU corrupted, disclose and withhold numeric TEU ranking.
5. Retrieve `top_forwarders` company-level information and **refuse to claim** the top forwarder handled German loads unless specific lane/BOL evidence exists.
6. Present results with all filters, exact row count, data-through/coverage, traceable sources, conditional ranked table, and qualifications for shipments loaded via Antwerp/Rotterdam.
7. Follow-ups `remove DSV accounts`, `only >10 verified TEU`, `show top 25`, `find decision makers` must rerun backend plans and maintain result-set state. Contact enrichment or sending requires plan and confirmation.

## Architecture contract
- **Harvey orchestrator:** authenticated and tenant scoped, typed plan plus constrained multi-step tool use, per-tool cost/time budget, feature flag, logging/observability, idempotent async heavy queries.
- **Deterministic freight tools:** `search_companies`, `search_trade_lanes`, `aggregate_shipments`, `lookup_forwarders`, `get_company_context`, `research_public_sources`, `find_contacts`, `save_list_preview`, `export_csv` with strict parameters and server-side enforcement. No free-form LLM SQL.
- **Fact lineage:** `dataset`, `source_record_ids`, `metric_unit`, `mode`, `window_start/end`, `data_through`, `provider_updated_at`, `coverage`, `quality_status`, `scope(company/port/lane)`.
- **One conversational front end:** Explore, Company Profile, CRM, Command Center with memory of filters/result_set_id; action surfaces separate from text, safe link/export handling.
- **Safe operations:** read-only by default; explicit user approval for sends, enrichment costs, full historical paid imports or changes to CRM; separate existing plan entitlements and org RLS.
- **Deployment:** PR test suite and Vercel preview, Supabase migrations with permission review, canary flag internal only, authenticated performance and data correctness, merge/deploy **main** and verify Vercel production READY. Keep rollback switch.

## Evaluation targets
- >=95% structured intent/filter/tool correctness; >=98% exact numeric facts where sources verified; 0 severe evidence or authorization errors, zero unauthorized outbound sends.
- Monitor search cached p95 <8 seconds, uncached bounded p95 <15 seconds as **initial engineering targets**, not current measured performance.
- Record false company-geography match, forwarder misclassification, carrier-vs-forwarder confusion, TEU quarantine leaks, source coverage, token and provider credits.
- No release labelled complete without signed-in production testing across representative companies and PDF/CSV reconciliation.

## Release decision principles
1. **Do not train on unverified numbers.** Prompts and evaluations are not a substitute for underlying normalized evidence.
2. **No paid import automation enabled without budget approval.**
3. **Do not invent direct-booking or forwarder names.** Use provider-reported label plus evidence class.
4. **No alternate user login/branch.** Branches are for PR/CI; app access and releases occur on `main`.
5. **No fake demo accounts in production data.** Use actual verified records and label all gaps.

## Tracking
Primary workstreams: #183 → #184 / #185 → #186 → #187. Data prerequisites: #178, #182, #175. Control Tower updates status only based on verified artifacts, CI logs, tests and deployments. This file is the canonical Harvey 2.0 implementation tracker; individual issues hold detailed checklists and acceptance evidence.
