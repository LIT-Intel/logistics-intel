import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { sanityClient } from "@/sanity/lib/client";
import { HS_CODE_QUERY, ALL_HS_CODE_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { KpiStrip } from "@/components/sections/KpiStrip";
import { ProseShell } from "@/components/sections/ProseShell";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { formatNumber } from "@/lib/format";

export const revalidate = 3600;

export async function generateStaticParams() {
  const items = (await sanityClient.fetch<{ slug: string }[]>(ALL_HS_CODE_SLUGS).catch(() => [])) || [];
  return items.filter((p) => p.slug).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const hs = await sanityClient.fetch<any>(HS_CODE_QUERY, { slug: params.slug }).catch(() => null);
  if (!hs) return buildMetadata({ title: "HS code not found", path: `/hs/${params.slug}` });
  return buildMetadata({
    title: `HS ${hs.code} — ${hs.title}`,
    description:
      hs.shortDefinition ||
      hs.summary?.slice(0, 200) ||
      `HS code ${hs.code}: ${hs.title}. Top importers, lanes, and live volume.`,
    path: `/hs/${params.slug}`,
    eyebrow: `HS ${hs.code}`,
    seo: hs.seo,
  });
}

export default async function HsCodePage({ params }: { params: { slug: string } }) {
  const hs = await sanityClient.fetch<any>(HS_CODE_QUERY, { slug: params.slug }).catch(() => null);
  if (!hs) notFound();

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "HS codes", href: "/hs" },
          { label: hs.code },
        ]}
      />

      <header className="px-8 pt-6 pb-10">
        <div className="mx-auto max-w-container">
          <div className="lit-pill">
            <span className="dot" />
            HS {hs.level || "code"} · refreshed weekly
          </div>
          <h1 className="display-xl mt-5">
            <span className="font-mono text-brand-blue">{hs.code}</span>
            <span className="block text-ink-900">{hs.title}</span>
          </h1>
          {hs.shortDefinition && <p className="lead mt-5 max-w-[760px]">{hs.shortDefinition}</p>}
        </div>
      </header>

      {hs.kpis?.length > 0 && <KpiStrip kpis={hs.kpis} />}

      {hs.summary && (
        <ProseShell
          value={[
            {
              _type: "block",
              style: "normal",
              children: [{ _type: "span", text: hs.summary }],
            },
          ]}
        />
      )}

      {hs.topImporters?.length > 0 && (
        <section className="px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Top importers · last 12 months
            </div>
            <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
              <table className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-25 text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="font-display px-5 py-3 font-bold">#</th>
                    <th className="font-display px-5 py-3 font-bold">Importer</th>
                    <th className="font-display px-5 py-3 font-bold">Country</th>
                    <th className="font-display px-5 py-3 text-right font-bold">Shipments</th>
                  </tr>
                </thead>
                <tbody>
                  {hs.topImporters.map((s: any, i: number) => (
                    <tr key={`${s.name}-${i}`} className="border-b border-ink-100 last:border-0 transition hover:bg-ink-25">
                      <td className="px-5 py-3 font-mono text-[13px] text-ink-200">{s.rank ?? i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="font-display text-[14px] font-semibold text-ink-900">{s.name}</div>
                        {s.domain && <div className="font-body text-[12px] text-ink-500">{s.domain}</div>}
                      </td>
                      <td className="font-body px-5 py-3 text-[13px] text-ink-700">{s.country || "—"}</td>
                      <td className="px-5 py-3 text-right font-mono text-[13.5px] font-semibold text-brand-blue-700">
                        {formatNumber(s.shipments12m)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {hs.topLanes?.length > 0 && (
        <section className="px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Top lanes carrying HS {hs.code}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {hs.topLanes.map((l: any) => (
                <Link
                  key={l.slug?.current || l.title}
                  href={`/lanes/${l.slug?.current}`}
                  className="group rounded-xl border border-ink-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
                >
                  <div className="font-display flex items-center gap-2 text-[14px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                    {l.title}
                    <ArrowRight className="h-3.5 w-3.5 text-brand-blue" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner
        eyebrow="Find importers shipping this code"
        title={`See who's importing under HS ${hs.code} this week.`}
        subtitle="LIT turns HS classifications into a list of real importers you can act on — with verified contacts, lane history, and outbound triggers."
        primaryCta={{ label: "Try free", href: "https://app.logisticintel.com/signup", icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "DefinedTerm",
            name: `HS ${hs.code}`,
            alternateName: [hs.title],
            description: hs.shortDefinition || hs.summary,
            inDefinedTermSet: {
              "@type": "DefinedTermSet",
              name: "Harmonized System (HS)",
              url: "https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx",
            },
            url: siteUrl(`/hs/${params.slug}`),
            identifier: hs.code,
          }),
        }}
      />
    </PageShell>
  );
}
