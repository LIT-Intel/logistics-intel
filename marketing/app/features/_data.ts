/**
 * Feature page corpus. One entry per `/features/[slug]` route. Each is its
 * own SEO target — H1, "short answer" snippet, problem framing, capability
 * list, workflow, ICPs, related links, FAQs.
 *
 * Keep entries dense but not bloated: 250-450 word body content per page,
 * 3-4 FAQs max. Adding more rarely improves rank and dilutes the page's
 * intent signal. When in doubt, edit one of these files in place rather
 * than adding adjacent supporting prose.
 */

export type FeatureFaq = { q: string; a: string };

export type FeaturePage = {
  slug: string;
  /** H1 + browser tab title. Keep <60 chars when possible. */
  title: string;
  /** Sub-title fragment that gets the cyan gradient inside the H1. */
  titleHighlight?: string;
  /** Pill / eyebrow above the H1. Plain text, no emoji. */
  eyebrow: string;
  /** Plain-text page summary used for <meta description> and OG card. */
  metaDescription: string;
  /** First paragraph under the H1 — the lede. Should answer "what is this." */
  lede: string;
  /**
   * AEO/AI surface block. 1-3 sentences. Written so an LLM can quote it
   * verbatim as the answer to "what is X" or "how do I do Y."
   */
  shortAnswer: string;
  /** Problem framing — why a buyer cares. Two sentences max. */
  problem: string;
  /** Solution framing — how LIT solves it. Two sentences max. */
  solution: string;
  /** 3-6 capability bullets. Title + one-line description. */
  capabilities: Array<{ title: string; body: string }>;
  /** Optional 3-step workflow. Skip when the feature isn't a workflow. */
  workflow?: Array<{ step: string; body: string }>;
  /** Who this is for. Each item is one sentence. */
  whoItsFor: string[];
  /** Internal-link cluster. Used in "related" rail + AEO context. */
  related: Array<{ label: string; href: string }>;
  /** 3-4 FAQs. Used both for the on-page accordion and FAQPage JSON-LD. */
  faqs: FeatureFaq[];
};

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "bill-of-lading-search",
    title: "Bill of Lading search —",
    titleHighlight: "every US import filing, queryable.",
    eyebrow: "Search",
    metaDescription:
      "Search 124M+ Bills of Lading by importer, exporter, HS code, port, carrier, and lane. Live customs data with verified contacts and CRM-ready exports.",
    lede:
      "Run an instant Bill of Lading search across 124M+ live US import filings. Filter by importer, exporter, HS code, country of origin, port pair, carrier, container count, and arrival window — then push the result set straight into your CRM.",
    shortAnswer:
      "Bill of Lading search in LIT is a live query interface over 124M+ US Customs filings. You can search by importer name, exporter, HS code, port, country of origin, carrier, lane, and date range, and every match comes with verified buyer contacts you can sequence the same day.",
    problem:
      "Public BOL data is messy, slow to update, and hard to join to a CRM. Most teams either pay for ImportYeti / ImportGenius and re-key the results, or skip BOL entirely and rely on cold lists.",
    solution:
      "LIT indexes every US BOL filing, normalizes shipper/consignee names, and joins each record to enriched company + contact data so a search isn't a CSV — it's a list of accounts you can call this week.",
    capabilities: [
      { title: "124M+ filings", body: "Every US ocean BOL since 2014, refreshed weekly." },
      { title: "20+ filter dimensions", body: "Importer, exporter, HS, port, lane, carrier, country, container count, weight, value, arrival window." },
      { title: "Boolean + saved searches", body: "Combine filters, save, share, and run as alerts when a new shipment matches." },
      { title: "Contact-attached", body: "Every importer surfaces 5-30 verified buyer-side contacts with role + email + phone." },
      { title: "CRM export", body: "Push results to LIT CRM, HubSpot, Salesforce, or CSV in one click." },
      { title: "API access", body: "Programmatic search on Pro plans — same query surface as the UI." },
    ],
    workflow: [
      { step: "Search", body: "Pick filters — e.g. ‘Vietnam → Long Beach, HS 9401, last 90 days.’ Results appear in under a second." },
      { step: "Triage", body: "Sort by container count, recency, or carrier mix. Save high-fit accounts to a watchlist." },
      { step: "Engage", body: "Pull contacts, draft Pulse-AI outreach with shipment context, and send from your sequence." },
    ],
    whoItsFor: [
      "Freight forwarders prospecting NVOCC accounts.",
      "Customs brokers building a book in a target HS chapter.",
      "3PL sales teams targeting importers by lane.",
      "Trade-finance and factoring teams underwriting based on shipment patterns.",
    ],
    related: [
      { label: "Importer database", href: "/features/importer-database" },
      { label: "Exporter database", href: "/features/exporter-database" },
      { label: "Trade lane intelligence", href: "/features/trade-lane-intelligence" },
      { label: "LIT vs ImportYeti", href: "/vs/importyeti" },
      { label: "LIT vs ImportGenius", href: "/vs/importgenius" },
    ],
    faqs: [
      { q: "How fresh is the data?", a: "US BOL records refresh weekly, typically within 7-10 days of the filing being released by Customs. Air, Mexico, and select country feeds vary — see /lanes for per-corridor freshness." },
      { q: "Can I search exporters, not just importers?", a: "Yes. Every BOL has both shipper and consignee. Filter on either, or combine — e.g. ‘exporter contains \"Samsung\" AND port = LAX.’" },
      { q: "Is there a free version?", a: "Yes. Free plans get unlimited search and the first 10 saved companies. Paid plans unlock contact reveal at scale, sequences, and API access." },
      { q: "Does LIT replace ImportYeti?", a: "For most teams, yes. See the side-by-side at /vs/importyeti — the headline difference is contacts + CRM + sequences in one place vs. CSV-only output." },
    ],
  },
  {
    slug: "importer-database",
    title: "US importer database —",
    titleHighlight: "525K+ active companies, with contacts.",
    eyebrow: "Database",
    metaDescription:
      "Search 525K+ active US importers by HS code, country of origin, lane, and volume. Each importer comes with verified buyer contacts you can sequence today.",
    lede:
      "Browse and segment the full US importer universe. Every company is enriched with HS-code mix, top trade lanes, dominant carriers, and 5-30 verified buyer-side contacts.",
    shortAnswer:
      "LIT's US importer database covers 525K+ active US import companies. You can filter by HS code, country of origin, lane, port, carrier, and 12-month TEU volume, and every importer is paired with verified contacts in procurement, supply chain, and logistics roles.",
    problem:
      "Stand-alone importer lists go stale within months and rarely include contacts. Sales-intel tools like ZoomInfo or Apollo cover the company but miss what they actually ship.",
    solution:
      "LIT joins live BOL data with company + contact intelligence, so an importer record tells you what they import, from where, on which lanes, and who owns the buying decision.",
    capabilities: [
      { title: "525K+ importers", body: "Every US company that filed a BOL in the trailing 24 months." },
      { title: "Shipment context per company", body: "HS mix, top lanes, carrier mix, container count, last shipment date." },
      { title: "Verified contacts", body: "5-30 buyer-side contacts per company with role, email, and phone." },
      { title: "Smart segments", body: "Save filters as living lists — new importers matching the criteria appear automatically." },
      { title: "ICP scoring", body: "Score each account against your ideal customer profile based on lane, volume, and HS." },
    ],
    workflow: [
      { step: "Define ICP", body: "Pick your ideal lane × HS chapter × volume band. LIT scores every importer on fit." },
      { step: "Build segments", body: "Save the filter as a smart list. New matches show up automatically as BOLs file." },
      { step: "Sequence", body: "Pull contacts and launch a Pulse-AI sequence personalized with each account's actual shipments." },
    ],
    whoItsFor: [
      "Freight forwarders + 3PLs running outbound on importer fit.",
      "Customs brokers identifying volume opportunities by HS chapter.",
      "B2B sales teams selling to import-driven verticals (CPG, electronics, apparel)."
    ],
    related: [
      { label: "Bill of Lading search", href: "/features/bill-of-lading-search" },
      { label: "Exporter database", href: "/features/exporter-database" },
      { label: "Contact enrichment", href: "/features/contact-enrichment" },
      { label: "Freight prospecting", href: "/features/freight-prospecting" },
      { label: "LIT vs ZoomInfo", href: "/vs/zoominfo" },
    ],
    faqs: [
      { q: "How is an ‘active’ importer defined?", a: "Any company that filed at least one US BOL in the last 24 months. We surface inactive companies separately so they don't dilute prospecting lists." },
      { q: "Are the contacts buying-decision-makers?", a: "We focus on procurement, supply chain, logistics, ops, and trade compliance roles. Email deliverability is verified at >95% on Pro plans." },
      { q: "Can I export to my CRM?", a: "Yes — push to LIT CRM, HubSpot, Salesforce, or CSV. API also available on Pro/Enterprise." },
    ],
  },
  {
    slug: "exporter-database",
    title: "Exporter database —",
    titleHighlight: "global suppliers + their US-bound flows.",
    eyebrow: "Database",
    metaDescription:
      "Search global exporters and the US importers they ship to. Filter by country, HS code, lane, and trailing-12m TEU volume. Verified contacts included.",
    lede:
      "Profile the global exporter universe and see exactly which US importers each one supplies — by HS code, lane, carrier, and container volume.",
    shortAnswer:
      "LIT's exporter database lets you search global suppliers by country, HS code, lane, and US-bound shipment volume. Every exporter record is joined to the US importers they actually ship to, so you can see the whole demand chain in one view.",
    problem:
      "Most trade-data tools only let you search one side of the BOL. If you sell to exporters — or want to find who supplies a given US importer — you're forced to flip between tools.",
    solution:
      "LIT treats the BOL as a graph. From any exporter you can see their US importers; from any importer you can see their suppliers. Same query surface, same enrichment, same contact attachment.",
    capabilities: [
      { title: "Global exporter coverage", body: "Every shipper appearing on a US BOL, normalized to a clean entity." },
      { title: "Two-sided lookup", body: "Pivot from exporter → importer or importer → exporter in one click." },
      { title: "Volume + lane mix", body: "Per-exporter trailing-12m TEU, top destinations, dominant carriers." },
      { title: "Contacts where available", body: "Buyer + supplier-side contacts where data exists; clearly flagged when limited." },
    ],
    whoItsFor: [
      "Logistics sales teams targeting overseas shippers.",
      "Trade-finance teams underwriting cross-border flows.",
      "Procurement teams researching supplier alternatives.",
    ],
    related: [
      { label: "Importer database", href: "/features/importer-database" },
      { label: "Bill of Lading search", href: "/features/bill-of-lading-search" },
      { label: "Trade lane intelligence", href: "/features/trade-lane-intelligence" },
      { label: "LIT vs Panjiva", href: "/vs/panjiva" },
    ],
    faqs: [
      { q: "Do you cover non-US exporters?", a: "Any global exporter that has shipped to a US importer is in the database. We don't separately index domestic-only exporters in non-US markets." },
      { q: "Can I find suppliers for a specific brand?", a: "Yes — search the importer, then pivot to their exporters with one click. The relationship graph is one of the highest-value workflows on the platform." },
    ],
  },
  {
    slug: "shipper-lead-generation",
    title: "Shipper lead generation —",
    titleHighlight: "from BOL signal to booked freight.",
    eyebrow: "Lead generation",
    metaDescription:
      "Generate outbound-ready shipper leads from live BOL data. ICP-scored, contact-attached, sequence-ready — built for freight forwarders, brokers, and 3PLs.",
    lede:
      "Stop building cold lists. Pull shipper leads directly from live BOL data, scored on lane and volume fit, with verified contacts ready for the first sequence step.",
    shortAnswer:
      "LIT generates shipper leads from live US BOL data. You define your ICP (lane × HS × volume), and LIT surfaces matching importers ranked by fit, each with verified buyer contacts and a Pulse-AI sequence draft personalized to their actual shipments.",
    problem:
      "Most freight outbound is built on stale lists or cold prospecting against a generic ‘importers in apparel’ slice. Reps spend more time researching than selling.",
    solution:
      "LIT replaces list-buying with a living signal. New BOL filings → new ICP-matched leads → contacts + AI-personalized sequences in one platform, so your reps stay in the lane.",
    capabilities: [
      { title: "Live ICP scoring", body: "Every importer is scored against your lane × HS × volume profile in real time." },
      { title: "Auto-built segments", body: "Save your ICP as a smart segment — LIT keeps it fresh as new BOLs file." },
      { title: "Contact attachment", body: "Each lead has 5-30 verified contacts in buying roles, deliverability >95%." },
      { title: "Pulse-AI personalization", body: "Sequence drafts cite the prospect's actual shipments — lane, HS, carrier, recency." },
      { title: "CRM-native", body: "Lead → contact → sequence → opportunity tracked end-to-end inside LIT." },
    ],
    whoItsFor: [
      "Freight forwarders running outbound on lane fit.",
      "3PLs building books of business in target verticals.",
      "Customs brokers targeting HS-specific importers.",
    ],
    related: [
      { label: "Importer database", href: "/features/importer-database" },
      { label: "Outbound campaigns", href: "/features/outbound-campaigns" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
      { label: "Pulse AI", href: "/pulse" },
      { label: "Solutions for freight forwarders", href: "/solutions/freight-forwarders" },
    ],
    faqs: [
      { q: "How is this different from buying a list?", a: "A list is a snapshot. LIT is a feed — new importers matching your ICP appear automatically as they file BOLs, and old leads age out." },
      { q: "Can I run this with my existing CRM?", a: "Yes. Push leads + contacts + shipment context to HubSpot or Salesforce, or run end-to-end in LIT CRM." },
    ],
  },
  {
    slug: "freight-sales-crm",
    title: "Freight sales CRM —",
    titleHighlight: "built around shipments, not stages.",
    eyebrow: "CRM",
    metaDescription:
      "A CRM for freight sales teams. Accounts, contacts, deals, and sequences — all attached to live shipment intelligence. No re-keying, no enrichment add-ons.",
    lede:
      "Run your entire freight sales motion in one place. Accounts and contacts are pre-enriched with shipment data; deals carry lane, carrier, and volume context automatically.",
    shortAnswer:
      "LIT CRM is a freight-native sales CRM with accounts, contacts, deals, sequences, and tasks. Every record is joined to live BOL data, so a customer record shows shipment cadence, lanes, and carrier mix — no separate enrichment tool required.",
    problem:
      "HubSpot and Salesforce are built for SaaS, not freight. Reps spend hours pasting BOL data into notes and re-enriching contacts from a third tool.",
    solution:
      "LIT CRM treats shipments as a first-class field. Every account auto-displays its TTM TEU, top lanes, dominant carriers, last shipment date, and HS mix. Contacts are pre-enriched and continuously refreshed.",
    capabilities: [
      { title: "Shipment-aware accounts", body: "Each company shows TTM volume, lane mix, and carrier share automatically." },
      { title: "Deal pipeline", body: "Stages, weighted forecasting, activity tracking — the basics, done well." },
      { title: "Sequences in CRM", body: "Step-based outbound sequences with Pulse-AI personalization, no separate engagement tool needed." },
      { title: "Two-way sync", body: "Optional bi-directional sync to HubSpot or Salesforce if you're not ready to migrate." },
      { title: "Watchlists + alerts", body: "Save lanes, ports, or accounts; get pinged when a meaningful change happens." },
    ],
    whoItsFor: [
      "Freight forwarders running a full outbound + AE motion.",
      "3PL sales teams replacing spreadsheets with a real pipeline.",
      "Customs brokers tracking active importers across HS chapters.",
    ],
    related: [
      { label: "Outbound campaigns", href: "/features/outbound-campaigns" },
      { label: "Logistics command center", href: "/features/logistics-command-center" },
      { label: "Contact enrichment", href: "/features/contact-enrichment" },
      { label: "LIT vs HubSpot", href: "/vs/hubspot" },
      { label: "LIT vs Salesforce", href: "/vs/salesforce" },
    ],
    faqs: [
      { q: "Can I run LIT alongside HubSpot?", a: "Yes — many teams do. Use LIT for prospecting + sequences and sync closed-won accounts back to HubSpot for finance/CS workflows." },
      { q: "Does it have a mobile app?", a: "Mobile web is fully responsive. A native app is on the 2026 roadmap." },
    ],
  },
  {
    slug: "trade-lane-intelligence",
    title: "Trade lane intelligence —",
    titleHighlight: "live volume, top shippers, carrier mix.",
    eyebrow: "Intelligence",
    metaDescription:
      "Pick a lane and see live TEU, top importers and exporters, carrier share, port pairs, and YoY trend. Updated daily across 500+ ocean and air corridors.",
    lede:
      "Pick any origin × destination pair and see live volume, top shippers, carrier mix, and YoY change. Updated daily across 500+ corridors.",
    shortAnswer:
      "Trade lane intelligence in LIT shows live shipment volume, top importers and exporters, dominant carriers, port pairs, and 12-month trend for any major origin-destination corridor. Refreshed daily from US Customs filings.",
    problem:
      "Lane data is scattered across maritime trackers, customs filings, and carrier press releases. Building a coherent view takes hours per lane.",
    solution:
      "LIT pre-builds a live page for every major lane, with the data joined and ranked. Watchlist any lane and Pulse Coach pings you when carrier mix or volume shifts meaningfully.",
    capabilities: [
      { title: "500+ lanes", body: "Every major US ocean + air corridor, plus a growing set of trans-Pacific, trans-Atlantic, and intra-Americas pairs." },
      { title: "Daily refresh", body: "Volume + shipper rankings update every day from new BOL filings." },
      { title: "Watchlists + alerts", body: "Save a lane and get notified when its top-10 shipper list shifts or carrier share moves >5%." },
      { title: "Origin/destination pivot", body: "Drill from lane → port → carrier → shipper in one view." },
    ],
    whoItsFor: [
      "Freight forwarders running lane-specific sales books.",
      "Carriers monitoring competitive share by corridor.",
      "Trade analysts and journalists tracking macro trade flows.",
    ],
    related: [
      { label: "Trade lanes index", href: "/lanes" },
      { label: "Bill of Lading search", href: "/features/bill-of-lading-search" },
      { label: "Shipment intelligence", href: "/features/shipment-intelligence" },
      { label: "Market rate benchmarking", href: "/features/market-rate-benchmarking" },
    ],
    faqs: [
      { q: "Which lanes are covered?", a: "All major US-inbound ocean lanes and the top 60 US-outbound corridors. Air freight covers the top 80 airport pairs by volume. New lanes publish weekly — see /lanes for the live index." },
      { q: "How current is the data?", a: "Daily refresh on US ocean and air. International-only lanes refresh weekly where customs feeds are available." },
    ],
  },
  {
    slug: "shipment-intelligence",
    title: "Shipment intelligence —",
    titleHighlight: "every BOL, joined to the buyer.",
    eyebrow: "Intelligence",
    metaDescription:
      "Real-time shipment intelligence joined to importer + contact data. See who shipped what, when, and how — and contact the buyer the same day.",
    lede:
      "Live shipment data isn't a CSV in LIT — it's a graph. Every BOL joins to a normalized importer, exporter, lane, and contact list, so you can move from signal to outreach in minutes.",
    shortAnswer:
      "Shipment intelligence in LIT joins every US BOL to enriched importer + contact data. You can see who shipped what, on which lane, with which carrier, when — and reach the buyer-side decision-maker the same day.",
    problem:
      "Raw BOL feeds are noisy: company name variants, missing HS codes, inconsistent ports. Reconciling them into a usable signal is a data engineering project on its own.",
    solution:
      "LIT runs entity resolution, HS classification, and carrier normalization on every filing — then joins it to a 525K-importer graph and 42M+ verified contacts.",
    capabilities: [
      { title: "Entity-resolved BOLs", body: "Company-name variants collapsed to a single canonical importer." },
      { title: "HS classification", body: "HS codes inferred where customs leaves them blank, validated against goods description." },
      { title: "Carrier + port normalization", body: "Every record tagged with normalized carrier and UN/LOCODE port pair." },
      { title: "Contact join", body: "Every importer linked to 5-30 verified buyer-side contacts." },
      { title: "Anomaly flagging", body: "Pulse Coach surfaces meaningful changes — new lanes, new carriers, volume jumps." },
    ],
    whoItsFor: [
      "Freight sales teams turning shipment changes into pipeline.",
      "Trade compliance teams tracking import patterns by HS chapter.",
      "Maritime analysts and journalists building data-driven stories.",
    ],
    related: [
      { label: "Bill of Lading search", href: "/features/bill-of-lading-search" },
      { label: "Trade lane intelligence", href: "/features/trade-lane-intelligence" },
      { label: "Pulse AI", href: "/pulse" },
      { label: "Company intelligence", href: "/features/company-intelligence" },
    ],
    faqs: [
      { q: "How accurate is the entity resolution?", a: "Above 96% precision on the importer side. We surface ambiguous records as low-confidence rather than guessing." },
      { q: "Can I get raw BOL data via API?", a: "Yes, on Pro/Enterprise. The same query surface as the UI is available programmatically." },
    ],
  },
  {
    slug: "contact-enrichment",
    title: "Contact enrichment —",
    titleHighlight: "42M+ verified, deliverability-checked.",
    eyebrow: "Enrichment",
    metaDescription:
      "Get verified email + phone for any importer's procurement, supply chain, and logistics team. 95%+ deliverability, GDPR-compliant, refreshed continuously.",
    lede:
      "Every importer in LIT comes with verified contacts in procurement, supply chain, ops, and logistics roles — refreshed continuously and deliverability-checked at >95%.",
    shortAnswer:
      "LIT enriches every importer record with 5-30 verified buyer-side contacts. Names, titles, emails, and phones are deliverability-checked at >95%, sourced GDPR-compliantly, and refreshed continuously as people change roles.",
    problem:
      "Standalone contact tools don't know which contacts matter for freight. ZoomInfo will return 200 names at a Fortune 500 importer and leave you guessing which one runs ocean procurement.",
    solution:
      "LIT scopes contact enrichment to buyer-side roles that own freight decisions. Every contact comes with a role tag (procurement, ops, ocean, air, customs) and a recency stamp.",
    capabilities: [
      { title: "42M+ contacts", body: "Buyer-side decision-makers across global importers, refreshed continuously." },
      { title: ">95% deliverability", body: "Pre-validated emails, with bounce-back monitoring on send." },
      { title: "Role-tagged", body: "Each contact tagged by function (procurement, ocean, air, customs, ops)." },
      { title: "Phone where available", body: "Direct dial when sourced; mobile flagged separately." },
      { title: "GDPR-compliant", body: "Sources documented per region; opt-out + suppression honored automatically." },
    ],
    whoItsFor: [
      "Freight forwarders + brokers running outbound at volume.",
      "3PL sales teams replacing ZoomInfo / Apollo for freight ICP.",
      "RevOps teams enriching their CRM with role-specific contacts.",
    ],
    related: [
      { label: "Importer database", href: "/features/importer-database" },
      { label: "Outbound campaigns", href: "/features/outbound-campaigns" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
      { label: "LIT vs ZoomInfo", href: "/vs/zoominfo" },
      { label: "LIT vs Apollo", href: "/vs/apollo" },
    ],
    faqs: [
      { q: "Where do the contacts come from?", a: "A blend of public registries, professional networks, opt-in B2B databases, and direct enrichment partners. Every record is documented and GDPR/CCPA-compliant." },
      { q: "Can I bring my own contact list?", a: "Yes — upload a CSV and LIT will enrich it with role tags, deliverability scores, and shipment context for each company." },
    ],
  },
  {
    slug: "outbound-campaigns",
    title: "Outbound campaigns —",
    titleHighlight: "personalized at the shipment level.",
    eyebrow: "Outbound",
    metaDescription:
      "Send outbound sequences personalized with each prospect's actual shipments, lanes, and carriers. Multi-step email + LinkedIn, sent from your domain.",
    lede:
      "Run outbound sequences whose every send is grounded in the prospect's real shipment data — lanes, carriers, HS codes, recent volume — drafted by Pulse AI.",
    shortAnswer:
      "Outbound campaigns in LIT are multi-step email sequences whose personalization is grounded in each prospect's actual BOL filings. Step copy cites real lanes, carriers, and shipments; sends come from your domain with native deliverability monitoring.",
    problem:
      "Generic sequences get ignored. Hand-personalizing 200 emails a week doesn't scale.",
    solution:
      "Pulse AI drafts each step using the prospect's actual shipment context, your reps approve in seconds, and LIT sends from your domain with deliverability + reply attribution built in.",
    capabilities: [
      { title: "Pulse-AI personalization", body: "Each step references real shipments, lanes, carriers — not just the company name." },
      { title: "Multi-channel", body: "Email + LinkedIn step types, with native scheduling." },
      { title: "Deliverability built-in", body: "Send from your own domain; SPF / DKIM / DMARC guidance included." },
      { title: "Reply attribution", body: "Replies route back to the originating sequence and show in CRM." },
      { title: "ICP-aware throttling", body: "Throttle send volume by ICP fit so high-fit accounts don't get diluted." },
    ],
    whoItsFor: [
      "Freight forwarders running outbound at scale.",
      "AE / SDR teams replacing Outreach / Salesloft for freight ICP.",
      "RevOps teams centralizing engagement in one platform.",
    ],
    related: [
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
      { label: "Pulse AI", href: "/pulse" },
      { label: "Campaign builder", href: "/features/campaign-builder" },
      { label: "Contact enrichment", href: "/features/contact-enrichment" },
    ],
    faqs: [
      { q: "Can I bring my own SMTP?", a: "Yes. Send from your existing domain via Gmail/Workspace OAuth or any standard SMTP relay." },
      { q: "Does this replace Outreach or Salesloft?", a: "For freight ICP, yes. The advantage is shipment-grounded personalization that horizontal sequencers can't generate." },
    ],
  },
  {
    slug: "market-rate-benchmarking",
    title: "Market rate benchmarking —",
    titleHighlight: "lane-specific, time-stamped.",
    eyebrow: "Benchmarking",
    metaDescription:
      "Benchmark your freight rates against the market on every lane, by mode, equipment, and HS chapter. Live data, time-stamped, ready for procurement reviews.",
    lede:
      "Compare your contracted and spot rates to the live market on every major lane — by mode, equipment type, and HS chapter — with point-in-time accuracy.",
    shortAnswer:
      "Market rate benchmarking in LIT shows live and historical freight rates by lane, mode, equipment, and HS chapter. Rates are time-stamped, sourced from carrier and forwarder filings, and exportable for procurement reviews.",
    problem:
      "Carrier rate cards don't tell you what others are paying. Rate indices like Drewry or Freightos give a global average but miss your specific lane and equipment.",
    solution:
      "LIT pulls rate signals from BOL declared values, carrier filings, and forwarder partner data — then normalizes to a per-lane, per-mode, per-equipment benchmark.",
    capabilities: [
      { title: "Per-lane benchmarks", body: "Live and trailing-12m rate ranges for every major US-inbound lane." },
      { title: "Mode + equipment splits", body: "FCL/LCL, 20/40/40HC, reefer, air, separately benchmarked." },
      { title: "Historical context", body: "Compare today's rate to 30/90/180/365 days ago for trend." },
      { title: "Procurement-ready exports", body: "PDF + CSV reports with sourcing methodology footnotes." },
    ],
    whoItsFor: [
      "Procurement teams renegotiating annual contracts.",
      "Freight forwarders benchmarking their quote desk.",
      "BCO supply chain teams validating quoted spot rates.",
    ],
    related: [
      { label: "Trade lane intelligence", href: "/features/trade-lane-intelligence" },
      { label: "Quote generator", href: "/features/quote-generator" },
      { label: "Tariff calculator", href: "/tools/tariff-calculator" },
    ],
    faqs: [
      { q: "How are rates sourced?", a: "Declared BOL values, carrier filings, and aggregated forwarder partner data — all normalized and de-duplicated. Methodology is published per benchmark." },
      { q: "Can I export to a spreadsheet?", a: "Yes — both CSV and a PDF report formatted for procurement review." },
    ],
  },
  {
    slug: "company-intelligence",
    title: "Company intelligence —",
    titleHighlight: "shipment-aware account research.",
    eyebrow: "Intelligence",
    metaDescription:
      "Research any importer in seconds: shipment history, lane mix, carriers, HS codes, contacts, and tech stack. Built for freight account teams.",
    lede:
      "Open any importer and see the full picture in seconds — shipment cadence, lane mix, carrier share, HS coverage, headcount, and the right contacts to call.",
    shortAnswer:
      "Company intelligence in LIT gives you a one-screen profile of any importer: trailing-12m TEU, top lanes, dominant carriers, HS mix, last shipment, and 5-30 verified buying contacts. Refreshed continuously.",
    problem:
      "Account research takes 30+ minutes per company across half a dozen tools. Reps end calls knowing less than they should.",
    solution:
      "LIT pre-builds the research view. Every importer page is one screen with shipment context, contacts, alerts, and saved-list status — researched in seconds, not half an hour.",
    capabilities: [
      { title: "One-screen profile", body: "Volume, lanes, carriers, HS, contacts — all at a glance." },
      { title: "Shipment timeline", body: "Last 12 months of BOL filings, sortable and exportable." },
      { title: "Contact panel", body: "Buyer-side contacts grouped by role, with deliverability + recency tags." },
      { title: "Saved + watchlisted", body: "Save accounts to lists; Pulse Coach surfaces when their shipments shift." },
    ],
    whoItsFor: [
      "AEs preparing for first-call discovery in 5 minutes, not 30.",
      "SDRs prioritizing account research before sequencing.",
      "RevOps teams enriching CRM company records with shipment context.",
    ],
    related: [
      { label: "Importer database", href: "/features/importer-database" },
      { label: "Bill of Lading search", href: "/features/bill-of-lading-search" },
      { label: "Contact enrichment", href: "/features/contact-enrichment" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
    ],
    faqs: [
      { q: "Can I export company data?", a: "Yes — push to CRM, CSV, or via API on Pro/Enterprise." },
      { q: "Does this replace ZoomInfo for account research?", a: "For freight ICP, yes — see the side-by-side at /vs/zoominfo. The headline difference is shipment-grounded context that horizontal tools can't provide." },
    ],
  },
  {
    slug: "freight-prospecting",
    title: "Freight prospecting —",
    titleHighlight: "ICP-scored, signal-driven, end-to-end.",
    eyebrow: "Prospecting",
    metaDescription:
      "End-to-end freight prospecting: ICP-scored importer leads, verified contacts, AI-personalized sequences. Replace 4 tools with one platform.",
    lede:
      "Run your full prospecting motion — ICP scoring, list building, contact enrichment, and AI-personalized outreach — in one freight-native platform.",
    shortAnswer:
      "LIT consolidates freight prospecting into one tool: ICP scoring, list building from live BOL data, verified contact enrichment, and AI-drafted outbound sequences. Reps stop re-keying and start booking.",
    problem:
      "Most freight outbound stacks span 4 tools — list source, enrichment, sequencer, CRM — with manual exports and broken context between each.",
    solution:
      "LIT collapses the stack. ICP → leads → contacts → sequences → CRM → revenue, all in one platform with one data model.",
    capabilities: [
      { title: "ICP-scored leads", body: "Live BOL data scored against your ideal lane × HS × volume." },
      { title: "Verified contacts", body: "5-30 buyer-side contacts per account, deliverability >95%." },
      { title: "AI-drafted sequences", body: "Pulse AI grounds each step in actual shipments, drafts copy your reps approve in seconds." },
      { title: "End-to-end CRM", body: "Pipeline, sequences, tasks, and reporting in one place." },
    ],
    whoItsFor: [
      "Freight forwarders running a full SDR + AE motion.",
      "Brokerages standardizing on one prospecting platform.",
      "Mid-market 3PLs replacing 4 tools with 1.",
    ],
    related: [
      { label: "Shipper lead generation", href: "/features/shipper-lead-generation" },
      { label: "Outbound campaigns", href: "/features/outbound-campaigns" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
      { label: "Solutions for freight forwarders", href: "/solutions/freight-forwarders" },
    ],
    faqs: [
      { q: "Can I migrate from my current stack?", a: "Yes. We offer migration support for HubSpot, Salesforce, ZoomInfo, and Apollo on Pro+ plans." },
      { q: "How fast can we ramp?", a: "Most teams are running first sequences within 2 weeks. Onboarding includes ICP setup, contact validation, and first-campaign review." },
    ],
  },
  {
    slug: "logistics-command-center",
    title: "Logistics command center —",
    titleHighlight: "your accounts, lanes, and signals in one view.",
    eyebrow: "Command center",
    metaDescription:
      "One dashboard for your saved accounts, watchlisted lanes, Pulse alerts, and pipeline. Built for freight sales leaders running a real book.",
    lede:
      "One screen for everything that matters: saved accounts, watchlisted lanes, Pulse alerts, pipeline, and team activity.",
    shortAnswer:
      "The logistics command center is LIT's executive dashboard — pipeline, watchlisted lanes, Pulse Coach alerts, top-fit accounts, and team activity all in one screen. Built for freight sales leaders.",
    problem:
      "Sales leaders bounce between CRM dashboards, lane reports, and Slack pings to piece together the state of the business.",
    solution:
      "LIT collapses that into a single command center: pipeline + signal + activity in one view, refreshed live.",
    capabilities: [
      { title: "Pipeline + forecast", body: "Weighted forecast, stage health, and team-level activity." },
      { title: "Lane watchlist", body: "Saved lanes with live volume, top shippers, and YoY change." },
      { title: "Pulse alerts", body: "Meaningful changes in your saved accounts and lanes — surfaced, not buried." },
      { title: "Team activity", body: "Sequences sent, replies, demos booked — at the rep and team level." },
    ],
    whoItsFor: [
      "Freight sales leaders running 5-50 reps.",
      "RevOps building dashboards for QBRs.",
      "Founders + GTM heads at logistics startups.",
    ],
    related: [
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
      { label: "Pulse AI", href: "/pulse" },
      { label: "Trade lane intelligence", href: "/features/trade-lane-intelligence" },
    ],
    faqs: [
      { q: "Is this configurable?", a: "Yes — every panel is drag-rearrangeable, and Enterprise plans get custom KPI tiles." },
      { q: "Does it replace BI tools?", a: "For freight-sales KPIs, yes. For broader BI, LIT exposes a data warehouse export on Enterprise." },
    ],
  },
  {
    slug: "campaign-builder",
    title: "Campaign builder —",
    titleHighlight: "visual sequence design, AI-drafted copy.",
    eyebrow: "Builder",
    metaDescription:
      "Visual drag-and-drop sequence builder with Pulse-AI step drafting, A/B testing, and shipment-grounded personalization for freight outbound.",
    lede:
      "Design multi-step outbound campaigns visually — drag steps, branch on replies, A/B test subject lines, and let Pulse AI draft each step against the prospect's real shipment data.",
    shortAnswer:
      "LIT's campaign builder is a visual sequence designer for freight outbound. Drag steps onto the canvas, set timing, branch on replies, and Pulse AI drafts each step's copy from the prospect's actual BOL filings.",
    problem:
      "Existing sequencers were built for SaaS outbound. Their templates and personalization tokens don't know what a BOL is.",
    solution:
      "LIT's campaign builder treats shipments as a first-class personalization source. Every step's copy can reference real lanes, carriers, HS codes, and shipment recency.",
    capabilities: [
      { title: "Visual canvas", body: "Drag-and-drop step builder with reply branching." },
      { title: "Pulse-AI drafting", body: "Each step's copy drafted from real shipment context per recipient." },
      { title: "A/B subject + body", body: "Run controlled experiments; LIT picks the winner automatically." },
      { title: "Reply routing", body: "Replies route to CRM with full sequence context preserved." },
    ],
    whoItsFor: [
      "SDR teams running multi-step outbound on freight ICP.",
      "Demand gen teams testing offers across cohorts.",
    ],
    related: [
      { label: "Outbound campaigns", href: "/features/outbound-campaigns" },
      { label: "Pulse AI", href: "/pulse" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
    ],
    faqs: [
      { q: "Can I import existing templates?", a: "Yes — paste in your existing copy and the builder will translate it into LIT step blocks." },
    ],
  },
  {
    slug: "tariff-calculator",
    title: "Tariff calculator —",
    titleHighlight: "HS-coded, country-specific, current.",
    eyebrow: "Tools",
    metaDescription:
      "Calculate landed cost on any HS code from any country to the US. MFN, FTA, and special-program rates included. Updated as USTR rulings publish.",
    lede:
      "Estimate landed cost on any HS code from any origin country to the US — with MFN, FTA, and special-program rates pulled from the current HTSUS.",
    shortAnswer:
      "LIT's tariff calculator returns landed cost for any HS code × origin pair. It includes MFN base duty, FTA preferential rates, Section 301 (China), Section 232 (steel/aluminum), and AD/CVD where applicable.",
    problem:
      "USTR rulings shift quarterly; spreadsheet-based tariff models drift fast.",
    solution:
      "LIT's calculator is sourced from the current HTSUS and updated as USTR rulings publish. Every result links to the underlying citation.",
    capabilities: [
      { title: "Full HTSUS coverage", body: "10-digit HTS codes with MFN + FTA preferential rates." },
      { title: "Special programs", body: "Section 301, Section 232, AD/CVD, GSP where active." },
      { title: "Citation links", body: "Every rate links to the current USTR or CBP source." },
    ],
    whoItsFor: [
      "Customs brokers quoting landed cost.",
      "Importers modeling sourcing scenarios.",
      "Trade compliance teams validating quoted duty rates.",
    ],
    related: [
      { label: "Try the live calculator", href: "/tools/tariff-calculator" },
      { label: "HS code lookup", href: "/hs" },
      { label: "Quote generator", href: "/features/quote-generator" },
      { label: "Market rate benchmarking", href: "/features/market-rate-benchmarking" },
    ],
    faqs: [
      { q: "Is there a free version I can try right now?", a: "Yes — the public calculator at /tools/tariff-calculator pulls live MFN rates from the USITC HTSUS REST API and applies Section 232 / 301 / 122 overlays. Use it to spot-check a single line. The in-app version runs the same math against your full import history with shipment-by-shipment exposure modeling." },
      { q: "How current are the rates?", a: "USTR rulings are reflected within 48 hours of publication. CBP HTSUS revisions are reflected within 7 days." },
    ],
  },
  {
    slug: "quote-generator",
    title: "Quote generator —",
    titleHighlight: "lane benchmarks + tariffs in one quote.",
    eyebrow: "Tools",
    metaDescription:
      "Build a freight quote with lane-benchmarked ocean rate, tariff calculation, and brokerage fees in one document. Branded export, ready for the buyer.",
    lede:
      "Pull a lane-benchmarked ocean rate, tariff math, and brokerage fees into a single branded quote — ready for the buyer.",
    shortAnswer:
      "LIT's quote generator combines benchmarked lane rates, HS-coded tariff math, and brokerage fees into one branded quote PDF. Designed for forwarders and brokers replacing spreadsheet quoting.",
    problem:
      "Quote desks live in spreadsheets. Rates and tariffs drift between the model and the actual market.",
    solution:
      "LIT pulls live benchmarks for the lane and current HTSUS rates for the HS code, so every quote is grounded in current data and exportable in seconds.",
    capabilities: [
      { title: "Live lane rate", body: "Benchmarked ocean / air rate pulled at quote time." },
      { title: "Tariff line", body: "Auto-calculated duty for the HS × origin pair." },
      { title: "Branded PDF export", body: "Your logo, terms, and signature block — ready for the buyer." },
      { title: "Versioning", body: "Every quote is versioned for audit and renegotiation." },
    ],
    whoItsFor: [
      "Freight forwarder quote desks.",
      "Customs brokers generating landed-cost quotes.",
      "3PLs running pricing inside the same platform as sales.",
    ],
    related: [
      { label: "Market rate benchmarking", href: "/features/market-rate-benchmarking" },
      { label: "Tariff calculator", href: "/tools/tariff-calculator" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
    ],
    faqs: [
      { q: "Can I customize the quote PDF?", a: "Yes — logo, terms, signature, and color accents are all configurable." },
    ],
  },
];

export function getFeatureBySlug(slug: string) {
  return FEATURE_PAGES.find((f) => f.slug === slug);
}
