import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { Section } from "@/components/sections/Section";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { RevenueOpportunityMock } from "@/components/sections/RevenueOpportunityMock";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Revenue Opportunity — quantify every account's freight wallet",
  description:
    "Size the freight wallet on any importer across six service lines (Ocean, Customs, Drayage, Air, Warehousing, Trucking) with confidence indicators and win-rate scenarios.",
  path: "/revenue-opportunity",
  eyebrow: "Revenue Opportunity",
});

const SECTIONS = [
  {
    icon: "BarChart3",
    tag: "Six service lines",
    title: "Ocean, Customs, Drayage, Air, Warehousing, Trucking",
    body: "Every account is sized across the full freight stack — not just ocean. Each service line has its own model, inputs, and outputs so you see exactly what the number is grounded in.",
  },
  {
    icon: "Sparkles",
    tag: "Confidence-rated",
    title: "High / Medium / Low / Insufficient",
    body: "We don't pretend to know what we don't. Confidence is rated per service line based on data density — TEU history, HS coverage, route specificity. Insufficient signal stays insufficient, not extrapolated.",
  },
  {
    icon: "TrendingUp",
    tag: "Win-rate scenarios",
    title: "Plan against 10% / 30% / 50% capture",
    body: "Total addressable spend isn't pipeline. Each opportunity rolls up across three win-rate scenarios so AEs and BD leaders can plan against realistic capture, not best-case dreams.",
  },
  {
    icon: "Network",
    tag: "Pulse AI integration",
    title: "Pitch the right service line first",
    body: "Pulse AI uses the highest-confidence service lines as the wedge — and stages cross-sells from there. Sales teams open the call knowing exactly what to lead with.",
  },
];

export default function RevenueOpportunityPage() {
  return (
    <PageShell>
      <section className="relative px-5 pt-14 pb-12 sm:px-8 sm:pt-24">
        <div className="mx-auto grid max-w-content gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <div className="lit-pill">
              <span className="dot" />
              Revenue Opportunity
            </div>
            <h1 className="display-xl space-eyebrow-h1 max-w-[640px]">
              Quantify the wallet{" "}
              <span className="grad-text">behind every account.</span>
            </h1>
            <p className="lead space-h1-intro max-w-[560px]">
              Size the freight spend opportunity on any importer across six service lines, with
              confidence ratings and win-rate scenarios. Move from qualitative "why now" to a
              defensible dollar number — on every profile, automatically.
            </p>
            <div className="space-intro-cta flex flex-wrap gap-3">
              <Link
                href={APP_SIGNUP_URL}
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                Start Prospecting
              </Link>
              <Link
                href="/demo"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
              >
                Book a demo <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="relative">
            <RevenueOpportunityMock />
          </div>
        </div>
      </section>

      <FeatureGrid
        eyebrow="Inside Revenue Opportunity"
        title="A defensible dollar number, on every profile."
        features={SECTIONS}
        cols={2}
      />

      <Section top="md" bottom="lg" tone="soft-blue">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12 lg:items-center">
          <div>
            <div className="eyebrow">How GTM teams use it</div>
            <h2 className="display-md space-eyebrow-h1">
              Stop forecasting on{" "}
              <span className="grad-text">vibes.</span>
            </h2>
            <p className="lead space-h1-intro">
              Sales teams shipping freight have always carried a "feel" for account size. Revenue
              Opportunity replaces that feel with a number — calibrated against TEU history,
              FBX rates, HS profile, and your account's lane mix.
            </p>
            <ul className="mt-6 space-y-3 text-[15px] text-ink-700">
              {[
                "Pipeline reviews use the 30%-win column as the realistic forecast anchor.",
                "AEs prioritize the high-confidence accounts ahead of low-data ones — same effort, more revenue.",
                "BD leaders size territories by total addressable spend, not headcount or revenue proxies.",
              ].map((s) => (
                <li key={s} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-2 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue"
                  />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="rounded-2xl border border-ink-100 bg-white p-8 shadow-sm">
              <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-blue">
                Companion to Pulse AI
              </div>
              <h3 className="display-sm mt-2">Qualitative + quantitative, same screen.</h3>
              <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">
                Pulse AI tells you <em>why</em> a buying conversation makes sense now. Revenue
                Opportunity tells you <em>how big</em> the conversation could get. Both are
                grounded in the same shipment graph — no separate models, no contradicting
                numbers.
              </p>
              <Link
                href="/pulse"
                className="font-display mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700"
              >
                See Pulse AI <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <CtaBanner
        eyebrow="Open any account"
        title="See the freight wallet, before you call."
        subtitle="Free trial includes Revenue Opportunity, Rate Benchmark, and Pulse AI on every saved company. No credit card."
        primaryCta={{ label: "Start free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Revenue Opportunity",
            description:
              "Quantify freight revenue opportunity on every account across six service lines, with confidence ratings and win-rate scenarios.",
            url: siteUrl("/revenue-opportunity"),
            isPartOf: { "@type": "WebSite", url: siteUrl("/") },
            about: {
              "@type": "SoftwareApplication",
              name: "LIT — Logistic Intel",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
            },
          }),
        }}
      />
    </PageShell>
  );
}
