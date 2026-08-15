import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { RiskScannerClient } from "./RiskScannerClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";
const PATH = "/import-risk-scanner";

export const metadata: Metadata = buildMetadata({
  title: "Import & Tariff Risk Scanner — Concentration Indicators for Any Importer",
  description:
    "Scan any U.S. importer for sourcing-country concentration, port concentration, and shipment-trend indicators — from cached customs data. Non-legal indicators only. Free, no credit card.",
  path: PATH,
  eyebrow: "Free import risk scanner",
});

const FAQ_ITEMS = [
  {
    question: "Is this legal or tariff advice?",
    answer:
      "No. The scanner surfaces concentration and trend indicators derived from public, aggregated shipment records. It does not classify goods, determine duty treatment, or provide legal, customs, or tariff advice. Verify any trade-policy impact with a licensed customs broker or trade attorney.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "From cached U.S. customs / bill-of-lading records — the same grounded shipment data our platform uses internally. Concentration shares and shipment counts are modeled estimates over a trailing 12 months and are labeled as indicators.",
  },
  {
    question: "What does 'import concentration' mean?",
    answer:
      "It's the estimated share of an importer's shipments coming from its single largest sourcing country, plus how many distinct countries they source from. A high top-country share is flagged as a higher concentration indicator — a signal to look closer, not a conclusion.",
  },
  {
    question: "What if the company isn't found?",
    answer:
      "We tell you honestly rather than invent numbers — just try another importer. We only report on companies we already have a cached profile for.",
  },
  {
    question: "What unlocks with an account?",
    answer:
      "Supplier-level concentration, full lane detail, shipment records, and — most importantly — Pulse monitoring so you're alerted when a company's sourcing or lanes shift. A free account saves the company and opens its live Pulse view.",
  },
];

const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Logistics Intel — Import & Tariff Risk Scanner",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}${PATH}`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Free scanner surfacing sourcing-country concentration, port concentration, and shipment-trend indicators for U.S. importers from cached customs data. Non-legal indicators only.",
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

export default function ImportRiskScannerPage() {
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
                Free import risk scanner · indicators, not advice
              </span>
              <h1 className="font-display mt-5 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
                Where is an importer&apos;s{" "}
                <span className="bg-[linear-gradient(90deg,#2563eb_0%,#0891b2_100%)] bg-clip-text text-transparent">
                  supply chain concentrated?
                </span>
              </h1>
              <p className="lead mx-auto mt-4 max-w-xl text-ink-500">
                Enter a U.S. importer and see sourcing-country concentration, port concentration, and a
                12-month shipment trend — modeled from cached customs data. Indicators only, never legal or
                tariff advice.
              </p>
            </div>

            <div className="mt-10">
              <RiskScannerClient />
            </div>

            <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink-200">
              All figures are estimates from public, aggregated shipment records and are labeled as indicators.
              Nothing here is legal, customs, or tariff advice.
            </p>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              <ValueItem
                title="Concentration at a glance"
                body="See how dependent an importer is on a single sourcing country or port — a fast read on supply-chain fragility."
              />
              <ValueItem
                title="Indicators, not advice"
                body="Every figure is a labeled estimate from public customs data. We never make legal, duty, or classification determinations."
              />
              <ValueItem
                title="Monitor with Pulse"
                body="Start free and we save the company and open live Pulse monitoring, so you're alerted when their sourcing or lanes shift."
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
