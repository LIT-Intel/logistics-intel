import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { LogoTile } from "./LogoTile";
import { formatNumber, type PublicCompany } from "@/lib/companies";

type FeaturedRow = PublicCompany & { _featured_domain: string };

/**
 * Shipper Insights — horizontal-scroll row that surfaces notable
 * household-name importers from the BOL graph inside the blog.
 * Each tile links to /companies/[slug]. Server component.
 */
export function ShipperInsightsRow({ companies }: { companies: FeaturedRow[] }) {
  if (!companies.length) return null;
  return (
    <section className="rounded-3xl border border-ink-100 bg-gradient-to-br from-white via-white to-brand-blue/[0.04] p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="lit-pill">
            <span className="dot" />
            New · Shipper Insights
          </div>
          <h2 className="font-display mt-3 text-[22px] font-semibold tracking-[-0.018em] text-ink-900 sm:text-[24px]">
            Notable importers we&apos;re tracking right now.
          </h2>
          <p className="font-body mt-1.5 max-w-[560px] text-[14px] leading-relaxed text-ink-500">
            Live US Customs filings from household-name shippers. Tap a profile to see headline volume,
            lane mix, and the path to verified buyer-side contacts inside LIT.
          </p>
        </div>
        <Link
          href="/companies"
          className="font-display inline-flex h-10 shrink-0 items-center gap-1.5 self-start rounded-xl border border-ink-100 bg-white px-4 text-[13px] font-semibold text-ink-900 transition hover:border-brand-blue/30 hover:shadow-sm sm:self-end"
        >
          See all importers <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Horizontal scroller — snap on mobile, grid on desktop */}
      <div className="mt-6 -mx-1 overflow-x-auto pb-2 [scrollbar-width:thin]">
        <div className="flex gap-3 px-1 sm:gap-4">
          {companies.map((c) => (
            <ShipperTile key={c.seo_slug} c={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ShipperTile({ c }: { c: FeaturedRow }) {
  const teu = Number(c.teu) || 0;
  const ships = Number(c.shipments) || 0;
  return (
    <Link
      href={`/companies/${c.seo_slug}`}
      className="group flex w-[220px] shrink-0 flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md sm:w-[240px]"
    >
      <div className="flex items-center gap-2.5">
        <LogoTile domain={c._featured_domain} name={c.company_name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-[13px] font-semibold leading-tight text-ink-900 group-hover:text-brand-blue-700">
            {c.company_name}
          </div>
          {c.industry && (
            <div className="font-body truncate text-[11px] text-ink-500">{c.industry}</div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-3">
        <Stat label="TEU 12m" value={formatNumber(teu)} accent />
        <Stat label="Ships" value={formatNumber(ships)} />
      </div>
      <div className="font-display inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-blue-700">
        <TrendingUp className="h-3 w-3" aria-hidden /> View profile
      </div>
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </div>
      <div
        className={
          "font-mono mt-0.5 text-[13px] font-bold tracking-[-0.01em] " +
          (accent ? "text-brand-blue-700" : "text-ink-900")
        }
      >
        {value}
      </div>
    </div>
  );
}
