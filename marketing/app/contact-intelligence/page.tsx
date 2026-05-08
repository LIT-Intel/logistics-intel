import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { ProductHero } from "@/components/sections/ProductHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { ContactDiscoveryMock } from "@/components/sections/ContactDiscoveryMock";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Contact Intelligence for Logistics Sales | Logistic Intel",
  description:
    "Find and enrich logistics, procurement, supply chain, import, and operations contacts tied to active shipping companies.",
  path: "/contact-intelligence",
  eyebrow: "Contact Intelligence",
});

const SECTIONS = [
  {
    icon: "Users",
    tag: "Search by logistics role",
    title: "Find the people who actually sign freight contracts",
    body: "Supply chain managers, logistics directors, import managers, procurement leaders, transportation managers, customs managers, operations contacts. Filter by role, seniority, department, and location.",
  },
  {
    icon: "Sparkles",
    tag: "Enrich only what matters",
    title: "Don't burn credits on contacts you'll never work",
    body: "Preview contacts first. Select the people you're ready to work. Enrich only those. Plan-aware credit usage means you control spend.",
  },
  {
    icon: "Send",
    tag: "Connected to campaigns",
    title: "Saved contacts feed outbound directly",
    body: "Saved contacts can be added to campaigns, used in personalized messaging, and tracked through outreach history. No CSV exports, no copy-paste.",
  },
  {
    icon: "Target",
    tag: "Account-based",
    title: "Built for account-based selling, not lead lists",
    body: "Generic contact databases miss the freight context. LIT connects every contact to shipment activity, trade lanes, and account-level opportunity signals.",
  },
];

export default function ContactIntelligencePage() {
  return (
    <PageShell>
      <ProductHero
        eyebrow="Contact Intelligence"
        title="Find the people"
        titleHighlight="behind the freight."
        subtitle="Logistic Intel helps your team move from company intelligence to the right decision makers. Search by title, department, seniority, and location. Enrich only the contacts your team is ready to work — not every name in the database."
        visual={<ContactDiscoveryMock />}
      />

      <FeatureGrid
        eyebrow="What's inside contact intelligence"
        title="Four reasons logistics-tuned contacts beat generic lead lists."
        features={SECTIONS}
        cols={2}
      />

      <CtaBanner
        eyebrow="Verified contacts"
        title="Right title, right account, right time."
        subtitle="Free trial includes 5 verified contact reveals so you can test the data before committing."
        primaryCta={{ label: "Start free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
