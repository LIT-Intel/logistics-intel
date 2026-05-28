# Observability: Sentry + structured logs + provider-spend dashboard

**Date:** 2026-05-28
**Status:** PLAN
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Owner:** Backend / Edge Functions + App Frontend
**Blocker resolved:** B-004 root cause (you can't fix Pulse over-consumption you can't see) + F-010 from CEO review

---

## Problem

Today: all logging is `console.log/warn/error` string-prefix style. No Sentry on frontend or edge. No traces from `frontend → edge → DB → external API`. No spend telemetry — you only see Anthropic / Apollo / Lusha / Gemini cost after a billing cycle.

This makes:
- Root-cause investigation slow (CEO review F-001 normalize-company cost amplification would be invisible until the Anthropic bill arrives)
- Pulse cost-control (B-004) reactive instead of proactive
- Incident response (B-003 admin dashboard) blind

## Phase 1 — Structured logger (done on this branch)

`supabase/functions/_shared/logger.ts` ships a JSON-line `createLogger(fn, base)` helper. New functions and any function being touched should adopt it instead of `console.log("[fn] ...")` strings.

Example migration of `save-company/index.ts:77`:
```ts
// Before
console.log(JSON.stringify({ fn: 'save-company', requestId, user_id, stage, ts: new Date().toISOString() }));
// After
const log = createLogger("save-company", { request_id: requestId, user_id });
log.info("save_attempt", { stage });
```

## Phase 2 — Sentry on frontend (1d / 2h)

- Sign up for Sentry (free tier covers 5k errors/mo; team tier $26/mo as the app scales).
- Install `@sentry/react` in `frontend/`.
- Wrap the root in `<ErrorBoundary>` + `Sentry.init({ dsn, tracesSampleRate: 0.1 })`.
- Capture all unhandled errors, route changes, and explicit `Sentry.captureException` for API failures inside `_client.ts`'s `EdgeFunctionError` path.
- Tag with `user_id`, `org_id`, `plan` from `useAuth()`.

## Phase 3 — Sentry on edge functions (1d / 2h)

- Install `@sentry/deno` in shared helpers.
- Wrap every `serve(...)` handler in a try/catch that captures the exception with context (fn name, user_id, request_id) before re-throwing.
- Add to `_shared/auth.ts`: emit a `Sentry.setUser({ id, email })` when `requireUser` succeeds.

## Phase 4 — Provider-spend telemetry (2d / 4h)

Create table `provider_spend_log`:
```sql
create table provider_spend_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  fn text not null,                -- 'normalize-company', 'pulse-search', 'apollo-job-postings'
  provider text not null,          -- 'anthropic', 'openai', 'apollo', 'lusha', 'gemini', 'phantombuster', 'resend', 'stripe'
  user_id uuid references auth.users(id),
  org_id uuid references organizations(id),
  request_id text,
  -- cost estimate in cents at time of call (provider-specific)
  estimated_cost_cents int,
  -- provider-supplied identifiers for correlation
  upstream_request_id text,
  -- raw metrics
  tokens_in int,
  tokens_out int,
  api_calls int default 1,
  metadata jsonb
);
create index provider_spend_log_org_id_ts on provider_spend_log (org_id, ts desc);
create index provider_spend_log_provider_ts on provider_spend_log (provider, ts desc);
```

Helper in `_shared/spend.ts`:
```ts
export async function logProviderSpend(admin, params: {
  fn: string; provider: string; user_id?: string; org_id?: string;
  request_id?: string; estimated_cost_cents?: number;
  upstream_request_id?: string; tokens_in?: number; tokens_out?: number; metadata?: unknown;
});
```

Wire into every Anthropic / OpenAI / Apollo / Lusha / Gemini / Resend / Stripe call. Use Anthropic's `usage` block + price-per-token to estimate cost. Same for OpenAI. Apollo/Lusha provide credit deltas in response headers — use those.

## Phase 5 — Admin spend dashboard (1d / 2h)

Add to admin dashboard:
- MTD spend per provider (sum cost cents, group by provider)
- MTD spend per org (sum cost cents, group by org_id), sorted desc
- 7-day trend per provider
- Top 10 functions by call volume
- Alert thresholds (org spend > $X, provider spend > $Y this week)

This closes B-004's structural root cause: you'll see Pulse cost-spikes as they happen, not when the bill arrives.

## Phase 6 — Alerts (2h / 30m)

Sentry alert rules:
- Any CRITICAL Sentry error → Slack #incidents
- New error type (first occurrence) → Slack #incidents
- Error rate >1/min for >5min → page on-call

Spend alerts (cron in Supabase):
- Per-org spend exceeds 2x rolling 7d average → email + admin notification
- Per-provider spend >$100 in 1h → email
- Per-user spend amplification (>200 enrichment calls/hour) → block + email

## Acceptance criteria

- [ ] All new edge functions use `createLogger`
- [ ] All existing edge functions migrated to `createLogger` (or scheduled)
- [ ] Sentry captures unhandled frontend errors with user/org context
- [ ] Sentry captures edge function exceptions with fn/user context
- [ ] `provider_spend_log` row written for every paid external call
- [ ] Admin dashboard shows current and recent provider spend
- [ ] Spend alerts fire on amplification patterns
- [ ] On-call rotation defined with Sentry → Slack wiring

## Effort

| Phase | Human | CC |
|---|---|---|
| 1 — Structured logger | done | done |
| 2 — Sentry frontend | 1d | 2h |
| 3 — Sentry edge | 1d | 2h |
| 4 — Provider spend telemetry | 2d | 4h |
| 5 — Admin spend dashboard | 1d | 2h |
| 6 — Alerts | 2h | 30m |
| **Total** | **~1 week** | **~10h** |

## Risk

- Sentry signup is a one-way external dependency. Recommended given the scale.
- `provider_spend_log` adds a write per external call. Negligible (a few ms). Don't write synchronously inline if it would block the response; fire-and-forget via background task.
