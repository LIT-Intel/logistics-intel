import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { HOMEPAGE_QUERY } from "@/sanity/lib/queries";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/nav/Footer";
import { ArrowRight, Calendar } from "lucide-react";
import { PulseSearchBar } from "@/components/sections/PulseSearchBar";
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
        <PillarsTrustBar />
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
          <HeroProductPlaceholder />
        </div>
      </div>
    </section>
  );
}

function HeroProductPlaceholder() {
  return (
    <div
      className="relative overflow-hidden rounded-[18px]"
      style={{
        background: "#020617",
        boxShadow:
          "0 60px 120px -30px rgba(15,23,42,0.45), 0 40px 80px -20px rgba(59,130,246,0.12)",
        border: "1px solid rgba(15,23,42,0.95)",
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span className="font-mono ml-3 flex-1 rounded-md border border-dark-3 bg-dark-2 px-2.5 py-1 text-[11px] text-ink-200">
          app.logisticintel.com
        </span>
      </div>
      <div className="aspect-[16/10] bg-dark-0 p-5">
        <div className="flex h-full flex-col gap-3 rounded-xl border border-dark-3 bg-gradient-to-b from-dark-1 to-dark-2 p-4">
          {/* Pulse search bar — auto-typing */}
          <PulseSearchBar />

          {/* Result rows placeholder */}
          <div className="grid flex-1 grid-cols-2 gap-3">
            <div className="rounded-lg border border-dark-3 bg-dark-1 p-3">
              <div className="font-display text-[10.5px] font-bold uppercase tracking-wider text-ink-200">
                Companies · 127
              </div>
              <div className="mt-2 space-y-1.5">
                {["Atlas Global Logistics", "Harbor Logistics Group", "Blue Ocean Express", "Pacific Freight Co."].map(
                  (n, i) => (
                    <div
                      key={n}
                      className="flex items-center gap-2 rounded-md border border-dark-3 bg-dark-0/50 px-2 py-1.5"
                    >
                      <div
                        className="font-display flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
                        style={{ background: ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981"][i] }}
                      >
                        {n[0]}
                      </div>
                      <div className="font-display flex-1 truncate text-[11px] font-semibold text-white">
                        {n}
                      </div>
                      <div className="font-mono text-[11px] font-bold" style={{ color: "#00F0FF" }}>
                        {[14, 9, 7, 3][i]}K
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div
                className="flex flex-1 items-center justify-center rounded-lg border border-dark-3 bg-dark-1"
                style={{
                  background:
                    "radial-gradient(circle at 50% 50%, rgba(0,240,255,0.15), #0F172A 60%)",
                }}
              >
                <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#00F0FF" }}>
                  Lane visualization
                </div>
              </div>
              <div className="rounded-lg border border-dark-3 bg-dark-1 p-3">
                <div className="font-display text-[10.5px] font-bold uppercase tracking-wider text-ink-200">
                  Outbound queue · +12
                </div>
                <div className="font-body mt-2 text-[11.5px] text-ink-150">
                  12 contacts at 4 importers w/ Vietnam lane activity in last 30d.
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    className="font-display flex-1 rounded-md px-2 py-1.5 text-[10.5px] font-semibold text-white"
                    style={{ background: "linear-gradient(180deg,#3b82f6,#2563eb)" }}
                  >
                    Launch campaign
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
