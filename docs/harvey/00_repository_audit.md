# Harvey Contextual Copilot — Repository and Live-System Audit

Audited 2026-08-26 against `LIT-Intel/logistics-intel` (`main`) and Supabase project `jkmrfiaefxwgbvftohrb`. Live state wins over older design notes.

## Executive finding

Harvey 1.0 is a deployed, internal-only autonomous sales engine. The requested work is Harvey 2.0: a contextual freight-sales layer in Company Profile that must reuse the existing company aggregator, freight/Pulse data, Apollo contacts, CRM, and Harvey workers. It must not expose or replace the autonomous controller.

## 1–20 audit

| Area | Current implementation | Harvey implication |
|---|---|---|
| Frontend | Vite 6, React 18, React Router 7 in `frontend/`. A small root Next.js shell exists but is not the production Company Profile. | Build the MVP in `frontend/src/pages/CompanyProfileV2.tsx`; do not add a Next.js route. |
| Backend | Supabase Edge Functions (Deno) plus Node services under `services/` and BigQuery search services. | Add a JWT-protected Edge Function and shared pure contracts/builders. |
| Database | Supabase Postgres 17.6.1.063. | Reuse live tables/RPCs; new persisted state must ship through a migration with RLS. |
| Authentication | Supabase Auth JWT. `_shared/auth.ts` exposes `requireUser`, user-scoped and service clients. | Verify the JWT, resolve org server-side, and never accept an authoritative org from the browser. |
| Account/workspace | `organizations` + active `org_members`; platform admins are separate. Multiple legacy membership tables remain. | Canonical tenant boundary is active `org_members`; customer access and internal Lead CRM access are distinct. |
| CRM/pipeline | Customer CRM (`lit_deals`, tasks/activity) and separate internal Lead CRM (`lit_admin_leads`, stages, activity, members, RPCs). | Context can read the caller's saved/company data. Autonomous handoff is allowed only for Lead CRM members. |
| Company profile | Canonical `/app/companies/:id` renders `CompanyProfileV2`. `company-profile` Edge Function resolves UUID/key/domain/name and aggregates identity, shipments, contacts, activity, and cached Pulse. | Extend this data path; do not create another company resolver. |
| Search | Vite UI calls search/gateway services backed by BigQuery and Supabase directory data. | Search prioritization is later scope; Company Profile is MVP 1. |
| Contact enrichment | Apollo search/enrich, Lemlist fallback, Lusha paths, orchestrator, previews and saved `lit_contacts`. | Recommend from existing tenant-visible contacts; no enrichment spend on profile load. |
| Shipment/trade-lane | `lit_unified_shipments`, ImportYeti snapshots, `lit_company_lane_months`, source metrics, BigQuery services. | Freight claims cite their concrete source/field and observed window. |
| AI/LLM | OpenAI-powered qualification/writing, Pulse AI/Gemini, Claude normalization, Harvey approved knowledge/templates. | Context assembly and scores are deterministic. Draft generation reuses grounded facts; no ungrounded free-form answer. |
| API architecture | Supabase function invocation from `frontend/src/api`, gateway REST services, shared auth/logger/provider helpers. | New function follows shared auth/logger patterns and returns typed structured JSON. |
| Components | Tailwind, Radix primitives, Lucide, internal card/layout system. | Add an embedded Harvey panel that matches Company Profile; no floating chatbot. |
| State management | React hooks/context, TanStack Query for server data, small module stores. | Keep Harvey request state local/query-driven; no global chat store. |
| Logging/analytics | Structured Edge logs + Sentry; product event taxonomy exists; no universal client analytics abstraction. | Log request/action ids without copy or PII; persist autonomous activity only through existing audit tables. |
| Permissions/security | RLS on relevant tables; freight directory/shipments broadly readable to authenticated users, saved/contact/CRM data more restricted. Some legacy permissive-policy advisor warnings exist. | Server-side assembly must bind saved/contact/CRM reads to user/org. Service-role data can never be returned without explicit filtering. |
| Rates/benchmarks | Freight benchmark tables/functions and Company Profile rate/revenue cards exist. | Include only if present in context; label modeled values as inference. |
| Feature flags | `lit_feature_flags`, admin RPC, per-plan/global semantics. `harvey_internal_agent` is a separate fail-closed autonomous flag. | Add `harvey_contextual_copilot`; never reuse the autonomous kill switch for UI access. |
| Tests | Vitest unit/integration suites, Deno shared tests, Playwright E2E. | Add pure contract/builder tests, Edge auth/tenant checks where feasible, UI tests, then run frontend build. |
| Deployment | Frontend Vite deployment (Vercel config present), Supabase migrations/functions, CI workflows and drift docs. | Land a reviewable branch first. Do not deploy until tests/security checks pass. |

## Live-data corrections to older docs

- `lit_company_directory` is live with more than 78k rows.
- `lit_company_source_metrics` is live with 20k rows.
- `lit_company_contact_previews` is live.
- Domestic/inland opportunity is implemented by `lit_company_inland_freight`, `lit_domestic_inland_leg`, unified shipments, and drayage estimates.
- The deployed Harvey controller and workers are active code, while the autonomous feature has rollout `0` and a separate config gate.

## Security invariants

1. Contextual Copilot and Autonomous Harvey use different feature flags and authorization paths.
2. A user JWT is mandatory for every contextual action.
3. Organization is derived from active membership, never trusted from the request.
4. Saved-company, contacts, activity, Pulse, drafts, and CRM reads are filtered to the caller or derived org.
5. `Have Harvey Work This Lead` is denied unless `is_lead_crm_member(auth.uid())` is true.
6. FACT claims identify table/RPC and field; INFERENCE claims identify inputs and method.
7. No outbound send occurs from the contextual endpoint. Email/LinkedIn are drafts only.

## Relevant current Supabase changes

The audit accounts for the 2026 Data API opt-in change, Node 20 support removal, Postgres 17, and Deno 2.1 hosted runtime. New tables explicitly grant only required roles and enable RLS.
