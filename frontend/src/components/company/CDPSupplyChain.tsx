import { useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
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
 * Phase 3 — Supply Chain tab. Renders the design's segmented sub-tab
 * control plus the "What matters now" dark-gradient brief, then sub-tab
 * specific content. All values come from the live ImportYeti `profile`
 * + `routeKpis` props that Company.jsx already loads via
 * `getSavedCompanyDetail` / `buildYearScopedProfile`. Empty states render
 * for any sub-tab whose backing data is missing — no fabrication.
 */
export default function CDPSupplyChain({
  profile,
  routeKpis,
  selectedYear,
  years,
  onSelectYear,
}: CDPSupplyChainProps) {
  const [sub, setSub] = useState<SubTabId>("summary");

  // Derive canonical lanes from the live profile.topRoutes / routeKpis.
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
    return Array.isArray(items) ? items.slice(0, 5) : [];
  }, [profile]);

  const forwarders = useMemo(() => {
    const list =
      profile?.topCarriers || profile?.carriers || profile?.serviceProviders || [];
    if (!Array.isArray(list)) return [];
    const total = list.reduce((sum: number, e: any) => sum + (Number(e?.count) || 0), 0);
    return list
      .filter((e: any) => e && (e.name || e.label))
      .map((e: any, i: number) => ({
        name: String(e.name || e.label),
        count: Number(e.count) || 0,
        share: total > 0 ? (Number(e.count) || 0) / total : 0,
        color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
      }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 6);
  }, [profile]);

  const modes = useMemo(() => {
    const list = profile?.topModes || profile?.modes || [];
    if (!Array.isArray(list)) return [];
    const total = list.reduce(
      (sum: number, e: any) => sum + (Number(e?.count) || 0),
      0,
    );
    return list
      .filter((e: any) => e && (e.mode || e.name))
      .map((e: any, i: number) => ({
        mode: String(e.mode || e.name),
        count: Number(e.count) || 0,
        pct: total > 0 ? Math.round(((Number(e.count) || 0) / total) * 100) : 0,
        color: MODE_COLORS[i % MODE_COLORS.length],
      }));
  }, [profile]);

  const suppliers = useMemo(() => {
    const list = profile?.topSuppliers || profile?.suppliers || [];
    if (!Array.isArray(list)) return [];
    const total = list.reduce(
      (sum: number, e: any) => sum + (Number(e?.shipments || e?.count) || 0),
      0,
    );
    return list
      .filter((e: any) => e && (e.name || e.label))
      .map((e: any) => {
        const ship = Number(e.shipments || e.count) || 0;
        return {
          name: String(e.name || e.label),
          country: String(e.countryCode || e.country_code || e.country || ""),
          shipments: ship,
          share: total > 0 ? Math.round((ship / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.shipments - a.shipments)
      .slice(0, 6);
  }, [profile]);

  const products = useMemo(() => {
    const list =
      profile?.topProducts ||
      profile?.products ||
      profile?.commodities ||
      [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((e: any) => e && (e.label || e.name || e.description))
      .map((e: any) => ({
        label: String(e.label || e.name || e.description),
        count: Number(e.count || e.shipments) || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [profile]);

  const briefHeadline = useMemo(() => {
    if (canonicalLanes.length === 0) return null;
    const top = canonicalLanes[0];
    const total = canonicalLanes.reduce(
      (sum: number, l: any) => sum + (Number(l.shipments) || 0),
      0,
    );
    const share =
      total > 0 ? Math.round((Number(top.shipments) / total) * 100) : null;
    const fromName =
      top.fromMeta?.countryName || top.fromMeta?.label || "Origin";
    const toName = top.toMeta?.countryName || top.toMeta?.label || "Destination";
    if (share != null) {
      return `${fromName} → ${toName} carries ${share}% of trailing-12m volume.`;
    }
    return `${fromName} → ${toName} is the dominant lane.`;
  }, [canonicalLanes]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Sub-tabs */}
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
          <span
            className="h-px w-8"
            style={{ background: "rgba(0,240,255,0.3)" }}
          />
          <span className="font-display text-[9px] font-semibold text-slate-400">
            Trailing 12 months
          </span>
        </div>
        <div
          className="font-display text-[18px] font-semibold leading-relaxed tracking-tight"
          style={{ color: "#F8FAFC" }}
        >
          {briefHeadline || (
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

      {/* Sub-tab content */}
      {sub === "summary" && (
        <SummaryView
          canonicalLanes={canonicalLanes}
          forwarders={forwarders}
          modes={modes}
          recentBols={recentBols}
          suppliers={suppliers}
        />
      )}
      {sub === "lanes" && <LanesView canonicalLanes={canonicalLanes} />}
      {sub === "providers" && <ProvidersView forwarders={forwarders} />}
      {sub === "shipments" && <ShipmentsView recentBols={recentBols} />}
      {sub === "products" && <ProductsView products={products} />}
    </div>
  );
}

/* ── Sub-tab views ────────────────────────────────────────────────────── */

function SummaryView({
  canonicalLanes,
  forwarders,
  modes,
  recentBols,
  suppliers,
}: {
  canonicalLanes: any[];
  forwarders: any[];
  modes: any[];
  recentBols: any[];
  suppliers: any[];
}) {
  const globeLanes: GlobeLane[] = canonicalLanes.slice(0, 6).map((l: any) => ({
    id: l.displayLabel,
    from: l.fromMeta.canonicalKey,
    to: l.toMeta.canonicalKey,
    coords: [l.fromMeta.coords, l.toMeta.coords],
    fromMeta: l.fromMeta,
    toMeta: l.toMeta,
    shipments: Number(l.shipments) || 0,
  }));

  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <LitSectionCard
          title="Top trade lanes"
          sub="By trailing-12m share"
          padded={false}
        >
          {canonicalLanes.length === 0 ? (
            <EmptyMessage text="No lane data yet — refresh enrichment when ImportYeti has indexed this company." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(200px,260px)_1fr]">
              <div className="flex items-center justify-center bg-slate-50 p-3">
                <GlobeCanvas
                  lanes={globeLanes}
                  selectedLane={globeLanes[0]?.id || null}
                  size={220}
                  theme="trade"
                />
              </div>
              <div>
                {canonicalLanes.slice(0, 5).map((lane: any, i: number) => (
                  <LaneRow key={lane.displayLabel} lane={lane} index={i} />
                ))}
              </div>
            </div>
          )}
        </LitSectionCard>

        <LitSectionCard title="Imports by mode" sub={`Modal split`}>
          {modes.length === 0 ? (
            <EmptyMessage text="No modal data on file." />
          ) : (
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
          )}
        </LitSectionCard>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <LitSectionCard
          title="Recent shipments"
          sub={`Latest ${recentBols.length || 0} BOL records`}
          padded={false}
        >
          {recentBols.length === 0 ? (
            <EmptyMessage text="No recent shipments to display." />
          ) : (
            recentBols.map((bol, i, arr) => (
              <ShipmentRow key={i} bol={bol} isLast={i === arr.length - 1} />
            ))
          )}
        </LitSectionCard>

        <LitSectionCard
          title="Top suppliers"
          sub="From verified BOL counterparties"
        >
          {suppliers.length === 0 ? (
            <EmptyMessage text="No supplier data on file." />
          ) : (
            <div className="flex flex-col gap-2">
              {suppliers.map((s) => (
                <SupplierRow key={s.name} supplier={s} />
              ))}
            </div>
          )}
        </LitSectionCard>
      </div>

      {forwarders.length > 0 && <ForwardersCard forwarders={forwarders} />}
    </>
  );
}

function LanesView({ canonicalLanes }: { canonicalLanes: any[] }) {
  if (canonicalLanes.length === 0) {
    return (
      <LitSectionCard title="Trade lanes" sub="Origin → destination by share">
        <EmptyMessage text="No lane data yet — refresh enrichment when available." />
      </LitSectionCard>
    );
  }
  return (
    <LitSectionCard
      title="Trade lanes"
      sub={`${canonicalLanes.length} unique lanes`}
      padded={false}
    >
      {canonicalLanes.map((lane: any, i: number) => (
        <LaneRow key={lane.displayLabel} lane={lane} index={i} />
      ))}
    </LitSectionCard>
  );
}

function ProvidersView({ forwarders }: { forwarders: any[] }) {
  if (forwarders.length === 0) {
    return (
      <LitSectionCard title="Service providers" sub="Carrier mix">
        <EmptyMessage text="No carrier data on file." />
      </LitSectionCard>
    );
  }
  return <ForwardersCard forwarders={forwarders} />;
}

function ShipmentsView({ recentBols }: { recentBols: any[] }) {
  if (recentBols.length === 0) {
    return (
      <LitSectionCard title="Recent shipments" sub="BOL records">
        <EmptyMessage text="No recent shipments to display." />
      </LitSectionCard>
    );
  }
  return (
    <LitSectionCard
      title="Recent shipments"
      sub={`${recentBols.length} latest BOL records`}
      padded={false}
    >
      {recentBols.map((bol, i, arr) => (
        <ShipmentRow key={i} bol={bol} isLast={i === arr.length - 1} />
      ))}
    </LitSectionCard>
  );
}

function ProductsView({ products }: { products: any[] }) {
  if (products.length === 0) {
    return (
      <LitSectionCard
        title="Products / Commodities"
        sub="From BOL descriptions"
      >
        <EmptyMessage text="No product data on file." />
      </LitSectionCard>
    );
  }
  return (
    <LitSectionCard
      title="Products / Commodities"
      sub={`Top ${products.length}`}
    >
      <div className="flex flex-col gap-2">
        {products.map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 last:border-b-0"
          >
            <span className="font-body truncate text-[12px] text-slate-700">
              {p.label}
            </span>
            <span className="font-mono shrink-0 text-[11px] text-slate-500">
              {p.count.toLocaleString()} shipments
            </span>
          </div>
        ))}
      </div>
    </LitSectionCard>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function ForwardersCard({ forwarders }: { forwarders: any[] }) {
  return (
    <LitSectionCard
      title="Current forwarders"
      sub="Carrier mix · trailing 12m share"
      action={
        <span className="font-mono text-[10px] font-semibold text-slate-500">
          {forwarders.length} carriers
        </span>
      }
      padded={false}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFBFC]">
            {["Forwarder", "Share", "Shipments"].map((h) => (
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
          {forwarders.map((f, i, arr) => (
            <tr
              key={f.name}
              className={[
                i < arr.length - 1 ? "border-b border-slate-100" : "",
              ].join(" ")}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-[18px] w-[18px] items-center justify-center rounded text-[10px] font-bold"
                    style={{ background: f.color + "18", color: f.color }}
                  >
                    {f.name.charAt(0)}
                  </div>
                  <span className="font-display text-[12px] font-semibold text-slate-900">
                    {f.name}
                  </span>
                </div>
              </td>
              <td className="w-36 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-1 rounded"
                      style={{
                        width: `${Math.round(f.share * 100)}%`,
                        background: f.color,
                      }}
                    />
                  </div>
                  <span className="font-mono w-10 shrink-0 text-right text-[11px] font-semibold text-slate-600">
                    {Math.round(f.share * 100)}%
                  </span>
                </div>
              </td>
              <td className="font-mono w-24 px-4 py-2.5 text-[11px] text-slate-700">
                {f.count.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </LitSectionCard>
  );
}

function LaneRow({ lane, index }: { lane: any; index: number }) {
  const isPrimary = index === 0;
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
      <span
        className="font-mono w-5 shrink-0 text-center text-[9px] font-bold text-slate-400"
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
          <span className="font-mono text-[11px] font-semibold text-slate-700">
            {lane.fromMeta?.countryName || lane.fromMeta?.label}
          </span>
          <ArrowRight className="h-2 w-2 text-slate-300" aria-hidden />
          <LitFlag
            code={lane.toMeta?.countryCode}
            size={13}
            label={lane.toMeta?.countryName}
          />
          <span className="font-mono text-[11px] font-semibold text-slate-700">
            {lane.toMeta?.countryName || lane.toMeta?.label}
          </span>
          {isPrimary && <LitPill tone="blue">Primary</LitPill>}
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
    </div>
  );
}

function ShipmentRow({ bol, isLast }: { bol: any; isLast: boolean }) {
  const date = getBolDate(bol);
  const carrier =
    bol?.carrier_name || bol?.carrier || bol?.shipping_line || null;
  const origin = bol?.origin_name || bol?.origin || bol?.from_port || null;
  const destination =
    bol?.destination_name ||
    bol?.destination ||
    bol?.to_port ||
    bol?.us_port_of_unlading ||
    null;
  const teu = Number(bol?.teu) || Number(bol?.containers_teu) || null;
  const mode = bol?.mode || bol?.shipping_mode || null;
  return (
    <div
      className={[
        "grid items-center gap-2 px-4 py-2.5",
        !isLast ? "border-b border-slate-100" : "",
      ].join(" ")}
      style={{ gridTemplateColumns: "84px 1fr 56px 56px" }}
    >
      <span className="font-mono whitespace-nowrap text-[10px] text-slate-500">
        {date ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
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
        {carrier && (
          <div className="font-body mt-0.5 truncate text-[10px] text-slate-400">
            {carrier}
          </div>
        )}
      </div>
      <span
        className={[
          "font-display whitespace-nowrap rounded border px-1.5 py-0.5 text-center text-[9px] font-semibold",
          mode === "FCL" || mode === "Ocean FCL"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-50 text-slate-500",
        ].join(" ")}
      >
        {mode || "—"}
      </span>
      <span className="font-mono text-right text-[11px] font-semibold text-slate-900">
        {teu != null ? `${Number(teu).toFixed(1)} TEU` : "—"}
      </span>
    </div>
  );
}

function SupplierRow({ supplier }: { supplier: any }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="font-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[9px] font-bold text-slate-500">
        {(supplier.country || "").slice(0, 2).toUpperCase() || "—"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-[12px] font-semibold text-slate-900">
          {supplier.name}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="h-0.5 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded bg-blue-500"
              style={{ width: `${supplier.share}%` }}
            />
          </div>
          <span className="font-mono whitespace-nowrap text-[10px] text-slate-500">
            {supplier.share}% · {supplier.shipments.toLocaleString()} ship
          </span>
        </div>
      </div>
    </div>
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

function readTopRoutes(profile: any, routeKpis: any) {
  const candidates = [
    profile?.topRoutes,
    profile?.top_routes,
    profile?.routes,
    routeKpis?.topRoutes,
    routeKpis?.top_routes,
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
  // If profile has just a single top_route_12m string, lift it
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

function getBolDate(bol: any) {
  return (
    bol?.bill_of_lading_date ||
    bol?.bill_of_lading_date_formatted ||
    bol?.shipment_date ||
    bol?.arrival_date ||
    bol?.date ||
    null
  );
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

const PROVIDER_COLORS = [
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
];

const MODE_COLORS = ["#3B82F6", "#6366F1", "#8B5CF6", "#10B981", "#F59E0B"];