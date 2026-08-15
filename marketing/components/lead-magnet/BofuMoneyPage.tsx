import Link from "next/link";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { LeadMagnetHero } from "@/components/lead-magnet/LeadMagnetHero";
import { LiveProductPreview } from "@/components/lead-magnet/LiveProductPreview";
import { ProofStrip } from "@/components/lead-magnet/ProofStrip";
import { MoneyPageOfferGrid } from "@/components/lead-magnet/MoneyPageOfferGrid";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { FinalCtaBand } from "@/components/lead-magnet/FinalCtaBand";
import type { BofuPage } from "@/app/_bofu/data";

/**
 * Shared renderer for the BOFU keyword landing pages (/importer-leads,
 * /logistics-leads, /3pl-leads, …). Mirrors the /freight-leads money-page
 * structure (sticky CTA → hero + live preview → proof strip → offer grid →
 * outcomes → FAQ → related cluster → final CTA) but is fully data-driven from
 * app/_bofu/data.tsx so each keyword page ships distinct copy without
 * duplicating layout. DO NOT use LandingPageTemplate here — it owns its own
 * MoneyPageShell and would render a second nav below the hero.
 */
export function BofuMoneyPage({ page }: { page: BofuPage }) {
  return (
    <>
      <StickyCTABar />
      <MoneyPageShell>
        <LeadMagnetHero
          eyebrow={page.eyebrow}
          headline={page.headline}
          lede={page.lede}
          ctaLabel="Start 7-day trial →"
          formSource={`${page.slug}-hero`}
          formNote={page.formNote}
        >
          <LiveProductPreview urlBarText={page.previewUrlBar} pulseLabel="LIVE · CBP">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-cyan">
              {page.previewCaption}
            </p>
            <div className="space-y-2">
              {page.previewRows.map((row) => (
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
              <span>{page.previewFooter}</span>
              <a href="#start" className="font-display font-semibold text-brand-cyan hover:text-white">
                Start a 7-day trial to see all →
              </a>
            </div>
          </LiveProductPreview>
        </LeadMagnetHero>

        <ProofStrip />

        <MoneyPageOfferGrid
          eyebrow={page.offer.eyebrow}
          heading={page.offer.heading}
          body={page.offer.body}
          cards={page.offerCards}
        />

        <OutcomesBand items={page.outcomes} />

        <MoneyPageFAQ emitJsonLd items={page.faqs} />

        <section className="bg-white px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-content">
            <div className="mx-auto max-w-[680px] text-center">
              <div className="eyebrow">Keep exploring</div>
              <h2 className="display-lg mt-3">{page.relatedHeading}</h2>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {page.related.map((rel) => (
                <Link
                  key={rel.href}
                  href={rel.href}
                  className="group rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                >
                  <div className="font-display text-[17px] font-semibold leading-snug text-ink-900 group-hover:text-brand-blue-700">
                    {rel.label}
                  </div>
                  <div className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">
                    {rel.blurb}
                  </div>
                  <div className="font-display mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-blue-700">
                    Explore →
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <FinalCtaBand
          heading={page.finalCta.heading}
          body={page.finalCta.body}
          ctaLabel="Start 7-day trial →"
          formSource={`${page.slug}-final`}
        />
      </MoneyPageShell>
      <ExitIntentModal />
    </>
  );
}
