# Marketing site — operational notes

Tracking pending env / infra tasks that aren't blockers but need to be
checked off before full launch.

## Environment variables

### Vercel Production

| Variable | Status | Note |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ Set | https://logisticintel.com |
| `NEXT_PUBLIC_APP_URL` | ✅ Set | https://app.logisticintel.com |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | ✅ Set | |
| `NEXT_PUBLIC_SANITY_DATASET` | ✅ Set | `production` |
| `NEXT_PUBLIC_SANITY_API_VERSION` | ✅ Set | `2024-10-15` |
| `SANITY_API_READ_TOKEN` | ✅ Set | preview/draft mode |
| `SANITY_API_WRITE_TOKEN` | ✅ Set | seed + agent fleet writes |
| `NEXT_PUBLIC_LOGO_DEV_KEY` | ✅ Set | logo.dev — customer + integration logos |
| `CRON_SECRET` | ✅ Set | gates `/api/cron/*` |
| **`ANTHROPIC_API_KEY`** | ⏳ **PENDING** | **Required before Phase 4 (agent fleet) ships. The 8 cron endpoints will fail without it. Ok to deploy Phase 1-3 in the meantime — they don't need it.** |

When the Anthropic key lands, paste it as a Production env in Vercel
and trigger a redeploy. No code changes needed — the agents read
`process.env.ANTHROPIC_API_KEY` at request time.

## Domain config

- Apex `logisticintel.com` → marketing site
- Subdomain `app.logisticintel.com` → existing in-app product (untouched)
- Marketing site redirects `/login`, `/signup`, `/app/*` to `app.logisticintel.com`
  (already wired in `next.config.mjs`)

## Phase status

- Phase 1 (foundation) — ✅ shipped
- Phase 1B (route shells + section library) — ✅ shipped
- Phase 2 (programmatic pages: lanes / industries / HS / ports) — pending
- Phase 3 (visual upgrades: hero video, Lottie, custom illustrations) — pending
- Phase 4 (AI agent fleet) — gated on `ANTHROPIC_API_KEY`
