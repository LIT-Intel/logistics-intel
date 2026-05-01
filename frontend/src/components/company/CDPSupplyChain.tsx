import { useMemo, useState } from "react";
import { ArrowRight, Sparkles, Info, Container } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitFlag from "@/components/ui/LitFlag";
import LitPill from "@/components/ui/LitPill";
import GlobeCanvas, { type GlobeLane } from "@/components/GlobeCanvas";
import { canonicalizeLanes } from "@/lib/laneGlobe";

type SubTabId = "summary" | "lanes" | "providers" | "shipments" | "products";

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "lanes", label: "Trade Lanes" },
  { id: "providers", label: "Service Providers" },
  { id: "shipments", label: "Shipments" },
  { id: "products", label: "Products" },
];

type CDPSupplyChainProps = {
  profile?: any;
  routeKpis?: any;
  selectedYear?: number;
  years?: number[];
  onSelectYear?: (year: number) => void;
};

/**
 * Phase 3 (rev. Phase 4) — Supply Chain tab.
 *
 * Sub-tab structure:
 *   Summary           — Monthly Cadence (FCL/LCL by month) + Imports by mode +
 *                       Container Profile + Recent BOL preview + Top suppliers
 *   Trade Lanes       — Globe + ranked-lane card + Combined Trade Lane
 *                       Intelligence table (lane × carrier × forwarder ×
 *                       container × FCL/LCL × trend)
 *   Service Providers — Carrier / Steamship Line Mix + Forwarder Mix
 *   Shipments         — Compact BOL preview table with carrier / supplier /
 *                       container / HS code per row
 *   Products          — Product / commodity ranking
 *
 * All modules render real data from `profile` props with honest empty
 * states when the field isn't populated. No normalization logic — when
 * a backend field is missing, we surface a fallback message and mark
 * the module so a future enrichment pass can flip it on.
 */
export default function CDPSupplyChain({
  profile,
  routeKpis,
  selectedYear,
  years,
  onSelectYear,
}: CDPSupplyChainProps) {
  const [sub, setSub] = useState<SubTabId>("summary");

  // ── Aggregates ───────────────────────────────────────────────────────
  const canonicalLanes = useMemo(() => {
    const raw = readTopRoutes(profile, routeKpis);
    if (!raw.length) return [];
    const { canonical } = canonicalizeLanes(raw);
    return canonical;
  }, [profile, routeKpis]);

  const recentBols = useMemo(() => {
    const items =
      profile?.recentBols ||
      profile?.recent_bols ||
      profile?.bols ||
      profile?.shipments ||
      [];
    return Array.isArray(items) ? items : [];
  }, [profile]);

  const carriers = useMemo(() => deriveCarriers(profile, recentBols), [profile, recentBols]);
  const forwarders = useMemo(() => deriveForwarders(profile, recentBols), [profile, recentBols]);
  const modes = useMemo(() => deriveModes(profile), [profile]);
  const suppliers = useMemo(
    () => deriveSuppliers(profile, recentBols),
    [profile, recentBols],
  );
  const products = useMemo(
    () => deriveProducts(profile, recentBols),
    [profile, recentBols],
  );
  const containerProfile = useMemo(() => deriveContainerProfile(profile), [profile]);
  const cadence = useMemo(() => deriveCadence(profile), [profile]);

  const briefHeadline = useMemo(() => {
    if (canonicalLanes.length === 0) return null;
    const top = canonicalLanes[0];
    const total = canonicalLanes.reduce(
      (sum: number, l: any) => sum + (Number(l.shipments) || 0),
      0,
    );
    const share =
      total > 0 ? Math.round((Number(top.shipments) / total) * 100) : null;
    const fromName = top.fromMeta?.countryName || top.fromMeta?.label || "Origin";
    const toName = top.toMeta?.countryName || top.toMeta?.label || "Destination";
    if (share != null) {
      return `${fromName} → ${toName} carries ${share}% of trailing-12m volume.`;
    }
    return `${fromName} → ${toName} is the dominant lane.`;
  }, [canonicalLanes]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Sub-tabs + year selector */}
      <div className="flex items-center gap-1.5 self-start rounded-lg bg-slate-100 p-1">
        {SUB_TABS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSub(s.id)}
            className={[
              "font-display whitespace-nowrap rounded-md px-3 py-1 text-[12px] font-semibold",
              sub === s.id
                ? "border border-slate-200 bg-white text-slate-900 shadow-sm"
                : "border border-transparent text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {s.label}
          </button>
        ))}
        {Array.isArray(years) && years.length > 1 && onSelectYear && (
          <select
            value={selectedYear ?? years[0]}
            onChange={(e) => onSelectYear(Number(e.target.value))}
            className="font-mono ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Strategic brief — premium dark gradient */}
      <StrategicBriefBanner
        headline={briefHeadline}
        recentBols={recentBols}
        canonicalLanes={canonicalLanes}
      />

      {/* Sub-tab content */}
      {sub === "summary" && (
        <SummaryView
          cadence={cadence}
          modes={modes}
          containerProfile={containerProfile}
          recentBols={recentBols}
          suppliers={suppliers}
        />
      )}
      {sub === "lanes" && (
        <LanesView
          canonicalLanes={canonicalLanes}
          carriers={carriers}
          forwarders={forwarders}
          containerProfile={containerProfile}
          recentBols={recentBols}
        />
      )}
      {sub === "providers" && (
        <ProvidersView carriers={carriers} forwarders={forwarders} />
      )}
      {sub === "shipments" && (
        <ShipmentsView recentBols={recentBols} />
      )}
      {sub === "products" && <ProductsView products={products} />}
    </div>
  );
}

/* ── Strategic brief banner ───────────────────────────────────────────── */

function StrategicBriefBanner({
  headline,
  recentBols,
  canonicalLanes,
}: {
  headline: string | null;
  recentBols: any[];
  canonicalLanes: any[];
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-[18px]"
      style={{
        background:
          "linear-gradient(135deg, #0B1736 0%, #0F1D38 60%, #102240 100%)",
        borderColor: "#1E293B",
      }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-60 w-60"
        style={{
          background:
            "radial-gradient(circle, rgba(0,240,255,0.15) 0%, transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative mb-2 flex items-center gap-2">
        <Sparkles className="h-3 w-3" style={{ color: "#00F0FF" }} />
        <span
          className="font-display text-[9px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "#00F0FF" }}
        >
          What matters now
        </span>
        <span className="h-px w-8" style={{ background: "rgba(0,240,255,0.3)" }} />
        <span className="font-display text-[9px] font-semibold text-slate-400">
          Trailing 12 months
        </span>
      </div>
      <div
        className="font-display text-[18px] font-semibold leading-relaxed tracking-tight"
        style={{ color: "#F8FAFC" }}
      >
        {headline || (
          <span style={{ color: "#94A3B8" }}>
            Brief activates once trade lanes load.
          </span>
        )}
      </div>
      <div
        className="font-body relative mt-2 max-w-[680px] text-[13px] leading-relaxed"
        style={{ color: "#CBD5E1" }}
      >
        {canonicalLanes.length > 0 ? (
          <>
            <strong style={{ color: "#F8FAFC" }}>
              {canonicalLanes.length} active{" "}
              {canonicalLanes.length === 1 ? "lane" : "lanes"}
            </strong>{" "}
            across this account's trailing-12m import history.
            {recentBols.length > 0 && (
              <>
                {" "}
                Most recent shipment recorded{" "}
                {formatRelativeShort(getBolDate(recentBols[0]))}.
              </>
            )}
          </>
        ) : (
          "Insights appear once at least one trade lane has reportable activity."
        )}
      </div>
    </div>
  );
}

/* ── Summary view ─────────────────────────────────────────────────────── */

function SummaryView({
  cadence,
  modes,
  containerProfile,
  recentBols,
  suppliers,
}: {
  cadence: CadencePoint[];
  modes: ModeSlice[];
  containerProfile: ContainerProfile;
  recentBols: any[];
  suppliers: SupplierRow[];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <MonthlyCadenceCard cadence={cadence} />
        <ImportsByModeCard modes={modes} />
      </div>

      <ContainerProfileCard profile={containerProfile} />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <RecentBolsCompactCard recentBols={recentBols.slice(0, 5)} />
        <TopSuppliersCard suppliers={suppliers} />
      </div>
    </>
  );
}

/* ── Trade Lanes view ─────────────────────────────────────────────────── */

function LanesView({
  canonicalLanes,
  carriers,
  forwarders,
  containerProfile,
  recentBols,
}: {
  canonicalLanes: any[];
  carriers: CarrierRow[];
  forwarders: ForwarderRow[];
  containerProfile: ContainerProfile;
  recentBols: any[];
}) {
  return (
    <>
      <TopLanesCard canonicalLanes={canonicalLanes} />
      <CombinedLaneIntelligenceTable
        canonicalLanes={canonicalLanes}
        carriers={carriers}
        forwarders={forwarders}
        containerProfile={containerProfile}
        recentBols={recentBols}
      />
    </>
  );
}

/* ── Service Providers view ───────────────────────────────────────────── */

function ProvidersView({
  carriers,
  forwarders,
}: {
  carriers: CarrierRow[];
  forwarders: ForwarderRow[];
}) {
  return (
    <>
      <CarrierMixCard carriers={carriers} />
      <ForwarderMixCard forwarders={forwarders} />
    </>
  );
}

/* ── Shipments view ───────────────────────────────────────────────────── */

function ShipmentsView({ recentBols }: { recentBols: any[] }) {
  if (recentBols.length === 0) {
    return (
      <LitSectionCard title="Recent shipments" sub="BOL records">
        <EmptyMessage text="No recent shipments to display." />
      </LitSectionCard>
    );
  }
  return <BolPreviewTable recentBols={recentBols.slice(0, 25)} />;
}

/* ── Products view ────────────────────────────────────────────────────── */

function ProductsView({ products }: { products: ProductRow[] }) {
  if (products.length === 0) {
    return (
      <LitSectionCard
        title="Products / Commodities"
        sub="From BOL descriptions"
      >
        <EmptyMessage text="No product data on file. Refresh enrichment when ImportYeti has indexed shipments." />
      </LitSectionCard>
    );
  }
  const productTotal = products.reduce((s, p) => s + p.count, 0);
  return (
    <LitSectionCard
      title="Products / Commodities"
      sub={`Top ${products.length}`}
    >
      <div className="flex flex-col gap-2.5">
        {products.map((p) => (
          <SplitBar
            key={p.label}
            label={p.label}
            value={p.count}
            total={productTotal}
            color="#F59E0B"
            sublabel={p.hsCode ? `HS ${p.hsCode}` : null}
          />
        ))}
      </div>
    </LitSectionCard>
  );
}

/* ── Modules ──────────────────────────────────────────────────────────── */

function MonthlyCadenceCard({ cadence }: { cadence: CadencePoint[] }) {
  if (!cadence.length) {
    return (
      <LitSectionCard
        title="Monthly shipment cadence"
        sub="Trailing 12 months · FCL & LCL"
      >
        <EmptyMessage text="Cadence chart appears once monthly time-series data is on file." />
      </LitSectionCard>
    );
  }
  const max = Math.max(...cadence.map((c) => c.fcl + c.lcl), 1);
  const chartHeight = 156;
  const [hoveredPoint, setHoveredPoint] = useState<CadencePoint | null>(null);
  const totalFcl = cadence.reduce((s, c) => s + c.fcl, 0);
  const totalLcl = cadence.reduce((s, c) => s + c.lcl, 0);
  const totalShip = totalFcl + totalLcl;
  const fclShare = totalShip > 0 ? Math.round((totalFcl / totalShip) * 100) : 0;
  const peak = cadence.reduce(
    (best, p) => (p.fcl + p.lcl > best.fcl + best.lcl ? p : best),
    cadence[0],
  );
  const avg = Math.round(totalShip / cadence.length);

  return (
    <LitSectionCard
      title="Monthly shipment cadence"
      sub="Trailing 12 months · FCL & LCL"
      action={
        <div className="flex gap-3">
          <span className="font-display inline-flex items-center gap-1 text-[10px] text-slate-500">
            <span className="h-2 w-2 rounded-sm bg-blue-500" />
            FCL
          </span>
          <span className="font-display inline-flex items-center gap-1 text-[10px] text-slate-500">
            <span className="h-2 w-2 rounded-sm bg-cyan-300" />
            LCL
          </span>
        </div>
      }
    >
      <div
        className="relative flex items-end gap-1.5 overflow-visible"
        style={{ height: chartHeight + 36 }}
      >
        {cadence.map((p, i) => {
          const total = p.fcl + p.lcl;
          const fclH = total > 0 ? (p.fcl / max) * chartHeight : 0;
          const lclH = total > 0 ? (p.lcl / max) * chartHeight : 0;
          const isLast = i === cadence.length - 1;
          const isHovered = hoveredPoint?.label === p.label;
          return (
            <div
              key={`${p.label}-${i}`}
              className="relative flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              {isHovered && (
                <div
                  className="font-display pointer-events-none absolute z-20 min-w-[150px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
                  style={{ bottom: chartHeight + 8, left: "50%", transform: "translateX(-50%)" }}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="opacity-90">Total: {(p.fcl + p.lcl).toLocaleString()} shipments</div>
                  <div className="opacity-90">FCL: {p.fcl.toLocaleString()}</div>
                  <div className="opacity-90">LCL: {p.lcl.toLocaleString()}</div>
                  {p.teu != null && Number(p.teu) > 0 && (
                    <div className="opacity-90">TEU: {Number(p.teu).toLocaleString()}</div>
                  )}
                </div>
              )}
              <div
                className="relative flex w-full flex-col items-stretch justify-end"
                style={{ height: chartHeight }}
              >
                {p.lcl > 0 && (
                  <div
                    className={[
                      "rounded-t-sm",
                      isLast ? "bg-cyan-400" : "bg-cyan-300",
                    ].join(" ")}
                    style={{ height: lclH }}
                  />
                )}
                {p.fcl > 0 && (
                  <div
                    className={[
                      "min-h-[2px]",
                      p.lcl > 0 ? "" : "rounded-t-sm",
                      isLast ? "bg-blue-600" : "bg-blue-500",
                    ].join(" ")}
                    style={{ height: fclH }}
                  />
                )}
                {total === 0 && (
                  <div className="mt-auto h-px w-full bg-slate-100" />
                )}
              </div>
              <span
                className={[
                  "font-display mt-1 text-[9px]",
                  isLast ? "font-bold text-slate-700" : "text-slate-400",
                ].join(" ")}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between border-t border-slate-100 pt-2.5 text-center">
        <Stat label="Peak month" value={`${peak.label} · ${peak.fcl + peak.lcl}`} />
        <Stat label="Avg / mo" value={String(avg)} />
        <Stat label="FCL share" value={`${fclShare}%`} accent />
        <Stat label="Months on file" value={String(cadence.length)} />
      </div>
    </LitSectionCard>
  );
}

function ImportsByModeCard({ modes }: { modes: ModeSlice[] }) {
  if (modes.length === 0) {
    return (
      <LitSectionCard title="Imports by mode" sub="Modal split">
        <EmptyMessage text="Modal split unavailable." />
      </LitSectionCard>
    );
  }
  return (
    <LitSectionCard title="Imports by mode" sub="Modal split · trailing 12m">
      <div className="flex flex-col gap-2.5">
        {modes.map((m) => (
          <div key={m.mode} className="flex items-center gap-2.5">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
              style={{ background: m.color + "18", color: m.color }}
            >
              {m.mode.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-display text-[12px] font-semibold text-slate-900">
                  {m.mode}
                </span>
                <span className="font-mono text-[11px] text-slate-700">
                  {m.count.toLocaleString()}{" "}
                  <span className="text-slate-400">· {m.pct}%</span>
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full rounded"
                  style={{ width: `${m.pct}%`, background: m.color }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </LitSectionCard>
  );
}

function ContainerProfileCard({ profile }: { profile: ContainerProfile }) {
  const hasData =
    profile.fcl + profile.lcl > 0 ||
    profile.lengths.length > 0 ||
    profile.isoCodes.length > 0;
  return (
    <LitSectionCard
      title="Container profile"
      sub="FCL / LCL split · top container lengths · ISO codes"
      action={
        <span className="font-display inline-flex items-center gap-1 text-[10px] text-slate-400">
          <Container className="h-2.5 w-2.5" />
          {profile.totalShipments > 0
            ? `${profile.totalShipments.toLocaleString()} shipments`
            : "—"}
        </span>
      }
    >
      {!hasData ? (
        <EmptyMessage text="Container details (FCL/LCL split, container lengths, ISO codes) appear once enrichment completes." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_1fr]">
          {/* FCL/LCL split */}
          <div>
            <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              FCL / LCL split
            </div>
            <div className="space-y-1.5">
              <SplitBar
                label="FCL"
                value={profile.fcl}
                total={profile.fcl + profile.lcl}
                color="#3B82F6"
              />
              <SplitBar
                label="LCL"
                value={profile.lcl}
                total={profile.fcl + profile.lcl}
                color="#67E8F9"
              />
            </div>
          </div>

          {/* Top container lengths */}
          <div>
            <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Top container lengths
            </div>
            {profile.lengths.length === 0 ? (
              <p className="font-body text-[11px] text-slate-400">
                Not specified on file.
              </p>
            ) : (
              <div className="space-y-1.5">
                {(() => {
                  const lengthTotal = profile.lengths.reduce((s, x) => s + x.count, 0);
                  return profile.lengths.slice(0, 4).map((l) => (
                    <SplitBar
                      key={l.label}
                      label={l.label}
                      value={l.count}
                      total={lengthTotal}
                      color="#06B6D4"
                      badge={l.yoy ? <YoyPill value={l.yoy} /> : null}
                      extraLabel={l.teu != null ? "TEU" : undefined}
                      extraValue={l.teu ?? null}
                    />
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Top ISO codes */}
          <div>
            <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Top ISO container codes
            </div>
            {profile.isoCodes.length === 0 ? (
              <p className="font-body text-[11px] text-slate-400">
                ISO codes not surfaced on this account yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {(() => {
                  const isoTotal = profile.isoCodes.reduce((s, x) => s + x.count, 0);
                  return profile.isoCodes.slice(0, 5).map((c) => (
                    <SplitBar
                      key={c.code}
                      label={c.code}
                      value={c.count}
                      total={isoTotal}
                      color="#8B5CF6"
                      sublabel={c.group || null}
                    />
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </LitSectionCard>
  );
}

function TopLanesCard({ canonicalLanes }: { canonicalLanes: any[] }) {
  if (canonicalLanes.length === 0) {
    return (
      <LitSectionCard
        title="Top trade lanes"
        sub="By trailing-12m share"
      >
        <EmptyMessage text="No lane data yet — refresh enrichment when ImportYeti has indexed this company." />
      </LitSectionCard>
    );
  }
  const globeLanes: GlobeLane[] = canonicalLanes.slice(0, 6).map((l: any) => ({
    id: l.displayLabel,
    from: l.fromMeta.canonicalKey,
    to: l.toMeta.canonicalKey,
    coords: [l.fromMeta.coords, l.toMeta.coords],
    fromMeta: l.fromMeta,
    toMeta: l.toMeta,
    shipments: Number(l.shipments) || 0,
  }));
  const [selectedId, setSelectedId] = useState<string | null>(globeLanes[0]?.id || null);

  return (
    <LitSectionCard
      title="Top trade lanes"
      sub="Globe + ranked share"
      padded={false}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,300px)_1fr]">
        <div className="flex items-center justify-center bg-slate-50 p-3">
          <GlobeCanvas
            lanes={globeLanes}
            selectedLane={selectedId}
            size={260}
            theme="trade"
            showFlagPins
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {canonicalLanes.slice(0, 8).map((lane: any, i: number) => (
            <button
              key={lane.displayLabel}
              type="button"
              onClick={() =>
                setSelectedId(selectedId === lane.displayLabel ? null : lane.displayLabel)
              }
              className={[
                "flex w-full items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0",
                selectedId === lane.displayLabel
                  ? "border-l-2 border-l-blue-500 bg-blue-50"
                  : "border-l-2 border-l-transparent hover:bg-slate-50/60",
              ].join(" ")}
            >
              <LaneRowInner lane={lane} index={i} highlight={selectedId === lane.displayLabel} />
            </button>
          ))}
        </div>
      </div>
    </LitSectionCard>
  );
}

function CombinedLaneIntelligenceTable({
  canonicalLanes,
  carriers,
  forwarders,
  containerProfile,
  recentBols,
}: {
  canonicalLanes: any[];
  carriers: CarrierRow[];
  forwarders: ForwarderRow[];
  containerProfile: ContainerProfile;
  recentBols: any[];
}) {
  if (canonicalLanes.length === 0) {
    return null;
  }
  const dominantContainer =
    containerProfile.lengths[0]?.label || containerProfile.topContainerLabel || "—";
  const fclLclLabel =
    containerProfile.fcl + containerProfile.lcl > 0
      ? containerProfile.fcl >= containerProfile.lcl
        ? "FCL"
        : "LCL"
      : "—";
  return (
    <LitSectionCard
      title="Combined trade lane intelligence"
      sub="Lane × carrier × forwarder × container × FCL/LCL"
      padded={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FAFBFC]">
              {[
                "Lane",
                "Shipments",
                "TEU",
                "Top carrier",
                "Top forwarder",
                "Container",
                "FCL/LCL",
                "Trend",
                "Last activity",
              ].map((h) => (
                <th
                  key={h}
                  className="font-display whitespace-nowrap border-b border-slate-100 px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {canonicalLanes.slice(0, 8).map((lane: any, i: number, arr: any[]) => {
              const lastBol = recentBols.find((b) => bolMatchesLane(b, lane));
              const trend = lane.trend || lane.yoy || null;
              const trendUp = trendIsPositive(trend);
              return (
                <tr
                  key={lane.displayLabel}
                  className={[
                    "border-b border-slate-100 hover:bg-slate-50/60",
                    i === arr.length - 1 ? "last:border-b-0" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <LitFlag
                        code={lane.fromMeta?.countryCode}
                        size={12}
                        label={lane.fromMeta?.countryName}
                      />
                      <span className="font-mono text-[11px] font-semibold text-slate-900">
                        {lane.fromMeta?.countryName || lane.fromMeta?.label}
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="h-2 w-2 text-slate-300"
                      />
                      <LitFlag
                        code={lane.toMeta?.countryCode}
                        size={12}
                        label={lane.toMeta?.countryName}
                      />
                      <span className="font-mono text-[11px] font-semibold text-slate-900">
                        {lane.toMeta?.countryName || lane.toMeta?.label}
                      </span>
                    </span>
                  </td>
                  <td className="font-mono px-3 py-2.5 text-[11px] text-slate-700">
                    {(Number(lane.shipments) || 0).toLocaleString()}
                  </td>
                  <td className="font-mono px-3 py-2.5 text-[11px] text-slate-700">
                    {Number(lane.teu) > 0
                      ? Math.round(Number(lane.teu)).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {carriers[0]?.name ? (
                      <span className="font-display text-[11px] font-semibold text-slate-900">
                        {carriers[0].name}
                      </span>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {forwarders[0]?.name ? (
                      <span className="font-display truncate text-[11px] font-semibold text-slate-900">
                        {forwarders[0].name}
                      </span>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <LitPill tone="slate">{dominantContainer}</LitPill>
                  </td>
                  <td className="px-3 py-2.5">
                    <LitPill tone={fclLclLabel === "FCL" ? "blue" : "purple"}>
                      {fclLclLabel}
                    </LitPill>
                  </td>
                  <td className="px-3 py-2.5">
                    {trend ? (
                      <span
                        className={[
                          "font-mono text-[11px] font-semibold",
                          trendUp === true
                            ? "text-green-700"
                            : trendUp === false
                              ? "text-red-700"
                              : "text-slate-500",
                        ].join(" ")}
                      >
                        {trendUp === true ? "↑ " : trendUp === false ? "↓ " : ""}
                        {trend}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="font-mono px-3 py-2.5 text-[10px] text-slate-500">
                    {formatRelativeShort(getBolDate(lastBol))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </LitSectionCard>
  );
}

function CarrierMixCard({ carriers }: { carriers: CarrierRow[] }) {
  if (carriers.length === 0) {
    return (
      <LitSectionCard
        title="Carrier / Steamship Line Mix"
        sub="Top carriers by shipment count"
      >
        <EmptyMessage
          text={
            "Carrier identity not surfaced on this account yet. Carrier may be inferable from Master Bill prefix when direct fields are absent."
          }
        />
      </LitSectionCard>
    );
  }
  const totalShipments = carriers.reduce((s, c) => s + c.shipments, 0);
  const totalTeu = carriers.reduce((s, c) => s + (c.teu || 0), 0);
  return (
    <LitSectionCard
      title="Carrier / Steamship Line Mix"
      sub="Top carriers · share by shipments and TEU"
      action={
        <span className="font-mono text-[10px] font-semibold text-slate-500">
          {carriers.length} carrier{carriers.length === 1 ? "" : "s"}
        </span>
      }
      padded={false}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFBFC]">
            {["Carrier", "Source", "Shipments", "TEU", "Trend"].map((h) => (
              <th
                key={h}
                className="font-display whitespace-nowrap border-b border-slate-100 px-4 py-2 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {carriers.map((c, i) => {
            const shipShare = totalShipments > 0 ? c.shipments / totalShipments : 0;
            const teuShare = totalTeu > 0 ? (c.teu || 0) / totalTeu : 0;
            return (
              <tr
                key={c.name}
                className="border-b border-slate-100 last:border-b-0"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-[18px] w-[18px] items-center justify-center rounded text-[10px] font-bold"
                      style={{
                        background: PROVIDER_COLORS[i % PROVIDER_COLORS.length] + "18",
                        color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
                      }}
                    >
                      {c.name.charAt(0)}
                    </div>
                    <span className="font-display text-[12px] font-semibold text-slate-900">
                      {c.name}
                    </span>
                    {c.scac && (
                      <span className="font-mono text-[9px] uppercase text-slate-400">
                        {c.scac}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {c.inferred ? (
                    <LitPill
                      tone="amber"
                      icon={<Info className="h-2 w-2" />}
                    >
                      Inferred
                    </LitPill>
                  ) : (
                    <LitPill tone="green">Direct</LitPill>
                  )}
                </td>
                <td className="w-44 px-4 py-2.5">
                  <ShareBar
                    share={shipShare}
                    color={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
                    label={c.shipments.toLocaleString()}
                    tooltipTitle={c.name}
                    tooltipExtra={c.teu != null ? `TEU: ${Math.round(c.teu).toLocaleString()}` : undefined}
                  />
                </td>
                <td className="w-44 px-4 py-2.5">
                  {c.teu != null ? (
                    <ShareBar
                      share={teuShare}
                      color="#0EA5E9"
                      label={Math.round(c.teu).toLocaleString()}
                      tooltipTitle={c.name}
                      tooltipExtra={`Shipments: ${c.shipments.toLocaleString()}`}
                    />
                  ) : (
                    <span className="font-body text-[11px] text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {c.trend ? (
                    <span
                      className={[
                        "font-mono text-[11px] font-semibold",
                        c.up === true
                          ? "text-green-700"
                          : c.up === false
                            ? "text-red-700"
                            : "text-slate-500",
                      ].join(" ")}
                    >
                      {c.up === true ? "↑ " : c.up === false ? "↓ " : ""}
                      {c.trend}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {carriers.some((c) => c.inferred) && (
        <div className="font-body border-t border-slate-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-700">
          <Info className="mr-1 inline h-3 w-3" />
          Some carriers are inferred from Master Bill of Lading prefixes when
          direct carrier fields are absent.
        </div>
      )}
    </LitSectionCard>
  );
}

function ForwarderMixCard({ forwarders }: { forwarders: ForwarderRow[] }) {
  if (forwarders.length === 0) {
    return (
      <LitSectionCard
        title="Forwarder / Service Provider Mix"
        sub="Forwarders, customs brokers, notify parties, suppliers"
      >
        <EmptyMessage text="Forwarder/provider data not surfaced on this account yet." />
      </LitSectionCard>
    );
  }
  const total = forwarders.reduce((s, f) => s + f.shipments, 0);
  const top = forwarders[0];
  const topShare = total > 0 ? top.shipments / total : 0;
  const concentrated = topShare > 0.4;
  return (
    <LitSectionCard
      title="Forwarder / Service Provider Mix"
      sub="Top providers · ranked by shipment touchpoints"
      action={
        <span className="font-mono text-[10px] font-semibold text-slate-500">
          {forwarders.length} provider{forwarders.length === 1 ? "" : "s"}
        </span>
      }
    >
      {concentrated && (
        <div className="font-body mb-3 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-[11px] text-purple-700">
          <strong>{top.name}</strong> covers {Math.round(topShare * 100)}% of
          provider touchpoints — potential displacement opportunity.
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {forwarders.map((f, i) => (
          <div
            key={f.name + i}
            className="flex items-center gap-2.5 border-b border-slate-100 pb-2 last:border-b-0"
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
              style={{
                background: PROVIDER_COLORS[i % PROVIDER_COLORS.length] + "18",
                color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
              }}
            >
              {f.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-display truncate text-[12px] font-semibold text-slate-900">
                  {f.name}
                </span>
                {f.roles.map((role) => (
                  <LitPill key={role} tone={roleToTone(role)}>
                    {role}
                  </LitPill>
                ))}
              </div>
              <div className="font-mono mt-0.5 text-[10px] text-slate-400">
                {f.shipments.toLocaleString()} shipments
                {f.teu != null && Number(f.teu) > 0 ? (
                  <> · {Math.round(Number(f.teu)).toLocaleString()} TEU</>
                ) : null}
                {f.lastShipment ? (
                  <> · last {formatRelativeShort(f.lastShipment)}</>
                ) : null}
                {f.countries && f.countries.length > 0 ? (
                  <> · {f.countries.slice(0, 3).join(", ")}</>
                ) : null}
              </div>
            </div>
            <div className="w-20 shrink-0">
              <ShareBar
                share={total > 0 ? f.shipments / total : 0}
                color={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
                hideLabel
                tooltipTitle={f.name}
                label={f.shipments.toLocaleString()}
                tooltipExtra={f.teu != null ? `TEU: ${Math.round(Number(f.teu)).toLocaleString()}` : undefined}
              />
            </div>
          </div>
        ))}
      </div>
    </LitSectionCard>
  );
}

function RecentBolsCompactCard({ recentBols }: { recentBols: any[] }) {
  if (recentBols.length === 0) {
    return (
      <LitSectionCard title="Recent shipments" sub="Latest BOLs">
        <EmptyMessage text="No recent shipments to display." />
      </LitSectionCard>
    );
  }
  return (
    <LitSectionCard
      title="Recent shipments"
      sub={`Latest ${recentBols.length} BOL records`}
      padded={false}
    >
      {recentBols.map((bol, i, arr) => (
        <ShipmentRow key={i} bol={bol} isLast={i === arr.length - 1} />
      ))}
    </LitSectionCard>
  );
}

function BolPreviewTable({ recentBols }: { recentBols: any[] }) {
  return (
    <LitSectionCard
      title="Recent BOLs"
      sub={`${recentBols.length} latest records · expand to see HS / weight / quantity`}
      padded={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FAFBFC]">
              {[
                "Date",
                "Lane",
                "Carrier",
                "Supplier",
                "Container",
                "TEU",
                "FCL/LCL",
                "HS",
              ].map((h) => (
                <th
                  key={h}
                  className="font-display whitespace-nowrap border-b border-slate-100 px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentBols.map((bol, i, arr) => (
              <BolPreviewRow key={i} bol={bol} isLast={i === arr.length - 1} />
            ))}
          </tbody>
        </table>
      </div>
    </LitSectionCard>
  );
}

function BolPreviewRow({ bol, isLast }: { bol: any; isLast: boolean }) {
  // Phase 6 — broad BOL helpers; the row never renders "Invalid Date" /
  // empty lane / blank carrier when ANY of the multi-name fields are
  // present in the raw row.
  const dateLabel = formatBolDate(bol);
  const carrierMeta = readCarrier(bol);
  const carrierName = carrierMeta?.name || (() => {
    const s = getBolCarrierString(bol);
    return s === "—" ? null : s;
  })();
  const supplier = (() => {
    const s = getBolSupplier(bol);
    return s === "—" ? null : s;
  })();
  const teu = Number(bol?.teu) || Number(bol?.containers_teu) || null;
  const isLcl =
    Boolean(bol?.lcl) ||
    /lcl/i.test(String(bol?.mode || bol?.fcl_lcl || bol?.loadType || ""));
  const fclLcl = isLcl ? "LCL" : "FCL";
  const containerCount =
    Number(bol?.containers_count) ||
    Number(bol?.containersCount) ||
    Number(bol?.container_count) ||
    null;
  const containerType =
    bol?.container_type ||
    bol?.containerType ||
    bol?.raw?.container_group ||
    null;
  const hs = (() => {
    const s = getBolHs(bol);
    return s === "—" ? null : s;
  })();
  const origin = (() => {
    const s = getBolOrigin(bol);
    return s === "—" ? null : s;
  })();
  const destination = (() => {
    const s = getBolDestination(bol);
    return s === "—" ? null : s;
  })();
  return (
    <tr
      className={[
        "hover:bg-slate-50/60",
        !isLast ? "border-b border-slate-100" : "",
      ].join(" ")}
    >
      <td className="font-mono whitespace-nowrap px-3 py-2 text-[10px] text-slate-600">
        {dateLabel}
      </td>
      <td className="px-3 py-2">
        <span className="font-display whitespace-nowrap text-[11px] text-slate-700">
          {origin || <span className="text-slate-300">—</span>}{" "}
          <span className="text-slate-300">→</span>{" "}
          {destination || <span className="text-slate-300">—</span>}
        </span>
      </td>
      <td className="px-3 py-2">
        {carrierName ? (
          <span className="inline-flex items-center gap-1">
            <span className="font-display text-[11px] font-semibold text-slate-900">
              {carrierName}
            </span>
            {carrierMeta?.inferred && (
              <span title="Inferred from Master Bill prefix">
                <LitPill tone="amber" icon={<Info className="h-2 w-2" />}>
                  MBL
                </LitPill>
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="font-body truncate px-3 py-2 text-[11px] text-slate-600">
        {supplier || <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2">
        <span className="font-mono whitespace-nowrap text-[10px] text-slate-700">
          {containerCount != null ? containerCount.toString() : "—"}
          {containerType ? (
            <span className="text-slate-400"> · {containerType}</span>
          ) : null}
        </span>
      </td>
      <td className="font-mono px-3 py-2 text-[11px] font-semibold text-slate-900">
        {teu != null ? Number(teu).toFixed(1) : "—"}
      </td>
      <td className="px-3 py-2">
        <LitPill tone={isLcl ? "purple" : "blue"}>{fclLcl}</LitPill>
      </td>
      <td className="font-mono px-3 py-2 text-[10px] text-slate-500">
        {hs || <span className="text-slate-300">—</span>}
      </td>
    </tr>
  );
}

function ShipmentRow({ bol, isLast }: { bol: any; isLast: boolean }) {
  // Phase 6 — broad helpers + safe formatBolDate so the row never says
  // "Invalid Date" / "— → —" when the raw row uses non-standard field
  // names (foreign_port, us_port_of_unlading, place_of_receipt, etc.).
  const dateLabel = (() => {
    const d = parseBolDate(getBolDate(bol));
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();
  const carrier = readCarrier(bol);
  const carrierFallback = (() => {
    const s = getBolCarrierString(bol);
    return s === "—" ? null : s;
  })();
  const carrierLabel = carrier?.name || carrierFallback;
  const supplier = (() => {
    const s = getBolSupplier(bol);
    return s === "—" ? null : s;
  })();
  const origin = (() => {
    const s = getBolOrigin(bol);
    return s === "—" ? null : s;
  })();
  const destination = (() => {
    const s = getBolDestination(bol);
    return s === "—" ? null : s;
  })();
  const teu = Number(bol?.teu) || Number(bol?.containers_teu) || null;
  const isLcl =
    Boolean(bol?.lcl) ||
    /lcl/i.test(String(bol?.mode || bol?.fcl_lcl || bol?.loadType || ""));
  return (
    <div
      className={[
        "grid items-center gap-2 px-4 py-2.5",
        !isLast ? "border-b border-slate-100" : "",
      ].join(" ")}
      style={{ gridTemplateColumns: "84px 1fr 56px 56px" }}
    >
      <span className="font-mono whitespace-nowrap text-[10px] text-slate-500">
        {dateLabel}
      </span>
      <div className="min-w-0">
        {origin || destination ? (
          <div className="font-display truncate text-[11px] font-semibold text-slate-900">
            {origin || "—"} <span className="text-slate-400">→</span>{" "}
            {destination || "—"}
          </div>
        ) : (
          <div className="font-body text-[11px] text-slate-300">—</div>
        )}
        {(carrierLabel || supplier) && (
          <div className="font-body mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-slate-400">
            {carrierLabel && (
              <span className="truncate">
                {carrierLabel}
                {carrier?.inferred ? " · MBL" : ""}
              </span>
            )}
            {carrierLabel && supplier && <span className="text-slate-300">·</span>}
            {supplier && <span className="truncate">{supplier}</span>}
          </div>
        )}
      </div>
      <span
        className={[
          "font-display whitespace-nowrap rounded border px-1.5 py-0.5 text-center text-[9px] font-semibold",
          !isLcl
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-purple-200 bg-purple-50 text-purple-700",
        ].join(" ")}
      >
        {isLcl ? "LCL" : "FCL"}
      </span>
      <span className="font-mono text-right text-[11px] font-semibold text-slate-900">
        {teu != null ? `${Number(teu).toFixed(1)} TEU` : "—"}
      </span>
    </div>
  );
}

function SupplierRowInteractive({
  supplier: s,
  hasStats,
}: {
  supplier: SupplierRow;
  hasStats: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative flex items-center gap-2.5 rounded transition-colors hover:bg-emerald-50/50"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && hasStats && (
        <div
          className="font-display pointer-events-none absolute left-8 z-20 min-w-[180px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
          style={{ bottom: "100%", marginBottom: 6 }}
        >
          <div className="font-semibold">{s.name}</div>
          {s.country && <div className="text-[10px] opacity-75">{s.country}</div>}
          <div className="opacity-90">Shipments: {s.shipments.toLocaleString()}</div>
          {s.share > 0 && <div className="opacity-90">Share: {s.share}%</div>}
        </div>
      )}
      <div className="font-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[9px] font-bold text-slate-500">
        {(s.country || "").slice(0, 2).toUpperCase() || "—"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-[12px] font-semibold text-slate-900">
          {s.name}
        </div>
        {hasStats ? (
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-1 flex-1 overflow-hidden rounded bg-slate-100">
              <div
                className="h-full rounded bg-emerald-500 transition-all"
                style={{ width: `${s.share}%`, opacity: hover ? 1 : 0.85 }}
              />
            </div>
            <span className="font-mono whitespace-nowrap text-[10px] text-slate-500">
              {s.share > 0 ? `${s.share}% · ` : ""}
              {s.shipments.toLocaleString()} ship
            </span>
          </div>
        ) : (
          <div className="font-body mt-0.5 text-[10px] text-slate-400">
            Counterparty on file · count pending
          </div>
        )}
      </div>
    </div>
  );
}

function TopSuppliersCard({ suppliers }: { suppliers: SupplierRow[] }) {
  return (
    <LitSectionCard
      title="Top suppliers"
      sub="From verified BOL counterparties"
    >
      {suppliers.length === 0 ? (
        <EmptyMessage text="No supplier data on file." />
      ) : (
        <div className="flex flex-col gap-2">
          {suppliers.slice(0, 6).map((s, i) => {
            const hasStats = s.shipments > 0 && s.share >= 0;
            return (
              <SupplierRowInteractive key={s.name + i} supplier={s} hasStats={hasStats} />
            );
          })}
        </div>
      )}
    </LitSectionCard>
  );
}

function LaneRowInner({
  lane,
  index,
  highlight,
}: {
  lane: any;
  index: number;
  highlight: boolean;
}) {
  return (
    <>
      <span
        className={[
          "font-mono w-5 shrink-0 text-center text-[9px] font-bold",
          highlight ? "text-blue-700" : "text-slate-400",
        ].join(" ")}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <LitFlag
            code={lane.fromMeta?.countryCode}
            size={13}
            label={lane.fromMeta?.countryName}
          />
          <span
            className={[
              "font-mono text-[11px] font-semibold",
              highlight ? "text-blue-700" : "text-slate-700",
            ].join(" ")}
          >
            {lane.fromMeta?.countryName || lane.fromMeta?.label}
          </span>
          <ArrowRight className="h-2 w-2 text-slate-300" aria-hidden />
          <LitFlag
            code={lane.toMeta?.countryCode}
            size={13}
            label={lane.toMeta?.countryName}
          />
          <span
            className={[
              "font-mono text-[11px] font-semibold",
              highlight ? "text-blue-700" : "text-slate-700",
            ].join(" ")}
          >
            {lane.toMeta?.countryName || lane.toMeta?.label}
          </span>
          {index === 0 && <LitPill tone="blue">Primary</LitPill>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-500">
            {(Number(lane.shipments) || 0).toLocaleString()} ship
          </span>
          {Number(lane.teu) > 0 && (
            <span className="font-mono text-[10px] text-slate-400">
              {Math.round(Number(lane.teu)).toLocaleString()} TEU
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Atoms ────────────────────────────────────────────────────────────── */

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="text-left">
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
        {label}
      </div>
      <div
        className={[
          "font-mono text-[14px] font-bold",
          accent ? "text-green-700" : "text-slate-900",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function SplitBar({
  label,
  value,
  total,
  color,
  badge,
  extraLabel,
  extraValue,
  sublabel,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  badge?: React.ReactNode;
  extraLabel?: string;
  extraValue?: number | string | null;
  sublabel?: string | null;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (
        <div
          className="font-display pointer-events-none absolute left-0 z-20 min-w-[180px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
          style={{ bottom: "100%", marginBottom: 6 }}
        >
          <div className="font-semibold">{label}</div>
          {sublabel && <div className="text-[10px] opacity-75">{sublabel}</div>}
          <div className="opacity-90">Count: {Number(value).toLocaleString()}</div>
          {total > 0 && <div className="opacity-90">Share: {pct}%</div>}
          {extraLabel && extraValue != null && extraValue !== "" && (
            <div className="opacity-90">
              {extraLabel}: {typeof extraValue === "number" ? extraValue.toLocaleString() : extraValue}
            </div>
          )}
        </div>
      )}
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-display inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-900">
          {label}
          {badge}
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          {value.toLocaleString()} <span className="text-slate-400">· {pct}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-slate-100 transition-all hover:h-2.5">
        <div
          className="h-full rounded transition-opacity"
          style={{ width: `${pct}%`, background: color, opacity: hover ? 1 : 0.9 }}
        />
      </div>
    </div>
  );
}

function ShareBar({
  share,
  color,
  label,
  hideLabel,
  tooltipTitle,
  tooltipExtra,
}: {
  share: number;
  color: string;
  label?: string;
  hideLabel?: boolean;
  tooltipTitle?: string;
  tooltipExtra?: string;
}) {
  const [hover, setHover] = useState(false);
  const pct = Math.round(share * 100);
  return (
    <div
      className="relative flex items-center gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (tooltipTitle || tooltipExtra) && (
        <div
          className="font-display pointer-events-none absolute left-0 z-20 min-w-[160px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
          style={{ bottom: "100%", marginBottom: 6 }}
        >
          {tooltipTitle && <div className="font-semibold">{tooltipTitle}</div>}
          <div className="opacity-90">Share: {pct}%</div>
          {label && <div className="opacity-90">Count: {label}</div>}
          {tooltipExtra && <div className="opacity-90">{tooltipExtra}</div>}
        </div>
      )}
      <div className="h-1 flex-1 overflow-hidden rounded bg-slate-100 transition-all hover:h-1.5">
        <div
          className="h-full rounded transition-opacity"
          style={{
            width: `${Math.max(0, Math.min(100, share * 100))}%`,
            background: color,
            opacity: hover ? 1 : 0.9,
          }}
        />
      </div>
      {!hideLabel && (
        <span className="font-mono w-12 shrink-0 text-right text-[10px] text-slate-500">
          {label ?? `${pct}%`}
        </span>
      )}
    </div>
  );
}

function YoyPill({ value }: { value: string }) {
  const up = trendIsPositive(value);
  return (
    <LitPill tone={up === true ? "green" : up === false ? "red" : "slate"}>
      {up === true ? "↑ " : up === false ? "↓ " : ""}
      {value}
    </LitPill>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="px-6 py-8 text-center">
      <p className="font-body text-[12px] text-slate-400">{text}</p>
    </div>
  );
}

/* ── Data normalizers ─────────────────────────────────────────────────── */

type CadencePoint = { label: string; fcl: number; lcl: number; total: number; teu?: number | null };
type ModeSlice = { mode: string; count: number; pct: number; color: string };
type ContainerLength = { label: string; count: number; teu?: number; yoy?: string | null };
type ContainerIso = { code: string; group?: string; count: number };
type ContainerProfile = {
  fcl: number;
  lcl: number;
  totalShipments: number;
  topContainerLabel: string | null;
  lengths: ContainerLength[];
  isoCodes: ContainerIso[];
};
type CarrierRow = {
  name: string;
  scac?: string | null;
  shipments: number;
  teu?: number | null;
  trend?: string | null;
  up?: boolean | null;
  inferred: boolean;
};
type ForwarderRow = {
  name: string;
  roles: string[];
  shipments: number;
  teu?: number | null;
  lastShipment?: string | null;
  countries?: string[];
};
type SupplierRow = { name: string; country: string; shipments: number; share: number };
type ProductRow = { label: string; count: number; hsCode?: string | null };

function readTopRoutes(profile: any, routeKpis: any) {
  const candidates = [
    profile?.topRoutes,
    profile?.top_routes,
    profile?.routes,
    routeKpis?.topRoutes,
    routeKpis?.top_routes,
    routeKpis?.topRoutesLast12m,
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length) {
      return list
        .map((entry: any) => {
          const lane = entry?.lane || entry?.label || entry?.route;
          if (!lane || typeof lane !== "string") return null;
          return {
            lane,
            shipments: Number(entry.shipments) || Number(entry.count) || 0,
            teu: Number(entry.teu) || Number(entry.teuLast12m) || 0,
            spend: null,
          };
        })
        .filter(Boolean) as Array<{
        lane: string;
        shipments: number;
        teu: number;
        spend: null;
      }>;
    }
  }
  if (profile?.topRoute || profile?.top_route_12m || routeKpis?.topRouteLast12m) {
    const lane =
      profile?.topRoute ||
      profile?.top_route_12m ||
      routeKpis?.topRouteLast12m;
    if (lane && typeof lane === "string") {
      return [
        {
          lane,
          shipments:
            Number(profile?.totalShipments) ||
            Number(routeKpis?.shipmentsLast12m) ||
            0,
          teu:
            Number(profile?.teuLast12m) ||
            Number(routeKpis?.teuLast12m) ||
            0,
          spend: null,
        },
      ];
    }
  }
  return [];
}

function deriveCadence(profile: any): CadencePoint[] {
  const series = Array.isArray(profile?.timeSeries) ? profile.timeSeries : [];
  if (!series.length) return [];
  const points: CadencePoint[] = series
    .map((p: any) => {
      const label = formatMonthLabel(p?.month, p?.year);
      const fcl = Number(p?.fclShipments) || 0;
      const lcl = Number(p?.lclShipments) || 0;
      let total = fcl + lcl;
      if (total === 0) total = Number(p?.shipments) || 0;
      const teu = Number(p?.teu) || null;
      return { label, fcl, lcl, total, teu };
    })
    .filter((p: CadencePoint) => p.label);
  return points.slice(-12);
}

function deriveModes(profile: any): ModeSlice[] {
  // Prefer explicit modes; otherwise synthesize from FCL/LCL counts.
  const explicit = profile?.topModes || profile?.modes;
  if (Array.isArray(explicit) && explicit.length) {
    const total = explicit.reduce((s: number, e: any) => s + (Number(e?.count) || 0), 0);
    return explicit
      .filter((e: any) => e && (e.mode || e.name))
      .map((e: any, i: number) => ({
        mode: String(e.mode || e.name),
        count: Number(e.count) || 0,
        pct: total > 0 ? Math.round(((Number(e.count) || 0) / total) * 100) : 0,
        color: MODE_COLORS[i % MODE_COLORS.length],
      }));
  }
  const fcl = Number(profile?.containers?.fclShipments12m || profile?.fcl_shipments_all_time) || 0;
  const lcl = Number(profile?.containers?.lclShipments12m || profile?.lcl_shipments_all_time) || 0;
  const total = fcl + lcl;
  if (total === 0) return [];
  return [
    {
      mode: "Ocean FCL",
      count: fcl,
      pct: Math.round((fcl / total) * 100),
      color: MODE_COLORS[0],
    },
    {
      mode: "Ocean LCL",
      count: lcl,
      pct: Math.round((lcl / total) * 100),
      color: MODE_COLORS[1],
    },
  ];
}

function deriveContainerProfile(profile: any): ContainerProfile {
  // v200 shape: profile.containerProfile.{fcl,lcl,byLength,containerTypes,dominantContainer}
  const cp = profile?.containerProfile || profile?.container_profile || null;
  const fcl =
    Number(cp?.fcl?.shipments) ||
    Number(profile?.containers?.fclShipments12m) ||
    Number(profile?.fcl_shipments_all_time) ||
    0;
  const lcl =
    Number(cp?.lcl?.shipments) ||
    Number(profile?.containers?.lclShipments12m) ||
    Number(profile?.lcl_shipments_all_time) ||
    0;
  const totalShipments = Number(profile?.totalShipments) || fcl + lcl;
  const lengths: ContainerLength[] = [];
  const lengthSource =
    cp?.byLength ||
    profile?.container_lengths_breakdown ||
    profile?.containers_load ||
    [];
  if (Array.isArray(lengthSource)) {
    for (const entry of lengthSource) {
      const label = String(
        entry?.length || entry?.label || entry?.containerLength || entry?.code || "",
      ).trim();
      const count = Number(entry?.shipments) || Number(entry?.count) || Number(entry?.teu) || 0;
      if (!label || count <= 0) continue;
      lengths.push({
        label,
        count,
        teu: Number(entry?.teu) || undefined,
        yoy: entry?.yoy != null ? String(entry.yoy) : null,
      });
    }
  }
  if (lengths.length === 0 && profile?.topContainerLength) {
    lengths.push({
      label: String(profile.topContainerLength),
      count: Number(profile?.topContainerCount) || 0,
      teu: Number(profile?.topContainerTeu) || undefined,
    });
  }
  const isoCodes: ContainerIso[] = [];
  const isoSource =
    cp?.containerTypes ||
    profile?.container_iso_codes ||
    profile?.iso_codes ||
    null;
  if (Array.isArray(isoSource)) {
    for (const entry of isoSource) {
      const code = String(entry?.isoCode || entry?.type || entry?.code || entry?.iso || "").trim();
      if (!code) continue;
      isoCodes.push({
        code,
        group: entry?.group ? String(entry.group) : (entry?.length ? String(entry.length) : undefined),
        count: Number(entry?.shipments) || Number(entry?.count) || Number(entry?.teu) || 0,
      });
    }
  }
  const dominant =
    cp?.dominantContainer?.length ||
    cp?.dominantContainer?.type ||
    cp?.dominantContainer?.isoCode ||
    profile?.topContainerLength ||
    (lengths[0]?.label ?? null);
  return {
    fcl,
    lcl,
    totalShipments,
    topContainerLabel: dominant || null,
    lengths,
    isoCodes,
  };
}

function deriveCarriers(profile: any, recentBols: any[]): CarrierRow[] {
  // Prefer a normalized profile.topCarriers list when the backend supplies it.
  const explicit = profile?.topCarriers || profile?.carriers;
  if (Array.isArray(explicit) && explicit.length) {
    const total = explicit.reduce((s: number, e: any) => s + (Number(e?.count) || 0), 0);
    return explicit
      .filter((e: any) => e && (e.name || e.label))
      .map((e: any) => ({
        name: String(e.name || e.label),
        scac: e?.scac || null,
        shipments: Number(e?.count) || Number(e?.shipments) || 0,
        teu: Number(e?.teu) || null,
        trend: e?.trend || null,
        up: typeof e?.up === "boolean" ? e.up : null,
        inferred: Boolean(e?.inferred),
      }))
      .sort((a, b) => b.shipments - a.shipments)
      .slice(0, 8)
      .map((c) => ({
        ...c,
        // share computed at render time; total kept for ratio
        teu: c.teu,
        // ensure inferred is bool
        inferred: c.inferred,
        // share of sum
        // (kept on row for clarity but unused below)
        ...{ _total: total },
      }))
      .map(({ _total, ...rest }) => rest);
  }
  // Otherwise aggregate carriers found directly on recent BOLs (no MBL
  // prefix inference here — we surface only what the row already names).
  const counts = new Map<string, { ship: number; teu: number; inferred: boolean }>();
  for (const bol of recentBols) {
    const c = readCarrier(bol);
    if (!c) continue;
    const key = c.name;
    const cur = counts.get(key) || { ship: 0, teu: 0, inferred: c.inferred };
    cur.ship += 1;
    cur.teu += Number(bol?.teu) || 0;
    cur.inferred = cur.inferred || c.inferred;
    counts.set(key, cur);
  }
  return Array.from(counts.entries())
    .map(([name, v]) => ({
      name,
      scac: null,
      shipments: v.ship,
      teu: v.teu > 0 ? v.teu : null,
      trend: null,
      up: null,
      inferred: v.inferred,
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 6);
}

function deriveForwarders(profile: any, recentBols: any[]): ForwarderRow[] {
  const explicit =
    profile?.topForwarders || profile?.forwarders || profile?.serviceProviders;
  const fromExplicit: ForwarderRow[] = Array.isArray(explicit)
    ? explicit
        .filter((e: any) => e && (e.name || e.label))
        .map((e: any) => ({
          name: String(e.name || e.label),
          roles: Array.isArray(e?.roles)
            ? e.roles.map((r: any) => String(r))
            : e?.role
              ? [String(e.role)]
              : [],
          shipments: Number(e?.count) || Number(e?.shipments) || 0,
          teu: Number(e?.teu) || null,
          lastShipment: e?.last_shipment || null,
          countries: Array.isArray(e?.countries) ? e.countries : undefined,
        }))
    : [];
  if (fromExplicit.length) {
    return fromExplicit.sort((a, b) => b.shipments - a.shipments).slice(0, 6);
  }
  // Fall back to aggregating shipper / notify-party / supplier names that
  // appear most often on recent BOLs. Each role contributes a different
  // pill in the resulting rows.
  const counts = new Map<
    string,
    { ship: number; teu: number; roles: Set<string>; last: string | null; countries: Set<string> }
  >();
  for (const bol of recentBols) {
    const date = getBolDate(bol);
    const country =
      bol?.supplier_country || bol?.origin_country || bol?.raw?.country || "";
    const roleEntries: Array<{ role: string; name: string | null }> = [
      { role: "Shipper", name: bol?.shipper_name || bol?.raw?.shipper_name || null },
      { role: "Notify", name: bol?.notify_party || bol?.raw?.notify_party_name || null },
      { role: "Supplier", name: bol?.supplier || bol?.supplier_name || null },
      { role: "Customs", name: bol?.customs_party || bol?.raw?.customs_party || null },
    ];
    for (const r of roleEntries) {
      const name = r.name && String(r.name).trim();
      if (!name) continue;
      const existing = counts.get(name) || {
        ship: 0,
        teu: 0,
        roles: new Set<string>(),
        last: null,
        countries: new Set<string>(),
      };
      existing.ship += 1;
      existing.teu += Number(bol?.teu) || 0;
      existing.roles.add(r.role);
      if (country) existing.countries.add(String(country));
      if (date && (!existing.last || new Date(date) > new Date(existing.last))) {
        existing.last = date;
      }
      counts.set(name, existing);
    }
  }
  return Array.from(counts.entries())
    .map(([name, v]) => ({
      name,
      roles: Array.from(v.roles),
      shipments: v.ship,
      teu: v.teu > 0 ? v.teu : null,
      lastShipment: v.last,
      countries: Array.from(v.countries),
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 6);
}

function deriveSuppliers(profile: any, recentBols: any[] = []): SupplierRow[] {
  // Phase 5.1 — prefer service_provider_mix.suppliers (v200 parser, has counts)
  // over the flat string-only top_suppliers list.
  const structured =
    profile?.serviceProviderMix?.suppliers ||
    profile?.service_provider_mix?.suppliers ||
    null;
  const list =
    (Array.isArray(structured) && structured.length > 0
      ? structured.map((s: any) => ({
          name: s?.providerName ?? s?.name ?? null,
          shipments: Number(s?.shipments) || 0,
          country: s?.countryCode ?? s?.country_code ?? s?.country ?? "",
        }))
      : null) ||
    profile?.topSuppliers ||
    profile?.suppliers ||
    profile?.suppliers_sample ||
    [];
  // Phase 6 — when the explicit list has counts, use it; when it's a
  // bare string array, aggregate counts from recentBols using
  // getBolSupplier so the UI doesn't render "0% · 0 ship". Falls back to
  // BOL-only aggregation when no explicit list is present at all.
  if (Array.isArray(list) && list.length > 0) {
    const hasCounts = list.some(
      (e: any) =>
        typeof e !== "string" &&
        (Number(e?.shipments) > 0 || Number(e?.count) > 0),
    );
    if (hasCounts) {
      const totalShip = list.reduce(
        (s: number, e: any) =>
          s + (typeof e === "string" ? 0 : Number(e?.shipments || e?.count) || 0),
        0,
      );
      return list
        .map((e: any) => {
          const isString = typeof e === "string";
          const name = isString ? e : String(e?.name || e?.label || "");
          if (!name) return null;
          const ship = isString ? 0 : Number(e?.shipments || e?.count) || 0;
          const country = isString
            ? ""
            : String(e?.countryCode || e?.country_code || e?.country || "");
          return {
            name,
            country,
            shipments: ship,
            share: totalShip > 0 ? Math.round((ship / totalShip) * 100) : 0,
          };
        })
        .filter(Boolean) as SupplierRow[];
    }
    // String-only list: aggregate counts from recentBols where supplier
    // matches one of these names; if no recentBols provided, return
    // names with no count (caller renders without 0% · 0 ship).
    const nameSet = new Set(
      list
        .map((e: any) => (typeof e === "string" ? e : String(e?.name || e?.label || "")))
        .filter(Boolean)
        .map((n: string) => n.toLowerCase()),
    );
    const counts = new Map<string, { ship: number; country: string }>();
    for (const bol of recentBols) {
      const supplier = getBolSupplier(bol);
      if (!supplier || supplier === "—") continue;
      if (!nameSet.has(supplier.toLowerCase())) continue;
      const cur = counts.get(supplier) || {
        ship: 0,
        country: bol?.supplier_country || bol?.origin_country || "",
      };
      cur.ship += 1;
      counts.set(supplier, cur);
    }
    const totalShip = Array.from(counts.values()).reduce(
      (s, v) => s + v.ship,
      0,
    );
    if (totalShip > 0) {
      return Array.from(counts.entries())
        .map(([name, v]) => ({
          name,
          country: v.country,
          shipments: v.ship,
          share: totalShip > 0 ? Math.round((v.ship / totalShip) * 100) : 0,
        }))
        .sort((a, b) => b.shipments - a.shipments);
    }
    // Truly no counts available — surface names with `shipments: -1`
    // sentinel; the supplier card reads it as "no stat to show".
    return list
      .map((e: any) => {
        const isString = typeof e === "string";
        const name = isString ? e : String(e?.name || e?.label || "");
        if (!name) return null;
        return {
          name,
          country: isString
            ? ""
            : String(e?.countryCode || e?.country_code || e?.country || ""),
          shipments: -1,
          share: -1,
        };
      })
      .filter(Boolean) as SupplierRow[];
  }
  // No explicit list — aggregate purely from recentBols.
  if (!Array.isArray(recentBols) || recentBols.length === 0) return [];
  const counts = new Map<string, { ship: number; country: string }>();
  for (const bol of recentBols) {
    const supplier = getBolSupplier(bol);
    if (!supplier || supplier === "—") continue;
    const cur = counts.get(supplier) || {
      ship: 0,
      country: bol?.supplier_country || bol?.origin_country || "",
    };
    cur.ship += 1;
    counts.set(supplier, cur);
  }
  const total = Array.from(counts.values()).reduce((s, v) => s + v.ship, 0);
  return Array.from(counts.entries())
    .map(([name, v]) => ({
      name,
      country: v.country,
      shipments: v.ship,
      share: total > 0 ? Math.round((v.ship / total) * 100) : 0,
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 6);
}

function deriveProducts(profile: any, recentBols: any[] = []): ProductRow[] {
  // v200 hsProfile is an object with topChapters[] + topHsChapter; expand to flat list
  const hsObj =
    (profile?.hsProfile && typeof profile.hsProfile === "object" && !Array.isArray(profile.hsProfile))
      ? profile.hsProfile
      : (profile?.hs_profile && typeof profile.hs_profile === "object" && !Array.isArray(profile.hs_profile))
        ? profile.hs_profile
        : null;
  const list =
    profile?.topProducts ||
    profile?.products ||
    profile?.commodities ||
    profile?.hs_categories ||
    profile?.productProfile?.topProducts ||
    profile?.product_profile?.topProducts ||
    (hsObj?.topChapters && Array.isArray(hsObj.topChapters) ? hsObj.topChapters : null) ||
    (Array.isArray(profile?.hs_profile) ? profile.hs_profile : null) ||
    (Array.isArray(profile?.hsProfile) ? profile.hsProfile : null) ||
    profile?.productBreakdown ||
    [];
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((e: any) => {
        const label = String(
          e?.description ||
            e?.label ||
            e?.name ||
            e?.commodity ||
            e?.product ||
            e?.hsCode ||
            e?.hs_code ||
            "",
        ).trim();
        if (!label) return null;
        return {
          label,
          count:
            Number(e?.shipments12m) ||
            Number(e?.shipments) ||
            Number(e?.count) ||
            0,
          hsCode: e?.hsCode || e?.hs_code || e?.code || null,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 8) as ProductRow[];
  }
  // Phase 6 — aggregate from recentBols descriptions/HS when the
  // backend hasn't surfaced topProducts yet.
  if (!Array.isArray(recentBols) || recentBols.length === 0) return [];
  const counts = new Map<string, { count: number; hs?: string }>();
  for (const bol of recentBols) {
    const desc = getBolDescription(bol);
    const hs = getBolHs(bol);
    const safeHs = hs && hs !== "—" ? hs : undefined;
    const label = String(desc || "").trim();
    if (!label) continue;
    const trimmed = label.length > 80 ? label.slice(0, 80) + "…" : label;
    const cur = counts.get(trimmed) || { count: 0, hs: safeHs };
    cur.count += 1;
    if (!cur.hs && safeHs) cur.hs = safeHs;
    counts.set(trimmed, cur);
  }
  return Array.from(counts.entries())
    .map(([label, v]) => ({ label, count: v.count, hsCode: v.hs ?? null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function readCarrier(
  bol: any,
): { name: string; inferred: boolean } | null {
  const direct =
    bol?.carrier_name ||
    bol?.carrier ||
    bol?.shipping_line ||
    bol?.raw?.carrier_name ||
    bol?.raw?.shipping_line ||
    null;
  if (direct) return { name: String(direct), inferred: false };
  // No code-side normalization of MBL prefixes per design directive — we
  // surface the prefix verbatim so a future enrichment pass can map it to
  // a canonical carrier name.
  const mbl =
    bol?.master_bill_of_lading_number ||
    bol?.mbl ||
    bol?.raw?.master_bill_of_lading_number ||
    null;
  if (mbl) {
    const prefix = String(mbl).slice(0, 4).toUpperCase();
    if (/^[A-Z]{4}$/.test(prefix)) {
      return { name: prefix, inferred: true };
    }
  }
  return null;
}

function bolMatchesLane(bol: any, lane: any): boolean {
  const fromName = String(lane?.fromMeta?.countryName || "").toLowerCase();
  const toName = String(lane?.toMeta?.countryName || "").toLowerCase();
  const origin = String(
    bol?.supplier_country || bol?.origin_country || bol?.raw?.country || "",
  ).toLowerCase();
  const destination = String(
    bol?.destination_country || bol?.us_port_country || "us",
  ).toLowerCase();
  const matchFrom = Boolean(
    fromName && origin && (origin.includes(fromName) || fromName.includes(origin)),
  );
  const matchTo = Boolean(
    toName && destination && (destination.includes(toName) || toName.includes(destination)),
  );
  return matchFrom || matchTo;
}

// Phase 6 — broad BOL field helpers per QA brief. All accept the row OR
// the row.raw object and return a string fallback "—" / null when the
// field is genuinely missing. Never throw, never return "Invalid Date".
function getBolDate(bol: any): string | null {
  if (!bol) return null;
  return (
    bol?.shipmentDate ||
    bol?.shipment_date ||
    bol?.date_formatted ||
    bol?.dateFormatted ||
    bol?.Date ||
    bol?.bill_of_lading_date ||
    bol?.bill_of_lading_date_formatted ||
    bol?.arrival_date ||
    bol?.arrivalDate ||
    bol?.Arrival_Date ||
    bol?.entry_date ||
    bol?.entryDate ||
    bol?.bol_date ||
    bol?.bolDate ||
    bol?.bill_date ||
    bol?.billDate ||
    bol?.shipped_on ||
    bol?.shippedOn ||
    bol?.created_at ||
    bol?.last_shipment_date ||
    bol?.lastShipmentDate ||
    bol?.date ||
    bol?.raw?.bill_of_lading_date ||
    bol?.raw?.shipment_date ||
    bol?.raw?.arrival_date ||
    null
  );
}

function parseBolDate(value: string | null): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // v200 emits DD/MM/YYYY (e.g. "13/04/2026"). Try that first, then native Date.
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = Number(slash[3]);
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
      const d = new Date(Date.UTC(y, b - 1, a));
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const d = new Date(Date.UTC(y, a - 1, b));
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatBolDate(bol: any): string {
  const value = getBolDate(bol);
  const d = parseBolDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getBolOrigin(bol: any): string {
  // v200: route="A → B"; if present, take left side
  if (typeof bol?.route === "string" && bol.route.includes("→")) {
    const left = bol.route.split("→")[0]?.trim();
    if (left) return left;
  }
  return (
    bol?.origin_name ||
    bol?.origin ||
    bol?.origin_country ||
    bol?.originCountry ||
    bol?.originCountryCode ||
    bol?.Country ||
    bol?.foreign_port ||
    bol?.foreignPort ||
    bol?.from_port ||
    bol?.fromPort ||
    bol?.port_of_lading ||
    bol?.portOfLading ||
    bol?.place_of_receipt ||
    bol?.placeOfReceipt ||
    bol?.supplier_address_country ||
    bol?.shipper_country ||
    bol?.supplier_country ||
    bol?.raw?.foreign_port ||
    bol?.raw?.country ||
    bol?.raw?.origin ||
    "—"
  );
}

function getBolDestination(bol: any): string {
  // v200: route="A → B"; if present, take right side
  if (typeof bol?.route === "string" && bol.route.includes("→")) {
    const right = bol.route.split("→")[1]?.trim();
    if (right) return right;
  }
  return (
    bol?.destination_name ||
    bol?.destination ||
    bol?.destination_country ||
    bol?.destinationCountry ||
    bol?.destinationCountryCode ||
    bol?.us_port ||
    bol?.usPort ||
    bol?.us_port_of_unlading ||
    bol?.usPortOfUnlading ||
    bol?.to_port ||
    bol?.toPort ||
    bol?.port_of_unlading ||
    bol?.portOfUnlading ||
    bol?.place_of_delivery ||
    bol?.placeOfDelivery ||
    bol?.company_address_country ||
    bol?.consignee_country ||
    bol?.raw?.us_port ||
    bol?.raw?.destination ||
    "—"
  );
}

function getBolCarrierString(bol: any): string {
  return (
    bol?.carrierName ||
    bol?.carrier?.carrierName ||
    (typeof bol?.carrier === "string" ? bol.carrier : null) ||
    bol?.carrier_name ||
    bol?.normalized_carrier ||
    bol?.inferred_carrier ||
    bol?.steamship_line ||
    bol?.steamshipLine ||
    bol?.shipping_line ||
    bol?.shippingLine ||
    bol?.carrierCode ||
    bol?.carrier?.carrierCode ||
    bol?.scac ||
    bol?.master_bill_prefix ||
    bol?.mbl_prefix ||
    bol?.raw?.carrier_name ||
    bol?.raw?.shipping_line ||
    bol?.raw?.scac ||
    "—"
  );
}

function getBolSupplier(bol: any): string {
  return (
    bol?.supplierName ||
    bol?.supplier_name ||
    bol?.Shipper_Name ||
    bol?.shipper_name ||
    bol?.shipperName ||
    bol?.shipper_basename ||
    bol?.topServiceProvider ||
    (typeof bol?.supplier === "string" ? bol.supplier : null) ||
    (typeof bol?.shipper === "string" ? bol.shipper : null) ||
    bol?.notify_party ||
    bol?.notifyParty ||
    bol?.notify_party_name ||
    bol?.Notify_Party_Name ||
    bol?.raw?.shipper_name ||
    bol?.raw?.supplier_name ||
    bol?.raw?.notify_party_name ||
    "—"
  );
}

function getBolHs(bol: any): string {
  return (
    bol?.hsCode ||
    bol?.hs_code ||
    bol?.HS_Code ||
    bol?.hts_code ||
    bol?.htsCode ||
    bol?.HTS_Code ||
    bol?.commodity_code ||
    bol?.commodityCode ||
    bol?.raw?.hs_code ||
    bol?.raw?.hts_code ||
    "—"
  );
}

function getBolDescription(bol: any): string {
  return (
    bol?.description ||
    bol?.product_description ||
    bol?.productDescription ||
    bol?.commodity ||
    bol?.commodity_description ||
    bol?.commodityDescription ||
    bol?.goods_description ||
    bol?.goodsDescription ||
    bol?.cargo_description ||
    bol?.cargoDescription ||
    bol?.raw?.product_description ||
    bol?.raw?.commodity_description ||
    ""
  );
}

function formatMonthLabel(month: any, _year: any) {
  if (!month) return "";
  const str = String(month).trim();
  if (/^\d{4}-\d{2}$/.test(str)) {
    const date = new Date(`${str}-01`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short" });
    }
  }
  if (/^\d+$/.test(str)) {
    const m = Number(str);
    if (m >= 1 && m <= 12) {
      const date = new Date(2024, m - 1, 1);
      return date.toLocaleDateString("en-US", { month: "short" });
    }
  }
  // Already a short month label like "Jan"
  if (str.length <= 4) return str;
  // Long month name — truncate
  return str.slice(0, 3);
}

function formatRelativeShort(value: any) {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 0) return "—";
  const day = 24 * 60 * 60 * 1000;
  if (delta < day) return "today";
  if (delta < 2 * day) return "yesterday";
  if (delta < 30 * day) return `${Math.round(delta / day)} days ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function trendIsPositive(trend: any): boolean | null {
  if (!trend) return null;
  const str = String(trend).trim();
  if (str.startsWith("+")) return true;
  if (str.startsWith("-") || str.startsWith("−") || str.startsWith("↓")) return false;
  if (str.toLowerCase().startsWith("new")) return true;
  return null;
}

function roleToTone(role: string): "blue" | "green" | "purple" | "amber" | "slate" {
  const r = role.toLowerCase();
  if (r.includes("ship")) return "blue";
  if (r.includes("supp")) return "green";
  if (r.includes("notif")) return "purple";
  if (r.includes("cust")) return "amber";
  return "slate";
}

const PROVIDER_COLORS = [
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
];

const MODE_COLORS = ["#3B82F6", "#67E8F9", "#8B5CF6", "#10B981", "#F59E0B"];