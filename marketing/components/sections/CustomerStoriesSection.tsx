import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { resolveLogoUrl } from "@/lib/sanityImage";
import { ArrowRight } from "lucide-react";
import { CustomerLogoTile } from "./CustomerLogoTile";

export const revalidate = 600;

const QUERY = groq`*[_type == "caseStudy" && featuredOnHomepage == true] | order(publishedAt desc)[0...3]{
  _id, customer, slug, headline, subhead, kpis, quote, logo, domain,
  "industry": industry->{name, slug}
}`;

/**
 * Customer stories section — 3 featured case study cards. Pulls
 * from Sanity (`featuredOnHomepage == true`). Each card shows
 * logo + customer + headline + 3 KPIs + 1-line quote, with a
 * "Read story" link to the full /customers/[slug] page.
 *
 * Renders nothing if no case studies are published — the homepage
 * never shows a broken empty state.
 */
export async function CustomerStoriesSection() {
  const cases = (await sanityClient.fetch<any[]>(QUERY).catch(() => [])) || [];
  if (!cases.length) return null;

  return (
    <section className="px-5 sm:px-8 py-16 sm:py-20">
      <div className="mx-auto max-w-container">
        <div className="mx-auto mb-12 max-w-[680px] text-center">
          <div className="eyebrow">Customer stories</div>
          <h2 className="display-md mt-3">
            Real results from <span className="grad-text">freight teams</span> on LIT.
          </h2>
          <p className="lead mx-auto mt-4 max-w-[560px]">
            Three teams using freight revenue intelligence to outpace incumbents — pipeline built,
            reply rates lifted, capacity unlocked.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {cases.map((c) => {
            const logoSrc = resolveLogoUrl({ logo: c.logo, domain: c.domain }, 96);
            return (
              <Link
                key={c._id}
                href={`/customers/${c.slug?.current}`}
                className="group flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
              >
                <div className="px-7 pt-7">
                  <div className="flex items-center gap-3">
                    <CustomerLogoTile name={c.customer} src={logoSrc} domain={c.domain} />
                    <div className="min-w-0 flex-1">
                      <div className="font-display truncate text-[15px] font-semibold text-ink-900">
                        {c.customer}
                      </div>
                      {c.industry?.name && (
                        <div className="font-body truncate text-[12px] text-ink-500">
                          {c.industry.name}
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="font-display mt-5 text-[20px] font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700">
                    {c.headline}
                  </h3>
                  {c.subhead && (
                    <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500 line-clamp-3">
                      {c.subhead}
                    </p>
                  )}
                </div>
                {c.kpis?.length > 0 && (
                  <div className="mt-5 grid grid-cols-3 divide-x divide-ink-100 border-t border-ink-100">
                    {c.kpis.slice(0, 3).map((k: any, i: number) => (
                      <div key={i} className="px-3 py-3 text-center">
                        <div className="font-mono text-[16px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                          {k.value}
                        </div>
                        <div className="font-display mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-ink-500 line-clamp-1">
                          {k.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {c.quote?.text && (
                  <div className="font-body border-t border-ink-100 bg-ink-25 px-7 py-4 text-[12.5px] italic leading-snug text-ink-700 line-clamp-3">
                    "{c.quote.text}"
                  </div>
                )}
                <div className="font-display flex items-center gap-1.5 px-7 py-4 text-[12px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                  Read full story <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/customers"
            className="font-display inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-700 hover:text-brand-blue-700"
          >
            See all customer stories <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
