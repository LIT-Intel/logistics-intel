import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Database,
  Filter,
  Globe2,
  Layers,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { FaqSection } from "@/components/sections/FaqSection";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Freight Leads Software | Find Shippers, Importers & Logistics Prospects | LIT",
  description:
    "Find freight leads using shipment intelligence, company discovery, CRM workflows, and outbound tools. LIT helps freight brokers, forwarders, and 3PL sales teams prospect smarter.",
  path: "/freight-leads",
  eyebrow: "Freight leads",
});

const PAIN_POINTS = [
  {
    label: "Stale lists",
    body: "Lead databases refresh quarterly. The accounts that matter — the ones whose lane mix is changing right now — never make it to the file you bought last month.",
  },
  {
    label: "Generic B2B contacts",
    body: "ZoomInfo, Apollo, and similar tools sell job titles. They cannot tell you which of those 80,000 contacts works at a company shipping 4,000 TEU through Long Beach this quarter.",
  },
  {
    label: "Expensive licenses",
    body: "Enterprise B2B databases price for marketing teams. Logistics sales teams pay $30K+ a year for fields they never look at.",
  },
  {
    label: "No shipment context",
    body: "Without a trade graph, your reps open every call with 'where are you shipping from?' — and the buyer hears 'I did not do my homework.'",
  },
  {
    label: "No workflow after discovery",
    body: "Even if you find a good list, you still need a CRM, a contact graph, an outbound tool, and a way to wire signals to triggers. That is four products and ten integrations.",
  },
];

const DIFFERENTIATORS = [
  {
    icon: Database,
    title: "Shipment intelligence",
    body: "124M+ Bill of Lading filings across 26,787 active US importers. Every freight lead is sized by real TEU, real shipments, and real declared customs value — not by guessed industry codes.",
  },
  {
    icon: Search,
    title: "Company discovery",
    body: "Search any importer by name for a one-page profile. Or run a natural-language Pulse query and get a ranked list of accounts that match the description — apparel importers from Vietnam over 50 TEU, for example.",
  },
  {
    icon: Sparkles,
    title: "Pulse AI account briefs",
    body: "One click on any importer profile returns an executive account brief: lane mix, top suppliers, carrier opportunity, and drafted outreach hooks tied to actual shipments.",
  },
  {
    icon: Layers,
    title: "Command Center CRM",
    body: "Save freight leads, track outreach, log conversations, and watch shipment signals on every account — without switching tools. Built specifically for the freight sales motion.",
  },
  {
    icon: Send,
    title: "Outbound engine",
    body: "Launch email + LinkedIn sequences from the same surface that surfaced the lead. Pulse Coach flags carrier pivots, volume swings, and new-lane signals to trigger timely outreach.",
  },
  {
    icon: Filter,
    title: "Affordable for the freight buyer",
    body: "Pricing built for sales teams at freight forwarders, brokers, and 3PLs — not for enterprise marketing departments. Free trial. No credit card.",
  },
];

const USE_CASES = [
  {
    icon: Target,
    label: "Freight brokers",
    body: "Find shippers actively moving freight on the lanes you cover. Watch carrier-mix shifts and rebid signals across your saved accounts.",
  },
  {
    icon: Globe2,
    label: "Freight forwarders",
    body: "Discover importers and exporters by origin, destination, HS code, or industry. Track lane volume changes to time your renewal pitch.",
  },
  {
    icon: Users,
    label: "3PL sales teams",
    body: "Identify mid-market importers with the lane mix and warehousing exposure your network is built to serve. Save them, watch them, sequence them.",
  },
  {
    icon: TrendingUp,
    label: "Drayage & local delivery",
    body: "Filter freight leads by port of entry, container volume, and inland destination so reps focus on the importers in your operating radius.",
  },
  {
    icon: CheckCircle2,
    label: "Customs brokers",
    body: "Surface importers by HS-code exposure or by tariff-action vulnerability so your compliance pitch lands on the buyers who need it.",
  },
  {
    icon: Building2,
    label: "Warehousing providers",
    body: "Find importers landing volume near your DC footprint. Sort by industry, by container cadence, by total TEU through nearby ports.",
  },
];

const FEATURE_BLOCKS = [
  {
    title: "Search companies by shipment activity",
    body: "Filter the 3,508 substantive US importer cohort (10+ BOL filings) by industry, origin, port, lane, or volume tier. No more guessing which database row is actually shipping.",
  },
  {
    title: "View shipment activity per account",
    body: "Every account profile carries trailing 12-month TEU, shipment count, declared value, container mix, top suppliers, and lane composition — sourced from US Customs filings.",
  },
  {
    title: "Identify lanes and signals",
    body: "Browse pre-built trade lanes (origin × destination) with shipper rosters, carrier shares, and YoY trends. Watch any lane to get inbox alerts when activity shifts.",
  },
  {
    title: "Save prospects to a workflow",
    body: "Add freight leads to a watchlist, tag them by ICP segment, assign owners, and route them through your sales process inside the Command Center CRM.",
  },
  {
    title: "Enrich verified buyer contacts",
    body: "Every importer in LIT carries 5–30 pre-built, role-tagged, deliverability-verified contacts: procurement, supply chain, logistics, customs, freight ops, finance.",
  },
  {
    title: "Launch outreach in the same place",
    body: "Email + LinkedIn sequences with merge fields drawn from the shipment graph. Pulse AI drafts the opener on the actual data so the first sentence is about the buyer, not you.",
  },
];

const COMPARISON = [
  {
    column: "Static lead lists",
    rows: [
      { label: "Refresh cadence", value: "Quarterly", positive: false },
      { label: "Shipment activity", value: "None", positive: false },
      { label: "Workflow after discovery", value: "Export to spreadsheet", positive: false },
    ],
  },
  {
    column: "Generic B2B databases",
    rows: [
      { label: "Refresh cadence", value: "Monthly", positive: false },
      { label: "Shipment activity", value: "None", positive: false },
      { label: "Workflow after discovery", value: "Push to CRM only", positive: false },
    ],
  },
  {
    column: "Manual research",
    rows: [
      { label: "Refresh cadence", value: "Real-time, but slow", positive: false },
      { label: "Shipment activity", value: "Sometimes (if PIERS access)", positive: false },
      { label: "Workflow after discovery", value: "None — back to spreadsheets", positive: false },
    ],
  },
  {
    column: "LIT",
    highlight: true,
    rows: [
      { label: "Refresh cadence", value: "Weekly BOL ingestion", positive: true },
      { label: "Shipment activity", value: "TEU, lanes, carriers, signals", positive: true },
      { label: "Workflow after discovery", value: "CRM + Pulse + Coach + Outbound", positive: true },
    ],
  },
];

const FAQS = [
  {
    question: "What are freight leads?",
    answer:
      "Freight leads are companies and contacts a logistics sales team can convert into customers — typically importers, exporters, shippers, or brokers with active freight movements that match the seller's lane, mode, or service. Inside LIT, every freight lead is grounded in real US Customs Bill of Lading activity, so you know the company is actually shipping before you reach out.",
  },
  {
    question: "Where do freight brokers find shipper leads?",
    answer:
      "Common sources include public US Customs filings, lane data from port authorities, industry directories, referrals, and SaaS platforms that aggregate shipment intelligence. LIT consolidates 124M+ BOL filings across 26,787 active US importers into a searchable directory, paired with verified buyer-side contacts and an outbound workflow.",
  },
  {
    question: "How does LIT find freight leads?",
    answer:
      "LIT ingests US Customs Bill of Lading filings every week, normalizes them into a directory of active US importers, and joins each row to a buyer-side contact graph. Reps can search by name, run natural-language Pulse queries, filter by industry or lane, or watch a trade lane to get notified the moment shipper activity changes.",
  },
  {
    question: "Are LIT leads based on shipment data?",
    answer:
      "Yes. Every importer in LIT is sized by real shipment metrics — trailing 12-month TEU, shipment count, declared customs value, container mix, top trade lanes, and carrier share. These come directly from US Customs filings, not modeled estimates.",
  },
  {
    question: "Can freight forwarders use LIT to find importers and exporters?",
    answer:
      "Forwarders are a core use case. Use Pulse Search to discover importers by origin, destination, HS code, or industry. Use account profiles to size each prospect's program. Use Pulse Coach to watch saved accounts for the carrier pivots, lane changes, and volume swings that signal contract-renewal windows.",
  },
  {
    question: "Does LIT include CRM tools?",
    answer:
      "LIT ships with Command Center CRM — purpose-built for freight sales. Save leads, tag by ICP, assign owners, log activity, and run pipelines without exporting to a generic CRM. Email + LinkedIn outbound and Pulse Coach signal alerts are built into the same workflow.",
  },
  {
    question: "How is LIT different from ZoomInfo for freight prospecting?",
    answer:
      "ZoomInfo is a horizontal B2B contact database optimized for marketing teams across industries. LIT is purpose-built for logistics sales — every lead is sized by real shipment data, the contact graph is filtered to buyer-side freight personas (procurement, supply chain, logistics, customs), and the workflow assumes a freight motion (lane signals, carrier pivots, trade-lane intelligence). Different product for a different buyer.",
  },
  {
    question: "Can I use LIT for cold outreach?",
    answer:
      "Yes. LIT includes an outbound engine for email and LinkedIn sequences with merge variables drawn directly from the shipment graph. Pulse AI drafts an opener for every account using the actual lane mix and signals so the message reads like a researched pitch rather than a template. Reply rates on signal-anchored campaigns run materially higher than on cold templates.",
  },
];

export default function FreightLeadsPage() {
  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Freight leads" },
        ]}
      />

      {/* HERO */}
      <section className="relative px-5 sm:px-8 pt-14 pb-12 sm:pt-24 sm:pb-16">
        <div className="mx-auto max-w-content">
          <div className="lit-pill">
            <span className="dot" />
            Freight leads · Shipment intelligence · CRM
          </div>
          <h1 className="display-xl space-eyebrow-h1 max-w-[860px]">
            Freight leads built from{" "}
            <span className="grad-text">real shipping intelligence.</span>
          </h1>
          <p className="lead space-h1-intro max-w-[680px]">
            Find importers, exporters, shippers, and logistics prospects using company and shipment
            activity, then save them into your CRM and launch outreach from one platform. Live US
            Customs data across 26,787 active US importers and 124M+ Bill of Lading filings.
          </p>
          <div className="space-intro-cta flex flex-wrap gap-3">
            <Link
              href={APP_SIGNUP_URL}
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              <ArrowRight className="h-4 w-4" />
              Start free trial
            </Link>
            <Link
              href="/demo"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
            >
              <Calendar className="h-4 w-4" />
              Book a demo
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { v: "26,787", l: "Active US importers" },
              { v: "124M+", l: "BOL filings" },
              { v: "3,508", l: "Substantive cohort" },
              { v: "$59.3B", l: "Declared customs value" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-sm"
              >
                <div className="font-mono text-[22px] font-bold tracking-[-0.02em] text-brand-blue-700">
                  {s.v}
                </div>
                <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PAIN SECTION */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">Why freight teams stop using generic lead tools</div>
          <h2 className="display-md space-eyebrow-h1">
            Generic databases were not built for freight sales.
          </h2>
        </div>
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {PAIN_POINTS.map((p) => (
            <li
              key={p.label}
              className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
            >
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <div>
                <div className="font-display text-[14.5px] font-semibold text-ink-900">
                  {p.label}
                </div>
                <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">
                  {p.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* DIFFERENTIATORS */}
      <Section top="md" bottom="md">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">What makes LIT different</div>
          <h2 className="display-md space-eyebrow-h1">
            A freight-leads engine, a CRM, and an outbound tool — one product.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {DIFFERENTIATORS.map((d) => {
            const Icon = d.icon;
            return (
              <div
                key={d.title}
                className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
              >
                <div
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                  }}
                >
                  <Icon className="h-5 w-5 text-brand-blue-700" />
                </div>
                <div className="font-display text-[15.5px] font-semibold text-ink-900">
                  {d.title}
                </div>
                <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">{d.body}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* USE CASES */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">Use cases</div>
          <h2 className="display-md space-eyebrow-h1">
            Built for every team selling into the freight buyer.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((u) => {
            const Icon = u.icon;
            return (
              <div
                key={u.label}
                className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
              >
                <div
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                  }}
                >
                  <Icon className="h-5 w-5 text-brand-blue-700" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[14.5px] font-semibold text-ink-900">
                    {u.label}
                  </div>
                  <p className="font-body mt-1 text-[13px] leading-relaxed text-ink-500">{u.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* FEATURE BLOCKS */}
      <Section top="md" bottom="md">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">Six things you can do</div>
          <h2 className="display-md space-eyebrow-h1">
            Find, qualify, save, and reach the right freight prospect.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_BLOCKS.map((b) => (
            <div
              key={b.title}
              className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
            >
              <div className="font-display text-[15px] font-semibold text-ink-900">
                {b.title}
              </div>
              <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* COMPARISON */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">How freight lead tools compare</div>
          <h2 className="display-md space-eyebrow-h1">
            A clean comparison — no name-calling.
          </h2>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-25 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                <th className="px-5 py-4">Approach</th>
                {COMPARISON[0].rows.map((r) => (
                  <th key={r.label} className="px-5 py-4">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-body divide-y divide-ink-100 text-[13.5px] text-ink-900">
              {COMPARISON.map((col) => (
                <tr key={col.column} className={col.highlight ? "bg-brand-blue/[0.04]" : ""}>
                  <td className="font-display px-5 py-4 font-semibold">
                    {col.column}
                    {col.highlight && (
                      <span className="ml-2 rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-blue-700">
                        Recommended
                      </span>
                    )}
                  </td>
                  {col.rows.map((r) => (
                    <td key={r.label} className="px-5 py-4 align-top">
                      <span
                        className={
                          r.positive
                            ? "font-medium text-emerald-700"
                            : "text-ink-500"
                        }
                      >
                        {r.value}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <FaqSection eyebrow="Freight leads FAQ" faqs={FAQS} />

      <CtaBanner
        eyebrow="Start prospecting on shipment intelligence"
        title="Try LIT free for 14 days."
        subtitle="Search the 26,787-importer cohort, save accounts, open Pulse AI briefs, and launch a sequence — all on a free trial. No credit card."
        primaryCta={{ label: "Start free trial", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      {/* FAQ JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          }),
        }}
      />
    </PageShell>
  );
}
