# 2026-06-09 — Drift cleanup post-audit

## Functions to DELETE from Supabase (operator action required)

The drift audit found two production-deployed edge functions with no
git source and no useful behavior. They should be deleted via the
Supabase Dashboard → Edge Functions UI or `supabase functions delete`:

1. **firmographics-backfill** — 17-line Gemini-models diagnostic stub.
   Superseded by the production-real `firmographics-backfill-once`
   used by the daily cron. Deleting is safe; no callers in repo.

2. **sentry-probe** — 7-line 410-Gone stub. Retired per CLAUDE.md.
   Deleting is safe; no callers in repo.

## How to delete

```bash
supabase functions delete firmographics-backfill --project-ref jkmrfiaefxwgbvftohrb
supabase functions delete sentry-probe --project-ref jkmrfiaefxwgbvftohrb
```

Or via Dashboard: Edge Functions → select fn → ... menu → Delete.

## Verification after deletion

```bash
supabase functions list --project-ref jkmrfiaefxwgbvftohrb | grep -E "firmographics-backfill$|sentry-probe"
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
