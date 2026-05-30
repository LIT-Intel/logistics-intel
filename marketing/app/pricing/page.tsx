import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { FaqSection } from "@/components/sections/FaqSection";
import { CustomerLogosRail } from "@/components/sections/CustomerLogosRail";
import { G2Chip } from "@/components/proof/G2Chip";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { PricingTiers } from "./PricingTiers";
import { PricingComparison } from "./PricingComparison";

export const metadata: Metadata = buildMetadata({
  title:
    "Pricing — Freight Prospecting Plans for Brokers, Forwarders & 3PLs | Logistic Intel",
  description:
    "Logistic Intel pricing for solo freight prospectors, scaling teams, and enterprise programs. Live shipment data, verified contacts, and Pulse AI from one platform.",
  path: "/pricing",
  eyebrow: "Pricing",
});

const PRICING_FAQS = [
  {
    question: "Is there a free trial?",
    answer:
      "Yes. Every account starts with a free trial — no credit card required. You get hands-on time with shipment search, contact reveals, and Pulse AI briefs so you can see whether LIT pays for itself before you pick a plan.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Monthly plans cancel at the end of the current billing period. Annual plans cancel at renewal. There are no cancellation fees and you keep access through the period you've already paid for.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards through Stripe. Scale customers can also pay by ACH or invoice on annual terms.",
  },
  {
    question: "Do you offer annual discounts?",
    answer:
      "Yes. Billing annually saves roughly 25% versus paying month to month across Starter, Growth, and Scale. Enterprise agreements are negotiated annually by default.",
  },
  {
    question: "What happens if I exceed my monthly contact reveals?",
    answer:
      "We'll notify you in-app before you hit your cap. You can either wait until the next billing cycle (caps reset automatically) or upgrade to the next tier — your reveal budget rebases instantly and we prorate the difference.",
  },
  {
    question: "Do you offer a startup or non-profit discount?",
    answer:
      "Yes. Early-stage startups (Series A and below) and registered non-profits qualify for discounted pricing on Starter and Growth. Talk to sales and we'll send you the application form.",
  },
  {
    question: "How does billing work for additional seats?",
    answer:
      "Growth includes 5 seats. Additional seats are billed at $99 per seat per month on the same cycle as your subscription. You can add or remove seats any time from your workspace settings — prorated automatically.",
  },
  {
    question: "Can I upgrade or downgrade mid-cycle?",
    answer:
      "Yes. Upgrades take effect immediately and we prorate the difference on your next invoice. Downgrades take effect at the start of your next billing period so you don't lose access to features you've already paid for.",
  },
];

export default function PricingPage() {
  const path = "/pricing";

  /* Product + Offer structured data. Prices sourced from the Supabase
   * `plans` table (price_monthly column) on 2026-05-30. Stripe remains the
   * source of truth at checkout — these values must match the products
   * linked by stripe_price_id_monthly. */
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Logistic Intel",
    description:
      "Freight prospecting platform with live shipment data, verified contacts, and Pulse AI briefs for brokers, freight forwarders, and 3PLs.",
    brand: { "@type": "Brand", name: "Logistic Intel" },
    url: siteUrl(path),
    offers: [
      {
        "@type": "Offer",
        name: "Starter",
        description:
          "For solo freight prospectors. U.S. customs shipment search, 1,000 verified contact reveals per month, and 50 Pulse AI briefs.",
        price: "125",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: siteUrl(path),
      },
      {
        "@type": "Offer",
        name: "Growth",
        description:
          "For revenue teams. 5,000 contact reveals per month, multi-channel outbound, Command Center CRM, HubSpot and Salesforce sync.",
        price: "499",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: siteUrl(path),
      },
      {
        "@type": "Offer",
        name: "Scale",
        description:
          "For multi-org programs. Unlimited contact reveals and Pulse briefs, SSO, SCIM, dedicated CSM, custom data feeds.",
        price: "999",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: siteUrl(path),
      },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PRICING_FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Pricing" },
        ]}
      />

      <PageHero
        eyebrow="Pricing"
        title="Freight prospecting that pays for itself in one booked lane."
        subtitle="Start free. Pick a plan when you're ready. Cancel anytime."
        primaryCta={{ label: "Start free trial", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Talk to sales", href: "/demo" }}
      />

      <PricingTiers />

      <PricingComparison />

      {/* Trust + proof strip */}
      <section className="px-5 sm:px-8 py-16">
        <div className="mx-auto max-w-container">
          <div className="flex flex-col items-center gap-6 text-center">
            <G2Chip rating={4.8} variant="light" category="G2 Verified" />
            <div className="flex flex-wrap items-center justify-center gap-2">
              {["SOC 2", "GDPR", "CCPA"].map((badge) => (
                <span
                  key={badge}
                  className="font-display inline-flex items-center rounded-full border border-ink-100 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-700 shadow-sm"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
        <CustomerLogosRail eyebrow="Trusted by freight teams at" />
      </section>

      <FaqSection
        eyebrow="Pricing questions"
        title="Everything teams ask before they pick a plan."
        faqs={PRICING_FAQS}
      />

      <CtaBanner
        eyebrow="Get started"
        title="Pick a plan or start a free trial."
        subtitle="See live shipment data on your accounts in under five minutes. No credit card required."
        primaryCta={{ label: "Start free trial", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Talk to sales", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </PageShell>
  );
}
