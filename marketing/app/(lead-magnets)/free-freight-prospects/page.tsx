import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { ProspectListClient, type MagnetCopy } from "../_shared/ProspectListClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";
const PATH = "/free-freight-prospects";

export const metadata: Metadata = buildMetadata({
  title: "Free Freight Prospect List — Build Yours in Minutes",
  description:
    "Build your freight prospect list in minutes. Filter by industry, origin country, destination region, mode, and volume to get a ranked list of active importers with estimated volume, TEU, top lane, and opportunity score. Free, no credit card.",
  path: PATH,
  eyebrow: "Free freight prospect list",
});

const COPY: MagnetCopy = {
  slug: "free-freight-prospects",
  ctaLabel: "Unlock the complete prospect list with your free trial →",
  emailGateTitle: "Keep building your list",
  emailGateBody:
    "Add your email to keep exploring active importers matched to your lanes — with volume, top lanes, and opportunity scores.",
};

const FAQ_ITEMS = [
  {
    question: "How is this list built?",
    answer:
      "From cached, aggregated U.S. customs / bill-of-lading intelligence. You set the filters — industry, origin country, destination region, mode, volume — and we rank the best-fit active importers by opportunity score. Volume and TEU are modeled estimates over a trailing 12 months.",
  },
  {
    question: "Is it really free?",
    answer:
      "Yes — building a ranked prospect list is free with no credit card. Unlocking every company and the full Explorer (contacts, complete lane history, monitoring) happens with a free Logistics Intel trial.",
  },
  {
    question: "Can I export or reuse the list?",
    answer:
      "Start your free trial and this exact search reopens inside the Pulse Explorer, where you can save it, refine it, and export — you never rebuild your prospect list by hand.",
  },
  {
    question: "Why can I only see 5 companies for free?",
    answer:
      "The free list shows the top 5 in full and previews the next 20 as locked teasers, so you can gauge fit before you sign up. A free account reveals all 25.",
  },
  {
    question: "What if nothing matches?",
    answer:
      "We say so honestly and suggest widening your filters — we never invent companies. Every number is derived from real cached data.",
  },
];

const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Logistics Intel — Free Freight Prospect List Builder",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}${PATH}`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Build a ranked freight prospect list of active importers in minutes, from cached customs intelligence. Free.",
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

export default function FreeFreightProspectsPage() {
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
                Free freight prospect list · from real customs data
              </span>
              <h1 className="font-display mt-5 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
                Build your freight prospect list{" "}
                <span className="bg-[linear-gradient(90deg,#2563eb_0%,#0891b2_100%)] bg-clip-text text-transparent">
                  in minutes.
                </span>
              </h1>
              <p className="lead mx-auto mt-4 max-w-xl text-ink-500">
                Set your lanes and target industry — we rank active importers by opportunity score with
                estimated volume, TEU, and top trade lane. No credit card.
              </p>
            </div>

            <div className="mt-10">
              <ProspectListClient copy={COPY} />
            </div>

            <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink-200">
              Volume and TEU figures are modeled estimates over a trailing 12 months. The complete prospect
              list, contacts, and full lane history unlock with a free trial.
            </p>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              <ValueItem
                title="Targeted to your lanes"
                body="Filter by industry, origin, destination, mode, and volume — the list matches the freight you actually want to move."
              />
              <ValueItem
                title="Real customs data"
                body="Every prospect is modeled from cached U.S. bill-of-lading records — never fabricated, and always labeled as estimates."
              />
              <ValueItem
                title="Straight into the Explorer"
                body="Start free and your prospect search reopens in the workspace, ready to save, refine, and work."
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
