import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { ProspectListClient, type MagnetCopy } from "../_shared/ProspectListClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";
const PATH = "/top-shippers";

export const metadata: Metadata = buildMetadata({
  title: "Top 25 Shippers in Your Market — Free Freight Prospect Finder",
  description:
    "Find the top companies moving freight in your market. Filter by industry, origin country, destination region, mode, and volume — then see the top 25 ranked shippers with estimated volume, TEU, top lane, and opportunity score. Free, no credit card.",
  path: PATH,
  eyebrow: "Top 25 shippers",
});

const COPY: MagnetCopy = {
  slug: "top-shippers",
  ctaLabel: "Create your free LIT account to unlock all 25 prospects →",
  emailGateTitle: "See the full top-25 list",
  emailGateBody:
    "Add your email to keep exploring the ranked shippers in your market — volume, lanes, and opportunity scores.",
};

const FAQ_ITEMS = [
  {
    question: "Where does this data come from?",
    answer:
      "From cached, aggregated U.S. customs / bill-of-lading intelligence — the same grounded corpus our Pulse Explorer uses. Shipment volume and TEU figures are modeled estimates over a trailing 12 months and are labeled as estimates.",
  },
  {
    question: "Is it really free?",
    answer:
      "Yes. Building a ranked top-25 list for your market is free — no credit card. Unlocking every company (and the full Explorer with contacts, lanes, and monitoring) happens with a free Logistics Intel account.",
  },
  {
    question: "How are companies ranked?",
    answer:
      "By an opportunity score that blends shipping consolidation potential, forwarder vulnerability, and shipment velocity — the same scoring the platform uses internally to surface winnable accounts.",
  },
  {
    question: "Why can I only see 5 companies?",
    answer:
      "The free list shows the top 5 in full and previews the next 20 as locked teasers. Create a free account to reveal all 25 and open the exact search in your workspace.",
  },
  {
    question: "What if nothing matches my filters?",
    answer:
      "We tell you honestly and suggest widening your filters rather than showing made-up companies. Every figure you see is derived from real cached data.",
  },
];

const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Logistics Intel — Top 25 Shippers Finder",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}${PATH}`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Find the top 25 companies moving freight in your market, ranked by opportunity score, from cached customs intelligence.",
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

export default function TopShippersPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <MoneyPageShell>
        <section className="bg-gradient-to-b from-white to-blue-50/40">
          <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <span className="lit-pill mx-auto w-fit shadow-sm">
                <span className="dot" />
                Top 25 shippers · from real customs data
              </span>
              <h1 className="font-display mt-5 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
                Find the top companies{" "}
                <span className="bg-[linear-gradient(90deg,#2563eb_0%,#0891b2_100%)] bg-clip-text text-transparent">
                  moving freight in your market.
                </span>
              </h1>
              <p className="lead mx-auto mt-4 max-w-xl text-ink-500">
                Pick an industry, lane, and volume — we rank the top 25 shippers with estimated volume,
                TEU, top trade lane, and an opportunity score. No credit card.
              </p>
            </div>

            <div className="mt-10">
              <ProspectListClient copy={COPY} />
            </div>

            <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink-200">
              Volume and TEU figures are modeled estimates over a trailing 12 months. The full 25-company
              list, contacts, and lanes unlock with a free account.
            </p>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              <ValueItem
                title="Ranked, not raw"
                body="Companies are scored by winnability — consolidation, forwarder vulnerability, and velocity — so the best fits rise to the top."
              />
              <ValueItem
                title="Real customs data"
                body="Estimates are modeled from cached U.S. bill-of-lading records — never fabricated, and always labeled."
              />
              <ValueItem
                title="Reopens in your workspace"
                body="Start free and this exact search reopens in the Explorer — you never rebuild it by hand."
              />
            </div>
          </div>
        </section>

        <MoneyPageFAQ items={FAQ_ITEMS} emitJsonLd={false} />
      </MoneyPageShell>
    </>
  );
}

function ValueItem({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-lg font-semibold text-ink-900">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}
