import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { CompanyIntelMock } from "@/components/sections/CompanyIntelMock";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Company Intelligence for Freight Sales | Logistic Intel",
  description:
    "Analyze company shipment activity, trade lanes, TEU, suppliers, recent BOLs, mode mix, and freight opportunity signals in one clean profile.",
  path: "/company-intelligence",
  eyebrow: "Company Intelligence",
});

const SECTIONS = [
  {
    icon: "BarChart3",
    tag: "Shipment profile",
    title: "Twelve months of activity, on one screen",
    body: "12-month shipment activity, total shipments, TEU, recent shipment dates, FCL/LCL split, container patterns, and monthly cadence — joined and rendered as one company-level view.",
  },
  {
    icon: "Route",
    tag: "Trade lanes",
    title: "Understand the lanes that matter",
    body: "Origin → destination patterns, lane share, recent route activity, and where your services may fit. Save lanes to a watchlist; Pulse Coach pings you when shifts happen.",
  },
  {
    icon: "Network",
    tag: "Suppliers + counterparties",
    title: "See the supplier graph behind the shipper",
    body: "Identify supplier relationships, shipment counterparties, and patterns that shape a stronger account strategy. Spot when a shipper is sourcing diversification before it hits press releases.",
  },
  {
    icon: "Sparkles",
    tag: "Opportunity signals",
    title: "What's worth reaching out about, this week",
    body: "Volume growth, active lanes, mode mix, recent changes, carrier gaps, contact personas worth pursuing — surfaced as ranked signals on every account.",
  },
];

export default function CompanyIntelligencePage() {
  return (
    <PageShell>
      <section className="relative px-5 pt-[72px] pb-12 sm:px-8">
        <div className="mx-auto grid max-w-container gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <div className="lit-pill">
              <span className="dot" />
              Company Intelligence
            </div>
            <h1 className="display-xl mt-5">
              Know the account <span className="grad-text">before</span> you contact the account.
            </h1>
            <p className="lead mt-5 max-w-[560px]">
              Logistic Intel company profiles turn shipment activity into sales-ready account
              intelligence. See how often a company ships, where freight is moving, what lanes
              matter, who they buy from, and where your team may have an opening.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={APP_SIGNUP_URL}
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                Start Prospecting
              </a>
              <a
                href="/demo"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
              >
                Book a Demo
              </a>
            </div>
          </div>
          <div className="relative">
            <CompanyIntelMock />
          </div>
        </div>
      </section>

      <FeatureGrid
        eyebrow="What's inside a company profile"
        title="Four layers of intelligence on every account."
        features={SECTIONS}
        cols={2}
      />

      <CtaBanner
        eyebrow="Stop researching from scratch"
        title="Open any account. Get the freight story instantly."
        subtitle="Free trial gives you company profiles, Pulse search, and 10 saved companies. No credit card."
        primaryCta={{ label: "Start free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
