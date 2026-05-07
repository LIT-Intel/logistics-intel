import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { Section } from "@/components/sections/Section";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { RateBenchmarkMock } from "@/components/sections/RateBenchmarkMock";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Rate Benchmark — live freight rates inside every account profile",
  description:
    "Benchmark contracted vs. spot ocean rates against the live FBX12 reference set, on the lanes your accounts actually ship. Per-lane, per-mode, per-equipment.",
  path: "/rate-benchmark",
  eyebrow: "Rate Benchmark",
});

const SECTIONS = [
  {
    icon: "BarChart3",
    tag: "FBX-grade reference",
    title: "FBX12 lane index, refreshed weekly",
    body: "All 12 canonical FBX lanes — China → USWC, China → USEC, North Europe → USEC, and the rest. Weekly refresh from the freight-rate-fetcher edge function. No vendor names in the UI; just the lane code and the live rate.",
  },
  {
    icon: "Route",
    tag: "Account-aware matching",
    title: "Auto-matched to the lanes your accounts ship",
    body: "Every company profile pulls the matching FBX lane(s) from its top routes — China inland, generic 'United States' destinations, and intermodal pairs all resolved by the comprehensive region-keyword matcher.",
  },
  {
    icon: "Sparkles",
    tag: "Market spend",
    title: "Compute market-rate 12-month spend",
    body: "FBX rate × your account's TEU 12m gives a defensible market-rate spend number — not a self-reported BOL value, not a vendor estimate. Built into Pulse AI's `freight_market_intelligence` block.",
  },
  {
    icon: "Network",
    tag: "Multi-lane comparison",
    title: "Compare up to three lanes side-by-side",
    body: "Overlay FBX01 vs FBX02 vs FBX11 on a single trend chart. Identify shifting carrier displacement and seasonality across your top corridors at a glance.",
  },
];

export default function RateBenchmarkPage() {
  return (
    <PageShell>
      <section className="relative px-5 pt-14 pb-12 sm:px-8 sm:pt-24">
        <div className="mx-auto grid max-w-content gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <div className="lit-pill">
              <span className="dot" />
              Rate Benchmark
            </div>
            <h1 className="display-xl space-eyebrow-h1 max-w-[640px]">
              Live freight rates,{" "}
              <span className="grad-text">in every account profile.</span>
            </h1>
            <p className="lead space-h1-intro max-w-[560px]">
              Benchmark contracted vs. spot rates against the live FBX12 reference set on the
              exact lanes your accounts ship. Compute defensible market-rate spend, surface
              displacement signals, and ground every Pulse AI recommendation in current rates.
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
            <RateBenchmarkMock />
          </div>
        </div>
      </section>

      <FeatureGrid
        eyebrow="Inside Rate Benchmark"
        title="Four moving parts. One calibrated number."
        features={SECTIONS}
        cols={2}
      />

      <Section top="md" bottom="lg" tone="soft-blue">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12 lg:items-center">
          <div>
            <div className="eyebrow">How sales teams use it</div>
            <h2 className="display-md space-eyebrow-h1">
              Walk into the call with the <span className="grad-text">market-rate number.</span>
            </h2>
            <p className="lead space-h1-intro">
              Most freight reps quote off a list. LIT reps quote off the live market — for the
              prospect's actual lane and equipment, with the trend behind it. That's the
              difference between a vendor and an advisor.
            </p>
            <ul className="mt-6 space-y-3 text-[15px] text-ink-700">
              {[
                "Pulse AI grounds every \"why now\" message in the lane's current rate vs trailing 90d.",
                "Quote desk pulls the FBX12 reference into every quote PDF as a market anchor.",
                "Carrier-displacement alerts when an account's mix shifts >5% on a watched lane.",
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
                Tied to Pulse AI
              </div>
              <h3 className="display-sm mt-2">FBX rates are first-class context.</h3>
              <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">
                Every Pulse AI enrichment call ships a{" "}
                <span className="font-mono text-ink-700">freight_market_intelligence</span> block
                with the matched FBX lane, current $/TEU, $/40ft, 30/90/365d delta, and the
                account's TEU on that lane. Recommendations are grounded in the data — no
                hallucinated numbers.
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
        eyebrow="Stop quoting blind"
        title="Open any account. See the live market on its lanes."
        subtitle="Free trial gives you company profiles, Rate Benchmark, and Pulse search. No credit card."
        primaryCta={{ label: "Start free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Rate Benchmark",
            description:
              "Live FBX-grade freight rate intelligence inside every LIT company profile. Benchmark contracted vs spot, compute market-rate spend, ground Pulse AI recommendations in current rates.",
            url: siteUrl("/rate-benchmark"),
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
