import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { HOMEPAGE_QUERY } from "@/sanity/lib/queries";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/nav/Footer";
import { ArrowRight, Calendar, CheckCircle2, MapPin, RefreshCcw, ShieldCheck, type LucideIcon } from "lucide-react";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { HeroSearchDemo } from "@/components/sections/HeroSearchDemo";
import { CompanyIntelMock } from "@/components/sections/CompanyIntelMock";
import { PulseBriefMock } from "@/components/sections/PulseBriefMock";
import { ContactDiscoveryMock } from "@/components/sections/ContactDiscoveryMock";
import { SequenceBuilderMock } from "@/components/sections/SequenceBuilderMock";
import { CustomerLogosRail } from "@/components/sections/CustomerLogosRail";
import { LoomTourPlaceholder } from "@/components/sections/LoomTourPlaceholder";
import { WorkflowMotion } from "@/components/sections/WorkflowMotion";

export const revalidate = 600; // ISR — refresh every 10 min

const FALLBACK_HERO = {
  pillText: "Pulse AI · Freight revenue intelligence",
  headline: "Turn shipment data into",
  headlineHighlight: "booked freight.",
  headlineSuffix: "",
  subhead:
    "LIT helps freight forwarders, brokers, and logistics sales teams find active shippers, understand their trade activity, enrich the right contacts, and launch outreach from one connected workspace.",
  noteBelow:
    "Built for logistics teams that need better prospects, better timing, and better context before the first email goes out.",
  badges: [
    { label: "60+ countries tracked", tone: "cyan", icon: "MapPin" },
    { label: "Refreshed daily", tone: "blue", icon: "RefreshCcw" },
    { label: "SOC 2 · GDPR · CCPA", tone: "emerald", icon: "ShieldCheck" },
  ],
  kpis: [
    { value: "Find", label: "Active shippers" },
    { value: "Understand", label: "The freight" },
    { value: "Reach", label: "The right people" },
  ],
  trialNote: "14-day free trial · Full feature access · Cancel anytime",
};

/** Badge tone → Tailwind utility group. Keep in sync with the homepageHero
 *  Sanity schema's tone option list. */
const HERO_BADGE_TONES: Record<string, string> = {
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  blue: "border-blue-200 bg-blue-50 text-brand-blue-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
};

/** Lucide icon name → component. Whitelist what hero badges can render. */
const HERO_BADGE_ICONS: Record<string, LucideIcon> = {
  MapPin,
  RefreshCcw,
  ShieldCheck,
  CheckCircle2,
};

export const metadata: Metadata = {
  title: "LIT | Freight Revenue Intelligence for Logistics Sales Teams",
  description:
    "Find active shippers, analyze trade activity, enrich decision makers, and launch outreach from one freight revenue intelligence platform built for logistics sales teams.",
};

export default async function HomePage() {
  const data: any = await sanityClient.fetch(HOMEPAGE_QUERY).catch(() => null);
  const hero = data?.settings?.homepageHero ?? FALLBACK_HERO;

  return (
    <>
      <Nav />
      <main>
        <Hero hero={hero} />
        <CustomerLogosRail
          eyebrow="Built for the revenue teams running freight at companies like"
          logos={[
            { domain: "chrobinson.com", name: "C.H. Robinson" },
            { domain: "rxo.com", name: "RXO" },
            { domain: "tql.com", name: "TQL" },
            { domain: "echo.com", name: "Echo Global Logistics" },
            { domain: "landstar.com", name: "Landstar" },
            { domain: "kuehne-nagel.com", name: "Kuehne + Nagel" },
            { domain: "dhl.com", name: "DHL" },
            { domain: "dsv.com", name: "DSV" },
            { domain: "expeditors.com", name: "Expeditors" },
            { domain: "dbschenker.com", name: "DB Schenker" },
          ]}
        />
        <LoomTourPlaceholder />
        <PillarsTrustBar />
        <CompanyIntelShowcase />
        <PulseBriefShowcase />
        <ContactDiscoveryShowcase />
        <SequenceBuilderShowcase />
        <ProblemSection />
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
    <section className="relative px-5 pt-[64px] pb-12 sm:px-8 sm:pt-[72px] sm:pb-[80px]">
      <div className="mx-auto grid max-w-container gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        <div className="min-w-0">
          <div className="lit-pill">
            <span className="dot" />
            {hero.pillText}
          </div>
          <h1 className="display-xl mt-6">
            {hero.headline}{" "}
            <span className="grad-text">{hero.headlineHighlight}</span>
            {hero.headlineSuffix ? <> {hero.headlineSuffix}</> : null}
          </h1>
          <p className="lead mt-6 max-w-[560px]">{hero.subhead}</p>
          {hero.noteBelow ? (
            <div className="font-body mt-3 max-w-[520px] text-[13.5px] leading-snug text-ink-500">
              {hero.noteBelow}
            </div>
          ) : null}
          {/* Trust badges — Sanity-driven, falls back to FALLBACK_HERO.badges */}
          {hero.badges?.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {hero.badges.map((b: any, i: number) => {
                const Icon = b.icon ? HERO_BADGE_ICONS[b.icon] : null;
                const tone = HERO_BADGE_TONES[b.tone] ?? HERO_BADGE_TONES.cyan;
                return (
                  <span
                    key={`${b.label}-${i}`}
                    className={`font-display inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}
                  >
                    {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
                    {b.label}
                  </span>
                );
              })}
            </div>
          ) : null}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={APP_SIGNUP_URL}
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              Start Prospecting <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
            >
              <Calendar className="h-4 w-4" /> Book a Demo
            </Link>
          </div>
          {/* Trial reassurance microcopy — Sanity-driven */}
          {hero.trialNote ? (
            <div className="font-display mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              {hero.trialNote}
            </div>
          ) : null}
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
    <section className="px-5 py-16 sm:px-8 sm:py-20">
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

function PulseBriefShowcase() {
  return (
    <section className="px-5 py-16 sm:px-8 sm:py-20">
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
    <section className="px-5 py-16 sm:px-8 sm:py-20">
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
    <section className="px-5 py-16 sm:px-8 sm:py-20">
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
  const pillars: { label: string; dot: string }[] = [
    { label: "Company Intelligence", dot: "bg-brand-blue" },
    { label: "Contact Intelligence", dot: "bg-brand-cyan-dim" },
    { label: "Shipment Intelligence", dot: "bg-brand-violet" },
    { label: "Trade Lane Signals", dot: "bg-emerald-500" },
    { label: "Campaign Execution", dot: "bg-amber-500" },
    { label: "CRM Workflows", dot: "bg-brand-blue" },
  ];
  return (
    <section className="px-5 py-12 sm:px-8">
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
                key={p.label}
                className="font-display flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-center text-[13px] font-semibold text-ink-900"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.dot}`}
                  aria-hidden
                />
                {p.label}
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
    <section className="px-5 py-16 sm:px-8 sm:py-24">
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
    <section className="px-5 py-16 sm:px-8 sm:py-24">
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

