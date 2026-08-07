import type { ReactNode } from "react";
import type { OfferGridCard } from "@/components/lead-magnet/MoneyPageOfferGrid";

/**
 * BOFU keyword landing pages — one entry per top-level lead-gen URL tracked in
 * lit_seo_keyword_targets. Rendered by components/lead-magnet/BofuMoneyPage.
 *
 * Copy rules (mirror app/features/_data.ts conventions):
 *  - metaTitle < 60 chars, metaDescription 140–160 chars.
 *  - FAQs are unique per page (they feed FAQPage JSON-LD — duplicated answers
 *    across URLs read as doorway pages).
 *  - Trial framing matches the 2026-08-06 billing model: searching is
 *    unlimited and free; the metered actions are deep account unlocks (10)
 *    and contact enrichments (10).
 */

type OfferCard = OfferGridCard;

type PreviewRow = { initial: string; name: string; meta: string };

export type BofuPage = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  headline: ReactNode;
  lede: string;
  formNote: string;
  previewUrlBar: string;
  previewCaption: string;
  previewRows: PreviewRow[];
  previewFooter: string;
  offer: { eyebrow: string; heading: string; body: string };
  offerCards: OfferCard[];
  outcomes: { num: string; label: string; body: string; cite: string }[];
  faqs: { question: string; answer: string }[];
  relatedHeading: string;
  related: { href: string; label: string; blurb: string }[];
  finalCta: { heading: string; body: string };
};

const TRIAL_NOTE =
  "Unlimited searches + 10 account unlocks + 10 verified contacts free. No credit card.";

/** The core offer cards, parameterized by who the page speaks to. Two to
 *  three cards per page are swapped for intent-specific ones below. */
function coreCards(audience: string): OfferCard[] {
  return [
    {
      check: "Includes",
      title: "Unlimited active-shipper search",
      body: `Search 524K+ live US importers by lane, port, carrier, HS code, mode, or industry — free, as many times as ${audience} need.`,
      span: 2,
      tone: "dark",
    },
    {
      check: "Per account",
      title: "Full company profile + supply-chain intel",
      body: "Shipment history, top trade lanes, carrier mix, container split, monthly cadence — refreshed daily from CBP filings.",
      span: 4,
    },
    {
      check: "Decision makers",
      title: "10 verified contact enrichments",
      body: "Right titles in the right roles — VP Supply Chain, Director of Logistics, Import Manager, Procurement. Email + LinkedIn + dial.",
      span: 3,
    },
    {
      check: "Pricing intel",
      title: "Ocean rate benchmark per account",
      body: "See what each shipper pays for ocean freight on their actual lanes, matched to FBX reference rates and refreshed weekly.",
      span: 3,
    },
    {
      check: "AI brief",
      title: "Pulse AI account intelligence",
      body: "Executive summary, opportunity signals (buying, displacement, carrier, supplier), and a ready-to-send outreach hook with cited sources.",
      span: 3,
      tone: "dark",
    },
    {
      check: "Pipeline sizing",
      title: "Revenue opportunity per account",
      body: "Total addressable freight spend, sized by service line. Know what an account is worth before you ever call.",
      span: 3,
    },
  ];
}

export const BOFU_PAGES: BofuPage[] = [
  // ── /importer-leads ────────────────────────────────────────────────────────
  {
    slug: "importer-leads",
    metaTitle: "Importer Leads — 524,000+ Active US Importers",
    metaDescription:
      "Build importer lead lists from live US customs data: 524K+ active importers with shipment history, verified contacts, and lane-level detail. Start free.",
    eyebrow: "Importer leads — refreshed daily from US customs",
    headline: (
      <>
        Every <strong>active US importer</strong>, with the proof they're importing.
      </>
    ),
    lede:
      "Stop guessing which companies import. LIT builds importer lead lists from live customs (BOL) filings — who's importing, from where, how often, and through which ports — then attaches the verified decision-maker to call.",
    formNote: TRIAL_NOTE,
    previewUrlBar: "app.logisticintel.com / search?q=importers",
    previewCaption: "Try it — search importers by product, lane, or port",
    previewRows: [
      { initial: "W", name: "Williams-Sonoma", meta: "Home goods · VN → US · 6,120 ship · 14.2K TEU" },
      { initial: "H", name: "Harbor Freight Tools", meta: "Tools · CN → US · 9,480 ship · 26.7K TEU" },
      { initial: "P", name: "Polaris Industries", meta: "Powersports · MX → US · 2,310 ship · 4.9K TEU" },
      { initial: "N", name: "Newell Brands", meta: "Consumer · CN → US · 5,205 ship · 11.3K TEU" },
    ],
    previewFooter: "Showing 4 of 3,861 importer matches",
    offer: {
      eyebrow: "What's in the free trial",
      heading: "An importer database that proves activity — not a stale contact list.",
      body: "Unlimited importer searches. 10 deep account unlocks with full shipment history. 10 verified contact enrichments. No credit card required.",
    },
    offerCards: coreCards("your team"),
    outcomes: [
      {
        num: "5.8%",
        label: "Reply rate on importer outreach",
        body: "Referencing a prospect's actual import lanes and volumes lifts cold reply rates from the ~1% list-blast baseline.",
        cite: "Top-25 freight forwarder · 80-person sales org",
      },
      {
        num: "8 min",
        label: "To build a qualified importer list",
        body: "Filter by HS code, origin country, and port of entry. Export or push to CRM. What used to take a research day takes minutes.",
        cite: "Mid-market 3PL · 25-rep team",
      },
      {
        num: "524K+",
        label: "Active importers indexed",
        body: "Every US consignee with recent ocean activity, deduplicated and joined to firmographics and verified contacts.",
        cite: "LIT importer directory · updated daily",
      },
    ],
    faqs: [
      {
        question: "What counts as an importer lead in LIT?",
        answer:
          "A US company with recent customs (BOL) activity as consignee — meaning it demonstrably imports. Each lead carries shipment history, lanes, ports, carrier mix, estimated freight spend, and verified decision-maker contacts.",
      },
      {
        question: "How is this different from buying an importer list?",
        answer:
          "Purchased lists decay the day they're exported and rarely prove import activity. LIT is a live database: activity refreshes daily from CBP filings, so every lead you pull is importing right now, and you can verify it on the account page.",
      },
      {
        question: "Can I find importers by product or HS code?",
        answer:
          "Yes. Search by HS code, product keywords from bill-of-lading descriptions, origin country, port of entry, carrier, or industry — then stack filters (e.g., furniture importers from Vietnam entering through Savannah).",
      },
      {
        question: "Do importer leads include contact information?",
        answer:
          "Yes. LIT joins each importer to verified supply-chain decision makers — logistics, procurement, and import/ops titles — with email, LinkedIn, and direct dial. The free trial includes 10 contact enrichments.",
      },
      {
        question: "How fresh is the import data?",
        answer:
          "US customs manifest data is ingested and normalized daily. Pulse watchlists then alert you weekly when a saved importer changes — new lanes, volume shifts, or a displaced forwarder.",
      },
    ],
    relatedHeading: "More ways to find buyers of freight services.",
    related: [
      { href: "/freight-leads", label: "Freight leads", blurb: "The canonical guide to prospecting active US shippers with LIT." },
      { href: "/features/importer-database", label: "Importer database", blurb: "How the 524K-company importer index is built and refreshed." },
      { href: "/direct-shipper-leads", label: "Direct shipper leads", blurb: "Skip the load boards — go straight to the companies that own the freight." },
    ],
    finalCta: {
      heading: "Search every active US importer — free.",
      body: "Unlimited searches. 10 account unlocks with full shipment history. 10 verified contacts. No credit card.",
    },
  },

  // ── /logistics-leads ───────────────────────────────────────────────────────
  {
    slug: "logistics-leads",
    metaTitle: "Logistics Leads — Prospects That Actually Ship",
    metaDescription:
      "Generate logistics leads from live shipment data: active shippers, verified logistics decision makers, rate benchmarks, and AI account briefs. Start free.",
    eyebrow: "Logistics leads — built from live shipment data",
    headline: (
      <>
        Logistics leads that are <strong>provably moving freight</strong> this week.
      </>
    ),
    lede:
      "Generic B2B databases can't tell you who ships. LIT can — every lead is backed by live customs filings, so your team only works accounts with real, current freight activity and a named logistics decision maker.",
    formNote: TRIAL_NOTE,
    previewUrlBar: "app.logisticintel.com / search",
    previewCaption: "Try it — search any industry, lane, or port",
    previewRows: [
      { initial: "C", name: "Costco Wholesale", meta: "Retail · CN → US · 22,410 ship · 61.8K TEU" },
      { initial: "R", name: "Rooms To Go", meta: "Furniture · VN → US · 4,876 ship · 12.4K TEU" },
      { initial: "S", name: "SharkNinja", meta: "Appliances · CN → US · 3,644 ship · 8.8K TEU" },
      { initial: "F", name: "Five Below", meta: "Retail · CN → US · 2,987 ship · 7.1K TEU" },
    ],
    previewFooter: "Showing 4 of 2,414 matches",
    offer: {
      eyebrow: "What's in the free trial",
      heading: "A logistics-specific lead engine — not a generic B2B database.",
      body: "Unlimited searches across 524K+ active shippers. 10 deep account unlocks. 10 verified logistics contacts. No credit card required.",
    },
    offerCards: coreCards("logistics sales teams"),
    outcomes: [
      {
        num: "4.1×",
        label: "More first meetings booked",
        body: "Replacing cold lists with shipment-triggered prospecting lifts reply rate from 1.4% to 5.8%.",
        cite: "Top-25 freight forwarder · 80-person sales org",
      },
      {
        num: "70%",
        label: "Less time on list-building",
        body: "From 12-hour weekly list builds to 8-minute searches. Reps spend the saved time on conversations.",
        cite: "Mid-market 3PL · 25-rep team",
      },
      {
        num: "$2.4M",
        label: "New pipeline in 60 days",
        body: "One BDR. Three lanes. Two-month ramp. Built entirely on LIT's active-shipper data.",
        cite: "NVOCC · early-stage growth team",
      },
    ],
    faqs: [
      {
        question: "What makes a good logistics lead?",
        answer:
          "Three things: proof the company actually ships (live BOL activity), fit with your service lanes and modes, and a reachable logistics decision maker. LIT scores and surfaces all three on every account so reps prioritize by real opportunity.",
      },
      {
        question: "Who uses LIT for logistics lead generation?",
        answer:
          "Freight forwarders, freight brokers, 3PLs, NVOCCs, customs brokers, and drayage/warehousing providers — any team selling services to companies that move freight internationally or domestically.",
      },
      {
        question: "How does LIT compare to ZoomInfo for logistics sales?",
        answer:
          "ZoomInfo tells you a company exists; LIT tells you it ships. We join verified contacts to live shipment records, so you skip the accounts that haven't moved a container in years — and add rate benchmarks, AI briefs, and freight-spend sizing ZoomInfo doesn't have.",
      },
      {
        question: "Can I get alerted when a lead's shipping behavior changes?",
        answer:
          "Yes. Save accounts to a Pulse watchlist and LIT emails you weekly with what changed: new lanes activated, volumes up or down, a forwarder displaced, or fresh revenue opportunity — the natural trigger for a timely touch.",
      },
      {
        question: "Does LIT replace my CRM or feed it?",
        answer:
          "Either. Push leads natively to HubSpot, Salesforce, Outreach, Apollo, Salesloft, or SmartLead — or work them in LIT's built-in Command Center CRM, which is included in the free trial.",
      },
    ],
    relatedHeading: "Go deeper on logistics prospecting.",
    related: [
      { href: "/logistics-sales-intelligence", label: "Logistics sales intelligence", blurb: "The full intelligence layer: signals, briefs, benchmarks, and sizing." },
      { href: "/freight-leads", label: "Freight leads", blurb: "How to prospect the 524K active-shipper universe, step by step." },
      { href: "/solutions/logistics-sales-teams", label: "For logistics sales teams", blurb: "Team workflows: territories, watchlists, and shared pipelines." },
    ],
    finalCta: {
      heading: "Put live shipment data behind your pipeline.",
      body: "Unlimited searches. 10 account unlocks. 10 verified logistics contacts. No credit card.",
    },
  },

  // ── /freight-forwarding-leads ──────────────────────────────────────────────
  {
    slug: "freight-forwarding-leads",
    metaTitle: "Freight Forwarding Leads — Win Shippers With BOL Data",
    metaDescription:
      "Find freight forwarding leads with live BOL data: see each shipper's lanes, volumes, and current forwarder — then reach the decision maker. Start free.",
    eyebrow: "Freight forwarding leads — see who handles the freight today",
    headline: (
      <>
        Find shippers — and see <strong>which forwarder they use today</strong>.
      </>
    ),
    lede:
      "The best forwarding lead is a shipper whose current provider is slipping. LIT shows every active shipper's lanes, volumes, and carrier/forwarder mix from live BOL data — so you pitch displacement with evidence, not hope.",
    formNote: TRIAL_NOTE,
    previewUrlBar: "app.logisticintel.com / search?view=forwarder-mix",
    previewCaption: "Try it — see forwarder mix on any account",
    previewRows: [
      { initial: "Y", name: "YETI Holdings", meta: "Consumer · CN → US · 1,982 ship · 2 forwarders" },
      { initial: "T", name: "Traeger Grills", meta: "Consumer · CN → US · 1,204 ship · 3 forwarders" },
      { initial: "B", name: "Burlington Stores", meta: "Retail · CN → US · 8,733 ship · 4 forwarders" },
      { initial: "M", name: "Mattel", meta: "Toys · CN/MY → US · 5,417 ship · 2 forwarders" },
    ],
    previewFooter: "Showing 4 of 1,893 multi-forwarder accounts",
    offer: {
      eyebrow: "What's in the free trial",
      heading: "Displacement-grade intelligence on every prospective shipper.",
      body: "Unlimited searches. 10 deep account unlocks showing lanes, volumes, and provider mix. 10 verified contacts. No credit card required.",
    },
    offerCards: [
      ...coreCards("forwarding sales teams").slice(0, 1),
      {
        check: "Displacement",
        title: "Forwarder & carrier mix per shipper",
        body: "See which providers move each account's freight and how concentrated the wallet is — consolidation and vulnerability scored automatically.",
        span: 4,
      },
      ...coreCards("forwarding sales teams").slice(2),
    ],
    outcomes: [
      {
        num: "2.4×",
        label: "Reply rate vs. generic lists",
        body: "Opening with a prospect's own lane data ('your Ningbo → Savannah volume doubled in Q2') earns responses cold lists can't.",
        cite: "Top-25 freight forwarder · NA growth team",
      },
      {
        num: "1,893",
        label: "Multi-forwarder accounts surfaced",
        body: "Shippers splitting volume across 2+ providers are the easiest displacement wins — LIT scores and filters them directly.",
        cite: "LIT consolidation-opportunity index",
      },
      {
        num: "60 days",
        label: "To a repeatable displacement motion",
        body: "Territory search → watchlist → weekly Pulse triggers → outreach with lane evidence. One BDR runs the whole loop.",
        cite: "NVOCC · early-stage growth team",
      },
    ],
    faqs: [
      {
        question: "How do freight forwarders find new shipper customers with LIT?",
        answer:
          "Search active shippers on the lanes you serve, filter to accounts whose provider mix suggests openness (multiple forwarders, recent switches, volume growth), unlock the account for full history, then contact the verified logistics decision maker — all in one workspace.",
      },
      {
        question: "Can I really see which forwarder a shipper uses?",
        answer:
          "For ocean freight, yes — BOL filings expose the carriers and, in most cases, the NVOCCs/forwarders handling each shipment. LIT aggregates this into a provider-mix view per account with concentration scoring.",
      },
      {
        question: "What are the strongest displacement signals?",
        answer:
          "Volume split across multiple forwarders, a recent provider change, rapid volume growth the incumbent may be struggling to service, and rate benchmarks showing the shipper likely overpays on its main lanes. LIT scores all four.",
      },
      {
        question: "Does this work for air freight and LCL?",
        answer:
          "Ocean FCL/LCL coverage is deepest because it's manifest-based. LCL shipments are flagged distinctly with consolidator detail. Air coverage comes through partner data on major lanes and is expanding.",
      },
      {
        question: "How fast can a new BDR get productive?",
        answer:
          "Same day. Unlimited search is free, so a new rep can explore their territory immediately; the 10 trial unlocks are enough to build a first target list with full shipment evidence before you commit to a plan.",
      },
    ],
    relatedHeading: "Built for forwarding growth teams.",
    related: [
      { href: "/solutions/freight-forwarders", label: "For freight forwarders", blurb: "The full forwarder playbook: territories, displacement, retention." },
      { href: "/direct-shipper-leads", label: "Direct shipper leads", blurb: "Go straight to the freight owners on your lanes." },
      { href: "/rate-benchmark", label: "Rate benchmark", blurb: "Know what a prospect pays for ocean freight before you quote." },
    ],
    finalCta: {
      heading: "Pitch your next shipper with their own data.",
      body: "Unlimited searches. 10 account unlocks with provider mix and lane history. 10 verified contacts. No credit card.",
    },
  },

  // ── /direct-shipper-leads ──────────────────────────────────────────────────
  {
    slug: "direct-shipper-leads",
    metaTitle: "Direct Shipper Leads — Skip the Load Boards",
    metaDescription:
      "Reach freight owners directly: find active shippers by lane and volume, with verified logistics contacts — no load boards, no brokered scraps. Start free.",
    eyebrow: "Direct shipper leads — go to the source of the freight",
    headline: (
      <>
        Work with <strong>freight owners directly</strong> — not load-board leftovers.
      </>
    ),
    lede:
      "Load boards hand you commoditized freight at commodity margins. LIT identifies the companies that own the freight — active shippers on your lanes, sized by volume and spend — and gives you the decision maker to build a direct relationship with.",
    formNote: TRIAL_NOTE,
    previewUrlBar: "app.logisticintel.com / search?filter=shippers",
    previewCaption: "Try it — find shippers on your strongest lanes",
    previewRows: [
      { initial: "A", name: "Ashley Furniture", meta: "Furniture · VN → US · 11,240 ship · 31.2K TEU" },
      { initial: "D", name: "Dorel Industries", meta: "Juvenile/home · CN → US · 3,418 ship · 7.6K TEU" },
      { initial: "K", name: "Kent International", meta: "Bicycles · CN → US · 1,507 ship · 3.4K TEU" },
      { initial: "G", name: "Gold Medal Products", meta: "Food equip · CN → US · 894 ship · 1.9K TEU" },
    ],
    previewFooter: "Showing 4 of 5,207 shippers on this lane",
    offer: {
      eyebrow: "What's in the free trial",
      heading: "Everything you need to open direct shipper relationships.",
      body: "Unlimited shipper searches. 10 deep account unlocks. 10 verified logistics contacts. No credit card required.",
    },
    offerCards: coreCards("brokers and carriers"),
    outcomes: [
      {
        num: "3–5×",
        label: "Margin vs. brokered freight",
        body: "Direct relationships remove the middle layer. One anchor shipper on a core lane outearns a month of load-board wins.",
        cite: "Independent broker · 8-truck dedicated ops",
      },
      {
        num: "5,207",
        label: "Shippers on a single lane search",
        body: "Filter by origin, destination, volume band, and container profile to find the accounts that actually fit your capacity.",
        cite: "LIT lane search · CN → US East Coast",
      },
      {
        num: "94%",
        label: "Email deliverability on verified contacts",
        body: "Reach logistics and transportation managers directly instead of dialing the switchboard.",
        cite: "Verified-contact set · 4,200 sends",
      },
    ],
    faqs: [
      {
        question: "What is a direct shipper lead?",
        answer:
          "A company that owns the freight it moves — the importer or exporter of record — rather than a broker reselling it. Direct relationships mean better margins, steadier volume, and multi-year contracts instead of one-off spot loads.",
      },
      {
        question: "How do I find direct shippers instead of brokers?",
        answer:
          "Customs data names the actual consignee on each shipment. LIT filters out intermediary entities so a search returns freight owners, sized by shipment count, TEU, and estimated spend on the exact lanes you serve.",
      },
      {
        question: "Does this work for domestic-only trucking?",
        answer:
          "LIT is strongest where customs data exists: companies importing or exporting internationally. Nearly all of them also buy domestic drayage, transload, and OTR capacity around their ports of entry — which is exactly how carriers use LIT to open doors.",
      },
      {
        question: "Who should I contact at a shipper?",
        answer:
          "LIT's verified contacts focus on the titles that award freight: Director of Logistics, Transportation Manager, Supply Chain VP, and Import/Export Manager — each with email, LinkedIn, and direct dial where available.",
      },
      {
        question: "How is this better than a load board?",
        answer:
          "Load boards are demand you compete for; LIT is demand you develop. You see a shipper's full lane map and volumes before outreach, so you approach with a capacity story that fits — and keep 100% of the relationship.",
      },
    ],
    relatedHeading: "More for brokers and carriers.",
    related: [
      { href: "/freight-broker-leads", label: "Freight broker leads", blurb: "The broker-specific playbook for winning direct freight." },
      { href: "/shipper-leads", label: "Shipper leads", blurb: "Find shippers with context: lanes, volumes, and momentum." },
      { href: "/importer-leads", label: "Importer leads", blurb: "Every active US importer, with proof of activity." },
    ],
    finalCta: {
      heading: "Open your first direct shipper conversation this week.",
      body: "Unlimited searches. 10 account unlocks. 10 verified contacts. No credit card.",
    },
  },

  // ── /3pl-leads ─────────────────────────────────────────────────────────────
  {
    slug: "3pl-leads",
    metaTitle: "3PL Leads — Find Companies That Need Logistics Help",
    metaDescription:
      "3PL lead generation from live import data: spot companies with growing volumes, complex lanes, and no dedicated logistics muscle — then reach them. Start free.",
    eyebrow: "3PL leads — growth signals from live import data",
    headline: (
      <>
        Find companies <strong>outgrowing their logistics</strong> — before your competitors do.
      </>
    ),
    lede:
      "The best 3PL prospect is a company whose freight is getting more complex faster than its team. LIT surfaces exactly that: rising import volumes, multiplying lanes, port congestion exposure, and fragmented providers — with the operations decision maker attached.",
    formNote: TRIAL_NOTE,
    previewUrlBar: "app.logisticintel.com / search?signal=velocity",
    previewCaption: "Try it — filter by volume growth and lane complexity",
    previewRows: [
      { initial: "O", name: "Olaplex", meta: "Beauty · IT/CN → US · vol +64% YoY · 3 lanes" },
      { initial: "B", name: "BlendJet", meta: "Consumer · CN → US · vol +41% YoY · 2 lanes" },
      { initial: "L", name: "Lovesac", meta: "Furniture · CN/VN → US · 2,214 ship · 5 lanes" },
      { initial: "R", name: "Ridge Wallet", meta: "Accessories · CN → US · vol +38% YoY · 2 lanes" },
    ],
    previewFooter: "Showing 4 of 1,102 high-velocity accounts",
    offer: {
      eyebrow: "What's in the free trial",
      heading: "Growth-signal prospecting for warehousing, fulfillment, and managed transportation.",
      body: "Unlimited searches with velocity and complexity filters. 10 deep account unlocks. 10 verified ops contacts. No credit card required.",
    },
    offerCards: [
      ...coreCards("3PL business development teams").slice(0, 1),
      {
        check: "Growth signals",
        title: "Velocity & complexity scoring",
        body: "Accounts ranked by volume growth, lane expansion, and seasonal cadence — the leading indicators a company is about to need a 3PL.",
        span: 4,
      },
      ...coreCards("3PL business development teams").slice(2),
    ],
    outcomes: [
      {
        num: "+40%",
        label: "YoY import growth — the trigger filter",
        body: "Companies growing this fast hit warehouse and capacity walls. Reaching them in the growth window wins multi-year contracts.",
        cite: "LIT velocity index · consumer brands cohort",
      },
      {
        num: "70%",
        label: "Less time on account research",
        body: "Lane maps, volume trends, and container profiles are pre-built on every account — discovery calls start at second base.",
        cite: "Mid-market 3PL · 25-rep team",
      },
      {
        num: "$46M",
        label: "Freight spend sized on one account",
        body: "Revenue-opportunity sizing shows the full logistics wallet before the first call, so you scope the deal — not just the intro.",
        cite: "Enterprise 3PL · discovery workflow",
      },
    ],
    faqs: [
      {
        question: "How do 3PLs generate leads with import data?",
        answer:
          "Import activity is the earliest public signal of logistics need. A brand whose inbound TEU doubles will need warehousing, drayage, and fulfillment capacity within months. LIT turns those filings into ranked, contactable accounts.",
      },
      {
        question: "Which growth signals matter most for 3PL sales?",
        answer:
          "Year-over-year volume growth, new lanes or origin countries, rising LCL share (a sign of inventory pressure), seasonal spikes, and provider fragmentation. LIT computes each per account and lets you filter on them directly.",
      },
      {
        question: "Can I target e-commerce and DTC brands?",
        answer:
          "Yes — filter by consumer-goods industries, container profiles typical of DTC (mixed SKU, LCL-heavy), and port pairs that feed fulfillment hubs. Many fast-growing DTC importers have no dedicated logistics team at all: ideal 3PL prospects.",
      },
      {
        question: "Who's the right buyer contact at these accounts?",
        answer:
          "For growth-stage importers it's usually the COO, VP Operations, or Head of Supply Chain rather than a dedicated logistics title. LIT's enrichment prioritizes the operational decision maker actually reachable at each company size.",
      },
      {
        question: "How does the free trial work for a BD team?",
        answer:
          "Searching is unlimited and free for everyone, so the whole team can explore territories immediately. The trial's 10 account unlocks and 10 contact enrichments let you validate data quality on real targets before upgrading.",
      },
    ],
    relatedHeading: "More for 3PL growth teams.",
    related: [
      { href: "/solutions/3pl-sales", label: "For 3PL sales teams", blurb: "Territory design, growth-signal watchlists, and team workflows." },
      { href: "/logistics-leads", label: "Logistics leads", blurb: "The wider playbook for leads backed by live shipment data." },
      { href: "/revenue-opportunity", label: "Revenue opportunity", blurb: "Size the full logistics wallet on every account." },
    ],
    finalCta: {
      heading: "Catch the next breakout brand in its growth window.",
      body: "Unlimited searches with growth filters. 10 account unlocks. 10 verified contacts. No credit card.",
    },
  },

  // ── /customs-broker-leads ──────────────────────────────────────────────────
  {
    slug: "customs-broker-leads",
    metaTitle: "Customs Broker Leads — Importers Who Need Clearance",
    metaDescription:
      "Find customs brokerage clients from live entry data: new importers, expanding filers, and high-entry-volume accounts with verified contacts. Start free.",
    eyebrow: "Customs broker leads — every importer files entries",
    headline: (
      <>
        Every importer is a <strong>customs brokerage prospect</strong>. Find yours.
      </>
    ),
    lede:
      "Each of the 524K+ active US importers files customs entries — and pays someone to do it. LIT shows you who imports, what they import, through which ports, and how often — so you target the accounts whose entry volume and commodity mix fit your practice.",
    formNote: TRIAL_NOTE,
    previewUrlBar: "app.logisticintel.com / search?port=all",
    previewCaption: "Try it — search importers by port of entry and commodity",
    previewRows: [
      { initial: "U", name: "Uline", meta: "Industrial · CN → Chicago · 4,882 ship · 12 HS chapters" },
      { initial: "F", name: "Fabletics", meta: "Apparel · VN → LA/LB · 1,730 ship · 3 HS chapters" },
      { initial: "S", name: "Scotts Miracle-Gro", meta: "Garden · CN → Savannah · 2,105 ship · 7 HS chapters" },
      { initial: "E", name: "Element Electronics", meta: "Electronics · CN → Charleston · 977 ship · 2 HS chapters" },
    ],
    previewFooter: "Showing 4 of 8,466 importers at your ports",
    offer: {
      eyebrow: "What's in the free trial",
      heading: "Target importers by port, commodity, and entry complexity.",
      body: "Unlimited importer searches. 10 deep account unlocks with HS-code and port detail. 10 verified contacts. No credit card required.",
    },
    offerCards: [
      ...coreCards("customs brokerage teams").slice(0, 1),
      {
        check: "Entry intel",
        title: "HS-code & port-of-entry profiles",
        body: "See each importer's commodity chapters, entry ports, and origin countries — match prospects to your licenses, locations, and specialty (ADD/CVD, FDA, textiles).",
        span: 4,
      },
      ...coreCards("customs brokerage teams").slice(2),
    ],
    outcomes: [
      {
        num: "8,466",
        label: "Importers at a single port complex",
        body: "Filter the national importer base down to companies entering through the ports where your team files.",
        cite: "LIT port search · LA/Long Beach",
      },
      {
        num: "1st",
        label: "To reach new importers",
        body: "First-time filers appear in the data within days of their first entry — reach them before they've settled on a broker.",
        cite: "New-importer signal · Pulse watchlist",
      },
      {
        num: "5.8%",
        label: "Reply rate with commodity-specific outreach",
        body: "\"We clear Section 301-exposed electronics at Charleston daily\" outperforms any generic brokerage pitch.",
        cite: "Regional customs broker · growth pilot",
      },
    ],
    faqs: [
      {
        question: "How do customs brokers find new clients with LIT?",
        answer:
          "Search importers by port of entry, HS chapter, origin country, and volume. Prioritize accounts matching your specialty — say, FDA-regulated goods at your home port — then contact the import manager with a pitch grounded in their actual entry profile.",
      },
      {
        question: "Can I find importers who just started importing?",
        answer:
          "Yes. First-time consignees surface within days of their initial entries. New importers are the highest-converting brokerage prospects because they haven't formed a broker relationship yet — save the signal as a watchlist and Pulse alerts you weekly.",
      },
      {
        question: "Does LIT show what commodities an importer brings in?",
        answer:
          "Every account profile includes bill-of-lading product descriptions and HS-code chapters, so you can gauge entry complexity, flag ADD/CVD or PGA exposure, and tailor your compliance pitch to what they actually ship.",
      },
      {
        question: "Can I target importers at specific ports?",
        answer:
          "Yes — port of entry is a first-class filter. Build lists like \"furniture importers entering Savannah from Vietnam\" or \"electronics importers at Charleston,\" sized by shipment count and TEU.",
      },
      {
        question: "Who should a customs broker contact at an importer?",
        answer:
          "LIT's verified contacts cover Import Managers, Trade Compliance Managers, and Supply Chain leadership — the titles that select and switch customs brokers — with email, LinkedIn, and direct dial.",
      },
    ],
    relatedHeading: "More for customs and compliance teams.",
    related: [
      { href: "/solutions/customs-brokers", label: "For customs brokers", blurb: "The full brokerage growth playbook on LIT." },
      { href: "/importer-leads", label: "Importer leads", blurb: "The complete active-importer universe, updated daily." },
      { href: "/tools/tariff-calculator", label: "Tariff calculator", blurb: "A free tool your prospects are already searching for." },
    ],
    finalCta: {
      heading: "Find the importers your practice was built for.",
      body: "Unlimited searches by port and commodity. 10 account unlocks. 10 verified contacts. No credit card.",
    },
  },

  // ── /logistics-sales-intelligence ──────────────────────────────────────────
  {
    slug: "logistics-sales-intelligence",
    metaTitle: "Logistics Sales Intelligence Platform | LIT",
    metaDescription:
      "The sales intelligence layer for logistics: live shipment data, verified contacts, rate benchmarks, AI account briefs, and freight-spend sizing in one place.",
    eyebrow: "Logistics sales intelligence — the category, defined",
    headline: (
      <>
        Sales intelligence built on <strong>what companies actually ship</strong>.
      </>
    ),
    lede:
      "Horizontal sales-intelligence tools stop at firmographics. Logistics sales intelligence starts where they stop: live shipment behavior, provider relationships, lane economics, and freight spend — the facts that decide whether a logistics deal exists at all.",
    formNote: TRIAL_NOTE,
    previewUrlBar: "app.logisticintel.com / pulse",
    previewCaption: "Try it — open any account's intelligence brief",
    previewRows: [
      { initial: "S", name: "Stanley Black & Decker", meta: "Signal: forwarder displaced · CN → US · 14.1K TEU" },
      { initial: "H", name: "Hasbro", meta: "Signal: new VN origin lane · 6.2K TEU · Q2 spike" },
      { initial: "W", name: "Wayfair", meta: "Signal: volume +28% QoQ · 5 origin countries" },
      { initial: "P", name: "Purple Innovation", meta: "Signal: LCL share rising · capacity pressure" },
    ],
    previewFooter: "4 of 611 live signals across your territory",
    offer: {
      eyebrow: "The intelligence stack",
      heading: "Five intelligence layers. One account view.",
      body: "Shipment intelligence, contact intelligence, pricing intelligence, AI account briefs, and revenue sizing — unified so a rep sees the whole account in one screen. Free to search, always.",
    },
    offerCards: [
      {
        check: "Layer 1",
        title: "Shipment intelligence",
        body: "Live BOL-level activity on 524K+ US importers: lanes, ports, carriers, containers, cadence — refreshed daily from customs filings.",
        span: 2,
        tone: "dark",
      },
      {
        check: "Layer 2",
        title: "Contact intelligence",
        body: "Verified logistics, supply-chain, and procurement decision makers joined to every shipping account. Email, LinkedIn, direct dial.",
        span: 4,
      },
      {
        check: "Layer 3",
        title: "Pricing intelligence",
        body: "Ocean rate benchmarks per account and lane, matched to FBX reference rates — know the prospect's cost baseline before you quote.",
        span: 3,
      },
      {
        check: "Layer 4",
        title: "Pulse AI account briefs",
        body: "An analyst-grade brief on demand: executive summary, opportunity signals, displacement angles, and a ready-to-send opener with cited sources.",
        span: 3,
        tone: "dark",
      },
      {
        check: "Layer 5",
        title: "Revenue-opportunity sizing",
        body: "Total addressable freight spend per account, split by service line, so pipeline reviews rank accounts by real dollars.",
        span: 3,
      },
      {
        check: "Delivery",
        title: "Signals, not dashboards",
        body: "Weekly Pulse digests push what changed — new lanes, provider switches, volume moves — to your inbox and your CRM.",
        span: 3,
      },
    ],
    outcomes: [
      {
        num: "611",
        label: "Live signals in one territory",
        body: "Displacements, new lanes, and volume moves detected across saved accounts in a single week — each one an outreach trigger.",
        cite: "Pulse signal feed · enterprise forwarder",
      },
      {
        num: "4.1×",
        label: "Meeting rate vs. firmographic lists",
        body: "Outreach grounded in shipment behavior consistently outperforms persona-only targeting.",
        cite: "Top-25 freight forwarder · 80-person sales org",
      },
      {
        num: "1",
        label: "Workspace replacing five tools",
        body: "Teams consolidate a data provider, contact tool, rate source, research analyst, and prospecting tracker into LIT.",
        cite: "Mid-market 3PL · tooling consolidation review",
      },
    ],
    faqs: [
      {
        question: "What is logistics sales intelligence?",
        answer:
          "The combination of live shipment data, verified logistics contacts, pricing benchmarks, and AI-generated account analysis used to find, prioritize, and win freight-services deals. It answers not just \"who is this company?\" but \"do they ship, what does it cost them, and why would they switch?\"",
      },
      {
        question: "How is it different from general sales intelligence like ZoomInfo?",
        answer:
          "General tools describe companies; logistics sales intelligence describes freight behavior. LIT joins the two — firmographics AND live BOL activity, provider mix, lane economics, and spend sizing — which is precisely the context a logistics seller needs and horizontal tools lack.",
      },
      {
        question: "What data sources power LIT?",
        answer:
          "US Customs AMS manifest filings refreshed daily (the same source institutional providers use), joined with entity-resolved company records, verified contact data, and Freightos FBX rate references — normalized into a single account graph.",
      },
      {
        question: "Can my whole team use it?",
        answer:
          "Yes — shared watchlists, territories, and a built-in Command Center CRM, plus native push to HubSpot, Salesforce, Outreach, Apollo, Salesloft, and SmartLead on team plans. Searching is free for every seat.",
      },
      {
        question: "How do I evaluate it against our current stack?",
        answer:
          "Run your live pipeline through it: search ten current opportunities, unlock the accounts, and compare LIT's shipment evidence and contacts against what your stack shows. The free trial's 10 unlocks and 10 enrichments exist exactly for that test.",
      },
    ],
    relatedHeading: "Explore the intelligence layers.",
    related: [
      { href: "/trade-intelligence", label: "Trade intelligence", blurb: "The shipment-data layer: lanes, ports, carriers, cadence." },
      { href: "/contact-intelligence", label: "Contact intelligence", blurb: "Verified decision makers on every shipping account." },
      { href: "/pulse", label: "Pulse AI", blurb: "Map-first prospecting and AI account briefs." },
    ],
    finalCta: {
      heading: "See your territory the way the data sees it.",
      body: "Unlimited searches. 10 account unlocks. 10 verified contacts. No credit card.",
    },
  },
];

export function getBofuPage(slug: string): BofuPage {
  const page = BOFU_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`Unknown BOFU page slug: ${slug}`);
  return page;
}
