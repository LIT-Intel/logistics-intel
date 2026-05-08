import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/sections/PageShell";
import { ProductHero } from "@/components/sections/ProductHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { FaqSection } from "@/components/sections/FaqSection";
import { HeroSearchDemo } from "@/components/sections/HeroSearchDemo";
import { PulseBriefMock } from "@/components/sections/PulseBriefMock";
import { MarketingGlobe } from "@/components/sections/MarketingGlobe";
import { WorkflowMotion } from "@/components/sections/WorkflowMotion";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Pulse AI | Freight Prospecting and Account Intelligence",
  description:
    "Use Pulse AI to search companies, contacts, trade lanes, industries, and locations. Turn freight data into account briefs, lead lists, and campaign angles.",
  path: "/pulse",
  eyebrow: "Pulse",
});

const FEATURES = [
  {
    icon: "Search",
    tag: "Search",
    title: "Ask in plain English",
    body: "\"Furniture importers shipping from Vietnam in the last 90 days\" — Pulse parses intent, applies filters, and returns ranked results across companies + lanes + contacts.",
  },
  {
    icon: "Compass",
    tag: "Coach",
    title: "Pulse Coach",
    body: "An always-on guide that surfaces what changed across your tracked lanes, accounts, and pipelines — and tells you why it matters this week.",
  },
  {
    icon: "Bell",
    tag: "Signals",
    title: "Live trade signals",
    body: "New shipments on a watched lane, carrier mix shifts, sudden volume changes, port congestion — Pulse pings you the moment things move.",
  },
  {
    icon: "Zap",
    tag: "Actions",
    title: "Action triggers",
    body: "Promote any signal into a workflow: launch a campaign, queue a contact, alert a teammate, or update CRM — without leaving the result.",
  },
  {
    icon: "MessageSquare",
    tag: "Chat",
    title: "Conversational follow-up",
    body: "Pulse keeps the thread. Ask a follow-up — \"Now narrow to ones in California\" — and it remembers the prior context.",
  },
  {
    icon: "Sparkles",
    tag: "Coverage",
    title: "All your data, one box",
    body: "Pulse searches across companies, contacts, shipments, lanes, ports, HS codes, and your saved CRM. One question, one ranked answer.",
  },
];

const SEARCH_EXAMPLES = [
  "Find furniture importers shipping from Vietnam to the United States.",
  "Show me retail companies with recent ocean import activity.",
  "Find companies similar to Old Navy with high import volume.",
  "Show me supply chain leaders at consumer goods companies in Georgia.",
  "Which companies are importing through Savannah with growing volume?",
];

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

export default function PulsePage() {
  return (
    <PageShell>
      <ProductHero
        eyebrow="Pulse AI · Freight prospecting + account intelligence"
        title="Ask better questions."
        titleHighlight="Find better freight opportunities."
        subtitle="Pulse is the intelligence layer inside Logistic Intel. Ask in plain English and get useful answers across companies, contacts, trade lanes, industries, and locations — with reasoning chips that show how it interpreted your prompt."
        visual={<HeroSearchDemo />}
      />

      <section className="px-5 pb-8 sm:px-8">
        <div className="mx-auto max-w-content">
          <div className="font-display mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-200">
            Try asking Pulse
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-3">
            {SEARCH_EXAMPLES.slice(0, 3).map((q) => (
              <li
                key={q}
                className="font-body rounded-lg border border-ink-100 bg-white px-3 py-2 text-[13px] leading-snug text-ink-700"
              >
                &quot;{q}&quot;
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-container">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="lg:order-1">
              <PulseBriefMock />
            </div>
            <div className="lg:order-2">
              <div className="eyebrow">Pulse Brief</div>
              <h2 className="display-lg mt-3">
                One click, one <span className="grad-text">full account brief.</span>
              </h2>
              <p className="lead mt-5 max-w-[480px]">
                Pulse generates an executive account brief on demand: trade snapshot, opportunity
                signals across buying / forwarder / carrier / supplier categories, risk flags, and
                ready-to-send outreach hooks. Cited sources, refreshed weekly.
              </p>
              <ul className="font-body mt-6 space-y-2.5 text-[14px] leading-snug text-ink-700">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                  <span>Build account lists from any natural-language prompt.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                  <span>Surface sales angles tied to actual shipment patterns.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                  <span>Connect any saved company directly into outbound sequences.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-container">
          <div
            className="relative overflow-hidden rounded-3xl border border-white/10 px-6 py-8 sm:px-10 sm:py-12"
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
            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div>
                <div
                  className="font-display text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "#00F0FF" }}
                >
                  Trade lane intelligence
                </div>
                <h2 className="font-display mt-3 text-[28px] font-semibold leading-tight tracking-[-0.015em] text-white">
                  Live trade lanes. Real shipper data. One Pulse query away.
                </h2>
                <p className="font-body mt-3 max-w-[480px] text-[14.5px] leading-relaxed text-ink-150">
                  500+ tracked origin × destination pairs, refreshed daily. Top 25 shippers per
                  lane. Carrier mix, monthly volume, YoY change — Pulse lets you slice by industry,
                  HS code, or location and seed an outbound sequence in the same query.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/lanes"
                    className="font-display inline-flex h-11 items-center gap-1.5 rounded-md bg-white/10 px-4 text-[13px] font-semibold text-white backdrop-blur hover:bg-white/15"
                  >
                    Browse trade lanes →
                  </Link>
                  <Link
                    href={APP_SIGNUP_URL}
                    className="font-display inline-flex h-11 items-center gap-1.5 rounded-md px-4 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.45)]"
                    style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
                  >
                    Try Pulse free
                  </Link>
                </div>
              </div>
              <div className="mx-auto" style={{ maxWidth: 460 }}>
                <MarketingGlobe size={460} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureGrid
        eyebrow="What Pulse can do"
        title="A search bar, a coach, and a workflow trigger — in one box."
        features={FEATURES}
        cols={3}
      />

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[780px] text-center">
            <div className="eyebrow">From signal to pipeline</div>
            <h2 className="display-lg mt-3">Watch one query turn into one campaign.</h2>
            <p className="lead mx-auto mt-3 max-w-[640px]">
              Pulse query → Coach reasoning → triggered actions → drafted outreach → live replies.
              Five steps that used to be five tools.
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
    </PageShell>
  );
}
