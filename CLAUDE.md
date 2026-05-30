# CLAUDE.md — LIT (Logistics Intel)

Logistics intelligence + CRM SaaS. Read this first, every session.

## Operating docs (source of truth)

Before doing anything non-trivial, read the relevant brief from `docs/agents/`:

- **Mission & top priorities:** [docs/agents/LIT_MASTER_OPERATING_BRIEF.md](docs/agents/LIT_MASTER_OPERATING_BRIEF.md)
- **Active blockers (P0–P3):** [docs/agents/LIT_CURRENT_BLOCKERS.md](docs/agents/LIT_CURRENT_BLOCKERS.md) — check this before proposing new work
- **Agent ownership map (who owns what):** [docs/agents/LIT_AGENT_OWNERSHIP_MAP.md](docs/agents/LIT_AGENT_OWNERSHIP_MAP.md)
- **Schema (Supabase tables, RLS, expected fields):** [docs/agents/LIT_SCHEMA_MAP.md](docs/agents/LIT_SCHEMA_MAP.md)
- **"Done" definition per workstream:** [docs/agents/LIT_ACCEPTANCE_CRITERIA.md](docs/agents/LIT_ACCEPTANCE_CRITERIA.md)
- **File-level navigation:** [docs/agents/LIT_FILE_MAP.md](docs/agents/LIT_FILE_MAP.md)
- **Shared context pack:** [docs/agents/shared/shared-context-pack.md](docs/agents/shared/shared-context-pack.md)

## Stack

- **App:** React + Vite + React Router 7 — `frontend/`
- **Marketing site:** Next.js 14 App Router + Sanity CMS — `marketing/`
- **Backend:** Supabase (Postgres + Auth + Edge Functions in Deno)
- **Billing:** Stripe (webhooks live; webhook is signature-verified + idempotent — see `supabase/functions/billing-webhook/index.ts`)
- **External providers:** Apollo, Lusha, Phantombuster, Gemini, Anthropic (marketing), ImportYeti / Explorium for shipments
- **CMS for marketing:** Sanity (project `w0whm6ow` / `production`) — schema is MCP-managed

## Non-negotiable rules

1. **Branch lock for plan-limits / entitlements / usage work:** stay on `claude/review-dashboard-deploy-3AmMD`. Do not branch off. Do not deploy from a new branch for this workstream.
2. **Dashboard visual language is the source of truth** for all app pages. Drift from it is a P1.
3. **Stripe is the source of truth for billing.** No fake plans, no hardcoded prices in production paths.
4. **Supabase is the source of truth for access and entitlements.** All entitlement checks derive from `get-entitlements` edge fn (JWT-verified). Never query `subscriptions` from the frontend.
5. **Org admin and superadmin are different concepts.** `org_members.role = owner|admin` is workspace-level. `platform_admins` is platform-level. Do not conflate.
6. **Admin bypass is server-side only.** Frontend gating is UX hint; the security boundary is in the edge function.
7. **No fake APIs or placeholder billing logic** in production code paths.
8. **Every fix must identify file paths + dependencies + acceptance criteria** before landing.

## App architecture quirks (don't get bitten)

- **Two sidebars.** Admin pages render `frontend/src/layout/lit/AppSidebar.jsx`. Non-admin app pages use `frontend/src/components/layout/AppShell.jsx`. New admin links must be added to BOTH if they appear in both surfaces.
- **Canonical "saved company" table:** `lit_saved_companies` written via `save-company` edge fn. Free-trial save cap = 10. Admin bypass is server-side only.
- **Auth is Supabase, period.** Live routes use `ModernLoginPage` and `ModernSignupPage` (`App.jsx:200-202`) backed by `frontend/src/auth/supabaseAuthClient.ts`. Clerk was removed; do not reintroduce it. If you encounter a `@clerk/*` import anywhere, it is stale and must be deleted.
- **Entitlements:** single source of truth is `supabase/functions/get-entitlements/index.ts`. Frontend uses `useEntitlements()` hook in `frontend/src/hooks/useEntitlements.ts` (TanStack Query, cached, JWT-verified server snapshot). Deprecated `check-entitlements` was removed 2026-05-28 (unauthenticated/spoofable).
- **`frontend/src/lib/api.ts` is a 6,658-line god-object.** Splitting it is a planned P1 refactor. While it exists, prefer adding new domain code to dedicated files (`frontend/src/api/<domain>.ts`).

## Sanity / CMS

- LIT Sanity project: `w0whm6ow` / `production` dataset.
- siteSettings is a singleton at UUID `cbb66865-…` (MCP can't set `_id`; use type-filter for Studio singletons).
- Sanity schema is **MCP-managed**: the patch tool only works for already-deployed types. `sanity/schemas/*.ts` files in the repo no longer auto-deploy.

## Stripe price IDs

Starter/Growth/Scale annual price IDs live in [docs/agents/](docs/agents/) and the `plans` table. Use the `plans` table at runtime; never hardcode price IDs in app code.

## Required edge-function env vars

| Env var | Required by | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | billing-webhook, billing-checkout, billing-portal, get-billing-status, list-invoices, cancel-subscription, upcoming-invoice | Stripe API access |
| `STRIPE_WEBHOOK_SECRET` | billing-webhook | Signature verification (function fails at boot if unset) |
| `LIT_CRON_SECRET` | every `_shared/cron_auth.ts` consumer (pulse-*-tick, pulse-*-cron, send-campaign-email, subscription-email-cron, etc.) | Shared secret in `X-Internal-Cron` header that gates cron-only functions |
| `LIT_PUBSUB_AUDIENCE` | reply-receiver (Gmail Pub/Sub branch) | OIDC `aud` claim expected on Google Pub/Sub push tokens. Typically the function URL OR a service-account email. Without it, all Pub/Sub pushes 401 |
| ~~`LIT_BILLING_WEBHOOK_WRITE_ORG_ID`~~ | REMOVED 2026-05-30 | Replaced by direct writes. The earlier "Phase 4 flag" plan was built on the wrong column name (`org_id`); the live `subscriptions` table already has `organization_id`, so writing it requires no flag and no migration ordering — billing-webhook just writes the field on every event |
| `ANTHROPIC_API_KEY` | normalize-company | Claude API access for company enrichment |
| `SENTRY_DSN` | every edge function (via `_shared/logger.ts`) | Edge-side Sentry capture. **No-op when unset** — code stays silent. When set, every `log.error(...)` and any `log.warn(...)` carrying an `err` field auto-routes to Sentry with `fn`, `event`, and `user_id`/`org_id`/`request_id` tags. Direct envelope POST (no SDK) keeps cold-start fast. Optionally set `SENTRY_ENV` (defaults to `production` if `DENO_DEPLOYMENT_ID` is set) and `SENTRY_RELEASE` (defaults to `DENO_DEPLOYMENT_ID`) |
| `VITE_SENTRY_DSN` | frontend (Vite build env) | Frontend Sentry capture via `@sentry/react`. **No-op when unset.** Set in production env (Vercel / Fly / Render / wherever the Vite build runs). Auth scope is tagged automatically via AuthProvider — every captured event carries `user.id`, `user.email`, `org_id` tag, `plan` tag. Optionally set `VITE_SENTRY_ENV` (defaults to Vite's `MODE`) and `VITE_SENTRY_RELEASE` (release tag for source-map matching — see `SENTRY_AUTH_TOKEN` row below) |
| `SENTRY_AUTH_TOKEN` | frontend (Vite build env) | Sentry CLI auth token for **source map upload** during `vite build`. Generate at Sentry → Settings → Auth Tokens with `project:releases` + `project:write` scopes. **No-op when unset** — `@sentry/vite-plugin` skips silently and the build still succeeds. Set on Vercel (Production + Preview). Pairs with `SENTRY_ORG` (defaults to `lit-g0`) + `SENTRY_PROJECT` (defaults to `lit-frontend`). The plugin reads the release name from `VITE_SENTRY_RELEASE` first, then `VERCEL_GIT_COMMIT_SHA` (auto-set on Vercel), then `SENTRY_RELEASE`. Source maps are uploaded then deleted from `dist/` before deploy so they don't ship to users |
| `LIT_RESEND_API_KEY` | send-subscription-email, send-campaign-email | Resend API for outbound email |
| `LIT_INTERNAL_SECRETS` (table) | admin-notify | `admin_notify_secret` row authorizes platform notifications |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | every edge function | Standard Supabase env (auto-set in Supabase env) |

When adding a new edge function: prefer `_shared/auth.ts` (`requireUser` or `requireUserOrService`) over re-implementing the JWT check, `_shared/logger.ts` (`createLogger("<fn-name>")`) for structured logs, and `_shared/cron_auth.ts` (`verifyCronAuth`) for any function called by pg_cron.

## Workflow expectations

- **Quality over shortcuts.** Default to the properly-modeled path. Real tables over JSONB views. Real RLS over hacks. Enterprise SaaS principle.
- **Verify before claiming done.** "It compiles" is not "it works." UI changes need a browser. API changes need a request.
- Update the relevant brief in `docs/agents/` after non-trivial work.
- State assumptions explicitly. Never assume another agent already fixed a dependency without verifying.

## Skill routing (gstack)

This project has `gstack` skills installed. When the user's request matches a skill, invoke it via the Skill tool.

Key routing rules:
- Product ideas / brainstorming → `/office-hours`
- Strategy / scope of a plan → `/plan-ceo-review`
- Architecture / eng review of a plan → `/plan-eng-review`
- Design review of a plan → `/plan-design-review`
- Developer experience review → `/plan-devex-review`
- Full review pipeline on a plan → `/autoplan`
- Security audit of current diff or branch → `/cso`
- Pre-landing PR review → `/review`
- QA testing a URL → `/qa <url>` (report-only: `/qa-only`)
- Bugs / errors / "why is this broken" → `/investigate`
- Visual / UI polish on the live site → `/design-review`
- Ship / deploy / PR creation → `/ship`
- Land merged PR + verify deploy → `/land-and-deploy`
- Save / restore session context → `/context-save` / `/context-restore`
- Convert vague intent into spec / GitHub issue → `/spec`

See [AGENTS.md](AGENTS.md) for the coding-tasks recipe block used when spawning child Claude Code sessions.
