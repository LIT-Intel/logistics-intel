import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Anchor } from "lucide-react";
import { sanityClient } from "@/sanity/lib/client";
import { PORT_QUERY, ALL_PORT_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { KpiStrip } from "@/components/sections/KpiStrip";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { formatNumber } from "@/lib/format";

export const revalidate = 3600;

export async function generateStaticParams() {
  const items = (await sanityClient.fetch<{ slug: string }[]>(ALL_PORT_SLUGS).catch(() => [])) || [];
  return items.filter((p) => p.slug).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const port = await sanityClient.fetch<any>(PORT_QUERY, { slug: params.slug }).catch(() => null);
  if (!port) return buildMetadata({ title: "Port not found", path: `/ports/${params.slug}` });
  return buildMetadata({
    title: `${port.name} — top shippers, lanes, and live volume`,
    description:
      port.summary?.slice(0, 200) ||
      `Live port intelligence for ${port.name}: top inbound + outbound shippers, lane mix, and 12-month volume trend.`,
    path: `/ports/${params.slug}`,
    eyebrow: "Port",
    seo: port.seo,
  });
}

export default async function PortPage({ params }: { params: { slug: string } }) {
  const port = await sanityClient.fetch<any>(PORT_QUERY, { slug: params.slug }).catch(() => null);
  if (!port) notFound();

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Ports", href: "/ports" },
          { label: port.name },
        ]}
      />

      <header className="px-5 sm:px-8 pt-6 pb-10">
        <div className="mx-auto max-w-container">
          <div className="lit-pill">
            <span className="dot" />
            Live · refreshed daily
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <h1 className="display-xl">
              <span className="grad-text">{port.name}</span>
            </h1>
            <div className="font-mono pb-2 text-[14px] uppercase tracking-wider text-ink-500">
              {port.unlocode} · {port.country || "—"} · {port.type || "sea"}
            </div>
          </div>
          {port.summary && <p className="lead mt-5 max-w-[760px]">{port.summary}</p>}
        </div>
      </header>

      {port.kpis?.length > 0 && <KpiStrip kpis={port.kpis} />}

      {port.topInboundShippers?.length > 0 && (
        <ShipperTable
          title="Top inbound shippers · last 12 months"
          rows={port.topInboundShippers}
        />
      )}

      {port.topOutboundShippers?.length > 0 && (
        <ShipperTable
          title="Top outbound shippers · last 12 months"
          rows={port.topOutboundShippers}
        />
      )}

      {port.topLanes?.length > 0 && (
        <section className="px-5 sm:px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Top lanes through {port.name}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {port.topLanes.map((l: any) => (
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
        eyebrow="Watch this port"
        title={`Get pinged when ${port.name} shifts.`}
        subtitle="Save the port, set your filters, and Pulse Coach surfaces every meaningful change in shipper mix and volume."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Place",
            name: port.name,
            url: siteUrl(`/ports/${params.slug}`),
            address: { "@type": "PostalAddress", addressCountry: port.country },
            geo:
              port.lat && port.lng
                ? { "@type": "GeoCoordinates", latitude: port.lat, longitude: port.lng }
                : undefined,
            additionalType: "Port",
            identifier: port.unlocode,
          }),
        }}
      />
    </PageShell>
  );
}

function ShipperTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <section className="px-5 sm:px-8 py-10">
      <div className="mx-auto max-w-container">
        <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
          {title}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-25 text-[11px] uppercase tracking-wider text-ink-500">
                <th className="font-display px-5 py-3 font-bold">#</th>
                <th className="font-display px-5 py-3 font-bold">Shipper</th>
                <th className="font-display px-5 py-3 font-bold">Industry</th>
                <th className="font-display px-5 py-3 text-right font-bold">TEU</th>
                <th className="font-display px-5 py-3 text-right font-bold">Shipments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={`${s.name}-${i}`} className="border-b border-ink-100 last:border-0 transition hover:bg-ink-25">
                  <td className="px-5 py-3 font-mono text-[13px] text-ink-200">{s.rank ?? i + 1}</td>
                  <td className="px-5 py-3">
                    <div className="font-display text-[14px] font-semibold text-ink-900">{s.name}</div>
                    {s.domain && <div className="font-body text-[12px] text-ink-500">{s.domain}</div>}
                  </td>
                  <td className="font-body px-5 py-3 text-[13px] text-ink-700">{s.industry || "—"}</td>
                  <td className="px-5 py-3 text-right font-mono text-[13.5px] font-semibold text-brand-blue-700">
                    {formatNumber(s.teu12m)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-[13px] text-ink-700">
                    {formatNumber(s.shipments12m)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
