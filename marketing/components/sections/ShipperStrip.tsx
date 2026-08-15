import Link from "next/link";
import { formatNumber, type PublicCompany } from "@/lib/companies";
import { logoDevUrl } from "@/lib/sanityImage";
import { LogoImage } from "./LogoImage";
import { OverlinePill } from "./OverlinePill";

type FeaturedRow = PublicCompany & { _featured_domain: string };

/**
 * `ShipperStrip` — 6-up grid of household-name importers on a dark
 * full-bleed band. Each tile shows the brand logo + name + TEU
 * (cyan-on-dark, allowed). TEU numbers come from the real
 * `getFeaturedBrandCompanies()` query, never hardcoded — see
 * show-stopper C in the handoff brief.
 */
export function ShipperStrip({
  companies,
  eyebrow = "Notable importers",
  heading = "We see who's actively shipping — by the container.",
  lede = "Pulled from US Customs Bill of Lading filings, refreshed weekly. These six are a sample of the household-name shippers LIT tracks every day.",
}: {
  companies: FeaturedRow[];
  eyebrow?: string;
  heading?: string;
  lede?: string;
}) {
  if (!companies.length) return null;

  return (
    <section className="section-bleed bleed-ink">
      <div className="mx-auto max-w-container px-5 sm:px-8">
        <header className="mx-auto max-w-[760px] text-center">
          <OverlinePill variant="cyan-on-dark">{eyebrow}</OverlinePill>
          <h2 className="font-display mt-4 text-balance text-[clamp(28px,3vw,40px)] font-bold leading-[1.1] tracking-[-0.024em] text-white">
            {heading}
          </h2>
          {lede && (
            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-relaxed text-white/70">
              {lede}
            </p>
          )}
        </header>

        <div className="shipper-strip">
          {companies.slice(0, 6).map((c) => {
            const teu = Number(c.teu) || 0;
            const logoSrc = logoDevUrl(c._featured_domain, { size: 96, format: "png" });
            return (
              <Link
                key={c.seo_slug}
                href={`/companies/${c.seo_slug}`}
                className="shipper-tile"
              >
                <div className="st-logo">
                  <LogoImage
                    src={logoSrc}
                    domain={c._featured_domain}
                    name={c.company_name}
                    className="[&>span:last-child]:sr-only"
                  />
                </div>
                <span className="st-name">{c.company_name}</span>
                {teu > 0 && (
                  <>
                    <span className="st-teu">{formatNumber(teu)}</span>
                    <span className="st-teu-label">TEU · 12m</span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
