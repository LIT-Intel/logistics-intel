/**
 * CompanyProfileWorkspace — the Company Profile v2 surface (Overview,
 * Trade Lanes, Lane History) mounted inside CompanyProfileV2's tab body.
 *
 * One data load (useShipmentDataset), all filtering client-side through the
 * unit-tested selectors; every widget renders the shared view-model so any
 * period/metric/facet change updates the whole workspace at once.
 */
import { useMemo } from "react";
import { miLabel } from "./data/format";
import type { RecentBolInput } from "./data/normalizeShipments";
import type { ShipmentDataset } from "./data/types";
import { computeLanes, computeView } from "./data/selectors";
import { useCountUp } from "./data/useCountUp";
import { useShipmentDataset } from "./data/useCompanyShipments";
import { useProfileState } from "./data/useProfileState";
import { Card, FONT_BODY, FONT_DISPLAY } from "./components/ui";
import { StickyFilterBar } from "./components/StickyFilterBar";
import { HistoryBrush } from "./components/HistoryBrush";
import { DataTraceDrawer } from "./components/DataTraceDrawer";
import { InsightRail } from "./components/InsightRail";
import { OverviewTab } from "./components/overview/OverviewTab";
import { TradeLanesTab } from "./components/lanes/TradeLanesTab";
import { LaneHistoryTab } from "./components/history/LaneHistoryTab";

export type WorkspaceTab = "overview" | "lanes" | "history";

/** The page-level workspace handle: one data load + one state instance shared
 *  by the editorial hero (above the tab bar) and every v2 tab body. */
export interface WorkspaceHandle {
  dataset: ShipmentDataset | null;
  loading: boolean;
  isSnapshotFallback: boolean;
  state: ReturnType<typeof useProfileState>["state"];
  actions: ReturnType<typeof useProfileState>["actions"];
  extra: ReturnType<typeof useProfileState>["extra"];
  ready: boolean;
  view: ReturnType<typeof computeView> | null;
  lanesView: ReturnType<typeof computeLanes> | null;
}

export function useCompanyProfileWorkspace(
  companyKey: string | null | undefined,
  recentBols?: RecentBolInput[] | null,
  demoDataset?: ShipmentDataset | null,
): WorkspaceHandle {
  const fetched = useShipmentDataset(demoDataset ? null : companyKey, demoDataset ? null : (recentBols ?? null));
  const dataset = demoDataset ?? fetched.dataset;
  const loading = demoDataset ? false : fetched.loading;
  const isSnapshotFallback = demoDataset ? false : fetched.isSnapshotFallback;
  const { state, actions, extra, ready } = useProfileState(dataset);

  const baseView = useMemo(
    () => (dataset && ready ? computeView(dataset, state, actions) : null),
    [dataset, ready, state, actions],
  );
  const disp = useCountUp(baseView ? baseView.targets : null);
  const view = useMemo(
    () =>
      dataset && ready && disp
        ? computeView(dataset, { ...state, disp }, actions)
        : baseView,
    [dataset, ready, state, actions, disp, baseView],
  );
  const lanesView = useMemo(
    () => (dataset && ready ? computeLanes(dataset, state, actions) : null),
    [dataset, ready, state, actions],
  );

  return { dataset, loading, isSnapshotFallback, state, actions, extra, ready, view, lanesView };
}

export interface CompanyProfileWorkspaceProps {
  tab: WorkspaceTab;
  /** From useCompanyProfileWorkspace() — owned by the page so the hero and
   *  all tabs share one dataset + filter state. */
  workspace: WorkspaceHandle;
  companyName: string;
  meta?: {
    hq?: string | null;
    website?: string | null;
    phone?: string | null;
    parent?: string | null;
    ownerName?: string | null;
    stage?: string | null;
    lastActivity?: string | null;
  };
  savedContacts?: number;
  refreshedNote?: string; // e.g. ", refreshed 2 days ago"
  onSwitchTab?: (tabId: string) => void; // page-level tab ids ("lanes", "history", "contacts", "supply")
}

export function CompanyProfileWorkspace({
  tab,
  workspace,
  companyName,
  meta,
  savedContacts,
  refreshedNote,
  onSwitchTab,
}: CompanyProfileWorkspaceProps) {
  const { dataset, loading, state, actions, extra, view, lanesView } = workspace;

  if (loading && !dataset) {
    return (
      <div className="flex flex-col gap-4 py-2" aria-busy>
        {[72, 200, 320].map((h, i) => (
          <div
            key={i}
            className="animate-pulse rounded-[14px] border border-[#E5E7EB] bg-white motion-reduce:animate-none"
            style={{ height: h }}
          />
        ))}
      </div>
    );
  }

  if (!dataset || !view) {
    return (
      <Card className="mx-auto my-10 max-w-xl p-8 text-center">
        <div className="text-[16px] font-semibold text-[#0F172A]" style={{ fontFamily: FONT_DISPLAY }}>
          Shipment intelligence is on its way
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-[#64748b]" style={{ fontFamily: FONT_BODY }}>
          We&apos;re assembling the bill-of-lading history for {companyName}. In the meantime, the
          Supply Chain tab has the live trade picture.
        </p>
        {onSwitchTab && (
          <button
            type="button"
            onClick={() => onSwitchTab("supply")}
            className="mt-5 h-[38px] rounded-[10px] bg-[#0F172A] px-5 text-[13px] font-semibold text-white transition-transform hover:bg-[#1e293b] active:scale-[0.97] motion-reduce:active:scale-100"
            style={{ fontFamily: FONT_BODY }}
          >
            Open Supply Chain
          </button>
        )}
      </Card>
    );
  }

  const firstDocMi = dataset.rows.length ? dataset.rows[0].mi : Number.POSITIVE_INFINITY;
  const firstRollupMi = dataset.rollup?.firstMi ?? Number.POSITIVE_INFINITY;
  const firstMi = Math.min(firstDocMi, firstRollupMi);
  const firstMonthLabel = miLabel(Number.isFinite(firstMi) ? firstMi : 0, dataset.firstYear);

  const handleOpenTab = (t: "lanes" | "history" | "contacts" | "shipments") => {
    if (t === "shipments") {
      // No standalone Shipments tab — the trust path is the Data trace with
      // every in-view BOL.
      actions.trace(null, null, "All shipments in view");
      return;
    }
    onSwitchTab?.(t);
  };

  return (
    <div className="min-w-0">
      <StickyFilterBar view={view} extra={extra} companyName={companyName} />

      <div className="mt-5 grid grid-cols-1 items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <HistoryBrush view={view} extra={extra} actions={actions} m0={state.m0} m1={state.m1} />

          {tab === "overview" && (
            <OverviewTab
              view={view}
              ds={dataset}
              extra={extra}
              onOpenTab={handleOpenTab}
              sourceNote={refreshedNote ?? ""}
            />
          )}
          {tab === "lanes" && lanesView && (
            <TradeLanesTab view={view} lanesView={lanesView} hqLabel={meta?.hq ?? undefined} />
          )}
          {tab === "history" && lanesView && (
            <LaneHistoryTab view={view} lanesView={lanesView} firstMonthLabel={firstMonthLabel} />
          )}
        </div>

        <InsightRail
          view={view}
          account={{
            ownerName: meta?.ownerName ?? undefined,
            stage: meta?.stage ?? undefined,
            lastActivity: meta?.lastActivity ?? undefined,
          }}
          firmo={{
            website: meta?.website ?? undefined,
            phone: meta?.phone ?? undefined,
            hq: meta?.hq ?? undefined,
            parent: meta?.parent ?? undefined,
          }}
          savedContacts={savedContacts}
          onFindContacts={() => onSwitchTab?.("contacts")}
        />
      </div>

      <DataTraceDrawer view={view} extra={extra} />
    </div>
  );
}

export default CompanyProfileWorkspace;
