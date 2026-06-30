import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { PulseExplorerHero } from "@/components/sections/pulse-explorer/PulseExplorerHero";
import { OpportunityScoring } from "@/components/sections/pulse-explorer/OpportunityScoring";
import { NLSearchSection } from "@/components/sections/pulse-explorer/NLSearchSection";
import { CoachSection } from "@/components/sections/pulse-explorer/CoachSection";
import { FeatureShowcase } from "@/components/sections/pulse-explorer/FeatureShowcase";
import { CapabilityBand } from "@/components/sections/pulse-explorer/CapabilityBand";
import { PulseFinalCta } from "@/components/sections/pulse-explorer/PulseFinalCta";
import { buildMetadata, siteUrl } from "@/lib/seo";

const PAGE_TITLE = "Pulse Explorer V2 — Map-First Company Intelligence | Logistic Intel";
const PAGE_DESCRIPTION =
  "78K+ U.S. shipper accounts as a living map. Opportunity scoring on every account, natural-language search, Pulse Coach AI, and branded PDF reports — find high-value shippers before your competitors.";

export const metadata: Metadata = buildMetadata({
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  path: "/company-intelligence",
  eyebrow: "Pulse Explorer V2",
});

/**
 * SoftwareApplication JSON-LD for the Pulse Explorer V2 product surface.
 * Signals to Google + AI search engines that this is a discrete product
 * page (not just marketing copy), unlocks rich-result eligibility for
 * software-listing snippets, and grounds the feature claims in
 * structured data. No fabricated aggregateRating — we don't expose
 * customer reviews on this surface yet, and faking them risks Google's
 * structured-data spam policy.
 */
const SOFTWARE_APPLICATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Pulse Explorer V2",
  alternateName: "Logistic Intel — Map-First Company Intelligence",
  description: PAGE_DESCRIPTION,
  url: siteUrl("/company-intelligence"),
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Sales Intelligence",
  operatingSystem: "Web",
  image: siteUrl(
    "/api/og?title=Pulse%20Explorer%20V2%20%E2%80%94%20Map-First%20Company%20Intelligence%20%7C%20Logistic%20Intel&eyebrow=Pulse%20Explorer%20V2",
  ),
  featureList: [
    "Map-first view of 78,000+ U.S. shipper accounts",
    "Opportunity score on every account (volume, lane fit, recency, mode mix)",
    "Natural-language search — ask in plain English, watch the map filter",
    "Pulse Coach AI for account briefs, talk tracks, and signal recaps",
    "Branded PDF executive reports per account",
    "Saved-list watchlists with shipment-change alerts",
    "HS-code, lane, and carrier filters on every map view",
    "Verified Logistics + Transportation decision-maker contacts",
  ],
  offers: {
    "@type": "Offer",
    name: "Free trial",
    description: "Start free — no credit card required.",
    price: "0",
    priceCurrency: "USD",
    url: siteUrl("/signup"),
    availability: "https://schema.org/InStock",
    category: "FreeTrial",
  },
  provider: {
    "@type": "Organization",
    name: "Logistic Intel",
    url: siteUrl("/"),
  },
  isAccessibleForFree: true,
};

/**
 * Pulse Explorer V2 — map-first sales intelligence. Rebuilt from the
 * 2026-06 handoff (Drive: MARKETING SITE). Hero hosts a real Leaflet +
 * OpenStreetMap basemap so the marketing surface matches the live
 * product UI exactly. All sections are composed top-down from
 * components/sections/pulse-explorer/ — keep new state local there, not
 * in this route file.
 */
export default function CompanyIntelligencePage() {
  return (
    <PageShell>
      {/* SoftwareApplication structured data. JSON-LD only — no visible UI. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION_JSONLD) }}
      />
      <div className="lit-page">
        <PulseExplorerHero />
        <OpportunityScoring />
        <NLSearchSection />
        <CoachSection />
        <FeatureShowcase />
        <CapabilityBand />
        <PulseFinalCta />
      </div>
    </PageShell>
  );
}
