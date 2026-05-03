import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { groq } from "next-sanity";
import { ArrowRight } from "lucide-react";

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: "Trade lanes — live shipment intelligence by route",
  description:
    "Live KPIs, top shippers, carrier mix, and 12-month trends for every major ocean and air trade lane. Updated daily.",
  path: "/lanes",
  eyebrow: "Trade Lanes",
});

const LANES_INDEX = groq`*[_type == "tradeLane"] | order(title asc){
  _id, title, slug, kpis, originPort, destinationPort
}`;

export default async function LanesIndexPage() {
  const lanes = (await sanityClient.fetch<any[]>(LANES_INDEX).catch(() => [])) || [];

  return (
    <PageShell>
      <PageHero
        eyebrow="Trade lanes"
        title="Live trade-lane"
        titleHighlight="intelligence,"
        titleSuffix="every major route."
        subtitle="Top shippers, carrier mix, TEU trend, and YoY change for every major ocean and air lane. Refreshed daily."
        align="center"
      />

      {lanes.length === 0 ? (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">
                Lane data warming up
              </div>
              <p className="font-body mx-auto mt-2 max-w-[480px] text-[14px] leading-relaxed text-ink-500">
                The TradeLane Refresher agent populates this index from your live shipment data. First run is
                scheduled for 02:00 UTC daily — check back tomorrow or trigger manually from <code className="font-mono">/api/cron/trade-lane-refresh</code>.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {lanes.map((l) => (
                <Link
                  key={l._id}
                  href={`/lanes/${l.slug?.current}`}
                  className="group rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                >
                  <div className="font-display flex items-center gap-2 text-[14px] font-semibold text-ink-900">
                    <span>{l.originPort?.name || "—"}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-brand-blue" />
                    <span>{l.destinationPort?.name || "—"}</span>
                  </div>
                  {l.kpis?.[0]?.value && (
                    <div className="mt-4 flex items-baseline gap-2">
                      <span className="font-mono text-[22px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                        {l.kpis[0].value}
                      </span>
                      <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                        {l.kpis[0].label}
                      </span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner
        eyebrow="Watch your lanes"
        title="Track your specific lanes."
        subtitle="Save lanes to your watchlist and Pulse Coach pings you when volume, carriers, or shippers shift."
        primaryCta={{ label: "Try free", href: "https://app.logisticintel.com/signup", icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
