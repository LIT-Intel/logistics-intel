# LIT MASTER OPERATING BRIEF

## Product
LIT (Logistics Intel) is a logistics intelligence and CRM SaaS platform combining:
1. Import/export shipment intelligence
2. Company and contact intelligence
3. CRM / Command Center workflows
4. Campaign execution and outbound automation
5. Billing, subscriptions, entitlements, and usage control

## Core Platform Areas
- Dashboard
- Search
- Command Center
- Pulse
- Campaigns
- Settings
- Billing
- Admin Dashboard
- Website

## Current Stack
- Frontend app: React / Vite
- Backend: Supabase
- Functions: Supabase Edge Functions
- Billing: Stripe
- Website target: Next.js + Vercel + Sanity
- External providers: Explorium and shipment intelligence sources

## Non-Negotiable Rules
- Dashboard visual language is source of truth for all app pages
- Stripe is source of truth for billing
- Supabase is source of truth for access and entitlements
- No fake APIs or placeholder billing logic in production paths
- Org admin and superadmin are different concepts
- Every fix must identify file paths, dependencies, and acceptance criteria

## Current Top Priorities
1. Billing truth and Stripe sync
2. Feature entitlements and usage gating
3. Admin dashboard stability and access
4. Pulse query accuracy and cost control
5. Signup/invite/admin flow stability
6. Website architecture and SEO foundation

## Known Risks
- Billing page does not fully match Stripe
- Entitlements are not reliably enforced
- Admin dashboard has relied on missing backend assumptions
- Pulse can over-consume credits
- Context drift across chats and agents

## Source-of-Truth References
- This brief
- Agent ownership map
- Handoff log
- Schema map
- File map
- Acceptance criteria

## Working Method
Every agent must:
- read this brief first
- update handoff log after work
- state assumptions explicitly
- identify blockers clearly
- never assume another agent already fixed a dependency without verifying

## 2026-10-19 correctness and latency update

Scope: preserve the deployed page layout while correcting data and loading; retain the requested CRM move and shorter onboarding. Baseline: production commit `203f3462368c2f392d06bbd5aabb0e0b2c0abe1e`.

- Active data paths: `features/command-center/data/useCommandCenterData.ts`, `features/dashboard/data/useDashboardData.ts`, and `features/company-profile/data/{useCompanyShipments,rollups,selectors}.ts`. Saved accounts must render independently of monthly-history, owner, and contact enrichment. Query caches include the viewer, workspace and plan. Profile navigation resets local company state and retains the existing search seed.
- Read every stored BOL/lane page with deterministic ordering. Failed pages must not be labeled complete. Company source totals remain authoritative over modeled document TEU; source conflicts and missing lane coverage stay visible. No sample distribution is scaled to a full company total.
- `OverviewWidgets.tsx`: current/prior-period tooltips; observed FCL/LCL with light green LCL and an unclassified remainder. Unknown service types remain unknown. `InsightRail.tsx` and `CDPDetailsPanel.tsx` host the single CRM panel immediately after Firmographics. Notify parties are not confirmed incumbents; the incumbent card requires an explicit source forwarder field.
- Supabase dependencies: `importyeti-proxy`, shared monthly evidence/parser and BOL pagination helpers, and migration `20261019172039_intel_accuracy_signup_onboarding.sql`. Work-email policy covers password, OAuth and invite creation at the Auth/database boundary; existing logins remain permitted. The three-step preferences RPC writes only `auth.uid()`'s profile, without billing changes.
- Acceptance: focused tests, production build, Deno check, database policy/isolation tests, and browser rendering. Release must apply the additive migration before the frontend preflight/onboarding RPC calls are published. Keep the previous deployment/function bundle available for rollback.
- Live bounded check: VisionNav Robotics USA, 2026: 54 reported shipments / 161 TEU, 50 stored BOLs, no lane rollup. The four-record difference is a source-coverage gap, not permission to invent lane records.
- Existing broad-check failures observed on this baseline: unused `pages/Resources.jsx` has malformed JSX that blocks whole-project `tsc`; `CampaignKpiHero.test.tsx` expects a retired draft summary. Neither is part of this change. Affected tests and the production bundle are checked independently.

Release status: backend migration applied as `20261019235955`; `importyeti-proxy` v280 active with JWT verification. Live preflight/API protection checks pass. Frontend release pending. Focused frontend: 68 tests pass; source-pagination tests: 3 pass; production build and Deno check pass. The private allowlist's RLS/no-policy INFO is intentional deny-all: client roles have no table grants.
