/**
 * OverviewTab — composition of the §6 Overview widgets in spec order.
 * The HistoryBrush (§5.5) is rendered by the parent workspace, not here.
 */
import { Anchor, Database, Factory, Package } from "lucide-react";
import type { ProfileView } from "../../data/selectors";
import type { ShipmentDataset } from "../../data/types";
import type { ServiceMix } from "../../data/serviceMix";
import type { ProfileExtraActions } from "../../data/useProfileState";
import { LaneMap } from "./LaneMap";
import {
  CadenceChart,
  EquipmentMix,
  FacetCard,
  InsightCards,
  KpiGrid,
  LatestBolsTable,
} from "./OverviewWidgets";

/** Air enrichment is only confirmed when a documented record explicitly
 * identifies air transport; ocean manifests do not prove air shipping. */
function AirEvidence({ summary }: { summary: {
  verifiedAir: number; unclassified: number; observedDocuments: number;
  weightKg: number | null; lastAirDate: string | null; topOrigin: string | null;
} }) {
  const verified = summary.verifiedAir > 0;
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-3" aria-label="Air freight intelligence coverage">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-slate-900">Air freight intelligence</h3>
        <span className={verified ? "text-[11px] font-medium text-emerald-700" : "text-[11px] font-medium text-slate-500"}>
          {verified ? "Verified air records" : "Coverage not verified"}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-slate-600">
        {verified
          ? `${summary.verifiedAir.toLocaleString()} source-labeled air shipments${summary.weightKg != null ? ` · ${summary.weightKg.toLocaleString()} kg reported` : ""}${summary.topOrigin ? ` · Top origin: ${summary.topOrigin}` : ""}`
          : "No source-labeled air waybills are available for this account. This does not mean the company has no air freight activity."}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        {summary.observedDocuments.toLocaleString()} stored shipment documents assessed; {summary.unclassified.toLocaleString()} lack a transport-mode label. Air volumes, routes and spend are not estimated from ocean BOLs.
      </p>
    </section>
  );
}

export function OverviewTab({
  view,
  ds,
  extra,
  showPrior,
  onOpenTab,
  onExpandMap,
  sourceNote,
  serviceMix,
  airSummary,
}: {
  view: ProfileView;
  ds: ShipmentDataset;
  extra: ProfileExtraActions;
  showPrior?: boolean;
  onOpenTab?: (tab: "lanes" | "history" | "contacts" | "shipments") => void;
  /** Opens the fullscreen Cinematic trade-lanes view. */
  onExpandMap?: () => void;
  sourceNote?: string;
  serviceMix?: ServiceMix | null;
  airSummary?: { verifiedAir: number; unclassified: number; observedDocuments: number; weightKg: number | null; lastAirDate: string | null; topOrigin: string | null } | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {view.teuUnverified && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-900"><strong>TEU source integrity review.</strong> One or more reported monthly TEU records failed plausibility checks. Total TEU, estimated freight spend and average TEU per shipment are hidden until the source is verified. Shipment counts remain separately reported. Supplier, carrier and lane shares represent available detailed BOL records only.</div>}
      <InsightCards view={view} ds={ds} />

      <KpiGrid view={view} />

      {airSummary && <AirEvidence summary={airSummary} />}

      <LaneMap view={view} onOpenLanesTab={() => onOpenTab?.("lanes")} onExpand={onExpandMap} />

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))" }}
      >
        <CadenceChart view={view} extra={extra} showPrior={showPrior} serviceMix={serviceMix} />
        <EquipmentMix view={view} />
      </div>

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))" }}
      >
        <FacetCard title="Suppliers" icon={Factory} iconColor="#3b82f6" items={view.suppliers} onOpenTab={undefined} />
        <FacetCard title="Products · HS" icon={Package} iconColor="#8b5cf6" items={view.products} onOpenTab={undefined} />
        <FacetCard title="Carriers" icon={Anchor} iconColor="#10b981" items={view.carriers} subAsChip onOpenTab={undefined} />
      </div>

      <LatestBolsTable view={view} onAllShipments={() => onOpenTab?.("shipments")} />

      <div className="flex items-center gap-1.5 text-[12px] text-[#94a3b8]">
        <Database size={14} className="flex-none" />
        <span>
          Source: U.S. CBP bills of lading{sourceNote ?? ""}.{" "}
          {view.modeled.spend ? "Est. spend is modeled from lane rate × TEU." : ""}
          {view.modeled.teu ? " TEU includes values modeled from container counts." : ""}
        </span>
      </div>
    </div>
  );
}
