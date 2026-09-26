/**
 * OverviewTab — composition of the §6 Overview widgets in spec order.
 * The HistoryBrush (§5.5) is rendered by the parent workspace, not here.
 */
import { Anchor, Database, Factory, Package } from "lucide-react";
import type { ProfileView } from "../../data/selectors";
import type { ShipmentDataset } from "../../data/types";
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

export function OverviewTab({
  view,
  ds,
  extra,
  showPrior,
  onOpenTab,
  sourceNote,
}: {
  view: ProfileView;
  ds: ShipmentDataset;
  extra: ProfileExtraActions;
  showPrior?: boolean;
  onOpenTab?: (tab: "lanes" | "history" | "contacts" | "shipments") => void;
  sourceNote?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <InsightCards view={view} ds={ds} />

      <KpiGrid view={view} />

      <LaneMap view={view} onOpenLanesTab={() => onOpenTab?.("lanes")} />

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))" }}
      >
        <CadenceChart view={view} extra={extra} showPrior={showPrior} />
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
