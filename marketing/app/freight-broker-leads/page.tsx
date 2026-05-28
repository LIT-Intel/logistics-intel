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
import { FinalCtaBand } from "@/components/lead-magnet/FinalCtaBand";

export const revalidate = 600;

const SLUG = "freight-broker-leads";

const SEO_QUERY = groq`*[_type == "landingPage" && slug.current == $slug][0]{
  h1, subhead, tldr, eyebrow, seo
}`;

/**
 * Tighten an H1 (which may include <em>/<strong> HTML for visual highlight)
 * down to a meta-title-safe string ≤60 chars. Strips tags + entity-decodes
 * &amp;, then clips with ellipsis if needed.
 */
function tightenH1(h1: string | undefined, max = 60): string | undefined {
  if (!h1) return undefined;
  const stripped = h1.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
  return stripped.length > max ? `${stripped.slice(0, max - 1).trimEnd()}…` : stripped;
}

export async function generateMetadata(): Promise<Metadata> {
  const doc = await sanityClient
    .fetch<any | null>(SEO_QUERY, { slug: SLUG })
    .catch(() => null);
  return buildMetadata({
    title:
      doc?.seo?.metaTitle ||
      tightenH1(doc?.h1) ||
      "Freight Broker Leads — Domestic shippers with consistent volume",
    description:
      doc?.tldr ||
      doc?.subhead ||
      "Find US importers running consistent domestic truckload volume. Verified Logistics, Transportation, and Operations contacts. Built for freight brokers and 3PLs. Start free.",
    path: `/${SLUG}`,
    eyebrow: doc?.eyebrow,
    seo: doc?.seo,
  });
}

export default function FreightBrokerLeadsPage() {
  return (
    <>
      <StickyCTABar />
      <MoneyPageShell>
        <LeadMagnetHero
          eyebrow="Built for freight brokers · CBP-grade data"
          headline={
            <>
              Match capacity to <strong>shippers with consistent volume</strong>.
            </>
          }
          lede="Stop chasing one-off loads. LIT surfaces US importers running predictable domestic truckload + LTL volume — joined to verified Transportation and Logistics decision makers. Built for freight broker outbound."
          ctaLabel="Start free →"
          formSource="freight-broker-leads-hero"
          formNote="10 searches + 10 verified contacts on us. No credit card. Cancel anytime."
        >
          <LiveProductPreview urlBarText="app.logisticintel.com / search" pulseLabel="LIVE · CBP">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-400">
              Active shippers · domestic TL · 50+ loads/mo
            </p>
            <div className="space-y-2">
              {[
                { initial: "H", name: "Home Depot Supply", meta: "Retail · domestic TL · 1,240 loads · LA→Atlanta" },
                { initial: "T", name: "Tractor Supply Co.", meta: "Retail · TL+LTL · 487 loads · DFW→Memphis" },
                { initial: "P", name: "PetSmart, LLC", meta: "Retail · domestic TL · 312 loads · LA→Phoenix" },
                { initial: "U", name: "Under Armour Inc.", meta: "Apparel · TL+LTL · 218 loads · Baltimore→ATL" },
              ].map((row) => (
                <div
                  key={row.name}
                  className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#1e293b] to-[#0f172a] font-display text-[13px] font-bold text-cyan-400">
                    {row.initial}
                  </div>
                  <div>
                    <div className="font-display text-[14px] font-semibold text-white">{row.name}</div>
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/55">{row.meta}</div>
                  </div>
                  <span className="rounded bg-emerald-500/15 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-400">
                    Active
                  </span>
                </div>
              ))}
            </div>
          </LiveProductPreview>
        </LeadMagnetHero>

        <ProofStrip />

        <MoneyPageOfferGrid
          eyebrow="What's in the free trial"
          heading="Built around how brokers actually sell."
          body="10 searches. 10 verified contacts. Targeted at active US importers running consistent domestic volume. No credit card."
          cards={[
            { check: "Includes", title: "10 capacity-matched searches", body: "Filter shippers by domestic lane, mode (TL/LTL/intermodal), origin DC, destination region, or commodity.", span: 2, tone: "dark" },
            { check: "Decision makers", title: "10 verified contact enrichments", body: "Transportation Director, Logistics Manager, Procurement, Operations. Email + LinkedIn + dial. 95%+ deliverability.", span: 4 },
            { check: "Per account", title: "Domestic load history", body: "Origin DC, destination region, average loads/month, mode mix, current carrier. Refreshed daily.", span: 3 },
            { check: "Pricing intel", title: "Rate benchmarks by lane", body: "See what each shipper pays per mile on their active lanes. Matched to spot + contract reference rates.", span: 3 },
            { check: "Capacity signals", title: "Carrier displacement alerts", body: "Pulse flags accounts where the incumbent broker pivoted in the last 90 days. Warm. Pre-negotiation.", span: 3, tone: "dark" },
            { check: "Pipeline sizing", title: "Revenue opportunity per account", body: "Total addressable domestic freight spend by service line. Walk in knowing the size of the prize.", span: 3 },
          ]}
        />

        <OutcomesBand
          items={[
            { num: "3.6×", label: "More booked first meetings", body: "Replacing cold lists with consistent-volume shipper targets lifts reply rates on broker outbound.", cite: "Mid-market freight brokerage · 30-rep team" },
            { num: "12%", label: "Carrier-pivot rate / yr", body: "About 1 in 8 US importers switches their primary broker each year. Pulse alerts catch them the week it happens.", cite: "LIT internal data · trailing 12 months" },
            { num: "$1.8M", label: "New pipeline in 60 days", body: "Two BDRs. Five domestic lanes. 60-day ramp. Built entirely on LIT's active-shipper data.", cite: "Freight brokerage · 45-rep growth org" },
          ]}
        />

        <TestimonialTrio
          quotes={[
            { quote: "We were getting destroyed in cold outbound. Switching to lane-filtered LIT lists let us actually talk to the right people. Reply rates went from 2% to 7% in a quarter.", initials: "JL", name: "Jordan L.", role: "VP Sales · Domestic Freight Broker", metric: "3.5× reply rate vs prior cold lists" },
            { quote: "The Pulse alerts on carrier pivots are gold. We've closed three accounts where we got to the buyer before anyone else even knew the contract was open.", initials: "MN", name: "Marcus N.", role: "Head of Sales · Top-100 3PL", metric: "3 accounts closed via Pulse pivot alerts" },
            { quote: "Revenue opportunity sizing changed how we approach the call. We know they're moving $4M in freight before we dial.", initials: "AB", name: "Ava B.", role: "Director of Enterprise Sales · 3PL", metric: "$1.8M pipeline in 60 days, 2 BDRs" },
          ]}
        />

        <MoneyPageFAQ
          emitJsonLd
          items={[
            { question: "Does LIT cover domestic-only freight?", answer: "LIT's primary index is CBP import data, but every importer also moves domestic freight to their DCs and end customers. We surface those domestic lanes and contacts as part of every shipper profile." },
            { question: "How is this different from DAT or Truckstop?", answer: "DAT and Truckstop are load boards — spot-market matching after the load already needs to move. LIT is a prospecting platform — it helps you find the shippers who will need consistent capacity over the next 12 months, before the bid goes out." },
            { question: "How accurate are the contacts?", answer: "95%+ email deliverability across Transportation, Logistics, Procurement, and Operations titles. Every contact in the verified set is validated against active SMTP, LinkedIn presence, and role match." },
            { question: "Will it integrate with my TMS?", answer: "Native push to HubSpot, Salesforce, Outreach, Apollo, Salesloft. TMS integration is on the roadmap; reach out if you'd like to be in the early-access cohort." },
            { question: "Can I cancel anytime?", answer: "Yes. Free trial has no credit card. Paid plans are month-to-month — cancel anytime." },
          ]}
        />

        <FinalCtaBand
          heading="Match capacity to consistent shippers — in 30 seconds."
          body="10 searches. 10 verified contacts. Full account profiles with domestic lane history, rate benchmarks, and revenue opportunity. No credit card."
          ctaLabel="Start free →"
          formSource="freight-broker-leads-final"
        />
      </MoneyPageShell>
      <ExitIntentModal />
    </>
  );
}
