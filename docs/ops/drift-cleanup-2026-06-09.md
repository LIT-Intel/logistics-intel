# 2026-06-09 — Drift cleanup post-audit

## Functions to DELETE from Supabase (operator action required)

The drift audit found production-deployed edge functions with no git
source and no useful behavior. They should be deleted via the
Supabase Dashboard → Edge Functions UI or `supabase functions delete`:

1. **firmographics-backfill** — 17-line Gemini-models diagnostic stub.
   Superseded by the production-real `firmographics-backfill-once`
   used by the daily cron. Deleting is safe; no callers in repo.

2. **sentry-probe** — 7-line 410-Gone stub. Retired per CLAUDE.md.
   Deleting is safe; no callers in repo.

3. **_shared-agentcash** — orphan library file (`agentcash.ts`) deployed
   as a standalone Supabase function. The bound `_shared/agentcash.ts`
   referenced by `importyeti-proxy` no longer exists in git; no edge
   function imports the deployed copy. Deleting is safe; zero callers.

4. **_shared-lusha** — same pattern as `_shared-agentcash`. Orphan
   `lusha.ts` library file deployed as a Supabase function. No edge
   function imports the deployed copy. Deleting is safe; zero callers.

## How to delete

```bash
supabase functions delete firmographics-backfill --project-ref jkmrfiaefxwgbvftohrb
supabase functions delete sentry-probe --project-ref jkmrfiaefxwgbvftohrb
supabase functions delete _shared-agentcash --project-ref jkmrfiaefxwgbvftohrb
supabase functions delete _shared-lusha --project-ref jkmrfiaefxwgbvftohrb
```

Or via Dashboard: Edge Functions → select fn → ... menu → Delete.

## Verification after deletion

```bash
supabase functions list --project-ref jkmrfiaefxwgbvftohrb | grep -E "firmographics-backfill$|sentry-probe|_shared-agentcash|_shared-lusha"
```

Expected: no matches.

## Related drift commits (this same audit)

- `fix(drift): commit deployed v9 + v5 sources for subscription email fns`
  — reverse-engineered `send-subscription-email` v9 (Gabriel sender +
  SALES_FROM env override) and `subscription-email-cron` v5 (inlined
  cron auth + logger) into git so the next `supabase functions deploy`
  doesn't clobber production behavior.
- `attio-activity-mirror` v1 verified in sync with git source — no
  action required.
- `fix(drift): commit deployed v66 source for phantombuster-linkedin`
  — reverse-engineered phantombuster-linkedin (large multi-feature fn).

## 2026-06-09 follow-up audit (Investigations A / B / C)

### Investigation A — 7 MAJOR_DRIFT cases triaged

All 7 functions audited turned out to be SAFE — no clobber risk:

| Function | Status | Notes |
|---|---|---|
| `apollo-contact-enrich` | SAFE_GIT_AHEAD | Git has additional inline comments; deployed v43 is functionally identical. No action. |
| `apollo-contact-search` | SAFE_GIT_AHEAD | Same — git just has more comments. Deployed v48 logic matches. No action. |
| `pulse-ai-enrich` | SAFE_GIT_AHEAD | Git adds `createLogger` import; deployed v43 uses `console.log`. Same logic. No action. |
| `company-profile` | SAFE_GIT_AHEAD | Git has expanded comments; deployed v21 logic identical. No action. |
| `email-oauth-callback` | SAFE_REFORMAT_ONLY | Deployed v47 is single-line minified; git is formatted. Same logic. No action. |
| `pulse-arrival-alerts` | SAFE_REFORMAT_ONLY | Deployed v12 minified; git formatted. Same logic. No action. |
| `pulse-bol-tracking-tick` | SAFE_REFORMAT_ONLY | Deployed v11 minified; git formatted. Same logic. No action. |

### Investigation B — 4 deployed-only fns triaged

| Function | Classification | Action |
|---|---|---|
| `_shared-agentcash` | SAFE_DELETE | Added to deletion list above. |
| `_shared-lusha` | SAFE_DELETE | Added to deletion list above. |
| `admin-marketing-api` | IN_USE → committed | Reverse-engineered v22 source committed to git (super-admin marketing campaigns gateway with Resend send_test). |
| `generate-signals` | IN_USE → committed | Reverse-engineered v12 source committed to git (produces `lit_signals` rows consumed by `frontend/src/components/dashboard/SignalsCard.tsx`). |

### Investigation C — Sample of 10 older fns

| Function | Status | Notes |
|---|---|---|
| `pulse-digest-preview` | MATCH | Git and deployed v12 are byte-identical. |
| `pulse-drayage-recompute` | MATCH | Git and deployed v18 align. |
| `pulse-list-digest-email` | MATCH | Git 444 lines vs deployed v34 — same logic. |
| `pulse-refresh-lists` | MATCH | Git 289 lines vs deployed v35 — same. |
| `pulse-unified-shipments-backfill` | MATCH | Git 55 lines vs deployed v15 — same. |
| `pulse-web-discover` | MATCH | Git 634 lines vs deployed v15 — same. |
| `resend-inbound-webhook` | **MAJOR_DRIFT → committed** | No git source; reverse-engineered deployed v16 (Resend inbound webhook with 3-tier reply matching). |
| `resend-webhook` | MATCH | Git 202 lines vs deployed v68 — same. |
| `save-company` | MATCH | Git 280 lines (with `createLogger`) vs deployed v89 — same logic. |
| `save-signature` | **MAJOR_DRIFT → committed** | No git source; reverse-engineered deployed v21 (server-side HTML sanitizer for user signatures). |

### Remaining 13 older fns not yet audited (deferred)

To keep this dispatch bounded, 13 of the original 23 skipped older
functions were NOT audited in this pass. They should be triaged in
a future session if drift is suspected. List captured at the end of
`docs/ops/edge-fn-drift-ci.md`.

## Summary of files committed in this audit follow-up

Four reverse-engineered source files added under
`supabase/functions/`:

- `admin-marketing-api/index.ts` (~390 lines, super-admin gateway)
- `generate-signals/index.ts` (~280 lines, signals generator for SignalsCard)
- `resend-inbound-webhook/index.ts` (~440 lines, inbound reply matcher)
- `save-signature/index.ts` (~270 lines, signature HTML sanitizer)

All four carry a lineage comment header documenting the deployed
version they were reverse-engineered from. No behavior changes — the
next `supabase functions deploy` should be a no-op for these slugs.
