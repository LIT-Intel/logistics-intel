# LIT SEO Strategy & Audit — 2026-09-21

CEO + SEO review. Grounded in the live site, the marketing repo, and live web/competitor research.

## 1. Diagnosis — why LIT isn't ranking (and it's fixable, not a rebuild)

**LIT is indexed and already appearing** — it ranks for its brand ("Logistics Intel"), has 80 marketing pages with JSON-LD, a `/vs/optimus` page, an `/alternatives` hub, and is **already cited in Google's AI Overview** for "freight prospecting software" (Pulse Explorer). So the base exists. The gap is **non-brand category rankings + authority + content-type**, plus three concrete on-page defects.

### The three concrete defects (owner-reported, confirmed)
1. **Title/SERP formatting.** Live homepage `<title>` = *"Freight Sales Intelligence & CRM"* — **no brand, no high-intent keyword.** Repo intends `"… | Logistics Intel"` (root template `"%s | Logistics Intel"`, and `buildMetadata()` in `marketing/lib/seo.ts` strips a trailing brand expecting the template to re-add it). Live shows no brand → **the marketing deploy is stale OR Google rewrote a weak title.** Fix = redeploy + keyword-lead titles.
2. **Logo/favicon.** Google's SERP logo comes from Organization JSON-LD `logo: ${SITE_URL}/icon-512.png` (`marketing/app/layout.tsx:155`) + `favicon.ico` (16/32px, generated Jun-15). These are stale/off-brand → regenerate all icon assets from the current brand mark and point schema at a proper logo.
3. **Canonical** = `logisticintel.com` (non-www) — owner confirmed non-www is primary, and www 301s to it. ✅ Consistent, no change needed.

### Why competitors out-rank LIT (from live research)
- **Content-type mismatch (biggest organic gap).** Competitors rank the money queries with **informational blog/guide content**, which LIT barely has:
  - Salesdash ranks "how do freight brokers find shipper leads" via a blog post.
  - Revenue Vessel ranks "top freight prospecting tools" via a blog post.
  - Optimus ranks via `/resources/freight-broker-sales-intelligence` ("Complete Guide" pillar).
  These top-funnel queries also **feed the AI Overviews** buyers now read.
- **Authority/backlink gap.** Optimus manufactures **PR**: FreightWaves coverage, PR.com press releases (Freight Intelligence Graph / digital twin / "Jared" AI rep). That builds domain authority, backlinks, and brand search. Incumbents (ImportGenius, Descartes/Datamyne, PIERS, DAT, Truckstop) have years of authority. LIT has ~none of this yet.
- **Paid, not just organic.** In the owner's screenshots Optimus sits under **"Sponsored Results"** — a chunk of their omnipresence is **Google Ads**, not SEO. Reframes strategy: match *durable* presence with organic+AI-Overview; match *immediate* presence with a small paid budget.
- **On-page under-optimization.** LIT HAS `/freight-broker-crm`, `/bill-of-lading-database`, `/direct-shipper-leads` etc., but they don't rank — titles/H1/meta/content aren't tightly tuned to a single query intent, and depth is thin vs. incumbents.

**Note:** Optimus's homepage has **no schema.org** — LIT already has more structured data than them. LIT's disadvantage is content depth + authority, not technical scaffolding.

## 2. Positioning (CEO lens)

LIT sits at the **intersection of three categories**, each with entrenched incumbents:
- Trade/customs data → ImportGenius, Descartes Datamyne, PIERS, ImportYeti
- Freight CRM → Salesdash, SalesDrip, BrokerOS
- Freight sales intelligence → Optimus, Revenue Vessel

That intersection ("customs/BOL data **+** verified contacts **+** freight-native CRM **+** AI outreach, in one tool") is LIT's differentiated wedge — but no single query "owns" it yet. Strategy: **own the intersection queries outright, and pick off each adjacent category with comparison/alternative pages.**

## 3. Target query universe (map everything LIT does)

Each cluster → the LIT tool it proves → the page that should own it. `[NEW]` = content gap to create.

**A. Prospecting / leads (bottom-funnel, product pages)**
- freight prospecting software → `/` + `/products`
- shipper leads / shipper leads database / find active shippers → `/direct-shipper-leads`
- freight broker leads → `/freight-broker-leads`
- freight forwarder leads → `/freight-forwarding-leads`
- importer leads / importer database → `/importer-leads`
- 3PL sales leads → `/3pl-leads`
- customs broker leads → `/customs-broker-leads`

**B. Trade / customs data (proves: BOL + customs intelligence)**
- bill of lading database / bill of lading lookup → `/bill-of-lading-database`
- US customs data / import export data → `/trade-intelligence`
- importer exporter database; "who imports <product>" → `/companies` + `[NEW]` programmatic "importers of <HS/commodity>" pages

**C. CRM (proves: freight-native CRM)**
- freight broker CRM → `/freight-broker-crm`
- freight forwarder CRM → `/freight-forwarder-crm`
- logistics CRM / freight sales CRM → `/features/freight-sales-crm`

**D. Sales intelligence / signals (proves: Pulse AI, Company Intelligence, lanes)**
- freight sales intelligence / logistics sales intelligence → `/logistics-sales-intelligence`
- shipper intelligence; trade lane data / lane intelligence → `/company-intelligence`, `/lanes`

**E. Contacts (proves: Contact Intelligence / enrichment)**
- logistics contacts / freight decision-maker contacts / verified logistics emails → `/contact-intelligence`

**F. Comparison / alternative (highest-intent, competitor-jacking)**
- ImportYeti alternative, ImportGenius alternative, Descartes/Datamyne alternative, Apollo/ZoomInfo for freight, **Optimus alternative**, Salesdash alternative, Revenue Vessel alternative → `/alternatives/[slug]`, `/vs/[competitor]`

**G. Informational / top-funnel (THE gap — feeds AI Overviews)** `[NEW BLOG/GUIDE]`
- how to find shippers as a freight broker
- how do freight brokers find leads / get shipper leads
- best freight prospecting tools (2026)
- how to use customs data / bill of lading data for sales
- freight broker sales process / prospecting strategy
- how to find importers of a product

## 4. SERP formatting spec (fix "not formatted correctly")

- **Title:** `<primary keyword> | Logistics Intel`, ≤60 chars, keyword-led. Examples:
  - Home: **"Freight Prospecting Software for Brokers | Logistics Intel"**
  - `/bill-of-lading-database`: **"Bill of Lading Database & US Customs Data | Logistics Intel"**
  - `/freight-broker-crm`: **"Freight Broker CRM — Shipment-Aware Pipeline | Logistics Intel"**
- **Meta description:** ≤155 chars, benefit + the tools + how it works + CTA. Home example:
  *"Find active shippers with live customs & bill-of-lading data, reach verified contacts, and manage pipeline in a freight-native CRM. Free 7-day trial."*
- **H1:** distinct from title, benefit-led.
- **Structured data per page:** `SoftwareApplication` (name, applicationCategory, offers, featureList, aggregateRating when real), `Organization` (correct logo), `FAQPage` (from on-page Q&A → wins AI Overviews + FAQ rich results), `BreadcrumbList`.

## 5. Logo / favicon fix

- Regenerate from the **current** brand mark: `favicon.ico` (16/32/48 multi-res), `favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180px).
- Organization JSON-LD `logo` → on-brand PNG ≥112×112 (use 512, square, padded).
- Post-deploy: Google Search Console → request favicon + homepage re-crawl (Google caches favicons for weeks).

## 6. The AI-Overview play (highest-leverage new surface)

Buyers now search via Google AI Overviews and ChatGPT (the owner's own screenshots are AI answers). LIT already appears for one query; to appear across the category:
- Publish structured **Q&A + comparison** content (cluster G) — LLMs cite concise, well-structured answers.
- Add `FAQPage` schema everywhere.
- Keep the `/vs/*` and `/alternatives/*` pages current and factual — these get cited in "X vs Y" and "best tools" AI answers.

## 7. Execution plan (phased)

**Phase 1 — Technical fixes (fast, in-repo, high certainty)**
1. Keyword-led titles + meta across the money pages (home, BOL, CRM, leads, trade-intel, contact-intel, sales-intel). Verify template applies + redeploy so live = repo.
2. Regenerate favicon/logo assets + fix Organization/SoftwareApplication `logo`.
3. Add/upgrade `SoftwareApplication` + `FAQPage` + `BreadcrumbList` schema on money pages.
4. Redeploy marketing; submit sitemap + request re-crawl in GSC.

**Phase 2 — Content (the ranking driver, 30–90 days)**
5. Write the cluster-G guides (informational) — these capture the queries competitors win and feed AI Overviews.
6. Deepen the money pages (how-it-works, screenshots, FAQ, internal links).
7. Expand `/alternatives/*` + `/vs/*` for every competitor.

**Phase 3 — Authority + demand (CEO-owned, ongoing)**
8. PR engine — LIT's unique data (55K NA cross-border shipment dataset, Mexico trade intel) is genuinely newsworthy → pitch FreightWaves / Journal of Commerce / trade press for coverage + backlinks (this is how Optimus built authority).
9. Small Google Ads budget on the top ~5 highest-intent terms to blunt Optimus's paid omnipresence while organic compounds.

**Honest CEO framing:** Phase 1 fixes formatting/branding in days. Phases 2–3 are a 3–6 month compounding play; organic SEO does not beat a funded competitor's ads overnight. The fastest ROI mix is Phase-1 fixes + AI-Overview content + a modest ad budget on money terms, with PR as the authority flywheel.

## Sources
Live research 2026-09-21: getoptimus.ai (title "Optimus | Sales Intelligence & CRM for Freight Brokers", H1 "The Unfair Advantage for Freight Brokers", 70k+ shippers, no schema); FreightWaves + PR.com Optimus coverage; Salesdash + Revenue Vessel ranking blog posts; ImportGenius/Descartes/PIERS for trade-data queries; LIT live site head/robots/sitemap + marketing repo.
