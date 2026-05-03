import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { sanityClient } from "@/sanity/lib/client";
import { TRADE_LANE_QUERY, ALL_TRADE_LANE_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { KpiStrip } from "@/components/sections/KpiStrip";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { formatNumber } from "@/lib/format";

export const revalidate = 3600;

export async function generateStaticParams() {
  const lanes = (await sanityClient.fetch<{ slug: string }[]>(ALL_TRADE_LANE_SLUGS).catch(() => [])) || [];
  return lanes.filter((l) => l.slug).map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const lane = await sanityClient.fetch<any>(TRADE_LANE_QUERY, { slug: params.slug }).catch(() => null);
  if (!lane) return buildMetadata({ title: "Lane not found", path: `/lanes/${params.slug}` });
  const route = `${lane.originPort?.name || "—"} → ${lane.destinationPort?.name || "—"}`;
  return buildMetadata({
    title: `${route} trade lane — top shippers, carrier mix, live volume`,
    description:
      lane.summary?.slice(0, 200) ||
      `Live trade-lane intelligence for ${route}: top 25 shippers, carrier share, monthly volume trend, and YoY change.`,
    path: `/lanes/${params.slug}`,
    eyebrow: "Trade Lane",
    seo: lane.seo,
  });
}

export default async function TradeLanePage({ params }: { params: { slug: string } }) {
  const lane = await sanityClient.fetch<any>(TRADE_LANE_QUERY, { slug: params.slug }).catch(() => null);
  if (!lane) notFound();

  const route = `${lane.originPort?.name || "—"} → ${lane.destinationPort?.name || "—"}`;

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Trade lanes", href: "/lanes" },
          { label: route },
        ]}
      />

      <header className="px-8 pt-6 pb-10">
        <div className="mx-auto max-w-container">
          <div className="lit-pill">
            <span className="dot" />
            Live · refreshed {lane.lastRefreshedAt ? "daily" : "soon"}
          </div>
          <h1 className="display-xl mt-5">
            <span className="grad-text">{lane.originPort?.name || "—"}</span> →{" "}
            <span className="grad-text">{lane.destinationPort?.name || "—"}</span>{" "}
            <span className="block text-ink-900">trade lane</span>
          </h1>
          {lane.summary && <p className="lead mt-5 max-w-[760px]">{lane.summary}</p>}
        </div>
      </header>

      {lane.kpis?.length > 0 && <KpiStrip kpis={lane.kpis} />}

      {lane.topShippers?.length > 0 && (
        <section className="px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Top shippers · last 12 months
            </div>
            <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-25 text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-display font-bold">#</th>
                    <th className="px-5 py-3 font-display font-bold">Shipper</th>
                    <th className="px-5 py-3 font-display font-bold">Industry</th>
                    <th className="px-5 py-3 font-display font-bold text-right">TEU</th>
                    <th className="px-5 py-3 font-display font-bold text-right">Shipments</th>
                    <th className="px-5 py-3 font-display font-bold">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {lane.topShippers.map((s: any, i: number) => (
                    <tr key={`${s.name}-${i}`} className="border-b border-ink-100 last:border-0 transition hover:bg-ink-25">
                      <td className="px-5 py-3 font-mono text-[13px] text-ink-200">{s.rank ?? i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="font-display text-[14px] font-semibold text-ink-900">{s.name}</div>
                        {s.domain && <div className="font-body text-[12px] text-ink-500">{s.domain}</div>}
                      </td>
                      <td className="px-5 py-3 font-body text-[13px] text-ink-700">{s.industry || "—"}</td>
                      <td className="px-5 py-3 text-right font-mono text-[13.5px] font-semibold text-brand-blue-700">
                        {formatNumber(s.teu12m)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] text-ink-700">
                        {formatNumber(s.shipments12m)}
                      </td>
                      <td className="px-5 py-3 font-mono text-[12px] text-ink-500">{s.trend || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="font-body mt-3 text-[12px] text-ink-200">
              Top 25 of {lane.topShippers.length}+ shippers tracked. Want full coverage for this lane?{" "}
              <Link href="/demo" className="font-medium text-brand-blue underline">
                Talk to sales
              </Link>
              .
            </p>
          </div>
        </section>
      )}

      {lane.carrierMix?.length > 0 && (
        <section className="px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Carrier mix
            </div>
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
              <div className="space-y-3">
                {lane.carrierMix.map((c: any, i: number) => {
                  const pct = Math.round((c.share || 0) * 100);
                  return (
                    <div key={`${c.carrier}-${i}`} className="flex items-center gap-4">
                      <div className="w-40 shrink-0">
                        <div className="font-display text-[13.5px] font-semibold text-ink-900">{c.carrier}</div>
                        {c.scac && <div className="font-mono text-[10.5px] text-ink-200">{c.scac}</div>}
                      </div>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-50">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: "linear-gradient(90deg,#3b82f6 0%,#2563eb 100%)",
                          }}
                        />
                      </div>
                      <div className="font-mono w-12 shrink-0 text-right text-[13px] font-semibold text-brand-blue-700">
                        {pct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {lane.relatedLanes?.length > 0 && (
        <section className="px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Related lanes
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {lane.relatedLanes.map((l: any) => (
                <Link
                  key={l.slug?.current || l.title}
                  href={`/lanes/${l.slug?.current}`}
                  className="group rounded-xl border border-ink-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
                >
                  <div className="font-display flex items-center gap-2 text-[14px] font-semibold text-ink-900">
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
        eyebrow="Watch this lane"
        title="Get pinged when this lane shifts."
        subtitle="Save the lane, set your filters, and Pulse Coach surfaces every meaningful change in TEU, carriers, and shipper mix."
        primaryCta={{ label: "Try free", href: "https://app.logisticintel.com/signup", icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: `${route} trade lane`,
            description:
              lane.summary ||
              `Live trade-lane intelligence covering top shippers, carrier mix, and monthly TEU trend for ${route}.`,
            url: siteUrl(`/lanes/${params.slug}`),
            keywords: ["trade lane", lane.originPort?.name, lane.destinationPort?.name, "TEU", "shipping"]
              .filter(Boolean)
              .join(", "),
            creator: { "@type": "Organization", name: "Logistic Intel" },
            dateModified: lane.lastRefreshedAt,
          }),
        }}
      />
    </PageShell>
  );
}
