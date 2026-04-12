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
