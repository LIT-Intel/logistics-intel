import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Mail,
  Download,
  ImageIcon,
  Type as TypeIcon,
  Palette,
  Newspaper,
  Building2,
} from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Press & media kit | Logistic Intel",
  description:
    "Press kit, brand assets, fact sheet, and contact information for Logistic Intel — freight prospecting software for brokers, forwarders, and 3PLs.",
  path: "/press",
  eyebrow: "Press",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";

const FACTS: { label: string; value: string; sub?: string }[] = [
  {
    label: "Founded",
    value: "2024",
    sub: "Operator-grade revenue intelligence for global trade.",
  },
  {
    label: "Headquarters",
    value: "United States",
    sub: "Remote-first team. Customers in 14 countries.",
  },
  {
    label: "Focus",
    value: "Freight revenue",
    sub: "Prospecting software for brokers, forwarders, 3PLs, and NVOCCs.",
  },
];

type BrandAsset = {
  name: string;
  format: string;
  description: string;
  href?: string;
  preview:
    | "icon-glow"
    | "favicon"
    | "wordmark-light"
    | "wordmark-dark"
    | "lockup-light"
    | "lockup-dark"
    | "palette"
    | "typography";
  available: boolean;
};

const BRAND_ASSETS: BrandAsset[] = [
  {
    name: "Logomark — primary",
    format: "SVG",
    description: "Glow logomark on dark surface. Use at 24px and above.",
    href: "/lit-icon-glow.svg",
    preview: "icon-glow",
    available: true,
  },
  {
    name: "Logomark — outline",
    format: "SVG",
    description: "Single-color outline mark. Use for favicons and tiny scales.",
    href: "/favicon.svg",
    preview: "favicon",
    available: true,
  },
  {
    name: "Wordmark — light",
    format: "SVG",
    description: "Logistic Intel wordmark for use on light backgrounds.",
    href: "/brand/wordmark-light.svg",
    preview: "wordmark-light",
    available: true,
  },
  {
    name: "Wordmark — dark",
    format: "SVG",
    description: "Logistic Intel wordmark for use on dark backgrounds.",
    href: "/brand/wordmark-dark.svg",
    preview: "wordmark-dark",
    available: true,
  },
  {
    name: "Lockup — light",
    format: "SVG",
    description: "Horizontal lockup (mark + wordmark) for light backgrounds.",
    href: "/brand/lockup-light.svg",
    preview: "lockup-light",
    available: true,
  },
  {
    name: "Lockup — dark",
    format: "SVG",
    description: "Horizontal lockup (mark + wordmark) for dark backgrounds.",
    href: "/brand/lockup-dark.svg",
    preview: "lockup-dark",
    available: true,
  },
  {
    name: "Brand colors",
    format: "Palette",
    description: "Brand blue, cyan, deep ink, and canvas swatches.",
    preview: "palette",
    available: true,
  },
  {
    name: "Typography",
    format: "Type system",
    description: "Space Grotesk display, DM Sans body, JetBrains Mono numerics.",
    preview: "typography",
    available: true,
  },
];

function AssetPreview({ kind }: { kind: BrandAsset["preview"] }) {
  if (kind === "icon-glow") {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl bg-dark-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lit-icon-glow.svg" alt="" className="h-12 w-12" />
      </div>
    );
  }
  if (kind === "favicon") {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-ink-100 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.svg" alt="" className="h-12 w-12" />
      </div>
    );
  }
  if (kind === "wordmark-light") {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-ink-100 bg-white px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wordmark-light.svg" alt="" className="h-8 w-auto" />
      </div>
    );
  }
  if (kind === "wordmark-dark") {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl bg-dark-0 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wordmark-dark.svg" alt="" className="h-8 w-auto" />
      </div>
    );
  }
  if (kind === "lockup-light") {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-ink-100 bg-white px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-light.svg" alt="" className="h-10 w-auto" />
      </div>
    );
  }
  if (kind === "lockup-dark") {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl bg-dark-0 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-dark.svg" alt="" className="h-10 w-auto" />
      </div>
    );
  }
  if (kind === "palette") {
    return (
      <div className="flex h-24 items-stretch gap-1 overflow-hidden rounded-xl border border-ink-100">
        <div className="flex-1" style={{ background: "#2563EB" }} title="brand-blue #2563EB" />
        <div className="flex-1" style={{ background: "#00F0FF" }} title="brand-cyan #00F0FF" />
        <div className="flex-1" style={{ background: "#020617" }} title="dark-0 #020617" />
        <div className="flex-1" style={{ background: "#0F172A" }} title="ink-900 #0F172A" />
      </div>
    );
  }
  // typography
  return (
    <div className="grid h-24 grid-rows-3 items-center rounded-xl border border-ink-100 bg-white px-4">
      <div className="font-display text-[15px] font-semibold tracking-[-0.015em] text-ink-900">
        Space Grotesk — display
      </div>
      <div className="font-body text-[13px] text-ink-700">DM Sans — body</div>
      <div className="font-mono text-[12px] text-ink-500">JetBrains Mono — numerics</div>
    </div>
  );
}

function BrandAssetCard({ asset }: { asset: BrandAsset }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <AssetPreview kind={asset.preview} />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
            {asset.name}
          </h3>
          <p className="font-body mt-1 text-[13px] leading-relaxed text-ink-500">
            {asset.description}
          </p>
          <div className="font-mono mt-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">
            {asset.format}
          </div>
        </div>
      </div>
      <div className="mt-4">
        {asset.available && asset.href ? (
          <a
            href={asset.href}
            download
            className="font-display inline-flex h-9 items-center gap-2 rounded-xl border border-ink-100 bg-white px-4 text-[13px] font-semibold text-ink-900 transition hover:border-brand-blue/30 hover:bg-ink-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        ) : asset.available ? (
          <span className="font-display inline-flex h-9 items-center gap-2 rounded-xl border border-ink-100 bg-ink-50 px-4 text-[13px] font-semibold text-ink-700">
            Reference only
          </span>
        ) : (
          <span className="font-display inline-flex h-9 items-center gap-2 rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 text-[13px] font-semibold text-ink-400">
            Coming soon
          </span>
        )}
      </div>
    </div>
  );
}

export default function PressPage() {
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Logistic Intel",
    url: SITE_URL,
    logo: `${SITE_URL}/lit-icon-glow.svg`,
    description:
      "Logistic Intel is a freight revenue intelligence platform for brokers, forwarders, 3PLs, and NVOCCs — combining shipment data, company intelligence, and CRM workflows in one system.",
    sameAs: [
      "https://twitter.com/logisticintel",
      "https://www.linkedin.com/company/logistic-intel",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "press relations",
        email: "press@logisticintel.com",
        availableLanguage: ["English"],
        url: `${SITE_URL}/press`,
      },
    ],
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />

      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Press" },
        ]}
      />

      <PageHero
        eyebrow="Press & media"
        title="Press kit, brand assets, and"
        titleHighlight="recent coverage."
        subtitle="Writing about freight tech, trade data, or revenue intelligence? We're happy to help with quotes, demos, screenshots, and background — usually within one business day."
        primaryCta={{
          label: "Contact press",
          href: "mailto:press@logisticintel.com",
          icon: "arrow",
        }}
        secondaryCta={{ label: "Download brand assets", href: "#brand-assets" }}
      />

      {/* Fact strip — light, low-density */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {FACTS.map((f) => (
            <div
              key={f.label}
              className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
            >
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
                {f.label}
              </div>
              <div className="font-display mt-3 text-[24px] font-semibold tracking-[-0.02em] text-ink-900">
                {f.value}
              </div>
              {f.sub && (
                <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">
                  {f.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Elevator pitch */}
      <Section top="md" bottom="md">
        <div className="mx-auto max-w-[820px]">
          <div className="eyebrow">About Logistic Intel</div>
          <h2 className="display-lg space-eyebrow-h1">
            What we do, in one paragraph.
          </h2>
          <div className="font-body mt-6 space-y-5 text-[17px] leading-[1.7] text-ink-700">
            <p>
              Logistic Intel is a revenue intelligence platform built for global trade.
              We combine shipment data, company intelligence, and CRM workflows into one
              system so freight brokers, forwarders, 3PLs, and NVOCCs can find the right
              accounts, reach the right people, and run outbound on real signal — not
              stale lists.
            </p>
            <p>
              The product pairs a customs and trade-flow dataset with Pulse Coach, an
              AI layer that watches accounts and surfaces what changed and what to do
              about it. Revenue teams use LIT to move from signal to action without
              leaving the page.
            </p>
          </div>
        </div>
      </Section>

      {/* Recent coverage — empty state */}
      <Section id="coverage" top="md" bottom="md" tone="tint">
        <div className="mx-auto max-w-[820px]">
          <div className="eyebrow">Recent coverage</div>
          <h2 className="display-md space-eyebrow-h1">
            Press and analyst mentions.
          </h2>
          <div className="mt-8 rounded-2xl border border-dashed border-ink-200 bg-white p-8 sm:p-10">
            <div
              className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: "rgba(37,99,235,0.08)",
                boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
              }}
            >
              <Newspaper className="h-5 w-5 text-brand-blue" />
            </div>
            <h3 className="display-sm">No press coverage to share yet.</h3>
            <p className="font-body mt-3 text-[15px] leading-relaxed text-ink-500">
              Recent press mentions and analyst coverage will appear here as it lands.
              Journalists writing about freight tech, trade data, or B2B revenue
              software — we&apos;d love to talk.
            </p>
            <a
              href="mailto:press@logisticintel.com"
              className="font-display mt-5 inline-flex items-center gap-2 text-[13px] font-semibold text-brand-blue hover:text-brand-blue-700"
            >
              <Mail className="h-3.5 w-3.5" />
              press@logisticintel.com
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </Section>

      {/* Brand assets */}
      <Section id="brand-assets" top="md" bottom="md">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr,2fr] lg:gap-16">
          <div>
            <div className="eyebrow">Brand assets</div>
            <h2 className="display-md space-eyebrow-h1">
              Logos, colors, and{" "}
              <span className="grad-text">type.</span>
            </h2>
            <p className="font-body mt-4 text-[15px] leading-relaxed text-ink-500">
              SVGs scale cleanly at any size. Please don&apos;t recolor, stretch, or
              alter the marks. For anything else, email{" "}
              <a
                href="mailto:press@logisticintel.com"
                className="font-medium text-brand-blue underline"
              >
                press@logisticintel.com
              </a>
              .
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[12px] text-ink-500">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-brand-blue" />
                Logos
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5">
                <Palette className="h-3.5 w-3.5 text-brand-blue" />
                Colors
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5">
                <TypeIcon className="h-3.5 w-3.5 text-brand-blue" />
                Typography
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
            {BRAND_ASSETS.map((a) => (
              <BrandAssetCard key={a.name} asset={a} />
            ))}
          </div>
        </div>
      </Section>

      {/* Leadership / press contact directory */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mx-auto max-w-[820px]">
          <div className="eyebrow">Leadership</div>
          <h2 className="display-md space-eyebrow-h1">Press contact.</h2>
          <p className="font-body mt-4 text-[15px] leading-relaxed text-ink-500">
            For interviews, quotes, demos, screenshots, or background — please reach
            out to the press inbox. We&apos;ll route to the right person on the
            leadership team.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
              <div
                className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: "rgba(37,99,235,0.08)",
                  boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                }}
              >
                <Mail className="h-5 w-5 text-brand-blue" />
              </div>
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
                Press inquiries
              </div>
              <div className="font-display mt-2 text-[18px] font-semibold tracking-[-0.015em] text-ink-900">
                Logistic Intel press team
              </div>
              <a
                href="mailto:press@logisticintel.com"
                className="font-display mt-3 inline-flex items-center gap-2 text-[14px] font-semibold text-brand-blue hover:text-brand-blue-700"
              >
                press@logisticintel.com
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
              <div
                className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: "rgba(37,99,235,0.08)",
                  boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                }}
              >
                <Building2 className="h-5 w-5 text-brand-blue" />
              </div>
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
                Partnerships
              </div>
              <div className="font-display mt-2 text-[18px] font-semibold tracking-[-0.015em] text-ink-900">
                Co-marketing & integrations
              </div>
              <Link
                href="/contact"
                className="font-display mt-3 inline-flex items-center gap-2 text-[14px] font-semibold text-brand-blue hover:text-brand-blue-700"
              >
                Contact the team
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <CtaBanner
        eyebrow="Press inquiries"
        title="On deadline? We can move fast."
        subtitle="Quotes, demos, screenshots, custom data pulls — usually within one business day. Email the press team directly."
        primaryCta={{
          label: "Email press team",
          href: "mailto:press@logisticintel.com",
          icon: "arrow",
        }}
        secondaryCta={{ label: "About LIT", href: "/about" }}
      />
    </PageShell>
  );
}
