import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { PulseExplorerHero } from "@/components/sections/pulse-explorer/PulseExplorerHero";
import { OpportunityScoring } from "@/components/sections/pulse-explorer/OpportunityScoring";
import { NLSearchSection } from "@/components/sections/pulse-explorer/NLSearchSection";
import { CoachSection } from "@/components/sections/pulse-explorer/CoachSection";
import { FeatureShowcase } from "@/components/sections/pulse-explorer/FeatureShowcase";
import { CapabilityBand } from "@/components/sections/pulse-explorer/CapabilityBand";
import { PulseFinalCta } from "@/components/sections/pulse-explorer/PulseFinalCta";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Pulse Explorer V2 — Map-First Company Intelligence | Logistic Intel",
  description:
    "78K+ U.S. shipper accounts as a living map. Opportunity scoring on every account, natural-language search, Pulse Coach AI, and branded PDF reports — find high-value shippers before your competitors.",
  path: "/company-intelligence",
  eyebrow: "Pulse Explorer V2",
});

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
