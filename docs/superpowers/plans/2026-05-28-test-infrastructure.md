# Stand up test infrastructure (item 10)

**Date:** 2026-05-28
**Status:** PLAN
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Owner:** QA / Release / Debug + App Frontend + Backend / Edge Functions
**Blocker resolved:** F-004 (no test infrastructure) from CEO review

---

## Problem

Root `package.json` has `vitest` as a dev dep but no scripts, no config, no tests. Frontend has no test framework. No CI gating around tests. With 76 edge functions, 51 frontend pages, a Stripe billing surface, and a hybrid auth system, every PR is a coin flip.

The good news: `supabase/functions/_shared/*.test.ts` exists for 7 utilities (`alert_diff`, `dcsa_event_map`, `digest_render`, `drayage_cost`, `hapag_client`, `maersk_client`, `materialize_bols`, `osrm_client`, `scac_router`, `outreach-throttle`, `reply-correlate`). Whoever wrote those started the right pattern; it just hasn't been generalized.

## Goal

Ship three test surfaces, in order of payback:

1. **Vitest unit tests** for `frontend/src/api/*`, `frontend/src/lib/*`, `frontend/src/hooks/*`.
2. **Deno test** for `supabase/functions/_shared/*` and per-function logic (extracted from `index.ts` into testable helpers).
3. **Playwright E2E** for the 5 user-critical golden paths: signup → onboarding, search → save company, build campaign, send campaign, billing checkout.

Gate `/ship` on green tests for the touched surface.

## Phase 1 — Vitest scaffold (1d / 2h)

Add to root `package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^4.0.12",
    "@testing-library/react": "^16",
    "@testing-library/jest-dom": "^6",
    "jsdom": "^25",
    "msw": "^2"
  }
}
```

Add `vitest.config.ts` at frontend root scoping to `frontend/src/**/*.test.{ts,tsx}` with jsdom env. Mock Supabase via MSW.

First test: `frontend/src/api/entitlements.test.ts` — verifies the snapshot shape, EdgeFunctionError handling, and the admin-bypass derivation in `useEntitlements`.

## Phase 2 — Deno test for edge functions (2d / 4h)

Extract pure-function logic out of `index.ts` into `helpers.ts` modules so they're testable without spinning up Deno's HTTP server. Pattern from the existing `_shared/alert_diff.test.ts`.

First tests:
- `supabase/functions/_shared/auth.test.ts` — `requireUser`, `requireUserOrService`, `resolveUserOrg`, `isUserAdmin`. Mock `auth.getUser()`.
- `supabase/functions/billing-webhook/handlers.test.ts` — Stripe event handlers (extracted from `index.ts`). Cover: signature verification, idempotency claim, plan-code derivation, period-end updates, cancellation flow.
- `supabase/functions/get-billing-status/index.test.ts` — org-owner fallback resolution (the tactical fix shipped 2026-05-28).
- `supabase/functions/save-company/index.test.ts` — free-trial save cap (10), admin bypass, RLS posture.

## Phase 3 — Playwright E2E (3d / 6h)

Install `@playwright/test`. Add `playwright.config.ts` targeting `https://app.logisticintel.com` for staging and `http://localhost:5173` for dev.

Golden paths:
1. **Signup → onboarding** — Supabase magic link or email/password (post-Clerk-removal). Lands on `/app/dashboard`. Covers B-005.
2. **Search → save company** — Authenticated user searches "Sony", saves a company, sees it in command center. Verifies B-002 fix and the `save-company` write path.
3. **Build campaign** — Create campaign, add 3 companies from search, set up sequence templates.
4. **Send campaign** — Trigger send to a test mailbox (test-only Resend domain). Verifies outreach pipeline end-to-end.
5. **Billing checkout** — Trial user clicks Upgrade → Growth → Stripe checkout (test mode) → back to `/billing?checkout=success` → page reflects new plan within 30s (webhook lag tolerance). Covers B-001.

## Phase 4 — CI gating (2h / 30m)

Add `.github/workflows/test.yml`:
- Runs `vitest run` on PRs touching `frontend/**`
- Runs Deno test on PRs touching `supabase/functions/**`
- Runs Playwright nightly + on `main` (E2E too slow per-PR)
- Required check on the `claude/*` branch protection rule

Wire `/ship` to refuse a PR with red unit tests.

## Acceptance criteria

- [ ] `npm test` from repo root runs the full Vitest suite green
- [ ] `deno test supabase/functions/_shared/` runs green
- [ ] `npx playwright test` runs the 5 golden paths green against staging
- [ ] PR builds fail on red tests for touched surfaces
- [ ] At least 1 test per file in `frontend/src/api/*` (the new domain layer)
- [ ] Auth + entitlements + billing webhook covered (the highest-stakes paths)

## Effort

| Phase | Human | CC |
|---|---|---|
| 1 — Vitest scaffold + first test | 1d | 2h |
| 2 — Deno tests for shared + billing/entitlements paths | 2d | 4h |
| 3 — Playwright E2E for 5 golden paths | 3d | 6h |
| 4 — CI gating | 2h | 30m |
| **Total** | **~1 week** | **~13h** |
