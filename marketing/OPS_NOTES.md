# Marketing site — operational notes

Tracking env vars, deploy ops, and agent fleet runtime status for the
LIT marketing site (Next.js 14 + Sanity CMS + Vercel).

## Environment variables

### Required for the public site to render real content

| Variable | Required | Default fallback | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | `https://logisticintel.com` | Used in canonical, OG, sitemap. Override in preview envs. |
| `NEXT_PUBLIC_APP_URL` | yes | `https://app.logisticintel.com` | "Sign in", redirects |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | yes | `placeholder` | Without it, Sanity queries return null → empty-state copy. |
| `NEXT_PUBLIC_SANITY_DATASET` | yes | `production` | |
| `NEXT_PUBLIC_SANITY_API_VERSION` | yes | `2024-10-15` | |
| `SANITY_API_READ_TOKEN` | for /studio | — | Preview drafts in Studio |
| `SANITY_API_WRITE_TOKEN` | yes for agents | — | Write client used by all 8 cron agents + seed |
| `NEXT_PUBLIC_LOGO_DEV_KEY` | recommended | — | Falls back to public logo.dev (rate-limited) |
| `CRON_SECRET` | yes | — | Gates `/api/cron/*` |

### Required for the Phase 4 agent fleet

| Variable | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | blog-drafter, glossary-expander, news-watcher, comparison-refresh | Each agent gracefully no-ops without it (returns `{skipped:1}`). |
| `SUPABASE_URL` | trade-lane-refresh | Reads shipment data from your existing app DB. |
| `SUPABASE_SERVICE_ROLE_KEY` | trade-lane-refresh | Service role needed to read across orgs. Marketing site never exposes this. |

## Deploy ops

### Initial deploy (already shipped)

Project is `lit-marketing` on team `Spark` (`team_O3pR8pSBsZJIStgD0nmgEkBm`).
Project ID: `prj_Kqb3p4j5lIQNMXTIOoC8K8Crkckw`.

- Production: https://lit-marketing.vercel.app
- Inspector: https://vercel.com/sparkfusion25s-projects/lit-marketing
- Root directory: `marketing/` (configured in dashboard, currently set to null because CLI deploys from inside the dir)
- Framework: Next.js 14
- Region: `iad1` (Washington, D.C.)

### Subsequent deploys

```bash
cd marketing
vercel deploy --prod --token=$VERCEL_TOKEN --yes
```

Or wire git: Vercel → Project → Settings → Git → connect GitHub repo,
set production branch to `main`, set rootDirectory back to `marketing/`.
Then push.

## Agent fleet — Phase 4

8 cron endpoints under `/api/cron/*`. Each is auth-gated by `CRON_SECRET`
and emits a uniform JSON envelope (`{agent, ok, durationMs, scanned,
written, skipped, notes}`).

**Hobby plan limitation:** Vercel Hobby blocks <daily crons. The hourly
news-watcher was downgraded to daily. To restore the original cadence,
upgrade to Vercel Pro and add the `crons` block back to `vercel.json`
(snippet below).

### Manual trigger (works on any plan)

```bash
# Status snapshot — list all agents + runtime checks
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://lit-marketing.vercel.app/api/cron

# Run a specific agent
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://lit-marketing.vercel.app/api/cron/blog-drafter
```

### Agent inventory

| Agent | Schedule (Pro) | Deps | What it writes |
|---|---|---|---|
| `trade-lane-refresh` | daily 02:00 | Supabase + Sanity | Top shippers, carrier mix, monthly trend on every `tradeLane` doc |
| `blog-drafter` | Mon 06:00 | Claude + Sanity | Draft blog post (NOT auto-published) |
| `glossary-expander` | Wed 06:00 | Claude + Sanity | New `glossaryTerm` doc |
| `news-watcher` | hourly→daily | Claude + Sanity | `siteSettings.newsCallouts[]` |
| `internal-linking` | daily 03:00 | Sanity | `relatedPosts` / `relatedGlossary` on blog posts |
| `seo-audit` | Sun 06:00 | Sanity | `siteSettings.seoAuditFindings[]` |
| `comparison-refresh` | 1st of month | Claude + Sanity | `pendingReview` on `comparison` docs |
| `press-citations` | daily 04:00 | Sanity | `siteSettings.pressCitations[]` (no-op until SOURCES configured) |

### Restoring crons after Pro upgrade

Edit `vercel.json` to add back the `crons` array:

```json
{
  "crons": [
    { "path": "/api/cron/trade-lane-refresh", "schedule": "0 2 * * *" },
    { "path": "/api/cron/blog-drafter", "schedule": "0 6 * * 1" },
    { "path": "/api/cron/glossary-expander", "schedule": "0 6 * * 3" },
    { "path": "/api/cron/news-watcher", "schedule": "0 * * * *" },
    { "path": "/api/cron/internal-linking", "schedule": "0 3 * * *" },
    { "path": "/api/cron/seo-audit", "schedule": "0 6 * * 0" },
    { "path": "/api/cron/comparison-refresh", "schedule": "0 8 1 * *" },
    { "path": "/api/cron/press-citations", "schedule": "0 4 * * *" }
  ]
}
```

## Domain config (when ready)

- Apex `logisticintel.com` → `lit-marketing` (this project)
- Subdomain `app.logisticintel.com` → existing `logistics-intel` project (untouched)
- Marketing redirects `/login`, `/signup`, `/app/*` to `app.logisticintel.com`
  (already wired in `next.config.mjs`)

## Phase status

- Phase 1 (foundation) — ✅ shipped
- Phase 1B (route shells + section library) — ✅ shipped
- Phase 2 (programmatic SEO + ports + HS codes + stats helpers) — ✅ shipped
- Phase 3 (visual upgrades: globe, motion, search bar) — ✅ shipped
- Phase 4 (agent fleet) — ✅ code shipped; runtime gated on `ANTHROPIC_API_KEY` + `SUPABASE_*`
