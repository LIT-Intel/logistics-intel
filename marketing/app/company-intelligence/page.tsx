import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { ProductHero } from "@/components/sections/ProductHero";
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
      <ProductHero
        eyebrow="Company Intelligence"
        title="Know the account"
        titleHighlight="before"
        titleSuffix="you contact the account."
        subtitle="Logistic Intel company profiles turn shipment activity into sales-ready account intelligence. See how often a company ships, where freight is moving, what lanes matter, who they buy from, and where your team may have an opening."
        visual={<CompanyIntelMock />}
      />

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
