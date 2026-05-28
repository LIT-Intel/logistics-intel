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

const SLUG = "shipper-leads";

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
      "Shipper Leads — Find direct importers on your lanes",
    description:
      doc?.tldr ||
      doc?.subhead ||
      "Search 524,000 active US importers by lane, port, HS code, or carrier. Verified Logistics, Supply Chain, and Procurement contacts on every account. Start free.",
    path: `/${SLUG}`,
    eyebrow: doc?.eyebrow,
    seo: doc?.seo,
  });
}

export default function ShipperLeadsPage() {
  return (
    <>
      <StickyCTABar />
      <MoneyPageShell>
        <LeadMagnetHero
          eyebrow="Shipper leads — refreshed daily from CBP"
          headline={
            <>
              Find <strong>direct shippers</strong> moving freight on your lanes — this week.
            </>
          }
          lede="Skip the middlemen. Search every active US importer by origin port, destination, HS code, or carrier. Open each profile to see real shipment cadence, top contracts, and the Logistics + Supply Chain decision makers ready to take your call."
          ctaLabel="Start free →"
          formSource="shipper-leads-hero"
          formNote="10 searches + 10 verified contacts on us. No credit card. Cancel anytime."
        >
          <LiveProductPreview urlBarText="app.logisticintel.com / shippers" pulseLabel="LIVE · CBP">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-400">
              Active shippers · Korea → US · 100+ TEU/yr
            </p>
            <div className="space-y-2">
              {[
                { initial: "S", name: "Samsung Electronics", meta: "Electronics · KR → US · 6,535 TEU · 2,055 ship" },
                { initial: "L", name: "LG Energy Solution", meta: "Batteries · KR → US · 3,128 ship · 7.2K TEU" },
                { initial: "H", name: "Hyundai Mobis", meta: "Auto parts · KR → US · 2,910 ship · 6.8K TEU" },
                { initial: "K", name: "Kia America Inc.", meta: "Automotive · KR → US · 1,847 ship · 12.1K TEU" },
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
          heading="A working shipper-prospecting list — in 8 minutes."
          body="10 searches. 10 verified contact enrichments. Every account comes with full shipment history, rate benchmarks, AI brief, and revenue opportunity. No credit card."
          cards={[
            {
              check: "Includes",
              title: "10 lane-filtered searches",
              body: "Filter 524K+ live importers by origin, destination, HS code, carrier, mode, or industry.",
              span: 2,
              tone: "dark",
            },
            {
              check: "Decision makers",
              title: "10 verified contact enrichments",
              body: "VP Supply Chain, Director of Logistics, Import Manager, Procurement. Email + LinkedIn + dial. 95%+ deliverability.",
              span: 4,
            },
            {
              check: "Per account",
              title: "Live shipment cadence",
              body: "12-month TEU, top lanes, carrier mix, monthly volume trend. Refreshed daily from CBP filings.",
              span: 3,
            },
            {
              check: "Pricing intel",
              title: "Ocean rate benchmarks",
              body: "What each shipper pays on their actual lanes. Matched to FBX reference rates. Refreshed weekly.",
              span: 3,
            },
            {
              check: "AI brief",
              title: "Pulse AI account intelligence",
              body: "Executive summary, opportunity signals, ready-to-send outreach hook — cited sources, 95% confidence.",
              span: 3,
              tone: "dark",
            },
            {
              check: "Pipeline sizing",
              title: "Revenue opportunity per account",
              body: "Total addressable freight spend by service line. See what an account is worth before you call.",
              span: 3,
            },
          ]}
        />

        <OutcomesBand
          items={[
            {
              num: "4.1×",
              label: "More first meetings booked",
              body: "Shipment-triggered prospecting lifts reply rate from 1.4% to 5.8% on cold direct-shipper outbound.",
              cite: "Top-25 freight forwarder · 80-person sales org",
            },
            {
              num: "8 min",
              label: "Time to first qualified list",
              body: "From signup to a working shipper-prospecting list, segmented by lane + volume. No SDR setup required.",
              cite: "Mid-market NVOCC · 25-rep team",
            },
            {
              num: "$2.4M",
              label: "New pipeline in 60 days",
              body: "One BDR. Three trans-Pacific lanes. Two-month ramp. Built entirely on LIT's active-shipper data.",
              cite: "NVOCC · early-stage growth team",
            },
          ]}
        />

        <TestimonialTrio
          quotes={[
            {
              quote: "We dropped ImportGenius after a quarter. They had the BOL data but no contacts. LIT gives me both — and the AI brief tells my SDRs exactly what to say.",
              initials: "RT",
              name: "Robin T.",
              role: "VP Sales · Freight Forwarder, US West",
              metric: "2.8× reply rate vs cold lists",
            },
            {
              quote: "The contact match rate is the real differentiator. Right titles, right inboxes. We finally booked demos with shippers we'd never been able to reach.",
              initials: "DK",
              name: "David K.",
              role: "Head of Sales · Top-50 NVOCC",
              metric: "94% deliverability across 4,200 sends",
            },
            {
              quote: "Knowing the addressable freight spend before the call changed how we do discovery. We walk in informed.",
              initials: "SH",
              name: "Sarah H.",
              role: "Director of Enterprise Sales · 3PL",
              metric: "$2.4M pipeline in 60 days, 1 BDR",
            },
          ]}
        />

        <MoneyPageFAQ
          emitJsonLd
          items={[
            { question: "What's a shipper lead in LIT?", answer: "A US-based importer that has moved cargo on US Customs (CBP) records in the last 90 days. We index 524,000+ active shippers, joined to 42 million verified contact records." },
            { question: "How is this different from ImportGenius or Panjiva?", answer: "ImportGenius and Panjiva surface BOL records. Stop there. LIT joins those shipment records to verified Logistics, Supply Chain, Procurement contacts plus rate benchmarks, AI briefs, and revenue opportunity sizing — in one workspace." },
            { question: "How accurate are the contacts?", answer: "95%+ email deliverability across supply-chain titles. Every contact in the verified set is validated against active SMTP, LinkedIn presence, and role match. Hidden contacts revealed on enrichment." },
            { question: "Where does the shipment data come from?", answer: "CBP Automated Manifest System (AMS) filings for US imports, plus customs data from 60+ countries. Refreshed daily. Same source institutional data providers use." },
            { question: "Can I cancel anytime?", answer: "Yes. Free trial has no credit card. Paid plans are month-to-month — cancel anytime." },
            { question: "Will it integrate with my CRM?", answer: "Native push to HubSpot, Salesforce, Outreach, Apollo, Salesloft, SmartLead. Two-way sync on paid plans. Or use LIT's built-in CRM (free with the trial)." },
          ]}
        />

        <FinalCtaBand
          heading="See the active shippers on your lane in 30 seconds."
          body="10 searches. 10 verified contacts. Full account profiles with shipment data, rate benchmarks, AI briefs, and revenue opportunity. No credit card."
          ctaLabel="Start free →"
          formSource="shipper-leads-final"
        />
      </MoneyPageShell>
      <ExitIntentModal />
    </>
  );
}
