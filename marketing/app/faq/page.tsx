import type { Metadata } from "next";
import Link from "next/link";
import { groq } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { ProseRenderer } from "@/lib/portableText";
import { buildMetadata } from "@/lib/seo";
import { ChevronDown } from "lucide-react";

export const revalidate = 600; // ISR

const FAQ_QUERY = groq`*[_type == "faq"] | order(category asc, displayOrder asc, _createdAt asc){
  _id, question, answer, category, displayOrder
}`;

/** Categories rendered in the order they appear here. Anything that
 *  doesn't match falls through to "Other" at the end. Keep in sync with
 *  the schema's category option list. */
const CATEGORY_LABELS: Record<string, string> = {
  platform: "Platform",
  data: "Data sources",
  integrations: "Integrations",
  pricing: "Pricing",
  security: "Security & compliance",
  comparisons: "Comparisons",
  onboarding: "Onboarding",
};
const CATEGORY_ORDER = [
  "platform",
  "data",
  "integrations",
  "pricing",
  "security",
  "comparisons",
  "onboarding",
];

export const metadata: Metadata = buildMetadata({
  title: "Frequently asked questions | LIT — Logistic Intel",
  description:
    "Answers to the most common questions about LIT — the freight revenue intelligence platform. Coverage, integrations, pricing, security, and how we compare.",
  path: "/faq",
  eyebrow: "FAQ",
});

type FaqDoc = {
  _id: string;
  question: string;
  answer: any;
  category: string;
  displayOrder?: number;
};

/** Flatten Sanity portable-text blocks to plain text for FAQPage JSON-LD.
 *  Schema.org wants a string, not HTML. */
function blocksToPlainText(blocks: any): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((b) =>
      b?._type === "block" && Array.isArray(b.children)
        ? b.children.map((c: any) => c?.text ?? "").join("")
        : "",
    )
    .filter(Boolean)
    .join("\n\n");
}

export default async function FaqPage() {
  const faqs = (await sanityClient.fetch<FaqDoc[]>(FAQ_QUERY).catch(() => [])) || [];

  // Group by category, preserving CATEGORY_ORDER, with "Other" as fallback.
  const grouped = new Map<string, FaqDoc[]>();
  for (const f of faqs) {
    const key = CATEGORY_ORDER.includes(f.category) ? f.category : "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }
  const sections = [
    ...CATEGORY_ORDER.filter((k) => grouped.has(k)).map((k) => ({
      key: k,
      label: CATEGORY_LABELS[k] || k,
      items: grouped.get(k)!,
    })),
    ...(grouped.has("other")
      ? [{ key: "other", label: "Other", items: grouped.get("other")! }]
      : []),
  ];

  // FAQPage JSON-LD — emitted only when we have at least one entry. Google
  // ignores empty FAQPage payloads anyway, but emitting nothing keeps the
  // page lean and avoids a flagged "no items" warning in Rich Results Test.
  const faqJsonLd =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: blocksToPlainText(f.answer),
            },
          })),
        }
      : null;

  return (
    <PageShell>
      <PageHero
        eyebrow="FAQ"
        title="Frequently asked"
        titleHighlight="questions."
        subtitle="Answers to the most common questions about LIT — coverage, integrations, pricing, security, and how we compare to ZoomInfo, ImportGenius, Apollo, and the rest of the freight-data stack."
      />

      <section className="px-5 sm:px-8 pb-20">
        <div className="mx-auto max-w-[820px]">
          {sections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">
                No FAQs yet
              </div>
              <p className="font-body mx-auto mt-2 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
                Marketing publishes FAQ entries from <Link href="/studio" className="text-brand-blue-700 underline">Sanity Studio</Link>. Have a
                question we should answer? <Link href="/contact" className="text-brand-blue-700 underline">Tell us</Link>.
              </p>
            </div>
          ) : (
            sections.map((s) => (
              <div key={s.key} className="mb-12 last:mb-0">
                <h2
                  id={s.key}
                  className="font-display mb-4 text-[14px] font-bold uppercase tracking-[0.12em] text-brand-blue-700"
                >
                  {s.label}
                </h2>
                <div className="space-y-3">
                  {s.items.map((f) => (
                    <FaqEntry key={f._id} item={f} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <CtaBanner
        eyebrow="Don't see your question?"
        title="Talk to a freight operator."
        subtitle="Our team includes people who've actually run freight at scale. Book a 30-minute conversation and ask anything."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Email the team", href: "/contact" }}
      />

      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
    </PageShell>
  );
}

/** Native disclosure — works without JS, keyboard accessible, and the
 *  global prefers-reduced-motion CSS already neuters the open animation
 *  for users who need that. */
function FaqEntry({ item }: { item: FaqDoc }) {
  return (
    <details className="group rounded-2xl border border-ink-100 bg-white px-6 py-4 shadow-sm transition open:border-brand-blue/30 open:shadow-md">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <span className="font-display text-[16px] font-semibold leading-snug text-ink-900">
          {item.question}
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-ink-500 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-3 border-t border-ink-100 pt-3 text-[15px] leading-relaxed text-ink-700">
        <ProseRenderer value={item.answer} />
      </div>
    </details>
  );
}
