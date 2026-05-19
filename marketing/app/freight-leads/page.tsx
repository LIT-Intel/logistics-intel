import type { Metadata } from "next";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { buildMetadata } from "@/lib/seo";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { LeadMagnetHero } from "@/components/lead-magnet/LeadMagnetHero";
import { LiveProductPreview } from "@/components/lead-magnet/LiveProductPreview";
import { ProofStrip } from "@/components/lead-magnet/ProofStrip";
import { MoneyPageOfferGrid } from "@/components/lead-magnet/MoneyPageOfferGrid";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { TestimonialTrio } from "@/components/lead-magnet/TestimonialTrio";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { PulseDigestEmailMockup } from "@/components/lead-magnet/PulseDigestEmailMockup";
import { FinalCtaBand } from "@/components/lead-magnet/FinalCtaBand";

export const revalidate = 600;

/**
 * /freight-leads — canonical money page. Structure per Claude-Design
 * HANDOFF.md §2: sticky CTA → hero → proof strip → 6-card offer grid →
 * Pulse digest mockup → outcomes band → testimonials → FAQ → final CTA.
 *
 * Sanity is consulted only for SEO metadata. All page content lives in
 * code so it can't drift from the design system. DO NOT re-introduce
 * LandingPageTemplate here — it owns its own MoneyPageShell and would render
 * a second nav below the hero.
 */

const SLUG = "freight-leads";

const SEO_QUERY = groq`*[_type == "landingPage" && slug.current == $slug][0]{
  h1, subhead, tldr, eyebrow, seo
}`;

export async function generateMetadata(): Promise<Metadata> {
  const doc = await sanityClient
    .fetch<any | null>(SEO_QUERY, { slug: SLUG })
    .catch(() => null);
  return buildMetadata({
    title: doc?.h1 || "Freight Leads — 524,000 active US shippers",
    description:
      doc?.tldr ||
      doc?.subhead ||
      "Find 524,000+ active US shippers, verified contacts, ocean rate benchmarks, and revenue opportunity per account. Start free.",
    path: `/${SLUG}`,
    eyebrow: doc?.eyebrow,
    seo: doc?.seo,
  });
}

export default function FreightLeadsPage() {
  return (
    <>
      <StickyCTABar />
      <MoneyPageShell>
        <LeadMagnetHero
          eyebrow="Freight leads — refreshed daily from CBP"
          headline={
            <>
              Find <em>524,000+ active shippers</em> moving freight this week.
            </>
          }
          lede="Search every active US importer by lane, port, carrier, or HS code. Get verified decision-maker contacts. See what they pay for ocean freight. Size every account by addressable revenue — all on one screen."
          ctaLabel="Start free →"
          formSource="freight-leads-hero"
          formNote="10 searches + 10 verified contacts on us. No credit card. Cancel anytime."
        >
          <LiveProductPreview urlBarText="app.logisticintel.com / search" pulseLabel="LIVE · CBP">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-cyan">
              Try it now — search any lane or industry
            </p>
            <div className="space-y-2">
              {[
                { initial: "T", name: "Tesla, Inc.", meta: "Automotive · TR → US · 7,862 ship · 18.9K TEU" },
                { initial: "A", name: "Anker Innovations", meta: "Electronics · CN → US · 4,210 ship · 9.1K TEU" },
                { initial: "V", name: "VinFast Auto", meta: "EV · VN → US · 1,944 ship · 5.7K TEU" },
                { initial: "L", name: "LG Energy Solution", meta: "Batteries · KR → US · 3,128 ship · 7.2K TEU" },
              ].map((row) => (
                <div
                  key={row.name}
                  className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#1e293b] to-[#0f172a] font-display text-[13px] font-bold text-brand-cyan">
                    {row.initial}
                  </div>
                  <div>
                    <div className="font-display text-[14px] font-semibold text-white">
                      {row.name}
                    </div>
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/55">
                      {row.meta}
                    </div>
                  </div>
                  <span className="rounded bg-emerald-500/15 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-400">
                    Active
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3.5 flex items-center justify-between border-t border-white/10 pt-3.5 font-mono text-[11px] text-white/45">
              <span>Showing 4 of 1,247 matches</span>
              <a href="#start" className="font-display font-semibold text-brand-cyan hover:text-white">
                Start free to see all →
              </a>
            </div>
          </LiveProductPreview>
        </LeadMagnetHero>

        <ProofStrip />

        <MoneyPageOfferGrid
          eyebrow="What's in the free trial"
          heading="Everything ZoomInfo gives you — built for freight, free for 14 days."
          body="10 searches. 10 verified contact enrichments. Every account comes with a full shipment profile, rate benchmark, AI brief, and revenue opportunity. No credit card required."
          cards={[
            {
              check: "Includes",
              title: "10 active-shipper searches",
              body: "Filter 524K+ live importers by lane, port, carrier, HS code, mode, or industry.",
              span: 2,
              tone: "dark",
            },
            {
              check: "Per account",
              title: "Full company profile + supply-chain intel",
              body: "Shipment history, top trade lanes, carrier mix, container split, monthly cadence — refreshed daily from CBP.",
              span: 4,
            },
            {
              check: "Decision makers",
              title: "10 verified contact enrichments",
              body: "Right titles in the right roles — VP Supply Chain, Director of Logistics, Import Manager, Procurement. Email + LinkedIn + dial.",
              span: 3,
            },
            {
              check: "Pricing intel",
              title: "Ocean rate benchmark per account",
              body: "See what each shipper pays for ocean freight on their actual lanes. Matched to FBX reference rates, refreshed weekly.",
              span: 3,
            },
            {
              check: "AI brief",
              title: "Pulse AI account intelligence",
              body: "Executive summary, opportunity signals (buying, displacement, carrier, supplier), and a ready-to-send outreach hook — cited sources, 95% confidence.",
              span: 3,
              tone: "dark",
            },
            {
              check: "Pipeline sizing",
              title: "Revenue opportunity per account",
              body: "Total addressable freight spend, sized by service line. See what an account is worth before you call.",
              span: 3,
            },
          ]}
        />

        <section className="bg-gradient-to-b from-[#020617] to-[#0b1230] py-20 sm:py-24">
          <div className="mx-auto max-w-content px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
              <div>
                <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-brand-cyan">
                  Pulse alerts — included in free trial
                </p>
                <h2 className="font-display text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.06] tracking-[-0.025em] text-white text-balance">
                  Get notified the week a shipper changes — before anyone else.
                </h2>
                <p className="mt-4 max-w-lg text-[17px] leading-[1.55] text-white/70">
                  Save companies to your watchlist and Pulse emails you every Monday with what changed: new lanes activated, volume up or down, forwarder displaced, fresh revenue opportunity. No dashboards to check. No alerts to set up. It just shows up.
                </p>
              </div>
              <PulseDigestEmailMockup />
            </div>
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

        <TestimonialTrio
          quotes={[
            {
              quote: "We dropped ZoomInfo six months in. Our reps were reaching out to companies that hadn't moved a container in three years. LIT only shows live shippers. Reply rates more than doubled.",
              initials: "MR",
              name: "Marisol R.",
              role: "VP Growth · Freight Forwarder, NA",
              metric: "2.4× reply rate · 80-person sales org",
            },
            {
              quote: "The contact match rate is the real differentiator. Right person, right role, right email. We're booking demos in industries we couldn't crack with Apollo.",
              initials: "DK",
              name: "David K.",
              role: "Head of Sales · Top-50 NVOCC",
              metric: "94% email deliverability across 4,200 sends",
            },
            {
              quote: "Revenue opportunity sizing changed how we run discovery calls. Walking in knowing the account is worth $46M in freight spend lets us go big from minute one.",
              initials: "SH",
              name: "Sarah H.",
              role: "Director of Enterprise Sales · 3PL",
              metric: "$2.4M pipeline built in 60 days, 1 BDR",
            },
          ]}
        />

        <MoneyPageFAQ
          emitJsonLd
          items={[
            { question: "What's included in the free trial?", answer: "10 company searches, 10 verified contact enrichments (email + LinkedIn + dial), full company profiles with shipment history, rate benchmarks, Pulse AI account briefs, and revenue opportunity sizing per account. No credit card required." },
            { question: "Where does LIT's shipment data come from?", answer: "US Customs (CBP) Automated Manifest System (AMS) filings — the same source institutional data providers use — refreshed daily. We ingest ocean and air manifests across 60+ countries, normalize entity names, and join shipments to verified company records." },
            { question: "How accurate are the contacts?", answer: "95%+ email deliverability across supply-chain titles. Every contact in the verified set has been validated against active SMTP, LinkedIn presence, and role match (Logistics, Supply Chain, Procurement, Operations, Import). Hidden contacts are revealed on enrichment." },
            { question: "How is this different from ZoomInfo or Apollo?", answer: "ZoomInfo and Apollo are horizontal B2B intelligence with no shipment data. They tell you who exists; LIT tells you who actively ships. We join verified contacts to live BOL records so you only ever reach out to companies actively moving freight — and we add rate benchmarks, AI briefs, and revenue sizing on top." },
            { question: "How is this different from ImportGenius or Panjiva?", answer: "ImportGenius and Panjiva have BOL data but stop there — no contacts, no AI, no CRM, no outbound. LIT layers verified decision-maker contacts, Pulse AI account briefs, rate benchmarks, and revenue opportunity sizing on top of comparable shipment coverage. One workspace, not five." },
            { question: "Can I cancel anytime?", answer: "Yes. The free trial includes 10 searches and 10 enrichments with no credit card on file. If you upgrade to a paid plan, you can cancel anytime — month-to-month pricing, no annual contracts." },
            { question: "Will LIT integrate with our CRM?", answer: "Native push to HubSpot, Salesforce, Outreach, Apollo, Salesloft, and SmartLead. Two-way sync on the paid plans. Or use LIT's built-in Command Center CRM (included with the free trial) and skip the integration entirely." },
          ]}
        />

        <FinalCtaBand
          heading="Start free. See your first 10 active shippers in 30 seconds."
          body="10 searches. 10 verified contacts. Full account profiles with shipment data, rate benchmarks, AI briefs, and revenue opportunity. No credit card."
          ctaLabel="Start free →"
          formSource="freight-leads-final"
        />
      </MoneyPageShell>
      <ExitIntentModal />
    </>
  );
}
