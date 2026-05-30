import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";

export const metadata: Metadata = buildMetadata({
  title: "Our founders | Logistic Intel",
  description:
    "Twenty years of combined logistics experience — international and domestic freight forwarding, freight brokerage sales and ownership — shaped into a freight prospecting platform.",
  path: "/about/founders",
  eyebrow: "About",
});

type ExperienceCard = {
  eyebrow: string;
  value: string;
  body: string;
};

const EXPERIENCE: ExperienceCard[] = [
  {
    eyebrow: "Combined experience",
    value: "20+ years",
    body: "Two decades operating inside the freight industry — booking, quoting, selling, and managing P&L against real market cycles.",
  },
  {
    eyebrow: "Coverage",
    value: "Domestic + international",
    body: "Hands-on freight forwarding across both domestic moves and international air, ocean, and customs workflows.",
  },
  {
    eyebrow: "Operating depth",
    value: "Sales-side + ownership",
    body: "Time spent as front-line freight brokers and as owners of brokerage operations — the seller's view and the operator's view.",
  },
];

type RationaleCard = {
  title: string;
  body: string;
};

const RATIONALE: RationaleCard[] = [
  {
    title: "Lane economics that survive contact with reality.",
    body: "The team has booked enough freight to know when a quote will hold and when it will not. That shows up in how Logistic Intel ranks shippers, lanes, and timing.",
  },
  {
    title: "A workflow built around how forwarders and brokers actually sell.",
    body: "Search → contacts → outreach → CRM, in one place — because juggling four tools never scaled past a 10-rep team.",
  },
  {
    title: "An honest read on what tools matter and what does not.",
    body: "The team has spent on every category — customs data, contact databases, sequencers, dashboards. The product reflects the ones that pay back.",
  },
];

const VALUES: string[] = [
  "Freight teams ship — we ship the same way.",
  "Real customs data over inferred firmographics.",
  "Verified contacts over enriched guesses.",
  "Product that respects the buyer's time.",
];

export default function FoundersPage() {
  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Our founders | Logistic Intel",
    description:
      "Twenty years of combined logistics experience — international and domestic freight forwarding, freight brokerage sales and ownership — shaped into a freight prospecting platform.",
    url: `${SITE_URL}/about/founders`,
    isPartOf: {
      "@type": "WebSite",
      name: "Logistic Intel",
      url: SITE_URL,
    },
    about: {
      "@type": "Organization",
      name: "Logistic Intel",
      url: SITE_URL,
    },
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }}
      />

      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "About", href: "/about" },
          { label: "Founders" },
        ]}
      />

      <PageHero
        eyebrow="Our founders"
        title="Twenty years of freight,"
        titleHighlight="built into a product"
        titleSuffix="for freight people."
        subtitle="A founding team made of operators — not analysts, not adjacent observers. The product reflects what they wished existed when they were quoting lanes and chasing accounts."
        primaryCta={{ label: "See the product", href: "/", icon: "arrow" }}
        secondaryCta={{ label: "Talk to us", href: "/contact" }}
      />

      {/* Experience profile — three KPI-style cards */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="eyebrow">Experience profile</div>
          <h2 className="display-md space-eyebrow-h1">
            The credentials are <span className="grad-text">freight, not finance.</span>
          </h2>
          <p className="lead space-h1-intro mx-auto max-w-[560px]">
            We lead with the operating experience because that is what shaped the product.
            Names and bios are less interesting than where the team has actually stood.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {EXPERIENCE.map((card) => (
            <div
              key={card.eyebrow}
              className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm"
            >
              <div className="lit-pill">
                <span className="dot" />
                {card.eyebrow}
              </div>
              <div className="font-display mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink-900">
                {card.value}
              </div>
              <p className="font-body mt-3 text-[14.5px] leading-relaxed text-ink-500">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* What this means for the product */}
      <Section top="md" bottom="md">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="eyebrow">What this means for the product</div>
          <h2 className="display-md space-eyebrow-h1">
            Operator experience, <span className="grad-text">in the product</span>.
          </h2>
          <p className="lead space-h1-intro mx-auto max-w-[560px]">
            Twenty years of booking, quoting, and selling freight does not stay on a
            resume — it shows up in what the platform ranks, surfaces, and ignores.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {RATIONALE.map((card, i) => (
            <div
              key={card.title}
              className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="display-sm mt-2 leading-tight">{card.title}</h3>
              <p className="font-body mt-3 text-[14.5px] leading-relaxed text-ink-500">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Story arc — narrative */}
      <Section top="md" bottom="md" tone="tint">
        <div className="mx-auto max-w-[820px]">
          <div className="eyebrow">The story</div>
          <h2 className="display-lg space-eyebrow-h1">
            Built because the team needed it first.
          </h2>
          <div className="font-body mt-6 space-y-5 text-[17px] leading-[1.7] text-ink-700">
            <p>
              The founding team built Logistic Intel because of an itch they could not
              scratch from inside a forwarder or brokerage seat — the gap between knowing
              a shipment moved and being able to act on it before a competitor did.
            </p>
            <p>
              The existing tools never quite fit. Customs datasets were powerful but lived
              in their own tab. Contact databases were broad but had no sense of which
              accounts were actually moving freight this quarter. CRMs assumed the
              homework was already done. Outbound sequencers assumed someone else had
              picked the right shippers. The work of tying it all together fell on the
              rep — and the rep is busy quoting.
            </p>
            <p>
              Logistic Intel is built differently because the people building it have
              done the work. Real shipment data sits next to verified contacts, which
              sits next to outreach, which sits next to a CRM that already knows the
              account. The path from a signal to a meeting is short on purpose.
            </p>
            <p className="text-ink-900">
              It is built for the teams that already know freight: forwarders, brokers,
              NVOCCs, and 3PLs.
            </p>
          </div>
        </div>
      </Section>

      {/* Team values band */}
      <Section top="md" bottom="md">
        <div className="mx-auto max-w-[820px]">
          <div className="eyebrow">How the team operates</div>
          <h2 className="display-md space-eyebrow-h1">
            Four lines that shape <span className="grad-text">every decision.</span>
          </h2>
          <ul className="mt-8 space-y-3">
            {VALUES.map((v) => (
              <li
                key={v}
                className="flex items-start gap-3 rounded-xl border border-ink-100 bg-white px-5 py-4 shadow-sm"
              >
                <span
                  aria-hidden
                  className="mt-2 inline-block h-1.5 w-1.5 flex-none rounded-full bg-brand-blue"
                />
                <span className="font-body text-[15.5px] leading-relaxed text-ink-700">
                  {v}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Rail: about + careers */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mx-auto max-w-[820px]">
          <div className="eyebrow">Keep reading</div>
          <h2 className="display-md space-eyebrow-h1">More from the team.</h2>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              href="/about"
              className="group rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
            >
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
                About
              </div>
              <div className="font-display mt-2 text-[18px] font-semibold tracking-[-0.015em] text-ink-900">
                More about us
              </div>
              <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">
                The company story, principles, and where Logistic Intel is going.
              </p>
              <span className="font-display mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                Visit the about page
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>

            <Link
              href="/careers"
              className="group rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
            >
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
                Careers
              </div>
              <div className="font-display mt-2 text-[18px] font-semibold tracking-[-0.015em] text-ink-900">
                Working at LIT
              </div>
              <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">
                How the team works, what we hire for, and how to send a real artifact.
              </p>
              <span className="font-display mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                See careers
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </div>
        </div>
      </Section>

      <CtaBanner
        eyebrow="See the platform"
        title="Want to see what twenty years of freight builds?"
        subtitle="A live tour of the product — search, contacts, outreach, and CRM, all sitting next to real shipment data."
        primaryCta={{ label: "Start free trial", href: "/signup", icon: "arrow" }}
        secondaryCta={{ label: "Talk to the team", href: "/contact" }}
      />
    </PageShell>
  );
}
