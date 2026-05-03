import type { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, Calendar } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { FaqSection } from "@/components/sections/FaqSection";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Pricing — built for revenue teams that hate per-seat math",
  description:
    "Simple, transparent pricing. Start free, scale as you find what works. No surprise overages — Pulse Coach gives you a heads-up before any limit.",
  path: "/pricing",
  eyebrow: "Pricing",
});

const PLANS = [
  {
    name: "Starter",
    code: "starter",
    monthly: 125,
    annual: 100,
    blurb: "For founder-led GTM and early sales teams getting up and running.",
    features: [
      "1 seat",
      "100 saved companies / month",
      "Pulse natural-language search",
      "Verified contact reveals (capped)",
      "Email + cadence sequencer",
      "Standard support",
    ],
    ctaLabel: "Start with Starter",
    ctaHref: "https://app.logisticintel.com/signup?plan=starter",
    highlight: false,
  },
  {
    name: "Growth",
    code: "growth",
    monthly: 295,
    annual: 245,
    blurb: "Most loved by 5-15 person revenue teams running outbound at scale.",
    features: [
      "3 seats included",
      "Unlimited saved companies",
      "Trade-lane watchlists & alerts",
      "Full Pulse Coach (recommendations + insights)",
      "Multichannel campaigns + intent triggers",
      "CRM integrations (HubSpot, Salesforce)",
      "Priority support",
    ],
    ctaLabel: "Start with Growth",
    ctaHref: "https://app.logisticintel.com/signup?plan=growth",
    highlight: true,
  },
  {
    name: "Scale",
    code: "scale",
    monthly: 695,
    annual: 595,
    blurb: "For sophisticated GTM teams that need API access and dedicated support.",
    features: [
      "10 seats included",
      "Everything in Growth, plus:",
      "API access + webhook events",
      "Custom HS code & lane modeling",
      "SOC 2 audit log access",
      "Dedicated CSM + onboarding",
      "Quarterly business review",
    ],
    ctaLabel: "Talk to sales",
    ctaHref: "/demo",
    highlight: false,
  },
];

const FAQS = [
  {
    question: "Can I try LIT before paying?",
    answer:
      "Yes. The free trial gives you 10 saved companies, Pulse search, and a tour of the platform — no credit card required.",
  },
  {
    question: "Are there overage fees if I exceed plan limits?",
    answer:
      "No. We don't bill overages. Pulse Coach surfaces a heads-up well before you hit a limit so you can decide whether to upgrade. If you don't, the relevant action just pauses until next billing cycle.",
  },
  {
    question: "Do contact reveals come out of a separate credit pool?",
    answer:
      "On Starter, contact reveals are capped per month. On Growth and Scale, reveals are unlimited within a fair-use envelope (we'll reach out before you'd hit anything punitive).",
  },
  {
    question: "Can I switch between annual and monthly?",
    answer:
      "Yes — you can switch any time. Going annual mid-cycle prorates the difference; going monthly takes effect at the next renewal.",
  },
  {
    question: "Do you offer discounts for non-profits or education?",
    answer:
      "We offer 30% off Growth and Scale for verified non-profits and academic institutions. Contact sales — we'll set you up after a quick verification.",
  },
];

export default function PricingPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Pricing"
        title="Pricing that scales with"
        titleHighlight="results"
        titleSuffix="not seats."
        subtitle="Simple, transparent pricing. Start free. No overage fees — Pulse Coach warns you before any limit hits."
        align="center"
      />

      <section className="px-8 pb-12">
        <div className="mx-auto max-w-container">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.code}
                className={`relative flex flex-col rounded-3xl border p-8 shadow-sm transition-all ${
                  p.highlight
                    ? "border-brand-blue/50 bg-white shadow-[0_30px_60px_-20px_rgba(37,99,235,0.25)]"
                    : "border-ink-100 bg-white"
                }`}
              >
                {p.highlight && (
                  <div
                    className="font-display absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md"
                    style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
                  >
                    Most loved
                  </div>
                )}
                <h3 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-ink-900">
                  {p.name}
                </h3>
                <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{p.blurb}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-[44px] font-semibold tracking-[-0.02em] text-ink-900">
                    ${p.annual}
                  </span>
                  <span className="font-body text-[14px] text-ink-500">/mo billed annually</span>
                </div>
                <div className="font-body text-[12.5px] text-ink-200">${p.monthly}/mo billed monthly</div>
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                      <span className="font-body text-[14px] leading-snug text-ink-700">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.ctaHref}
                  className={`font-display mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition ${
                    p.highlight
                      ? "text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
                      : "border border-ink-100 bg-white text-ink-900 hover:bg-ink-25"
                  }`}
                  style={
                    p.highlight
                      ? { background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }
                      : undefined
                  }
                >
                  {p.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-8 pb-16">
        <div className="mx-auto max-w-container">
          <div className="rounded-2xl border border-ink-100 bg-white px-7 py-6 shadow-sm">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink-200">
                  Free Trial
                </div>
                <div className="font-display mt-1 text-[18px] font-semibold text-ink-900">
                  Try LIT for free — 10 saved companies, Pulse search, no card.
                </div>
              </div>
              <Link
                href="https://app.logisticintel.com/signup"
                className="font-display inline-flex h-11 items-center gap-2 rounded-xl border border-ink-100 bg-white px-5 text-[14px] font-semibold text-ink-900 hover:bg-ink-25"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-8 pb-20">
        <div className="mx-auto max-w-container">
          <div
            className="relative overflow-hidden rounded-3xl border border-white/10 px-10 py-10 text-white"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-12 h-60 w-60 rounded-full opacity-50"
              style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
            />
            <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
              <div>
                <div
                  className="font-display text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "#00F0FF" }}
                >
                  Enterprise
                </div>
                <div className="font-display mt-2 text-[26px] font-semibold tracking-[-0.015em]">
                  Need more than Scale?
                </div>
                <p className="font-body mt-2 max-w-[640px] text-[15px] leading-relaxed text-ink-150">
                  Custom seat counts, SSO + SCIM, audit logs, custom data residency, deployed agents, and
                  white-glove onboarding. We'll build a quote that fits.
                </p>
              </div>
              <Link
                href="/demo"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.45)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.55)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                <Calendar className="h-4 w-4" />
                Talk to sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      <FaqSection faqs={FAQS} />
      <CtaBanner
        title="Still deciding?"
        subtitle="See the platform live with your accounts in 30 minutes."
        primaryCta={{ label: "Book a Demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free trial", href: "https://app.logisticintel.com/signup" }}
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
