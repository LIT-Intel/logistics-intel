# Split `frontend/src/lib/api.ts` by domain

**Date:** 2026-05-28
**Status:** IN PROGRESS — scaffold landed, mechanical migration pending
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Owner:** App Frontend
**Blocker resolved:** F-003 (api.ts god-object) from CEO review

---

## Problem

`frontend/src/lib/api.ts` is 6,658 lines and was touched 41 times in the last 30 days. Search + companies + contacts + campaigns + pulse + billing + RFP + filters + dev fallbacks all mixed in one file. Every parallel branch fights over it. No domain ownership, no tree-shaking, no test surface, no type isolation. This is the single biggest velocity tax in the codebase.

`@tanstack/react-query` is already a dep (`^5.87`) but is only used in ~3 places. Most fetches are raw async calls with hand-threaded auth headers.

## Done (this branch)

- `frontend/src/api/_client.ts` — `invokeEdge<T>(name, body)` wrapper + `EdgeFunctionError` + `getAccessToken()`. New domain code calls this; old code keeps working.
- `frontend/src/api/entitlements.ts` — worked example: `fetchEntitlementsSnapshot()`. `useEntitlements` now imports from `@/api/entitlements`, not from `@/lib/api.ts`.
- CLAUDE.md updated to say new domain code goes in `frontend/src/api/<domain>.ts`.

## Target file shape

```
frontend/src/api/
  _client.ts                  shared invoke wrapper, error type, auth helpers
  entitlements.ts             get-entitlements snapshot (done)
  billing.ts                  get-billing-status, billing-checkout, billing-portal, list-invoices, cancel-subscription, upcoming-invoice
  companies.ts                save-company, company-profile, company search, command center
  search.ts                   searchCompanies, searchLeads, filter options, typeahead
  pulse.ts                    pulse-search, pulse-coach, pulse-coach-v2, pulse-brief, pulse-refresh-*
  contacts.ts                 enrich-contacts, enrich-campaign-contacts, lusha-*, apollo-*
  campaigns.ts                send-campaign-email, queue-campaign-recipients, campaign analytics
  outreach.ts                 OAuth flows (gmail/outlook), email-oauth-*, reply-receiver, list-* / threads
  admin.ts                    admin-api, admin-audit-export, admin-notify, affiliate-admin
  affiliate.ts                affiliate-* (apply/review/invite/lookup/referrals)
  cms.ts                      Sanity reads, CMS manager calls (if any)
  ai.ts                       normalize-company, gemini-brief, gemini-enrichment, anthropic-backed calls
```

Each module: pure functions returning typed Promises. Hooks (`useFoo()`) live in `frontend/src/hooks/` and wrap these with TanStack Query.

## Migration sequence (by call frequency, hot files first)

1. **entitlements.ts** — done.
2. **billing.ts** — small surface, recently touched, easy to verify. Extract: `getBillingStatus`, `createStripeCheckout`, `createStripePortalSession`, `listStripeInvoices`, `cancelStripeSubscription`, `previewUpcomingInvoice`. Replace callers in BillingNew.tsx, SettingsPage.tsx, OnboardingFlow.tsx.
3. **search.ts** — `Search.tsx` was rewritten last week. Carve out `searchCompanies`, `postSearchCompanies`, `getFilterOptions`, `getCommandCenterAvailableYears`, typeahead helpers. Drop the `apiDev.ts` parallel structure or pivot it to a single dev-mode flag inside `_client.ts`.
4. **pulse.ts** — high traffic, multi-version functions (`pulse-coach` + `pulse-coach-v2`). Rename to `pulseProactiveCards` and `pulseChatComposer` so the two surfaces are self-documenting.
5. **companies.ts** — `save-company`, `company-profile`, `export-company-profile`, command-center reads.
6. **contacts.ts** — Apollo + Lusha + enrichment helpers.
7. **campaigns.ts + outreach.ts** — recently active (outreach engine). Coordinate with whoever last shipped to avoid stash conflicts.
8. **admin.ts + affiliate.ts** — lower traffic, do last.

After each domain ships, the matching block in `lib/api.ts` becomes a thin re-export so existing imports keep working. After all domains land, sweep imports, delete `lib/api.ts`.

## Hook conventions (TanStack Query)

```ts
// frontend/src/hooks/useEntitlements.ts (the pattern)
const { data, isLoading } = useQuery({
  queryKey: ['entitlements'],
  queryFn: fetchEntitlementsSnapshot,
  enabled: Boolean(user),
  staleTime: 60_000,
  gcTime: 5 * 60_000,
});
```

- One query key per resource.
- `staleTime` set per domain (entitlements: 60s; billing: 30s; pulse search: 0).
- Mutations use `useMutation` + `queryClient.invalidateQueries(['domain'])` on success.
- Never re-implement caching inside a domain module — that's TanStack's job.

## Acceptance criteria

- [ ] Every edge function call in the frontend goes through `@/api/<domain>.ts`
- [ ] `frontend/src/lib/api.ts` reduced to zero non-re-export code
- [ ] `frontend/src/lib/api.ts` deleted
- [ ] No remaining imports of `@/lib/api` (grep clean)
- [ ] Every data-fetching component uses a TanStack `useQuery` hook
- [ ] `frontend/src/api/apiDev.ts` (the dev fallback layer) collapsed into `_client.ts` behind a single flag, or removed
- [ ] Type coverage parity: every public function exports its response type

## Effort estimate

Per domain: ~30 min CC + ~30 min human review per domain. ~12 domains. ~12h CC + ~6h human review across 3-4 PRs.

## Risk + rollout

- **Two-way door** at every domain step. Each domain ships behind a re-export shim so callers keep working.
- Conflicts with the 14 in-flight stashes — triage those first (item 4 of CEO upgrade path).
- Land `billing.ts` first on a clean branch (it's the smallest meaningful surface and unblocks the subscriptions-org-keyed migration too).
