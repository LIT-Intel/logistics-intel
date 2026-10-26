# Harvey 3.0 — intelligence foundation (2026-10-26)

Status: architecture/evaluation foundation; NOT production runtime activation.

## Verified as-built inventory
- `supabase/functions/_shared/llm.ts`: shared Anthropic Messages / OpenAI Responses text caller; current OpenAI default is gpt-4o; no tool loop in this abstraction.
- `supabase/functions/harvey-copilot/index.ts`: authenticated contextual Q&A + bounded historical-provider `research_search`; requires feature flag and active org.
- `supabase/functions/_shared/harvey_forwarder_plan.ts`: deterministic parser for reviewed providers and states; refuses recent lanes, air, and unverified TEU.
- `supabase/functions/_shared/harvey_research_search.ts`: source-qualified historical-provider results, NOT a general freight research planner.
- `supabase/functions/pulse-coach-v2/index.ts`: separate account assistant with contextual account/usage/campaign state and different prompt/model.
- `frontend/src/features/pulse/explore/InsightsPanel.jsx`: constructs an aggregate + capped sample for Pulse Coach, not an unrestricted authoritative result-set query.
- `supabase/functions/harvey-research/index.ts`: internal lead-CRM research of prospective LIT customers, not shipper research; do not conflate with user-facing company search.

## Required architecture (design, not live)
One server-side Harvey orchestrator with authenticated organization context, policies, capability registry, bounded tool planner, execution log, and natural-language answer composer. Existing read-only tools remain available; no model-generated SQL.

Phase A: model-independent `HarveyIntentV1` classifier / query plan validated with strict schema. Unsupported tool capabilities respond with coverage explanation instead of generic hallucinated output.
Phase B: verified tool adapters — company search, shipment aggregates and periods, directory provider history, company profile, eligible contact enrichment, CRM summary. Exact source field lineage on metrics.
Phase C: result-set service — one stable server result_id, sort/filter/page/export contract; Map and List share the same result version. Company identifiers resolved from source IDs and org-access policies.
Phase D: conversation state — immutable turns with data scope, resolved entities, source evidence, filters, and user-approved action decisions. Bounded turn history; no silent execution of write/send actions.
Phase E: answer composer — human conversational paragraph, findings, caveats, follow-up suggestions and structured result metadata; cite datasets/period, never assert air shipment counts from ocean BOL.
Phase F: rollout: feature flag, baseline evaluation, signed-in E2E and cross-organization isolation, performance budget, monitored release.

## Evaluation strategy
`frontend/src/lib/harvey/evals/harvey_v3_scenarios.json` contains exactly 1,000 deterministic input-intent test scenarios. These are **not** 1,000 trained responses or proof of capability. They are fixture data for a golden test suite to exercise parser contracts, unsupported data gates, tool selection, conversational reformulations and approval requirements.

Category quotas: company_discovery 200; shipment_analytics 200; forwarder_history 150; opportunity_reasoning 150; crm_and_enrichment 100; outreach 100; conversation_memory 100.

Quality gates proposed (must calibrate after baseline): 95% plan classification accuracy, 98% numeric claims supported by actual source fields, zero fabricated AWB counts/confirmed incumbents, 100% confirmation gate for sends/updates, 100% tenant-isolation regression, p95 interactive answer target subject to measured baseline.

## Rules for other teams
- Product: preserve current Map; single result table rather than duplicate Harvey list; opt-in List.
- Data: no blank metric replaced with fabricated figures. Define entity join and source/period before display.
- Backend: central auth and guardrails. Preserve `research_search` compatibility until a versioned replacement is tested.
- Frontend: render `answer_md` as natural language and hydrate results from canonical server records, not sampled chat text.
- QA: fixtures must have assertions and controlled mock fixtures. Never run outbound message sends as tests.
- Release: Cloudflare-accessible end-user tests use main only after gates, but do not merge incomplete agent runtime solely to expose UI.

## Deferred work
CBP air-waybill source investigation remains explicitly out of scope until pending Harvey architecture, data tools and QA are complete.
