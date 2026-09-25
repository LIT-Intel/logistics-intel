import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { RoiCalculatorClient } from "./RoiCalculatorClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";
const PATH = "/roi-calculator";

export const metadata: Metadata = buildMetadata({
  title: "Freight ROI Calculator — What Logistics Intel Is Worth",
  description:
    "Estimate the first-year ROI of Logistics Intel for your brokerage. Adjust reps, new shippers won, loads, revenue, and margin to see added gross profit, cost, and return. Free — no signup.",
  path: PATH,
  eyebrow: "Free ROI calculator",
});

const FAQ_ITEMS = [
  {
    question: "How is the ROI estimate calculated?",
    answer:
      "Added gross profit = sales reps × new shippers won per rep per year × loads per shipper per month × ~6 average active months in year 1 × revenue per load × gross margin. Your LIT cost is the selected plan billed monthly × 12. Net first-year value = added gross profit − LIT cost. Every figure is an estimate based on the inputs you provide.",
  },
  {
    question: "Why 6 average active months?",
    answer:
      "Accounts are won throughout the year, so a shipper won in, say, month 4 only ships for part of year one. Averaging ~6 of 12 months keeps the first-year headline conservative and realistic rather than assuming every account ships all 12 months.",
  },
  {
    question: "Do I need an account to use it?",
    answer:
      "No. The calculator is free and runs entirely in your browser — no signup, no credit card. Move the sliders and the numbers update instantly.",
  },
  {
    question: "Is this a quote or a guarantee?",
    answer:
      "No. It is a directional estimate based on the reps, win rate, volume, rate, and margin you enter. Actual results depend on how many active shippers you find and convert. Logistics Intel helps by showing which companies are actively shipping so your reps target proven accounts.",
  },
];

const appLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Logistics Intel — Freight ROI Calculator",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}${PATH}`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Free calculator estimating the first-year ROI of Logistics Intel for a freight brokerage from reps, new shippers won, loads, revenue per load, and margin.",
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

export default function RoiCalculatorPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <MoneyPageShell>
        <section className="bg-gradient-to-b from-white to-blue-50/40">
          <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <span className="lit-pill mx-auto w-fit shadow-sm">
                <span className="dot" />
                Free ROI calculator · no signup
              </span>
              <h1 className="font-display mt-5 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
                What is Logistics Intel{" "}
                <span className="bg-[linear-gradient(90deg,#2563eb_0%,#0891b2_100%)] bg-clip-text text-transparent">
                  worth to your brokerage?
                </span>
              </h1>
              <p className="lead mx-auto mt-4 max-w-xl text-ink-500">
                Move the sliders to match your team and see the estimated first-year return — added gross profit
                from winning more active shippers, minus your LIT cost. Instant, in your browser.
              </p>
            </div>

            <div className="mt-10">
              <RoiCalculatorClient />
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
                title="Grounded in real freight math"
                body="Reps, win rate, loads, rate, and margin — the levers that actually drive a brokerage's number, not a vanity metric."
              />
              <ValueItem
                title="Conservative by design"
                body="Year-1 accounts are assumed to ship only ~6 of 12 months, so the payback figure holds up under scrutiny."
              />
              <ValueItem
                title="Then go win the accounts"
                body="LIT shows which companies are actively shipping on your lanes — so reps target proven shippers instead of dialing blind."
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
