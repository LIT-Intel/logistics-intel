import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { FaqSection } from "@/components/sections/FaqSection";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { WorkflowMotion } from "@/components/sections/WorkflowMotion";
import { PulseExplorerHero } from "@/components/sections/pulse-explorer/PulseExplorerHero";
import { NLSearchSection } from "@/components/sections/pulse-explorer/NLSearchSection";
import { CoachSection } from "@/components/sections/pulse-explorer/CoachSection";
import { FeatureShowcase } from "@/components/sections/pulse-explorer/FeatureShowcase";
import { CapabilityBand } from "@/components/sections/pulse-explorer/CapabilityBand";
import { PulseFinalCta } from "@/components/sections/pulse-explorer/PulseFinalCta";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Pulse AI | Map-first freight prospecting + account intelligence",
  description:
    "Pulse plots 78K+ U.S. shippers as a living map, scores every opportunity, and answers plain-English questions across companies, contacts, trade lanes, industries, and locations.",
  path: "/pulse",
  eyebrow: "Pulse",
});

/** FAQ stays specific to /pulse — these are the questions that come up
 *  when buyers compare Pulse to "another search bar" and need to
 *  understand the local-first model + Anthropic stack. */
const FAQS = [
  {
    question: "How is Pulse different from a normal search bar?",
    answer:
      "It understands intent, joins data across companies + shipments + contacts in one query, and ranks by signal recency. You can ask the same question three different ways and get the same accurate answer.",
  },
  {
    question: "Does it use my private CRM data?",
    answer:
      "Pulse can pull from your saved companies and CRM activity if you've connected one — and it never shares that across tenants. Public trade data and our company graph are shared infrastructure; your CRM is yours alone.",
  },
  {
    question: "Local-first or external-first search?",
    answer:
      "Local-first. Pulse searches your owned company directory before expanding into external intelligence. That means faster results, lower enrichment cost, and less wasted usage.",
  },
  {
    question: "What model powers Pulse Coach?",
    answer:
      "We orchestrate Anthropic Claude for reasoning + tool use, with embeddings for retrieval. Classification heuristics run first, LLM augmentation only when confidence is low — keeps latency snappy and costs predictable.",
  },
  {
    question: "Can I use Pulse via API?",
    answer:
      "Yes — Scale and Enterprise plans get programmatic Pulse access for your own apps and agents.",
  },
];

/**
 * /pulse — the Pulse AI product hub. Rebuilt June 2026 around the new
 * Pulse Explorer V2 visual so the marketing surface matches the live
 * product UI. Shares hero + spotlight sections with /company-intelligence
 * (both market the same product), but keeps /pulse's distinct
 * "signal-to-pipeline" workflow + FAQ blocks intact so the two pages
 * don't read as duplicates.
 */
export default function PulsePage() {
  return (
    <PageShell>
      <div className="lit-page">
        <PulseExplorerHero />
        <NLSearchSection />
        <CoachSection />
        <FeatureShowcase />
        <CapabilityBand />

        {/* /pulse-unique: signal → pipeline workflow visualization */}
        <section className="section">
          <div className="container mx-auto px-8" style={{ maxWidth: 1240 }}>
            <div className="section-title">
              <div className="eyebrow">From signal to pipeline</div>
              <h2 className="display-lg mt-3">
                Watch one query turn into one campaign.
              </h2>
              <p className="lead mx-auto mt-3" style={{ maxWidth: 640 }}>
                Pulse query → Coach reasoning → triggered actions → drafted
                outreach → live replies. Five steps that used to be five tools.
              </p>
            </div>
            <div className="mt-12">
              <WorkflowMotion />
            </div>
          </div>
        </section>

        <FaqSection faqs={FAQS} />

        <CtaBanner
          eyebrow="Try Pulse"
          title="Skip the boolean. Ask a question."
          subtitle="Free trial gives you Pulse search, Coach, and 10 saved companies. No credit card."
          primaryCta={{ label: "Start free", href: APP_SIGNUP_URL, icon: "arrow" }}
          secondaryCta={{ label: "Book a demo", href: "/demo" }}
        />

        <PulseFinalCta />

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
      </div>
    </PageShell>
  );
}
