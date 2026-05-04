/**
 * Initial Sanity content seed. Run with `npm run seed` after setting
 * NEXT_PUBLIC_SANITY_PROJECT_ID + SANITY_API_WRITE_TOKEN in .env.local.
 *
 * Idempotent — uses createOrReplace with deterministic IDs so re-running
 * just updates existing documents. Drops a starter set:
 *  - 1× siteSettings singleton
 *  - 4× authors (1 human seed + 3 AI agent personas)
 *  - 9× categories (one per blog category called out in the design files)
 *  - 60× glossary terms (the trade + GTM long-tail SEO foundation)
 *  - 4× comparison stubs (importyeti, zoominfo, apollo, panjiva)
 *  - 5× use-case stubs (sales-teams, freight-forwarders, saas-gtm, agencies, operators)
 *  - 12× customer logos (placeholder names from the design files)
 *
 * Programmatic content (trade lanes, industries) is generated separately
 * by the TradeLane Refresher + Industry Refresher agents in Phase 4.
 */
import { createClient } from "@sanity/client";

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-10-15",
  token: process.env.SANITY_API_WRITE_TOKEN!,
  useCdn: false,
});

if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || !process.env.SANITY_API_WRITE_TOKEN) {
  console.error("[seed] Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_WRITE_TOKEN");
  process.exit(1);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function seed() {
  console.log("[seed] Starting…");

  // 1. siteSettings singleton
  await client.createOrReplace({
    _id: "siteSettings",
    _type: "siteSettings",
    siteName: "LIT — Logistic Intel",
    tagline: "Market intelligence and revenue execution, in one platform.",
    homepageHero: {
      pillText: "New · Pulse is live — natural-language intelligence",
      headline: "Find the companies, contacts, shipments, and",
      headlineHighlight: "market signals",
      subhead:
        "LIT combines company intelligence, trade data, CRM, Pulse search, and outbound execution into one platform built for modern growth teams.",
      kpis: [
        { _key: "k1", _type: "kpi", value: "124K+", label: "Companies indexed" },
        { _key: "k2", _type: "kpi", value: "8.2M", label: "Shipment records" },
        { _key: "k3", _type: "kpi", value: "94 lanes", label: "Tracked live" },
      ],
    },
    ctaCopy: {
      eyebrow: "Ready when you are",
      headline: "See LIT on",
      headlineHighlight: "your pipeline.",
      body: "Book a 25-minute demo and we'll run Pulse, shipment intel, and CRM workflows against companies in your own territory.",
      primaryLabel: "Book a Demo",
      primaryHref: "/demo",
      secondaryLabel: "Start Free",
      secondaryHref: "https://www.logisticintel.com/login?next=/app/dashboard",
    },
  });
  console.log("[seed] siteSettings ✓");

  // 2. Authors
  const authors = [
    { name: "Mira Chen", role: "Head of Trade Intelligence · LIT", isAi: false },
    { name: "Pulse Coach", role: "AI agent · LIT", isAi: true, expertise: ["Trade intelligence", "GTM playbooks"] },
    { name: "Lane Watcher", role: "AI agent · LIT", isAi: true, expertise: ["Trade lanes", "Carrier signals"] },
    { name: "Field Editor", role: "AI agent · LIT", isAi: true, expertise: ["Editorial review", "Brand voice"] },
  ];
  for (const a of authors) {
    await client.createOrReplace({
      _id: `author-${slug(a.name)}`,
      _type: "author",
      name: a.name,
      slug: { _type: "slug", current: slug(a.name) },
      role: a.role,
      isAiAgent: a.isAi,
      expertise: a.expertise,
    });
  }
  console.log(`[seed] ${authors.length} authors ✓`);

  // 3. Blog categories
  const categories = [
    { title: "Trade Intelligence", color: "#06b6d4" },
    { title: "Sales Prospecting", color: "#3b82f6" },
    { title: "Market Signals", color: "#10b981" },
    { title: "Company Intelligence", color: "#f59e0b" },
    { title: "CRM Automation", color: "#6366f1" },
    { title: "Outbound Campaigns", color: "#ef4444" },
    { title: "Logistics Growth", color: "#06b6d4" },
    { title: "Product Updates", color: "#8b5cf6" },
    { title: "Playbooks", color: "#ec4899" },
  ];
  for (const c of categories) {
    await client.createOrReplace({
      _id: `category-${slug(c.title)}`,
      _type: "category",
      title: c.title,
      slug: { _type: "slug", current: slug(c.title) },
      color: c.color,
    });
  }
  console.log(`[seed] ${categories.length} categories ✓`);

  // 4. Glossary — the long-tail SEO foundation. Top 60 trade + GTM terms.
  const glossary: Array<{ term: string; abbr?: string; cat: string; def: string; aka?: string[] }> = [
    { term: "TEU", abbr: "Twenty-foot Equivalent Unit", cat: "trade", def: "A standardized container measurement equivalent to one 20-foot shipping container; used to count global container volume." },
    { term: "FEU", abbr: "Forty-foot Equivalent Unit", cat: "trade", def: "Two TEU. The 40-foot shipping container size that makes up the majority of modern ocean freight." },
    { term: "BOL", abbr: "Bill of Lading", cat: "trade", def: "Legal shipping document detailing what was shipped, where, by whom — and the foundational data layer of trade intelligence." },
    { term: "MBL", abbr: "Master Bill of Lading", cat: "trade", def: "The carrier-issued bill of lading. The first 4 characters of the MBL number are usually the carrier's SCAC code." },
    { term: "HBL", abbr: "House Bill of Lading", cat: "trade", def: "The freight forwarder-issued bill of lading covering the actual shipper-to-consignee leg." },
    { term: "FCL", abbr: "Full Container Load", cat: "trade", def: "A single shipper has booked an entire container. Higher-margin freight, indicates established trade volume." },
    { term: "LCL", abbr: "Less than Container Load", cat: "trade", def: "Multiple shippers share one container. Smaller-volume shippers, often growing or seasonal." },
    { term: "HS Code", abbr: "Harmonized System Code", cat: "trade", def: "Standardized 6-10 digit numerical code classifying every traded product on Earth. The first 2 digits identify the chapter (e.g. 39 = plastics, 84 = machinery)." },
    { term: "SCAC", abbr: "Standard Carrier Alpha Code", cat: "trade", def: "Four-letter unique carrier identifier. Decoded from the first 4 chars of any MBL number." },
    { term: "ICP", abbr: "Ideal Customer Profile", cat: "sales", def: "The firmographic + behavioral profile of a company most likely to buy and stay. The foundation of every modern outbound motion." },
    { term: "ABM", abbr: "Account-Based Marketing", cat: "sales", def: "Marketing strategy that treats individual accounts as markets of one — coordinated multichannel outreach to a defined target list." },
    { term: "ARR", abbr: "Annual Recurring Revenue", cat: "sales", def: "The annualized value of subscription contracts in force. The headline metric of SaaS health." },
    { term: "BDR", abbr: "Business Development Rep", cat: "sales", def: "Outbound-focused seller who finds and qualifies new opportunities. Distinct from inbound SDR work." },
    { term: "Intent data", cat: "sales", def: "Behavioral signals (content consumption, hiring, lane changes) that suggest a company is in-market for your product." },
    { term: "Cadence", cat: "sales", def: "A structured sequence of outreach steps (email, call, LinkedIn) executed against a prospect over time." },
    { term: "Ocean freight", cat: "trade", def: "Cargo moved by ship. ~80% of global goods trade by volume travels via ocean freight." },
    { term: "Air freight", cat: "trade", def: "Cargo moved by aircraft. Faster, more expensive, used for high-value or time-sensitive goods." },
    { term: "Drayage", cat: "trade", def: "Short-haul truck moves between port and inland warehouse. The first/last mile of containerized ocean freight." },
    { term: "NVOCC", abbr: "Non-Vessel Operating Common Carrier", cat: "trade", def: "A freight intermediary that issues bills of lading without owning vessels — typically a forwarder operating their own master service." },
    { term: "Consignee", cat: "trade", def: "The party receiving the goods. Usually the importer of record." },
    { term: "Shipper", cat: "trade", def: "The party sending the goods. Usually the exporter or manufacturer." },
    { term: "Notify Party", cat: "trade", def: "Third party listed on the BOL to be notified of shipment arrival — often the freight forwarder or customs broker." },
    { term: "Incoterms", cat: "trade", def: "Standardized international trade terms (FOB, CIF, DDP, etc.) defining responsibilities of buyer vs seller in cross-border shipments." },
    { term: "FOB", abbr: "Free On Board", cat: "trade", def: "Incoterm: seller delivers goods on the vessel; buyer takes responsibility (and cost) from there." },
    { term: "CIF", abbr: "Cost, Insurance, and Freight", cat: "trade", def: "Incoterm: seller pays cost, insurance, and freight to destination port; buyer takes over there." },
    { term: "DDP", abbr: "Delivered Duty Paid", cat: "trade", def: "Incoterm: seller delivers door-to-door including duties. Buyer just receives." },
    { term: "Demurrage", cat: "trade", def: "Fee charged when containers stay at the port beyond the free-time window. A real cost trade intelligence tools surface." },
    { term: "Detention", cat: "trade", def: "Fee charged when containers stay outside the port (with the consignee) beyond the free-time window." },
    { term: "Tariff", cat: "trade", def: "Government tax on imported goods. HS-code-driven; varies by origin and trade agreement." },
    { term: "Customs broker", cat: "trade", def: "Licensed agent that clears goods through customs on behalf of importer." },
    { term: "Freight forwarder", cat: "trade", def: "Service company that arranges international shipping on behalf of shippers — booking carriers, customs, drayage, etc." },
    { term: "3PL", abbr: "Third-Party Logistics", cat: "trade", def: "Outsourced logistics provider — warehousing, fulfillment, transport. Forwarders are a subset." },
    { term: "4PL", abbr: "Fourth-Party Logistics", cat: "trade", def: "Logistics integrator that manages an entire supply chain on behalf of the customer — typically across multiple 3PLs." },
    { term: "MQL", abbr: "Marketing Qualified Lead", cat: "sales", def: "A lead that has met marketing's threshold for sales handoff (usually a content + form-fill score)." },
    { term: "SQL", abbr: "Sales Qualified Lead", cat: "sales", def: "A lead that the sales team has accepted as worth pursuing — opens an opportunity in CRM." },
    { term: "PQL", abbr: "Product Qualified Lead", cat: "sales", def: "A lead identified by product usage patterns (free trial, free tool, in-app signal). Often higher-converting than MQLs." },
    { term: "TAM", abbr: "Total Addressable Market", cat: "sales", def: "The full revenue opportunity if your product captured 100% of demand in your category." },
    { term: "SAM", abbr: "Serviceable Addressable Market", cat: "sales", def: "The portion of TAM you can realistically serve given your geo, product, and ICP constraints." },
    { term: "SOM", abbr: "Serviceable Obtainable Market", cat: "sales", def: "The slice of SAM you can capture in a defined timeframe — the realistic 1-3 year revenue ceiling." },
    { term: "Pipeline coverage", cat: "sales", def: "Open pipeline value divided by quota. A coverage ratio of 3x is the conventional minimum for SaaS sales." },
    { term: "Carrier mix", cat: "data", def: "The distribution of shipping carriers a shipper uses. Sudden carrier-mix shifts are one of the highest-intent buying signals in trade data." },
    { term: "Lane experiment", cat: "data", def: "When a shipper adds a new origin or destination port at low volume — typically a precursor to ramp." },
    { term: "Cadence shift", cat: "data", def: "A change in shipping frequency (monthly to bi-weekly, etc.) — often signals expansion or supply-chain restructuring." },
    { term: "Win-back", cat: "sales", def: "Re-engaging a former customer or prospect that lapsed. Trade intelligence makes this signal-driven." },
    { term: "Conquest play", cat: "sales", def: "Outreach motion targeting prospects currently using a specific competitor. High-intent because they've validated the category." },
    { term: "Vertical play", cat: "sales", def: "GTM motion focused on one industry — apparel importers, electronics, etc. — with industry-specific messaging and proof points." },
    { term: "Bill of lading data", cat: "data", def: "Aggregated shipment records sourced from US, Indian, Brazilian, and other public customs filings. The raw data layer of trade intelligence." },
    { term: "Container detail", cat: "data", def: "BOL-attached metadata about each container (type, size, weight, ISO code) used to compute TEU + load-type metrics." },
    { term: "ISO container code", cat: "trade", def: "Four-character ISO 6346 code identifying container type — e.g. 22G0 (20ft general purpose), 45G0 (40ft high-cube)." },
    { term: "Pulse query", cat: "data", def: "A natural-language search executed against LIT's intelligence layer. Routes to companies, lanes, contacts, or industries based on detected intent." },
    { term: "Natural-language search", cat: "data", def: "Search interface that interprets user intent in plain English instead of requiring structured filters. The defining UX of modern intelligence platforms." },
    { term: "Trade lane", cat: "trade", def: "An origin port × destination port shipping route. The unit of analysis for trade-flow intelligence." },
    { term: "Trade corridor", cat: "trade", def: "A geographic cluster of related lanes — e.g. Trans-Pacific (Asia → US West Coast)." },
    { term: "Container freight rate", cat: "trade", def: "Cost to move one TEU on a given lane. Volatile — tracked by SCFI, FBX, etc." },
    { term: "SCFI", abbr: "Shanghai Containerized Freight Index", cat: "trade", def: "Weekly spot-rate benchmark for container freight from Shanghai to major destinations." },
    { term: "FBX", abbr: "Freightos Baltic Index", cat: "trade", def: "Daily container freight rate index covering 12 global trade lanes." },
    { term: "OTIF", abbr: "On-Time In-Full", cat: "trade", def: "KPI measuring whether shipments arrive on time and complete. The gold-standard supply-chain reliability metric." },
    { term: "Lead time", cat: "trade", def: "Time from order to delivery. Compressing lead time is one of the highest-leverage supply-chain optimizations." },
    { term: "Sourcing diversification", cat: "trade", def: "Shifting sourcing from one country/region to multiple — e.g. China + 1, China + Vietnam. A high-intent signal in trade data." },
    { term: "Nearshoring", cat: "trade", def: "Relocating production closer to end markets — e.g. Mexico instead of China for US consumption. Driving a 2024-2026 corridor shift." },
    { term: "Reverse logistics", cat: "trade", def: "Return flow of goods — used items, defective product, recyclables — back through the supply chain." },
  ];
  for (const g of glossary) {
    await client.createOrReplace({
      _id: `glossary-${slug(g.term)}`,
      _type: "glossaryTerm",
      term: g.term,
      slug: { _type: "slug", current: slug(g.term) },
      abbreviation: g.abbr,
      category: g.cat,
      shortDefinition: g.def,
    });
  }
  console.log(`[seed] ${glossary.length} glossary terms ✓`);

  // 5. Comparison page stubs
  const comparisons = [
    { name: "ImportYeti", url: "https://www.importyeti.com" },
    { name: "ZoomInfo", url: "https://www.zoominfo.com" },
    { name: "Apollo", url: "https://www.apollo.io" },
    { name: "Panjiva", url: "https://panjiva.com" },
  ];
  for (const c of comparisons) {
    await client.createOrReplace({
      _id: `comparison-${slug(c.name)}`,
      _type: "comparison",
      competitorName: c.name,
      slug: { _type: "slug", current: slug(c.name) },
      competitorUrl: c.url,
      headline: `LIT vs ${c.name}`,
      subhead: `How LIT compares to ${c.name} for modern revenue teams.`,
    });
  }
  console.log(`[seed] ${comparisons.length} comparison stubs ✓`);

  // 6. Use-case stubs
  const useCases = [
    { persona: "Sales teams", headline: "Prospect with real trade intent — not guesswork." },
    { persona: "Freight forwarders", headline: "Win more shippers. Lane by lane." },
    { persona: "SaaS GTM", headline: "Replace ZoomInfo for supply-chain-adjacent ICPs." },
    { persona: "Agencies", headline: "Close enterprise brands with shipment-backed stories." },
    { persona: "Operators", headline: "Benchmark competitors by BOL and carrier mix." },
  ];
  for (const u of useCases) {
    await client.createOrReplace({
      _id: `useCase-${slug(u.persona)}`,
      _type: "useCase",
      persona: u.persona,
      slug: { _type: "slug", current: slug(u.persona) },
      headline: u.headline,
    });
  }
  console.log(`[seed] ${useCases.length} use-case stubs ✓`);

  // 7. Customer logos (placeholder names from the design files)
  const logos = [
    "Meridian Global Freight",
    "Lanewire Logistics",
    "Parallax Cargo",
    "Kestrel Trade",
    "Corridor Forwarding",
    "Port7",
    "Haulroute",
    "Northstar Shipping",
    "Seabound",
    "Atlas Global",
    "Harbor Logistics",
    "Blue Ocean Express",
  ];
  for (let i = 0; i < logos.length; i++) {
    const name = logos[i];
    await client.createOrReplace({
      _id: `logo-${slug(name)}`,
      _type: "customerLogo",
      name,
      domain: `${slug(name).split("-")[0]}.com`,
      displayInRail: true,
      displayOnCustomersPage: true,
      order: 100 + i,
    });
  }
  console.log(`[seed] ${logos.length} customer logos ✓`);

  console.log("[seed] Complete. Visit /studio to start editing.");
}

seed().catch((e) => {
  console.error("[seed] FAILED:", e);
  process.exit(1);
});
