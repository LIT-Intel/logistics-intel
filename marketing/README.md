# LIT Marketing Site

Next.js 14 (App Router) + Sanity CMS + Vercel. Lives at `logisticintel.com`.
The in-app product is at `app.logisticintel.com` (existing `/frontend`).

## Stack

- Next.js 14 App Router (RSC + ISR)
- Sanity Studio embedded at `/studio`
- Tailwind CSS (matches in-app brand tokens — slate-950 + cyan #00F0FF)
- @vercel/og for dynamic social images
- Vercel hosting + Cron for the AI agent fleet

## First-time setup

1. Create a Sanity project at <https://sanity.io/manage> (or have AI agent do it via API)
2. Copy `.env.local.example` → `.env.local`, fill in:
   - `NEXT_PUBLIC_SANITY_PROJECT_ID`
   - `SANITY_API_WRITE_TOKEN` (Editor role)
   - `NEXT_PUBLIC_LOGO_DEV_KEY` ([logo.dev](https://www.logo.dev))
   - `ANTHROPIC_API_KEY` (for the agent fleet)
3. `npm install`
4. `npm run dev` → http://localhost:3001
5. Visit `/studio` to author content
6. `npm run seed` to load default content (site settings, glossary terms, comparison pages)

## Deploy

```bash
vercel --prod
```

Add the env vars in Vercel project settings. Set the production domain to `logisticintel.com`.

## Layout

```
app/                       # routes
  page.tsx                 # /
  layout.tsx               # root, metadata + schema markup
  sitemap.ts               # /sitemap.xml (Sanity-driven)
  robots.ts                # /robots.txt
  api/
    og/route.tsx           # dynamic OG image generator
    cron/                  # AI agent endpoints (added in Phase 4)
  studio/
    [[...tool]]/page.tsx   # Sanity Studio embedded
  blog/, glossary/, lanes/, industries/, use-cases/, vs/, customers/, tools/, legal/
components/
  nav/Nav.tsx, Footer.tsx
  seo/LitLogoMark.tsx
  sections/                # added in Phase 1B
sanity/
  schemas/                 # 14 schemas + 4 reusable objects
  lib/client.ts, queries.ts
  structure.ts             # Studio sidebar layout
scripts/
  seed.ts                  # initial content seed
sanity.config.ts
next.config.mjs
tailwind.config.ts
```

## Schemas

| Schema | Purpose | URL pattern |
|---|---|---|
| `siteSettings` | Singleton — nav, footer, hero, CTA | — |
| `blogPost` + `author` + `category` + `tag` | Editorial | `/blog/<slug>` |
| `glossaryTerm` | Trade + GTM glossary | `/glossary/<slug>` |
| `caseStudy` + `customerLogo` | Customer proof | `/customers/<slug>` |
| `tradeLane` | Programmatic lane page | `/lanes/<slug>` |
| `industry` | Vertical landing | `/industries/<slug>` |
| `useCase` | Persona landing | `/use-cases/<slug>` |
| `comparison` | Competitor "vs" page | `/vs/<slug>` |
| `integration` | Integration directory entry | (rendered on `/integrations`) |
| `freeTool` | Free public tool surface | `/tools/<slug>` |
| `page` | Generic catch-all | `/<slug>` |

Reusable object fragments: `seoFields`, `kpi`, `faqItem`, `contentBlock`.

## SEO foundation (already wired)

- Sitemap.xml with priority weighting + ISR refresh
- Robots.txt with explicit LLM crawler allow-list (GPTBot, Claude-Web, etc.)
- Schema.org markup: `Organization`, `WebSite`, `SoftwareApplication`, `Article` (blog),
  `FAQPage` (FAQ sections), `BreadcrumbList`, `Person` (authors)
- Dynamic OG images at `/api/og?title=...&eyebrow=...`
- Canonical URLs from Sanity `seoFields.canonicalUrl`
- noindex toggle from Sanity for legal/draft pages
- Compression + immutable cache headers for static assets
- Core Web Vitals: hosted fonts deferred, images optimized to AVIF/WebP

## AI agent fleet (Phase 4 — coming next)

8 cron-driven agents using Anthropic API + Sanity write client:

- TradeLane Refresher (daily)
- Blog Drafter (weekly)
- Glossary Expander (weekly)
- News Watcher (hourly)
- Internal Linking Bot (daily)
- SEO Health Auditor (weekly)
- Comparison Refresher (monthly)
- Press Citation Watcher (daily)

Each runs as a Vercel cron route under `/api/cron/<agent>` protected by `CRON_SECRET`.
