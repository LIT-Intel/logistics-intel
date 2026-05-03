import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { HOMEPAGE_QUERY } from "@/sanity/lib/queries";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/nav/Footer";
import { ArrowRight, Calendar } from "lucide-react";
import { HeroSearchDemo } from "@/components/sections/HeroSearchDemo";
import { CompanyIntelMock } from "@/components/sections/CompanyIntelMock";
import { MarketingGlobe } from "@/components/sections/MarketingGlobe";
import { PulseBriefMock } from "@/components/sections/PulseBriefMock";
import { ContactDiscoveryMock } from "@/components/sections/ContactDiscoveryMock";
import { SequenceBuilderMock } from "@/components/sections/SequenceBuilderMock";
import { CustomerLogosRail } from "@/components/sections/CustomerLogosRail";
import { LoomTourPlaceholder } from "@/components/sections/LoomTourPlaceholder";
import { WorkflowMotion } from "@/components/sections/WorkflowMotion";

export const revalidate = 600; // ISR — refresh every 10 min

const FALLBACK_HERO = {
  pillText: "New · Pulse is live — natural-language intelligence",
  headline: "Find the companies, contacts, shipments, and",
  headlineHighlight: "market signals",
  headlineSuffix: "your competitors miss.",
  subhead:
    "LIT combines company intelligence, trade data, CRM, Pulse search, and outbound execution into one platform built for modern growth teams.",
  kpis: [
    { value: "124K+", label: "Companies indexed" },
    { value: "8.2M", label: "Shipment records" },
    { value: "94 lanes", label: "Tracked live" },
  ],
};

export const metadata: Metadata = {
  title: "Market intelligence & revenue execution, in one platform",
  description:
    "Find the companies, contacts, shipments, and market signals your competitors miss. LIT combines company intelligence, trade data, CRM, Pulse search, and outbound execution into one platform.",
};

export default async function HomePage() {
  const data: any = await sanityClient.fetch(HOMEPAGE_QUERY).catch(() => null);
  const hero = data?.settings?.homepageHero ?? FALLBACK_HERO;

  return (
    <>
      <Nav />
      <main>
        <Hero hero={hero} />
        <CustomerLogosRail />
        <LoomTourPlaceholder />
        <PillarsTrustBar />
        <CompanyIntelShowcase />
        <TradeLaneShowcase />
        <PulseBriefShowcase />
        <ContactDiscoveryShowcase />
        <SequenceBuilderShowcase />
        <ProblemSection />
        <PlatformSection />
        <SignalToPipelineSection />
      </main>
      <Footer />

      {/* Schema markup — Organization sits in root layout. Add Product
          schema here so Google understands LIT as a SaaS product. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "LIT — Logistic Intel",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description:
              "Market intelligence and revenue execution platform combining company data, trade signals, CRM, and outbound campaigns.",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
              description: "Free trial available. Paid plans from $125/mo.",
            },
          }),
        }}
      />
    </>
  );
}

function Hero({ hero }: { hero: any }) {
  return (
    <section className="relative pt-[72px] pb-[80px]">
      <div className="mx-auto grid max-w-container gap-14 px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        <div className="min-w-0">
          <div className="lit-pill">
            <span className="dot" />
            {hero.pillText}
          </div>
          <h1 className="display-xl mt-6">
            {hero.headline}{" "}
            <span className="grad-text">{hero.headlineHighlight}</span>{" "}
            {hero.headlineSuffix || "your competitors miss."}
          </h1>
          <p className="lead mt-6 max-w-[560px]">{hero.subhead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              <Calendar className="h-4 w-4" /> Book a Demo
            </Link>
            <Link
              href="/pulse"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
            >
              Explore Platform <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-7">
            {hero.kpis?.map((k: any) => (
              <div key={k.label}>
                <div
                  className="font-mono text-[22px] font-semibold tracking-[-0.01em] text-brand-blue-700"
                >
                  {k.value}
                </div>
                <div className="font-display mt-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-200">
                  {k.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <HeroSearchDemo />
        </div>
      </div>
    </section>
  );
}

function CompanyIntelShowcase() {
  return (
    <section className="px-8 py-20">
      <div className="mx-auto max-w-container">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="lg:order-1">
            <div className="eyebrow">Company Intelligence</div>
            <h2 className="display-lg mt-3">
              Every account, with the <span className="grad-text">trade picture</span> built in.
            </h2>
            <p className="lead mt-5 max-w-[480px]">
              Not just firmographics. KPIs, trade lanes, carrier mix, modal split, recent shipments,
              top suppliers — refreshed daily and joined to the people you'd actually pitch.
            </p>
            <ul className="font-body mt-6 space-y-2.5 text-[14px] leading-snug text-ink-700">
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span><b className="text-ink-900">Pulse Coach</b> tells you what changed this week, in one sentence.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Live trailing-12m volume, top lane, carrier mix, container types.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>One click to start outbound, save to a campaign, or push to your CRM.</span>
              </li>
            </ul>
          </div>
          <div className="lg:order-2">
            <CompanyIntelMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function TradeLaneShowcase() {
  return (
    <section className="px-8 py-20">
      <div className="mx-auto max-w-container">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div>
            <div
              className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8"
              style={{
                background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18), 0 30px 80px -20px rgba(15,23,42,0.5)",
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full opacity-50"
                style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
              />
              <div
                className="font-display relative mb-3 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#00F0FF" }}
              >
                Trade Lane Visualization · Live
              </div>
              <div className="relative mx-auto" style={{ maxWidth: 480 }}>
                <MarketingGlobe size={480} />
              </div>
              <div className="font-mono relative mt-4 grid grid-cols-3 gap-3 text-[11px] text-ink-150 sm:grid-cols-3">
                <div>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: "#00F0FF" }}>
                    Tracked lanes
                  </div>
                  <div className="font-display text-[18px] font-semibold text-white">142</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: "#00F0FF" }}>
                    Active arcs
                  </div>
                  <div className="font-display text-[18px] font-semibold text-white">8</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: "#00F0FF" }}>
                    TEU 12m
                  </div>
                  <div className="font-display text-[18px] font-semibold text-white">61.4K</div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="eyebrow">Trade Lane Intelligence</div>
            <h2 className="display-lg mt-3">
              The trade flows you sell into, <span className="grad-text">live and ranked.</span>
            </h2>
            <p className="lead mt-5 max-w-[480px]">
              Watch any origin → destination lane. See top shippers, carrier mix, monthly cadence,
              and YoY change. Get pinged when volume shifts.
            </p>
            <ul className="font-body mt-6 space-y-2.5 text-[14px] leading-snug text-ink-700">
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>500+ origin × destination pairs tracked, refreshed daily.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Top 25 shippers per lane with verified company + contact data.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Save lanes to your watchlist — Pulse Coach surfaces shifts.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function PulseBriefShowcase() {
  return (
    <section className="px-8 py-20">
      <div className="mx-auto max-w-container">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <div className="eyebrow">Pulse AI Brief</div>
            <h2 className="display-lg mt-3">
              The first 30 seconds of <span className="grad-text">account research</span>, done.
            </h2>
            <p className="lead mt-5 max-w-[480px]">
              One click on any account and Pulse generates a full intel brief — exec summary,
              opportunity signals, risk flags, ready-to-send outreach hooks. Cited sources, 95%
              confidence, refreshed weekly.
            </p>
            <ul className="font-body mt-6 space-y-2.5 text-[14px] leading-snug text-ink-700">
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Buying / forwarder / carrier / supplier signal classification.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Email + LinkedIn opener variants you can copy and send today.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Every claim cited to a public source — no hallucinated facts.</span>
              </li>
            </ul>
          </div>
          <div>
            <PulseBriefMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactDiscoveryShowcase() {
  return (
    <section className="px-8 py-20">
      <div className="mx-auto max-w-container">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="lg:order-1">
            <ContactDiscoveryMock />
          </div>
          <div className="lg:order-2">
            <div className="eyebrow">Contact Discovery</div>
            <h2 className="display-lg mt-3">
              The right buyers, <span className="grad-text">not just any buyers.</span>
            </h2>
            <p className="lead mt-5 max-w-[480px]">
              LIT's contact graph is filtered by title, seniority, department, and location — then
              joined to who actually owns shipments at that company. Verified emails, LinkedIn URLs,
              and direct dials revealed on enrich.
            </p>
            <ul className="font-body mt-6 space-y-2.5 text-[14px] leading-snug text-ink-700">
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Email-verified contacts — no spam-trap-rate roulette.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>One-click bulk enrichment, plan-aware credit usage.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Native push to HubSpot, Salesforce, Outreach, Apollo.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function SequenceBuilderShowcase() {
  return (
    <section className="px-8 py-20">
      <div className="mx-auto max-w-container">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <div className="eyebrow">Campaign Builder</div>
            <h2 className="display-lg mt-3">
              Sequences seeded by <span className="grad-text">the signal that started them.</span>
            </h2>
            <p className="lead mt-5 max-w-[480px]">
              Lane-launch, carrier-pivot, RFP follow-up, win-back — six starter plays that bake the
              signal into the message. Multichannel by default. Send forecast before you launch.
            </p>
            <ul className="font-body mt-6 space-y-2.5 text-[14px] leading-snug text-ink-700">
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Email + LinkedIn + call-task in one timeline.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Predicted opens / replies / meetings before launch.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>Auto-personalization with the recipient's lane, top HS, top carrier.</span>
              </li>
            </ul>
          </div>
          <div>
            <SequenceBuilderMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function PillarsTrustBar() {
  const pillars = [
    "Company Intelligence",
    "Contact Intelligence",
    "Shipment Intelligence",
    "Trade Lane Signals",
    "Campaign Execution",
    "CRM Workflows",
  ];
  return (
    <section className="px-8 py-12">
      <div className="mx-auto max-w-container">
        <div
          className="rounded-2xl border border-ink-100 bg-white/70 px-7 py-6 backdrop-blur shadow-sm"
        >
          <div className="font-display mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-200">
            One platform · Six pillars
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {pillars.map((p) => (
              <div
                key={p}
                className="font-display flex items-center justify-center rounded-lg px-3 py-2.5 text-center text-[13px] font-semibold text-ink-900"
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const pains = [
    { title: "Teams jump between 5+ tools", body: "Data tools, enrichment, CRM, dialers, campaigns — context is lost at every handoff." },
    { title: "Company data is incomplete", body: "Firmographic tools miss what matters: lanes, volume, carriers, activity." },
    { title: "Trade signals are unusable", body: "BOL data exists, but no one has built the layer that turns it into revenue." },
    { title: "CRM ≠ intelligence", body: "Yours should tell you when to act, not just where to log it." },
    { title: "Outreach has no timing", body: "Generic sequences waste trust. Without real signals, every email feels like spray-and-pray." },
    { title: "No single source of truth", body: "Market intel, account data, and pipeline live in different tabs — and none of them talk." },
  ];
  return (
    <section className="px-8 py-24">
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[780px] text-center">
          <div className="eyebrow">The problem</div>
          <h2 className="display-lg mt-3">Revenue teams are flying blind in a data-rich world.</h2>
          <p className="lead mx-auto mt-3 max-w-[640px]">
            Every go-to-market stack has holes. LIT closes them — from first signal to closed deal.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pains.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
            >
              <h3 className="display-sm">{p.title}</h3>
              <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SignalToPipelineSection() {
  return (
    <section className="px-8 py-24">
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[780px] text-center">
          <div className="eyebrow">Signal → Pipeline</div>
          <h2 className="display-lg mt-3">Five steps from question to closed deal.</h2>
          <p className="lead mx-auto mt-3 max-w-[640px]">
            LIT collapses what was a five-tool, five-day workflow into a single board you finish in 20
            minutes.
          </p>
        </div>
        <div className="mt-14">
          <WorkflowMotion />
        </div>
      </div>
    </section>
  );
}

function PlatformSection() {
  const cards = [
    { tag: "Discover", title: "Search companies", body: "Filter 124K+ shippers by lane, carrier, TEU, HS code, and activity trend." },
    { tag: "Enrich", title: "Find contacts", body: "Verified emails for decision-makers — supply chain, procurement, ops, logistics." },
    { tag: "Analyze", title: "Analyze shipments", body: "BOL-level history, container volume, carrier mix, and lane performance over time." },
    { tag: "Track", title: "Track trade lanes", body: "Watchlist specific lanes, ports, and trade blocks. Get alerts when flow changes." },
    { tag: "Organize", title: "Save to Command Center", body: "A CRM that lives next to intelligence. Pipelines, tasks, activity, all in context." },
    { tag: "Engage", title: "Launch campaigns", body: "Multichannel sequences triggered by shipment signals, not calendar dates." },
  ];
  return (
    <section className="px-8 py-24">
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[780px] text-center">
          <div className="eyebrow">The platform</div>
          <h2 className="display-lg mt-3">One platform for market intelligence and execution.</h2>
          <p className="lead mx-auto mt-3 max-w-[640px]">
            Six capabilities, one workspace. Move from signal to action without switching tools.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">{c.tag}</div>
              <h3 className="display-sm mt-3">{c.title}</h3>
              <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
