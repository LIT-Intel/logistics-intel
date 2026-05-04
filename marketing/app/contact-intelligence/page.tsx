import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
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
      <section className="relative px-5 pt-[72px] pb-12 sm:px-8">
        <div className="mx-auto grid max-w-container gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <div className="lit-pill">
              <span className="dot" />
              Contact Intelligence
            </div>
            <h1 className="display-xl mt-5">
              Find the people <span className="grad-text">behind the freight.</span>
            </h1>
            <p className="lead mt-5 max-w-[560px]">
              Logistic Intel helps your team move from company intelligence to the right decision
              makers. Search by title, department, seniority, and location. Enrich only the
              contacts your team is ready to work — not every name in the database.
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
            <ContactDiscoveryMock />
          </div>
        </div>
      </section>

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
