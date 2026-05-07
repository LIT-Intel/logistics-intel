import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { PORTS_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { Anchor } from "lucide-react";

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: "Ports — live shipment intelligence by gateway",
  description:
    "Top inbound + outbound shippers, lane mix, and live volume for every major sea, air, rail, and truck port. Refreshed daily.",
  path: "/ports",
  eyebrow: "Ports",
});

export default async function PortsIndexPage() {
  const ports = (await sanityClient.fetch<any[]>(PORTS_INDEX_QUERY).catch(() => [])) || [];

  // Group by country for navigability
  const grouped = ports.reduce<Record<string, any[]>>((acc, p) => {
    const k = p.country || "Other";
    (acc[k] = acc[k] || []).push(p);
    return acc;
  }, {});
  const countries = Object.keys(grouped).sort();

  return (
    <PageShell>
      <PageHero
        eyebrow="Ports"
        title="Live port"
        titleHighlight="intelligence,"
        titleSuffix="every major gateway."
        subtitle="Inbound and outbound shipper rankings, lane mix, carrier share — refreshed daily for every port we track."
        align="center"
      />

      {ports.length === 0 ? (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">
                Port-level intelligence — rolling out
              </div>
              <p className="font-body mx-auto mt-2 max-w-[520px] text-[14px] leading-relaxed text-ink-500">
                Port pages cover 800+ global seaports with live trailing-12m volume, top importers and
                exporters, dominant carriers, and cross-references to major trade lanes. While this index
                is publishing,{" "}
                <Link href="/lanes" className="text-brand-blue-700 underline">
                  browse trade lanes →
                </Link>
                {" "}or{" "}
                <Link href="/demo" className="text-brand-blue-700 underline">
                  book a demo
                </Link>
                {" "}to query any port inside LIT directly.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container space-y-12">
            {countries.map((country) => (
              <div key={country}>
                <div className="font-display mb-5 flex items-center gap-3">
                  <span className="text-[26px] font-semibold tracking-[-0.015em] text-ink-900">{country}</span>
                  <span className="h-px flex-1 bg-ink-100" />
                  <span className="font-mono text-[12px] text-ink-200">{grouped[country].length}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {grouped[country].map((p) => (
                    <Link
                      key={p._id}
                      href={`/ports/${p.slug?.current}`}
                      className="group rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: "rgba(37,99,235,0.08)",
                            boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                          }}
                        >
                          <Anchor className="h-4 w-4 text-brand-blue" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-display truncate text-[15px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                            {p.name}
                          </div>
                          <div className="font-mono mt-0.5 text-[11px] uppercase tracking-wider text-ink-200">
                            {p.unlocode} · {p.type || "sea"}
                          </div>
                        </div>
                      </div>
                      {p.kpis?.[0]?.value && (
                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="font-mono text-[18px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                            {p.kpis[0].value}
                          </span>
                          <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                            {p.kpis[0].label}
                          </span>
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <CtaBanner
        eyebrow="Watch a port"
        title="Track inbound + outbound activity by gateway."
        subtitle="Save any port to your watchlist and Pulse Coach surfaces every meaningful change in shipper mix and volume."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
