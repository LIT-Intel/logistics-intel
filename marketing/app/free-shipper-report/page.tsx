import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { ReportClient } from "./ReportClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";
const PATH = "/free-shipper-report";

export const metadata: Metadata = buildMetadata({
  title: "Free Shipper Intelligence Report — Any U.S. Importer",
  description:
    "Get a free intelligence report on any U.S. importer. See estimated 12-month shipment volume, TEU, top origin countries, destination ports, and lead trade lane — from real cached customs data. No credit card.",
  path: PATH,
  eyebrow: "Free shipper intelligence",
});

const FAQ_ITEMS = [
  {
    question: "Where does this data come from?",
    answer:
      "From cached U.S. customs / bill-of-lading records — the same grounded shipment data our platform uses internally. Volume and TEU figures are modeled estimates over a trailing 12 months and are labeled as estimates in the report.",
  },
  {
    question: "Is it really free?",
    answer:
      "Yes. The intelligence report on any covered importer is free — no credit card. Deeper detail (full lane history, active suppliers, contacts, and shipment-level records) unlocks with a free 7-day trial of Logistics Intel.",
  },
  {
    question: "Why can't I see the full company profile?",
    answer:
      "The free report shows aggregated, public shipment intelligence. Contacts, decision-makers, shipment-level bill-of-lading detail, monitoring, and opportunity scoring are part of the full platform and unlock with a free trial.",
  },
  {
    question: "What if my company isn't found?",
    answer:
      "We're continuously expanding coverage. If we don't have a profile for an importer yet, we'll tell you honestly rather than show made-up numbers — just try another company.",
  },
  {
    question: "How current is the data?",
    answer:
      "Each report shows a data-freshness date so you know exactly when the underlying snapshot was last refreshed.",
  },
];

const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Logistics Intel — Free Shipper Intelligence Report",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}${PATH}`,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Free intelligence report on any U.S. importer: estimated shipment volume, TEU, top trade lanes, origin countries, and destination ports from cached customs data.",
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

export default function FreeShipperReportPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <MoneyPageShell>
        {/* HERO + interactive report — mobile-first (§93) */}
        <section className="bg-gradient-to-b from-white to-blue-50/40">
          <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <span className="lit-pill mx-auto w-fit shadow-sm">
                <span className="dot" />
                Free shipper intelligence · from real customs data
              </span>
              <h1 className="font-display mt-5 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
                Get a free intelligence report on{" "}
                <span className="bg-[linear-gradient(90deg,#2563eb_0%,#0891b2_100%)] bg-clip-text text-transparent">
                  any U.S. importer.
                </span>
              </h1>
              <p className="lead mx-auto mt-4 max-w-xl text-ink-500">
                Type a company name. See their estimated 12-month shipment volume, TEU,
                top origin countries, U.S. destination ports, and lead trade lane — pulled
                from cached customs records. No credit card.
              </p>
            </div>

            <div className="mt-10">
              <ReportClient />
            </div>

            <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink-200">
              Volume and TEU figures are modeled estimates over a trailing 12 months.
              Full lane history, suppliers, contacts, and shipment detail unlock with a free trial.
            </p>
          </div>
        </section>

        {/* value band */}
        <section className="bg-white">
          <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              <ValueItem
                title="Real customs data"
                body="Estimates are modeled from cached U.S. bill-of-lading records — not guesses, and always labeled."
              />
              <ValueItem
                title="Instant, not a PDF"
                body="Search a company and read its intelligence report on the spot. No waiting on an email."
              />
              <ValueItem
                title="Land in the account"
                body="Start a trial and you drop straight into that company's full profile — not a generic dashboard."
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
