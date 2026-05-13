import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  DollarSign,
  FileText,
  Handshake,
  Mail,
  Megaphone,
  Mic,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { FaqSection } from "@/components/sections/FaqSection";
import { PartnerApplicationForm } from "@/components/sections/PartnerApplicationForm";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Partner program — earn recurring commission on logistics SaaS referrals | LIT",
  description:
    "Earn up to 30% recurring commission for 12 months when you refer logistics companies to LIT. Built for freight creators, logistics newsletters, podcasts, consultants, sales coaches, and agencies.",
  path: "/partners",
  eyebrow: "Partner program",
});

const PARTNER_BENEFITS = [
  {
    icon: DollarSign,
    title: "Up to 30% recurring",
    body: "Recurring commission for 12 months on every referred customer that converts to a paid plan. No caps on referral count.",
  },
  {
    icon: Sparkles,
    title: "Free partner account",
    body: "Approved partners get a complimentary LIT account so you can demo the product to your audience and answer questions credibly.",
  },
  {
    icon: FileText,
    title: "Co-branded materials",
    body: "Demo scripts, email templates, landing page copy, screenshots, and campaign creative ready to drop into your channel.",
  },
  {
    icon: Target,
    title: "Built for freight buyers",
    body: "LIT solves a clear pain for a defined buyer (freight forwarders, brokers, 3PLs). Easier to recommend, easier to convert.",
  },
];

const COMMISSION_EXAMPLES = [
  {
    plan: "Starter customer",
    monthly: "$99 / mo",
    yourCut: "Up to ~$29.70 / mo",
    annualTotal: "Up to ~$356 / year",
  },
  {
    plan: "Growth customer",
    monthly: "$299 / mo",
    yourCut: "Up to ~$89.70 / mo",
    annualTotal: "Up to ~$1,076 / year",
  },
  {
    plan: "Scale customer",
    monthly: "$799 / mo",
    yourCut: "Up to ~$239.70 / mo",
    annualTotal: "Up to ~$2,876 / year",
  },
];

const IDEAL_PARTNERS = [
  {
    icon: Megaphone,
    label: "Freight creators",
    body: "YouTube channels, TikTok creators, and Reels accounts covering logistics, supply chain, and freight markets.",
  },
  {
    icon: Mail,
    label: "Logistics newsletters",
    body: "Substack, Beehiiv, and email publishers with a freight-forwarder, broker, or shipper audience.",
  },
  {
    icon: Mic,
    label: "Podcast hosts",
    body: "Industry podcasts with sponsorship slots and engaged operator audiences.",
  },
  {
    icon: Users,
    label: "Consultants & coaches",
    body: "Freight sales coaches, GTM consultants, and BD advisors who recommend tooling to their clients.",
  },
  {
    icon: Target,
    label: "Marketing agencies",
    body: "Agencies serving logistics, freight forwarding, or trade-data verticals as part of a SaaS rollout.",
  },
  {
    icon: Handshake,
    label: "SaaS & referral partners",
    body: "Complementary logistics SaaS or service partners with a buyer overlap.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Apply",
    body: "Submit the form below. Tell us about your audience and how you plan to promote LIT.",
  },
  {
    step: "02",
    title: "Get approved",
    body: "Our partnerships team reviews every application within 2 business days. No automatic approval — we look for genuine fit.",
  },
  {
    step: "03",
    title: "Receive your kit",
    body: "Once approved, you get a partner account, your unique referral link, and the co-branded campaign materials.",
  },
  {
    step: "04",
    title: "Refer customers",
    body: "Share LIT with your audience using your tracked link, embedded UTMs, and the assets we provide.",
  },
  {
    step: "05",
    title: "Earn monthly",
    body: "Get recurring commission for 12 months on every converted customer. Payouts via Stripe where available.",
  },
];

const PARTNER_RESOURCES = [
  "Email templates (introduce, soft-pitch, deep-dive)",
  "Demo scripts for 30-second + 5-minute walkthroughs",
  "Landing page copy you can drop into your own site",
  "High-resolution product screenshots and brand assets",
  "Co-branded campaign creative (1:1, 9:16, 16:9)",
  "Live partner dashboard with referral tracking",
];

const FAQS = [
  {
    question: "Who can apply to the partner program?",
    answer:
      "Freight and logistics creators, newsletter publishers, podcast hosts, consultants, freight sales coaches, marketing agencies that serve the logistics vertical, and complementary SaaS or referral partners. We approve based on genuine audience fit with our buyer — freight forwarders, brokers, 3PLs, and logistics sales teams.",
  },
  {
    question: "When do commissions pay out?",
    answer:
      "Monthly, on referred customer accounts in good standing. Commission is paid for 12 months from each referred customer's conversion date. Approved partners receive payout details and a dashboard link with their welcome kit.",
  },
  {
    question: "Do partners get free access to LIT?",
    answer:
      "Yes. Approved partners get a complimentary LIT account so you can demo the product, answer questions, and create authentic content. The account is meant for your own use and content creation, not for running production prospecting on someone else's freight pipeline.",
  },
  {
    question: "Can agencies refer their clients?",
    answer:
      "Absolutely. Agencies and consultants who roll LIT into their freight or 3PL client engagements are exactly the kind of partner we want. Use your referral link on client onboarding, and you earn commission on every account you activate.",
  },
  {
    question: "Are paid ads allowed?",
    answer:
      "Branded paid ads are permitted with a partnership manager's approval. We do not allow bidding on Logistic Intel branded search terms, cybersquatting on lit/logisticintel domains, or making claims we have not approved. Reach out to partnerships@logisticintel.com before launching a paid campaign.",
  },
  {
    question: "Can partners use LIT screenshots and brand assets?",
    answer:
      "Yes — approved partners receive a brand kit with high-resolution screenshots, logos, and campaign creative ready for newsletter, social, and YouTube use. Custom co-branded assets for larger campaigns are available on request.",
  },
  {
    question: "How long does approval take?",
    answer:
      "We review every application within 2 business days. We respond either way — approvals come with the welcome kit; declines come with a reason and an open door to reapply once your channel grows or your audience fit changes.",
  },
  {
    question: "What if I am already a Logistic Intel customer?",
    answer:
      "Customers are welcome to apply. Existing customers in good standing typically get fast-tracked. Mention your account email in the notes field and we will link the application to your customer record.",
  },
];

export default function PartnersPage() {
  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Partner program" },
        ]}
      />

      {/* HERO */}
      <section className="relative px-5 sm:px-8 pt-14 pb-12 sm:pt-24 sm:pb-16">
        <div className="mx-auto max-w-content">
          <div className="lit-pill">
            <span className="dot" />
            Partner program · 30% recurring · 12 months
          </div>
          <h1 className="display-xl space-eyebrow-h1 max-w-[820px]">
            Earn recurring revenue by referring{" "}
            <span className="grad-text">logistics companies to LIT.</span>
          </h1>
          <p className="lead space-h1-intro max-w-[680px]">
            LIT helps freight forwarders, brokers, and logistics sales teams find better prospects
            using freight intelligence, company discovery, CRM workflows, and outbound tools. If
            you have an audience of freight operators, sales leaders, or logistics decision makers,
            the partner program turns recommendations into recurring revenue.
          </p>
          <div className="space-intro-cta flex flex-wrap gap-3">
            <a
              href="#apply"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              <ArrowRight className="h-4 w-4" />
              Apply now
            </a>
            <a
              href="mailto:partnerships@logisticintel.com"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
            >
              <Calendar className="h-4 w-4" />
              Talk to partnerships
            </a>
          </div>
        </div>
      </section>

      {/* WHY PARTNER WITH LIT */}
      <Section top="md" bottom="md">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">Why partner with LIT</div>
          <h2 className="display-md space-eyebrow-h1">
            A high-ticket logistics SaaS with a clear buyer and an honest pitch.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PARTNER_BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.title}
                className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
              >
                <div
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                  }}
                >
                  <Icon className="h-5 w-5 text-brand-blue-700" />
                </div>
                <div className="font-display text-[15px] font-semibold text-ink-900">{b.title}</div>
                <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">{b.body}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* COMMISSION BREAKDOWN */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mb-8 max-w-[680px]">
          <div className="eyebrow">Commission breakdown · example only</div>
          <h2 className="display-md space-eyebrow-h1">
            See what one referred customer can look like over a year.
          </h2>
          <p className="font-body mt-3 max-w-[600px] text-[14.5px] leading-relaxed text-ink-500">
            Sample math at the top-tier 30% rate. Your actual commission tier is confirmed in your
            partnership agreement; conversion rate and plan mix vary by audience. Treat these
            numbers as illustration only.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-ink-25 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
              <tr>
                <th className="px-5 py-4">Customer tier</th>
                <th className="px-5 py-4">Customer pays</th>
                <th className="px-5 py-4">Your monthly cut</th>
                <th className="px-5 py-4">Per year (12 mo)</th>
              </tr>
            </thead>
            <tbody className="font-body divide-y divide-ink-100 text-[14px] text-ink-900">
              {COMMISSION_EXAMPLES.map((row) => (
                <tr key={row.plan}>
                  <td className="font-display px-5 py-4 font-semibold">{row.plan}</td>
                  <td className="font-mono px-5 py-4 text-ink-700">{row.monthly}</td>
                  <td className="font-mono px-5 py-4 text-brand-blue-700">{row.yourCut}</td>
                  <td className="font-mono px-5 py-4 font-semibold text-brand-blue-700">
                    {row.annualTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="font-body mt-4 text-[12px] italic text-ink-500">
          Example only. Plans, pricing, and commission rates may change. Final rate and payout terms
          are confirmed in your partnership agreement.
        </p>
      </Section>

      {/* WHO IT IS FOR */}
      <Section top="md" bottom="md">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">Who it is for</div>
          <h2 className="display-md space-eyebrow-h1">
            Built for the people freight operators already listen to.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {IDEAL_PARTNERS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.label}
                className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
              >
                <div
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                  }}
                >
                  <Icon className="h-5 w-5 text-brand-blue-700" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[14.5px] font-semibold text-ink-900">
                    {p.label}
                  </div>
                  <p className="font-body mt-1 text-[13px] leading-relaxed text-ink-500">{p.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">How it works</div>
          <h2 className="display-md space-eyebrow-h1">
            Five steps from application to your first payout.
          </h2>
        </div>
        <ol className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5">
          {HOW_IT_WORKS.map((s) => (
            <li
              key={s.step}
              className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
            >
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-blue-700">
                Step {s.step}
              </div>
              <div className="font-display mt-2 text-[16px] font-semibold text-ink-900">
                {s.title}
              </div>
              <p className="font-body mt-2 text-[13px] leading-relaxed text-ink-500">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* PARTNER RESOURCES */}
      <Section top="md" bottom="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="eyebrow">Partner resources</div>
            <h2 className="display-md space-eyebrow-h1">
              You don&apos;t start from a blank page.
            </h2>
            <p className="font-body mt-4 max-w-[540px] text-[15px] leading-relaxed text-ink-700">
              Every approved partner receives the full kit on day one. Use it as-is, customize it
              for your audience, or pair it with your existing creative — whatever ships fastest.
            </p>
          </div>
          <ul className="space-y-3">
            {PARTNER_RESOURCES.map((r) => (
              <li
                key={r}
                className="flex items-start gap-3 rounded-xl border border-ink-100 bg-white px-4 py-3 shadow-sm"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <span className="font-body text-[14px] leading-snug text-ink-900">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* APPLICATION FORM */}
      <section id="apply" className="px-5 sm:px-8 py-12 sm:py-20">
        <div className="mx-auto max-w-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <div className="lit-pill">
                <span className="dot" />
                Apply now · 2-day review
              </div>
              <h2 className="display-md space-eyebrow-h1 max-w-[480px]">
                Tell us about your audience.
              </h2>
              <p className="font-body mt-4 max-w-[480px] text-[15px] leading-relaxed text-ink-700">
                We approve based on genuine audience fit. The more concrete the promotion plan, the
                faster we can decide.
              </p>
              <div className="mt-8 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
                <div className="font-display text-[12.5px] font-semibold text-ink-900">
                  Prefer email first?
                </div>
                <p className="font-body mt-1 text-[13px] leading-snug text-ink-500">
                  Reach the partnerships team directly at{" "}
                  <a
                    href="mailto:partnerships@logisticintel.com"
                    className="font-medium text-brand-blue underline"
                  >
                    partnerships@logisticintel.com
                  </a>
                  .
                </p>
              </div>
            </div>
            <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.18)] sm:p-8">
              <div className="mb-5">
                <div className="font-display flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-200">
                  <Handshake className="h-3.5 w-3.5" />
                  Partner application
                </div>
                <h3 className="font-display mt-2 text-[20px] font-semibold tracking-[-0.015em] text-ink-900">
                  Apply to the partner program
                </h3>
                <p className="font-body mt-1 text-[13px] leading-snug text-ink-500">
                  We respond within 2 business days. Required fields marked with *.
                </p>
              </div>
              <PartnerApplicationForm />
            </div>
          </div>
        </div>
      </section>

      <FaqSection eyebrow="Partner program FAQ" faqs={FAQS} />

      <CtaBanner
        eyebrow="Existing partner?"
        title="Sign in to your partner dashboard."
        subtitle="Track referrals, manage payout details, and grab fresh campaign assets."
        primaryCta={{
          label: "Sign in",
          href: "https://app.logisticintel.com/login",
          icon: "arrow",
        }}
        secondaryCta={{
          label: "Email partnerships",
          href: "mailto:partnerships@logisticintel.com",
        }}
      />

      {/* FAQ JSON-LD */}
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
