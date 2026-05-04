import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { MarketingGlobe } from "@/components/sections/MarketingGlobe";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Trade Intelligence for Logistics Prospecting | LIT",
  description:
    "Search import/export activity, shipment records, trade lanes, TEU, suppliers, and company movement to find better logistics prospects.",
  path: "/trade-intelligence",
  eyebrow: "Trade Intelligence",
});

const FEATURES = [
  { icon: "Search", tag: "Active companies", title: "Search businesses with real recent shipment activity", body: "Skip the dead leads. LIT scopes search to companies actually moving freight in your target window." },
  { icon: "Route", tag: "Lanes", title: "Analyze every origin → destination that matters", body: "See where freight is moving, lane share, recent route activity, and where your services may fit." },
  { icon: "BarChart3", tag: "Volume", title: "Qualify with shipments, TEU, and cadence", body: "Use 12-month shipment counts, container types, and monthly cadence to size the account before reaching out." },
  { icon: "TrendingUp", tag: "Change", title: "Spot the moments that create reasons to reach out", body: "Recent shipment movement, lane shifts, supplier changes, and volume growth all create timing to act." },
  { icon: "Anchor", tag: "Ports & gateways", title: "Inbound + outbound activity by port", body: "Track ports, gateways, and rail/air/sea modal mix to find shippers concentrated in your coverage." },
  { icon: "Hash", tag: "HS codes", title: "Filter by what's being shipped, not just by who", body: "HS-code-level shipment intelligence joins commodity to importer to lane." },
];

export default function TradeIntelligencePage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Trade intelligence"
        title="Find prospects based on"
        titleHighlight="how freight actually moves."
        subtitle="LIT helps logistics teams search companies by trade activity, not guesswork. Find importers, exporters, lanes, suppliers, shipment volume, and account patterns that point to real opportunity."
        primaryCta={{ label: "Start Prospecting", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Explore Pulse", href: "/pulse" }}
      />

      <section className="px-8 pb-12">
        <div className="mx-auto max-w-container">
          <div
            className="relative overflow-hidden rounded-3xl border border-white/10 px-8 py-10"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18), 0 30px 80px -20px rgba(15,23,42,0.5)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full opacity-50"
              style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
            />
            <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div>
                <div
                  className="font-display text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "#00F0FF" }}
                >
                  Live trade graph
                </div>
                <h2 className="font-display mt-3 text-[28px] font-semibold leading-tight tracking-[-0.015em] text-white">
                  500+ origin × destination lanes, refreshed daily.
                </h2>
                <p className="font-body mt-3 max-w-[480px] text-[14.5px] leading-relaxed text-ink-150">
                  Top 25 shippers per lane with verified company + contact data. Save lanes to your
                  watchlist and Pulse Coach surfaces shifts in TEU, carriers, and shipper mix.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/lanes"
                    className="font-display inline-flex h-11 items-center gap-1.5 rounded-md bg-white/10 px-4 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/15"
                  >
                    Browse trade lanes →
                  </Link>
                  <Link
                    href="/ports"
                    className="font-display inline-flex h-11 items-center gap-1.5 rounded-md bg-white/10 px-4 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/15"
                  >
                    Browse ports →
                  </Link>
                </div>
              </div>
              <div className="mx-auto" style={{ maxWidth: 420 }}>
                <MarketingGlobe size={420} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureGrid
        eyebrow="What's inside"
        title="Six layers of trade intelligence in one workspace."
        features={FEATURES}
        cols={3}
      />

      <CtaBanner
        eyebrow="Trade data isn't enough"
        title="See trade signals turn into pipeline."
        subtitle="Pulse joins trade intelligence to verified contacts, account briefs, and outbound — so a signal becomes a meeting in the same week."
        primaryCta={{ label: "Start Prospecting", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a Demo", href: "/demo" }}
      />
    </PageShell>
  );
}
