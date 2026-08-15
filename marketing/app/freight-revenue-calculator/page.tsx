import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { CalculatorClient } from "./CalculatorClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";
const PATH = "/freight-revenue-calculator";

export const metadata: Metadata = buildMetadata({
  title: "Freight Account Revenue Calculator — Estimate an Account in Seconds",
  description:
    "Estimate the annual freight revenue, gross profit, and probability-adjusted opportunity of any account. Free calculator — no signup. Enter ocean and air volume and see the numbers instantly.",
  path: PATH,
  eyebrow: "Free freight revenue calculator",
});

const FAQ_ITEMS = [
  {
    question: "How is the estimate calculated?",
    answer:
      "Ocean revenue = annual containers × your average revenue per container. Air revenue = monthly air shipments × 12 × your average revenue per shipment. Gross profit applies your margin (15% assumed if left blank), and the probability-adjusted opportunity applies your win probability (25% assumed if blank). Every figure is an estimate based on the inputs you provide.",
  },
  {
    question: "Do I need an account to use it?",
    answer:
      "No. The calculator is free and runs entirely in your browser — no signup, no credit card. You can optionally email the estimate to yourself if you'd like a copy.",
  },
  {
    question: "Are these numbers a quote?",
    answer:
      "No. They are directional estimates based on the volume, rates, margin, and win probability you enter. Actual revenue depends on real rates, awarded volume, and how many accounts you win.",
  },
  {
    question: "What should I do with the estimate?",
    answer:
      "Use it to prioritize accounts. From the result you can jump straight to a ranked list of active importers that match this shipping profile, or start a free Logistics Intel trial to build and work your prospect list.",
  },
];

const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Logistics Intel — Freight Account Revenue Calculator",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}${PATH}`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Free calculator estimating annual freight revenue, gross profit, and probability-adjusted opportunity for a freight account from ocean and air volume inputs.",
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

export default function FreightRevenueCalculatorPage() {
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
                Free freight revenue calculator · no signup
              </span>
              <h1 className="font-display mt-5 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
                What&apos;s a freight account{" "}
                <span className="bg-[linear-gradient(90deg,#2563eb_0%,#0891b2_100%)] bg-clip-text text-transparent">
                  actually worth?
                </span>
              </h1>
              <p className="lead mx-auto mt-4 max-w-xl text-ink-500">
                Enter an account&apos;s ocean and air volume and see estimated annual revenue, gross profit,
                and probability-adjusted opportunity — instantly, right in your browser. No account required.
              </p>
            </div>

            <div className="mt-10">
              <CalculatorClient />
            </div>

            <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink-200">
              All figures are estimates based on the inputs you provide — not a quote or a guarantee.
            </p>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              <ValueItem
                title="Instant, in your browser"
                body="Pure math — nothing to install, no account, no waiting. Type volumes and see the numbers."
              />
              <ValueItem
                title="Prioritize your pipeline"
                body="See the probability-adjusted value of an account so you chase the freight that actually moves the number."
              />
              <ValueItem
                title="Then go find the accounts"
                body="Jump from an estimate to a ranked list of active importers that match this shipping profile."
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
