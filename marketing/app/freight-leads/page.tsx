import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import {
  LandingPageTemplate,
  type SanityLandingPageDoc,
} from "@/components/sections/LandingPageTemplate";
import { buildMetadata } from "@/lib/seo";
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { LeadMagnetHero } from "@/components/lead-magnet/LeadMagnetHero";
import { LiveProductPreview } from "@/components/lead-magnet/LiveProductPreview";
import { ProofStrip } from "@/components/lead-magnet/ProofStrip";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { PulseDigestEmailMockup } from "@/components/lead-magnet/PulseDigestEmailMockup";

export const revalidate = 600;

/**
 * /freight-leads — Sanity-driven landing page wrapped in the new
 * "money-page template" chrome (lead-magnet components). The Cowork
 * team continues to own the editable middle (proofPoints, painPoints,
 * productProof, comparisonTable, customerQuote, closing CTA) via the
 * `landingPage` doc with slug "freight-leads"; the new hero, proof
 * strip, Pulse digest mockup, outcomes band, and FAQ live in code.
 *
 * Note: LandingPageTemplate still renders its own hero from `doc.h1`
 * (we can't disable it without modifying the template, which is out of
 * scope here). The visual hero above-the-fold is now LeadMagnetHero;
 * the template's hero renders below as a secondary content block.
 * See follow-up note in PR description.
 */

const SLUG = "freight-leads";

const LANDING_PAGE_QUERY = groq`*[_type == "landingPage" && slug.current == $slug][0]{
  slug, eyebrow, h1, subhead, tldr, targetKeyword, audience,
  proofPoints, painPoints, productProof, comparisonTable,
  customerQuote, cta, faq, seo
}`;

export async function generateMetadata(): Promise<Metadata> {
  const doc = await sanityClient
    .fetch<(SanityLandingPageDoc & { seo?: any }) | null>(LANDING_PAGE_QUERY, { slug: SLUG })
    .catch(() => null);
  if (!doc) {
    return buildMetadata({
      title: "Freight Leads | LIT",
      description: "Find freight leads using shipment intelligence and verified buyer-side contacts.",
      path: `/${SLUG}`,
    });
  }
  return buildMetadata({
    title: doc.h1,
    description: doc.tldr || doc.subhead,
    path: `/${SLUG}`,
    eyebrow: doc.eyebrow,
    seo: doc.seo,
  });
}

export default async function FreightLeadsPage() {
  const doc = await sanityClient
    .fetch<SanityLandingPageDoc | null>(LANDING_PAGE_QUERY, { slug: SLUG })
    .catch(() => null);
  if (!doc) notFound();

  return (
    <>
      <StickyCTABar />

      <LeadMagnetHero
        eyebrow="Freight leads — refreshed daily from CBP"
        headline={
          <>
            Find <em>524,000+ active shippers</em> moving freight this week.
          </>
        }
        lede="Search every active US importer by lane, port, carrier, or HS code. Pull verified Logistics, Supply Chain, and Procurement contacts. Open every account with a Pulse AI brief that tells your reps what to say."
        ctaLabel="Start free →"
        formSource="freight-leads-hero"
        formNote="10 searches + 10 verified contacts on us. No credit card. Cancel anytime."
      >
        <LiveProductPreview urlBarText="app.logisticintel.com / search" pulseLabel="LIVE · CBP">
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div>
                <div className="font-display text-[13px] font-semibold text-white">
                  Walmart Inc.
                </div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/50">
                  Shenzhen → Long Beach · 312 TEU last 30d
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-brand-cyan">
                Hot
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div>
                <div className="font-display text-[13px] font-semibold text-white">
                  IKEA Supply AG
                </div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/50">
                  Ningbo → Savannah · 184 TEU last 30d
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div>
                <div className="font-display text-[13px] font-semibold text-white">
                  The Home Depot
                </div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/50">
                  Qingdao → Houston · 97 TEU last 30d
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div>
                <div className="font-display text-[13px] font-semibold text-white">
                  Target Corporation
                </div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/50">
                  Yantian → Los Angeles · 76 TEU last 30d
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">
                Active
              </span>
            </div>
          </div>
        </LiveProductPreview>
      </LeadMagnetHero>

      <ProofStrip />

      {/* Sanity-driven middle: pain points, product proof, comparison,
          customer quote, and closing CTA all render here. Note this also
          renders the template's hero (breadcrumb + doc.h1) — see file
          header comment. */}
      <LandingPageTemplate doc={doc} />

      <section className="bg-dark-1 py-20">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <PulseDigestEmailMockup />
        </div>
      </section>

      <OutcomesBand
        items={[
          {
            num: "4.1×",
            label: "More first meetings booked",
            body: "Replacing cold lists with shipment-triggered prospecting lifts reply rate from 1.4% to 5.8%.",
            cite: "Top-25 freight forwarder · 80-person sales org",
          },
          {
            num: "70%",
            label: "Less time on list-building",
            body: "From 12-hour weekly list builds to 8-minute searches. Reps spend the saved time on conversation.",
            cite: "Mid-market 3PL · 25-rep team",
          },
          {
            num: "$2.4M",
            label: "New pipeline in 60 days",
            body: "One BDR. Three lanes. Two-month ramp. Built entirely on LIT's active-shipper data.",
            cite: "NVOCC · early-stage growth team",
          },
        ]}
      />

      <MoneyPageFAQ
        emitJsonLd
        items={[
          {
            question: "What's included in the free trial?",
            answer:
              "10 company searches, 10 verified contact enrichments (email + LinkedIn + dial), full company profiles with shipment history, rate benchmarks, Pulse AI account briefs, and revenue opportunity sizing per account. No credit card required.",
          },
          {
            question: "Where does LIT's shipment data come from?",
            answer:
              "US Customs (CBP) Automated Manifest System (AMS) filings — the same source institutional data providers use — refreshed daily. We ingest ocean and air manifests across 60+ countries, normalize entity names, and join shipments to verified company records.",
          },
          {
            question: "How accurate are the contacts?",
            answer:
              "95%+ email deliverability across supply-chain titles. Every contact in the verified set has been validated against active SMTP, LinkedIn presence, and role match (Logistics, Supply Chain, Procurement, Operations, Import). Hidden contacts are revealed on enrichment.",
          },
          {
            question: "How does LIT compare to ZoomInfo or ImportGenius?",
            answer:
              "ZoomInfo is horizontal B2B intelligence with no shipment data. ImportGenius has BOL data but no contacts, no CRM, no AI. LIT joins shipment data to verified contacts, generates AI account briefs, and runs outbound — in one workspace built for freight teams.",
          },
          {
            question: "Can I cancel anytime?",
            answer:
              "Yes. The free trial includes 10 searches and 10 enrichments with no credit card on file. If you upgrade to a paid plan, you can cancel anytime — month-to-month pricing, no annual contracts required.",
          },
          {
            question: "Will LIT integrate with our CRM?",
            answer:
              "Native push to HubSpot, Salesforce, Outreach, Apollo, Salesloft, and SmartLead. Two-way sync on the paid plans. Or use LIT's built-in Command Center CRM (included with the free trial) and skip the integration entirely.",
          },
        ]}
      />

      <ExitIntentModal />
    </>
  );
}
