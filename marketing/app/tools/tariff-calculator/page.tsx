import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { TariffCalculator } from "@/components/sections/TariffCalculator";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "US tariff calculator — live HTSUS rates + Section overlays | LIT",
  description:
    "Free US tariff calculator using live USITC HTSUS data. Computes MFN duty plus Section 232 (steel / aluminum / copper), Section 301 (China), and Section 122 reciprocal overlays. Sources cited inline.",
  path: "/tools/tariff-calculator",
  eyebrow: "Tariff Calculator",
});

export default function TariffCalculatorPage() {
  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Free tools", href: "/tools" },
          { label: "Tariff calculator" },
        ]}
      />
      <PageHero
        eyebrow="Free tool · Live HTSUS data"
        title="US tariff calculator —"
        titleHighlight="real rates, real overlays."
        subtitle="Pulls live MFN rates from the USITC HTSUS REST API, then layers Section 232 steel/aluminum/copper, Section 301 China lists, and the Section 122 reciprocal baseline. AD/CVD pointer included."
        align="center"
      />

      <Section top="none" bottom="md">
        <TariffCalculator />
      </Section>

      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mx-auto max-w-[760px]">
          <div className="eyebrow">How this calculator works</div>
          <h2 className="display-md space-eyebrow-h1">No invented rates.</h2>
          <p className="lead space-h1-intro">
            The MFN rate comes directly from the USITC public REST API at <code className="font-mono text-[14px] text-ink-700">hts.usitc.gov/reststop/search</code>.
            Section overlays come from a maintained config file (USTR Section 301, CBP CSMS bulletins for Section 232,
            Federal Register for Section 122). Every overlay surfaces a source URL you can click and verify.
          </p>
          <ul className="mt-6 space-y-3 text-[15px] text-ink-700">
            {[
              "MFN rate inherited from the most-specific HTSUS line with a non-empty rate (10-digit lines often inherit from 8-digit parents).",
              "FTA preferences applied automatically when the origin matches a special-rate program code (USMCA, KORUS, USSFTA, AUSFTA, US-CL, US-CO, etc.).",
              "Section 232 steel/aluminum at the 2018 Proclamation 9705/9704 rates; copper at the April 6, 2026 expansion (50% semi-finished).",
              "Section 301 China List 3 modeled at the 25% rate. Granted exclusions are NOT pre-applied — confirm with your broker.",
              "Section 122 reciprocal baseline (10%) applied to non-FTA origins; USMCA + bilateral FTA partners exempt.",
              "IEEPA tariffs are not charged — they were invalidated Feb 20, 2026 (Learning Resources v Trump). Refunds are available via CBP CAPE.",
              "AD/CVD is NOT computed — case-number specific. The calculator surfaces a notice when origin × HS chapter has active orders.",
            ].map((s) => (
              <li key={s} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-2 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section top="md" bottom="md">
        <div className="mx-auto max-w-[760px]">
          <div
            className="rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-7"
            role="note"
          >
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">
              Disclaimer
            </div>
            <p className="font-body mt-2 text-[14px] leading-relaxed text-amber-900">
              This calculator is an estimate. It is not a binding ruling, not a substitute for a customs broker, and
              not a substitute for the USITC's HTS Search at <a href="https://hts.usitc.gov/" className="underline" target="_blank" rel="noreferrer">hts.usitc.gov</a>.
              For binding classification, file CBP Form 28 / 29 or request a binding ruling at <a href="https://rulings.cbp.gov/" className="underline" target="_blank" rel="noreferrer">rulings.cbp.gov</a>.
              Granted Section 301 exclusions, AD/CVD orders, MTB suspensions, and chapter 99 program codes can
              materially change the duty owed on a specific entry.
            </p>
          </div>
        </div>
      </Section>

      <CtaBanner
        eyebrow="In the platform"
        title="Tariff math meets shipment intelligence."
        subtitle="In LIT, every importer profile pre-computes the duty stack against their actual import history — so reps walk into a call knowing the prospect's tariff exposure on every lane."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      {/* SoftwareApplication schema. The page is a working tool — not
          just a marketing description — so it gets the same SoftwareApp
          treatment Google/AI search expects from interactive utilities.
          Free + no-signup is encoded as Offer price=0. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "US Tariff Calculator — LIT",
            description:
              "Free US tariff calculator with live USITC HTSUS rates plus Section 232 (steel/aluminum/copper), Section 301 (China), and Section 122 reciprocal overlays. Sources cited per line.",
            applicationCategory: "BusinessApplication",
            applicationSubCategory: "Tariff calculator",
            operatingSystem: "Web",
            url: siteUrl("/tools/tariff-calculator"),
            featureList: [
              "Live USITC HTSUS rate lookup",
              "Section 232 steel / aluminum / copper overlays",
              "Section 301 China list 3 overlay",
              "Section 122 reciprocal baseline",
              "FTA preference auto-detection (USMCA, KORUS, USSFTA, AUSFTA, US-CL, US-CO)",
              "IEEPA refund notice with CAPE portal link",
              "AD/CVD applicability pointer to ITC ADCVDmgr",
            ],
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
            },
            publisher: {
              "@type": "Organization",
              name: "Logistic Intel",
              url: siteUrl("/"),
            },
            potentialAction: {
              "@type": "UseAction",
              target: siteUrl("/tools/tariff-calculator"),
            },
          }),
        }}
      />
    </PageShell>
  );
}
