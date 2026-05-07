/**
 * Solution-page corpus. One entry per `/solutions/[slug]` route. These
 * are ICP-targeted versions of the feature story — same template, but
 * the lede, capabilities, and FAQs reframe LIT around a specific buyer
 * persona (forwarders, brokers, 3PLs, customs, etc.).
 */

import type { FeaturePage } from "@/app/features/_data";

export type SolutionPage = FeaturePage;

export const SOLUTION_PAGES: SolutionPage[] = [
  {
    slug: "freight-forwarders",
    title: "LIT for freight forwarders —",
    titleHighlight: "outbound, intelligence, CRM in one platform.",
    eyebrow: "Forwarders",
    metaDescription:
      "Built for freight forwarders running outbound on signal. ICP-scored importer leads, verified contacts, AI-personalized sequences, freight-native CRM.",
    lede:
      "LIT collapses the freight-forwarder sales stack into one platform. Replace ImportYeti + ZoomInfo + Apollo + HubSpot with one tool that knows what freight is.",
    shortAnswer:
      "LIT for freight forwarders is a single platform for ICP-scored prospecting, verified contact enrichment, AI-personalized outbound, and a freight-native CRM. Forwarders on LIT typically replace 3-4 tools and cut research time per account from 30 minutes to under 5.",
    problem:
      "Freight-forwarder sales teams build outbound on cold lists, then re-key BOL data into a generic CRM that has no idea what freight is. Reps burn 60% of their time on research, not selling.",
    solution:
      "LIT joins live BOL data with verified contacts and a freight-native CRM. Reps move from BOL signal to sequenced outreach in minutes, with shipment context attached to every account.",
    capabilities: [
      { title: "ICP scoring on lane × HS × volume", body: "Score every importer in real time against the lanes you actually sell." },
      { title: "Buyer-side contacts", body: "5-30 verified contacts per importer in procurement, ocean, air, and customs roles." },
      { title: "Pulse-AI sequences", body: "Outbound steps drafted from real shipment data — lane, carrier, volume, recency." },
      { title: "Freight-native CRM", body: "Accounts auto-display TTM TEU, top lanes, carrier mix. No re-keying." },
      { title: "Lane watchlists", body: "Save lanes, get pinged on volume + shipper changes that matter to your book." },
    ],
    workflow: [
      { step: "Define your ICP", body: "Lane × HS × volume profile. LIT scores every US importer against it." },
      { step: "Auto-generate leads", body: "New BOL filings matching your ICP feed your prospecting queue daily." },
      { step: "Sequence + close", body: "Pulse AI drafts shipment-grounded outreach; replies and pipeline live in LIT CRM." },
    ],
    whoItsFor: [
      "NVOCC and asset-light freight forwarders running US-inbound outbound.",
      "Forwarder sales teams replacing ImportYeti + ZoomInfo + Outreach + HubSpot.",
      "International forwarders building a US BCO book.",
    ],
    related: [
      { label: "Shipper lead generation", href: "/features/shipper-lead-generation" },
      { label: "Freight prospecting", href: "/features/freight-prospecting" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
      { label: "LIT vs ImportYeti", href: "/vs/importyeti" },
      { label: "LIT vs ZoomInfo", href: "/vs/zoominfo" },
    ],
    faqs: [
      { q: "Is this only for US-inbound forwarders?", a: "Today, BOL coverage is strongest on US-inbound. Outbound corridors are growing — see /lanes for current coverage. International-only forwarders use LIT primarily for prospecting US importer accounts." },
      { q: "How fast can a 5-rep team ramp?", a: "Most teams send their first sequence within 2 weeks. Onboarding includes ICP setup, contact validation, and a first-campaign review." },
      { q: "Can we keep using HubSpot or Salesforce?", a: "Yes — LIT syncs bi-directionally. Many teams use LIT for prospecting and sequencing, then sync closed-won accounts to their existing CRM." },
    ],
  },
  {
    slug: "freight-brokers",
    title: "LIT for freight brokers —",
    titleHighlight: "BCO-shipper acquisition at scale.",
    eyebrow: "Brokers",
    metaDescription:
      "Built for freight brokers acquiring BCO shippers. Live shipment intelligence, verified contacts, sequence-ready outbound — without the SaaS bloat.",
    lede:
      "Acquire BCO shippers without building a list-buying habit. LIT turns live shipment data into ICP-matched accounts, with verified contacts and AI-drafted sequences ready to go.",
    shortAnswer:
      "LIT for freight brokers replaces list-buying with a living signal. Brokers identify BCO shippers by lane, mode, and equipment fit, get verified buyer contacts, and run AI-personalized outreach — all from one platform.",
    problem:
      "Brokerage outbound runs on stale lists and cold calls. Modern brokers compete on intelligence — knowing who's shipping what, when, and on which carrier — but the data tools weren't built for it.",
    solution:
      "LIT joins BOL filings to a 525K-importer graph and routes to the right contacts in supply chain and procurement. The whole motion lives in one platform, not five.",
    capabilities: [
      { title: "BCO targeting by mode + equipment", body: "Filter importers by FCL/LCL, equipment type, and lane volume." },
      { title: "Decision-maker contacts", body: "Procurement + transportation roles, not generic role lists." },
      { title: "Carrier displacement signal", body: "See when an importer's carrier mix shifts — they're often shopping." },
      { title: "Sequence + dial", body: "Outbound + click-to-call inside the same tool." },
    ],
    whoItsFor: [
      "Domestic brokerages building a BCO book.",
      "International brokers acquiring US-inbound spot business.",
      "Brokerage sales leaders unifying prospecting + CRM.",
    ],
    related: [
      { label: "Shipper lead generation", href: "/features/shipper-lead-generation" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
      { label: "Outbound campaigns", href: "/features/outbound-campaigns" },
      { label: "LIT vs Apollo", href: "/vs/apollo" },
    ],
    faqs: [
      { q: "Can we filter by equipment?", a: "Yes — FCL/LCL, 20/40/40HC, reefer, and air separately filterable. Domestic OTR equipment filters are on the 2026 roadmap." },
      { q: "Do you cover spot vs. contract?", a: "Spot vs. contract isn't always declared in the BOL, but carrier-mix patterns are highly predictive of shopping behavior. Pulse Coach surfaces displacement signals." },
    ],
  },
  {
    slug: "logistics-sales-teams",
    title: "LIT for logistics sales teams —",
    titleHighlight: "one platform, end to end.",
    eyebrow: "Sales teams",
    metaDescription:
      "Run your full logistics sales motion in one freight-native platform. Lead generation, contacts, sequences, CRM — without four-tool tax.",
    lede:
      "Logistics sales teams running 5-50 reps use LIT to consolidate prospecting, enrichment, sequences, and CRM into one tool — and ship more pipeline with less stack tax.",
    shortAnswer:
      "LIT for logistics sales teams is a single platform for prospecting, enrichment, sequences, and CRM. It replaces the typical 3-4 tool stack with one freight-native system, cutting per-rep tooling cost and re-keying time.",
    problem:
      "The standard logistics-sales stack — list source + enrichment + sequencer + CRM — costs $300-500 per rep per month and breaks context at every handoff.",
    solution:
      "LIT collapses the stack. One contract, one data model, one report.",
    capabilities: [
      { title: "Per-rep $$ savings", body: "Replace ZoomInfo + Outreach + HubSpot for less than the cost of any one." },
      { title: "Manager dashboards", body: "Pipeline, activity, and signal coverage at the rep + team level." },
      { title: "Onboarding velocity", body: "New reps productive in days because everything lives in one tool." },
      { title: "Compliance-ready", body: "GDPR-compliant contact data and audit logs out of the box." },
    ],
    whoItsFor: [
      "Sales leaders running 5-50 freight reps.",
      "RevOps teams centralizing on one stack.",
      "Founders + GTM heads at logistics startups.",
    ],
    related: [
      { label: "Logistics command center", href: "/features/logistics-command-center" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
      { label: "Outbound campaigns", href: "/features/outbound-campaigns" },
      { label: "LIT vs HubSpot", href: "/vs/hubspot" },
    ],
    faqs: [
      { q: "Do you have SSO / SCIM?", a: "Yes — SAML SSO and SCIM provisioning on Enterprise plans. Google Workspace + Okta + Microsoft Entra are supported." },
      { q: "Can we replace Salesforce?", a: "For most freight sales motions, yes. Some teams keep Salesforce for finance/CS workflows and sync closed-won. We support either." },
    ],
  },
  {
    slug: "3pl-sales",
    title: "LIT for 3PL sales —",
    titleHighlight: "BCO acquisition built around shipment fit.",
    eyebrow: "3PL",
    metaDescription:
      "3PL sales platform for warehousing, fulfillment, and distribution. Surface BCO shippers by lane, mode, and SKU profile — with verified contacts.",
    lede:
      "3PL sales teams use LIT to identify BCO shippers whose lane, mode, and SKU patterns match their network — then reach out with shipment-grounded relevance.",
    shortAnswer:
      "LIT for 3PL sales lets warehousing, fulfillment, and distribution providers target BCO shippers by lane, mode, and SKU profile. Every match comes with verified buyer contacts and AI-drafted outreach grounded in real shipment data.",
    problem:
      "3PL sales is a long cycle that depends on knowing the prospect's actual flow — volume by SKU, peak season, lane mix. Most lists won't tell you any of that.",
    solution:
      "LIT joins BOL data to an enriched importer graph, so every prospect tells you their lane, HS, volume, and seasonality at a glance.",
    capabilities: [
      { title: "Lane × HS × volume targeting", body: "Filter by what your network actually serves." },
      { title: "Seasonality signal", body: "12-month volume curve per importer — peak period visible." },
      { title: "Carrier displacement", body: "See when a BCO's carrier mix shifts — often a sign they're shopping." },
    ],
    whoItsFor: [
      "Warehousing + fulfillment 3PLs.",
      "Distribution + last-mile providers.",
      "Cold-chain and reefer specialists.",
    ],
    related: [
      { label: "Shipper lead generation", href: "/features/shipper-lead-generation" },
      { label: "Trade lane intelligence", href: "/features/trade-lane-intelligence" },
      { label: "Solutions for freight forwarders", href: "/solutions/freight-forwarders" },
    ],
    faqs: [
      { q: "Do you cover domestic-only 3PLs?", a: "Today, BOL coverage is strongest on import-driven flows. Domestic OTR signal is on the 2026 roadmap. Domestic 3PLs serving import-heavy BCOs already get strong fit." },
    ],
  },
  {
    slug: "customs-brokers",
    title: "LIT for customs brokers —",
    titleHighlight: "HS-driven prospecting at scale.",
    eyebrow: "Customs",
    metaDescription:
      "Customs broker prospecting platform. Target importers by HS chapter, country of origin, and tariff exposure. Verified compliance contacts included.",
    lede:
      "Customs brokers use LIT to identify importers by HS chapter and tariff exposure — then reach the trade-compliance contacts who own the entry process.",
    shortAnswer:
      "LIT for customs brokers lets you prospect importers by HS code, country of origin, and tariff exposure. Every match comes with verified trade-compliance and import-ops contacts, plus the live tariff math via the built-in calculator.",
    problem:
      "Customs broker outreach lives or dies on HS coverage. Generic sales tools can't filter by HS, and BOL tools don't surface compliance contacts.",
    solution:
      "LIT lets you filter importers by HS chapter, see their tariff exposure (Section 301 / 232 / AD/CVD), and route to the trade-compliance team — all from one tool.",
    capabilities: [
      { title: "HS-chapter targeting", body: "Filter active US importers by 2/4/6/10-digit HTS code." },
      { title: "Tariff exposure flagging", body: "Section 301, 232, AD/CVD, GSP all surfaced per importer." },
      { title: "Compliance contacts", body: "Trade-compliance, customs, and import-ops roles flagged separately." },
      { title: "Quote generator", body: "Build landed-cost quotes inside LIT with live tariff math." },
    ],
    whoItsFor: [
      "Licensed customs brokers building HS-specialized books.",
      "Trade-compliance consulting practices.",
      "Drawback specialists targeting eligible importers.",
    ],
    related: [
      { label: "HS code lookup", href: "/hs" },
      { label: "Tariff calculator", href: "/features/tariff-calculator" },
      { label: "Quote generator", href: "/features/quote-generator" },
    ],
    faqs: [
      { q: "Are AD/CVD orders surfaced?", a: "Yes — every importer page flags active AD/CVD exposure on imported HS codes, sourced from current ITC + DOC orders." },
    ],
  },
  {
    slug: "import-export-sales",
    title: "LIT for import/export sales —",
    titleHighlight: "two-sided trade prospecting.",
    eyebrow: "Trade sales",
    metaDescription:
      "Two-sided trade prospecting: target US importers by source country, or global exporters shipping to US buyers. Verified contacts on both sides.",
    lede:
      "Whether you sell to importers, exporters, or both, LIT lets you pivot the BOL graph in either direction and reach the right contacts on the right side of the transaction.",
    shortAnswer:
      "LIT for import/export sales is two-sided — search global exporters by their US-bound flows, or target US importers by their source country. Every match comes with verified contacts on the relevant side.",
    problem:
      "Most trade tools only let you search one side of the transaction. If your motion spans both, you're using two tools and stitching results.",
    solution:
      "LIT treats the BOL as a graph, so importer ↔ exporter pivots are one click. Contacts attach on both sides where data permits.",
    capabilities: [
      { title: "Two-sided search", body: "Pivot exporter ↔ importer in one click." },
      { title: "Country-of-origin filters", body: "Target importers by source country to prospect overseas suppliers." },
      { title: "Cross-border contacts", body: "Buyer- and supplier-side contacts where data exists." },
    ],
    whoItsFor: [
      "Trade-finance and factoring teams.",
      "Cross-border consulting and advisory firms.",
      "Procurement teams researching supplier alternatives.",
    ],
    related: [
      { label: "Importer database", href: "/features/importer-database" },
      { label: "Exporter database", href: "/features/exporter-database" },
      { label: "LIT vs Panjiva", href: "/vs/panjiva" },
    ],
    faqs: [
      { q: "Do you cover non-US trade flows?", a: "Today, focus is on US import/export flows. Adjacent corridors (Canada, Mexico, EU export) are on the 2026 roadmap." },
    ],
  },
  {
    slug: "freight-agencies",
    title: "LIT for freight agencies —",
    titleHighlight: "data + tooling for member agents.",
    eyebrow: "Agencies",
    metaDescription:
      "Equip your freight agency network with shared shipment intelligence, verified contacts, and a unified outbound platform. Per-agent or shared seats.",
    lede:
      "Freight agencies use LIT to equip their member agents with shared BOL data, verified contacts, and a unified outbound platform — without forcing every agent to buy their own stack.",
    shortAnswer:
      "LIT for freight agencies provides shared trade data, verified contacts, and outbound tooling across member agents. Networks can deploy LIT centrally with per-agent seats and unified billing.",
    problem:
      "Agency networks struggle to standardize tools across independent agents. Every agent buys their own list source and CRM, and best practices don't compound.",
    solution:
      "LIT supports network-level deployments with per-agent seats, shared lists, and central admin. Agents stay independent; the network gets one consistent toolkit.",
    capabilities: [
      { title: "Multi-agent admin", body: "Network-level seat management with per-agent activity." },
      { title: "Shared accounts + lists", body: "Network-level lead pools with per-agent claim rules." },
      { title: "Unified billing", body: "One bill, per-agent reporting." },
    ],
    whoItsFor: [
      "Independent freight agency networks.",
      "Master franchisors equipping member offices.",
    ],
    related: [
      { label: "Solutions for freight forwarders", href: "/solutions/freight-forwarders" },
      { label: "Logistics command center", href: "/features/logistics-command-center" },
      { label: "Freight sales CRM", href: "/features/freight-sales-crm" },
    ],
    faqs: [
      { q: "Do you offer agency-wide pricing?", a: "Yes. Network deployments are quoted per-seat with volume discounts. Talk to us via the demo form." },
    ],
  },
  {
    slug: "supply-chain-business-development",
    title: "LIT for supply chain business development —",
    titleHighlight: "signal-driven account selection.",
    eyebrow: "BD",
    metaDescription:
      "Supply chain BD platform: identify importers by lane, mode, and HS fit. Live signal, verified contacts, and AI-drafted outreach in one tool.",
    lede:
      "Supply chain BD teams use LIT to select accounts on signal — not generic firmographics — and reach the people who actually own the freight decision.",
    shortAnswer:
      "LIT for supply chain business development surfaces accounts by lane, mode, HS fit, and shipment cadence. BD reps reach decision-makers in supply chain, ops, and procurement with shipment-grounded outreach.",
    problem:
      "Most BD tools optimize for revenue and headcount. Supply chain decisions are made in ops and procurement — and depend on shipment patterns those tools never surface.",
    solution:
      "LIT surfaces shipment patterns first, then routes to the supply-chain decision-makers. Every BD outreach can cite real lanes and carriers.",
    capabilities: [
      { title: "Shipment-pattern targeting", body: "Filter by lane mix, mode, HS, and cadence — not just firmographics." },
      { title: "Decision-maker routing", body: "Supply chain + ops + procurement contacts, not generic CXO lists." },
      { title: "Signal-based timing", body: "Pulse Coach flags shipment changes that often predict buying moments." },
    ],
    whoItsFor: [
      "Strategic BD teams at carriers, forwarders, and 3PLs.",
      "Enterprise reps targeting the Fortune 1000 importer set.",
    ],
    related: [
      { label: "Company intelligence", href: "/features/company-intelligence" },
      { label: "Pulse AI", href: "/pulse" },
      { label: "Logistics command center", href: "/features/logistics-command-center" },
    ],
    faqs: [
      { q: "Can we use this for ABM?", a: "Yes. Save your target account list, get continuous signal on each, and time outreach to shipment changes that signal a buying moment." },
    ],
  },
];

export function getSolutionBySlug(slug: string) {
  return SOLUTION_PAGES.find((s) => s.slug === slug);
}
