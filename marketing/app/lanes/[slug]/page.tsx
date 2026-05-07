import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Anchor, Ship, Calendar, Activity, Globe2 } from "lucide-react";
import { sanityClient } from "@/sanity/lib/client";
import { TRADE_LANE_QUERY, ALL_TRADE_LANE_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { Section } from "@/components/sections/Section";
import { HubCard } from "@/components/sections/HubCard";
import { KpiStrip } from "@/components/sections/KpiStrip";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { Flag, LaneFlags } from "@/components/sections/Flag";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { formatNumber } from "@/lib/format";
import { portISO } from "@/lib/countries";

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

  const originName = lane.originPort?.name || "—";
  const destName = lane.destinationPort?.name || "—";
  const originIso = portISO(lane.originPort);
  const destIso = portISO(lane.destinationPort);
  const originCountry = lane.originPort?.country;
  const destCountry = lane.destinationPort?.country;
  const route = `${originName} → ${destName}`;

  // Synthesize facts even when Sanity is sparse so the page is never just
  // a hero + empty body. These render only when their underlying data is
  // missing — when the agent fills the doc in, they get replaced.
  const hasShippers = Array.isArray(lane.topShippers) && lane.topShippers.length > 0;
  const hasCarriers = Array.isArray(lane.carrierMix) && lane.carrierMix.length > 0;
  const hasMonthly = Array.isArray(lane.monthlyTrend) && lane.monthlyTrend.length > 0;
  const hasKpis = Array.isArray(lane.kpis) && lane.kpis.length > 0;

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Trade lanes", href: "/lanes" },
          { label: route },
        ]}
      />

      <Section top="md" bottom="md">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[3fr,2fr] lg:gap-12">
          <div>
            <div className="lit-pill">
              <span className="dot" />
              Live · refreshed {lane.lastRefreshedAt ? "daily" : "weekly"}
            </div>
            <h1 className="display-xl mt-5 leading-[1.05]">
              <span className="grad-text">{originName}</span>
              <span className="px-3 text-ink-200" aria-hidden>→</span>
              <span className="grad-text">{destName}</span>
              <span className="block text-ink-900 mt-1 sm:mt-2">trade lane.</span>
            </h1>
            {lane.summary ? (
              <p className="lead mt-5">{lane.summary}</p>
            ) : (
              <p className="lead mt-5">
                Live shipment intelligence for the {originName} → {destName} corridor — top
                importers and exporters, carrier mix, port pairs, and 12-month volume trend.
                Aggregated nightly from US Customs filings.
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={APP_SIGNUP_URL}
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                Watch this lane <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
              >
                <Calendar className="h-4 w-4" /> Book a demo
              </Link>
            </div>
          </div>

          {/* Lane card — origin/destination flags + ports + key facts.
              Always renders, even when KPI/shipper data is sparse. */}
          <aside className="rounded-3xl border border-ink-100 bg-white p-6 sm:p-7 shadow-sm">
            <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-blue">
              Lane card
            </div>
            <div className="mt-4 space-y-4">
              <LaneRow
                label="Origin"
                iso={originIso}
                portName={originName}
                country={originCountry}
                code={lane.originPort?.code}
              />
              <div className="flex justify-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-200">via ocean</span>
              </div>
              <LaneRow
                label="Destination"
                iso={destIso}
                portName={destName}
                country={destCountry}
                code={lane.destinationPort?.code}
              />
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-ink-100 pt-5 text-[12.5px]">
              <FactCell icon={Ship} label="Mode" value="Ocean" />
              <FactCell icon={Activity} label="Refresh" value="Daily" />
              <FactCell icon={Anchor} label="Coverage" value="US-inbound" />
              <FactCell icon={Globe2} label="Tracked since" value="2014" />
            </dl>
          </aside>
        </div>
      </Section>

      {hasKpis && (
        <Section top="none" bottom="md">
          <KpiStrip kpis={lane.kpis} />
        </Section>
      )}

      {hasShippers ? (
        <Section top="md" bottom="md">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Top shippers · last 12 months</div>
              <h2 className="display-md mt-2">Who's actually moving on this lane.</h2>
            </div>
            <span className="font-mono hidden text-[12px] text-ink-200 sm:inline">
              {lane.topShippers.length} ranked
            </span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
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
          </div>
          <p className="font-body mt-3 text-[12.5px] text-ink-500">
            Top 25 of {lane.topShippers.length}+ shippers tracked.{" "}
            <Link href="/demo" className="font-medium text-brand-blue-700 underline">
              Talk to sales
            </Link>{" "}
            for full coverage.
          </p>
        </Section>
      ) : (
        <Section top="md" bottom="md">
          <div className="mb-5">
            <div className="eyebrow">What we track</div>
            <h2 className="display-md mt-2">Inside the {originName} → {destName} lane page.</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FactCard
              eyebrow="Top shippers"
              title="Ranked by TTM TEU"
              body={`The 25 importers moving the most volume on ${originName} → ${destName}, refreshed daily as new BOLs file. Each links to a full company profile with verified buyer contacts.`}
            />
            <FactCard
              eyebrow="Carrier mix"
              title="Lane share by SCAC"
              body="Which carriers handle this lane and at what share. Useful for spotting displacement signals when an importer's mix shifts."
            />
            <FactCard
              eyebrow="Monthly trend"
              title="12-month TEU curve"
              body="Volume month-over-month with peak / trough flags. Pulse Coach pings you when the trend deviates >15% from the trailing baseline."
            />
            <FactCard
              eyebrow="HS mix"
              title="What's on the boat"
              body="Top HS chapters moving on this lane. Customs brokers and BD reps use this to prospect by commodity fit."
            />
            <FactCard
              eyebrow="Port pairs"
              title="Origin × destination splits"
              body="Many corridors are multi-port. We surface the dominant origin × destination pairs and where activity is shifting."
            />
            <FactCard
              eyebrow="YoY change"
              title="Year-over-year delta"
              body="Lane volume vs same period last year, with seasonality normalized — so you can tell trend from cycle."
            />
          </div>
          <p className="font-body mt-5 text-[13.5px] text-ink-500">
            Sanity is still seeding this lane.{" "}
            <Link href="/demo" className="font-medium text-brand-blue-700 underline">
              Book a demo
            </Link>{" "}
            to see the full lane view inside the LIT app right now.
          </p>
        </Section>
      )}

      {hasCarriers && (
        <Section top="md" bottom="md">
          <div className="mb-5">
            <div className="eyebrow">Carrier mix</div>
            <h2 className="display-md mt-2">Who carries the cargo.</h2>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-7 shadow-sm">
            <div className="space-y-3">
              {lane.carrierMix.map((c: any, i: number) => {
                const pct = Math.round((c.share || 0) * 100);
                return (
                  <div key={`${c.carrier}-${i}`} className="flex items-center gap-3 sm:gap-4">
                    <div className="w-32 sm:w-40 shrink-0">
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
        </Section>
      )}

      {/* Corridor primer — always renders, gives the page weight even when
          Sanity has only a thin doc. Pulled from country fields where present. */}
      <Section top="md" bottom="md">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CorridorEndCard
            label="Origin"
            iso={originIso}
            portName={originName}
            country={originCountry}
            code={lane.originPort?.code}
            tone="origin"
          />
          <CorridorEndCard
            label="Destination"
            iso={destIso}
            portName={destName}
            country={destCountry}
            code={lane.destinationPort?.code}
            tone="destination"
          />
        </div>
      </Section>

      {Array.isArray(lane.relatedLanes) && lane.relatedLanes.length > 0 && (
        <Section top="md" bottom="lg">
          <div className="mb-5">
            <div className="eyebrow">Related lanes</div>
            <h2 className="display-md mt-2">Adjacent corridors worth watching.</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {lane.relatedLanes.map((l: any) => {
              const oIso = portISO(l.originPort);
              const dIso = portISO(l.destinationPort);
              return (
                <HubCard
                  key={l.slug?.current || l.title}
                  href={`/lanes/${l.slug?.current}`}
                  variant="compact"
                  className="flex items-center gap-3"
                >
                  <LaneFlags originIso={oIso} destIso={dIso} size="sm" />
                  <div className="font-display flex-1 truncate text-[14px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                    {l.title}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-200 group-hover:text-brand-blue" />
                </HubCard>
              );
            })}
          </div>
        </Section>
      )}

      <CtaBanner
        eyebrow="Watch this lane"
        title={`Get pinged when ${originName} → ${destName} shifts.`}
        subtitle="Save the lane, set your filters, and Pulse Coach surfaces every meaningful change in TEU, carriers, and shipper mix."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
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

/** Origin/destination row inside the sticky lane card. */
function LaneRow({
  label,
  iso,
  portName,
  country,
  code,
}: {
  label: string;
  iso: string | null;
  portName: string;
  country?: string;
  code?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Flag iso={iso} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-200">
          {label}
        </div>
        <div className="font-display truncate text-[16px] font-semibold text-ink-900">{portName}</div>
        <div className="font-body truncate text-[12px] text-ink-500">
          {country ? <span>{country}</span> : null}
          {code ? <span className="font-mono ml-1.5 text-ink-200">· {code}</span> : null}
        </div>
      </div>
    </div>
  );
}

function FactCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Ship;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-ink-25 p-3">
      <div className="flex items-center gap-1.5 text-ink-500">
        <Icon className="h-3 w-3" aria-hidden />
        <dt className="font-display text-[10px] font-bold uppercase tracking-[0.1em]">{label}</dt>
      </div>
      <dd className="font-display mt-1 text-[14px] font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

function FactCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6 shadow-sm transition hover:border-brand-blue/30 hover:shadow-md">
      <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-blue">
        {eyebrow}
      </div>
      <div className="font-display mt-2 text-[16px] font-semibold leading-tight text-ink-900">
        {title}
      </div>
      <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}

/**
 * Big origin/destination card with flag, port, country, and a compact
 * "what to know" line. Always renders so the page has visual weight even
 * when Sanity is sparse.
 */
function CorridorEndCard({
  label,
  iso,
  portName,
  country,
  code,
  tone,
}: {
  label: string;
  iso: string | null;
  portName: string;
  country?: string;
  code?: string;
  tone: "origin" | "destination";
}) {
  const accent =
    tone === "origin"
      ? "linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(255,255,255,0) 60%)"
      : "linear-gradient(135deg, rgba(0,240,255,0.10) 0%, rgba(255,255,255,0) 60%)";
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-6 sm:p-7 shadow-sm"
      style={{ backgroundImage: accent }}
    >
      <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-500">
        {label}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <Flag iso={iso} size="xl" />
        <div className="min-w-0">
          <div className="font-display truncate text-[22px] sm:text-[24px] font-bold tracking-[-0.015em] text-ink-900">
            {portName}
          </div>
          <div className="font-body mt-0.5 truncate text-[13px] text-ink-500">
            {country || "—"}
            {code ? <span className="font-mono ml-2 text-ink-200">· {code}</span> : null}
          </div>
        </div>
      </div>
      <div className="mt-5">
        <Link
          href="/lanes"
          className="font-display inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 transition hover:border-brand-blue/40 hover:text-brand-blue-700"
        >
          Browse all lanes <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
