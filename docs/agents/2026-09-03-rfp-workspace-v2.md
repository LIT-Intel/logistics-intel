# RFP Workspace v2 — Implementation Handoff

## Outcome

RFP is restored as a server-backed, multi-lane commercial workspace integrated
with the existing Quoting module. This is not the retired local-storage RFP
Studio.

## Routes

- `/app/rfp` — RFP dashboard, KPIs, status filters, company search
- `/app/rfp/new` — new RFP intake
- `/app/rfp/:rfpId` — RFP workspace
- `/app/quoting` — related quote list, linked by the RFPs/Quotes switcher
- `/app/quoting/:quoteId` — quote revision generated from an RFP

## Implemented workflow

1. Select a saved Command Center company.
2. Create an opportunity and customer scope.
3. Build and price multiple lanes.
4. Compare customer lanes with observed LIT port-lane intelligence.
5. Upload private tender/rate documents.
6. Save status and activity history.
7. Create versioned quote records without overwriting the RFP.

## Backend

New Edge Functions:

- `rfp-company-context`
- `rfp-list`
- `rfp-detail`
- `rfp-save`
- `rfp-document`

Existing `quote-create` now accepts an optional validated `rfp_id`, assigns the
next revision on the server, and records the RFP activity event.

## Schema

Migration: `supabase/migrations/20260903120000_rfp_workspace_v2.sql`

Additive changes only:

- extends `lit_rfps` with dashboard fields and a human-readable number
- creates `lit_rfp_counters`, `lit_rfp_events`, `lit_rfp_documents`
- links `lit_quotes.rfp_id` and adds `revision_no`
- creates private `rfp-documents` Storage bucket with org-scoped RLS
- adds `WITH CHECK` to the existing `lit_rfps` update policy

## Billing boundary

This branch does not modify:

- Stripe functions or webhook logic
- `plans` or `plan_entitlements`
- subscriptions, pricing, credit costs, or usage limits
- billing UI

The billing workstream can add the final RFP entitlement and usage allowance
after its current plan model lands. Quote creation continues to use the existing
server-side `quoting` entitlement.

## Verification

- `npm run build` in `frontend/`: passes
- targeted ESLint: zero new errors
- `npx vitest run tests/rfp-workspace.test.ts`: 3/3 pass
- full legacy suite: 17 existing snapshot-contract failures unrelated to RFP
- full `tsc --noEmit`: blocked by pre-existing malformed JSX in
  `frontend/src/pages/Resources.jsx`
- browser CLI launch: blocked because no browser binary is installed and the
  environment rejected the Chrome download certificate

## Deployment order

1. Apply migration.
2. Deploy the five new `rfp-*` functions and updated `quote-create`.
3. Deploy frontend.
4. Smoke test authenticated create → save → upload → quote revision.
5. Add RFP entitlement only after the billing-plan branch is merged.
