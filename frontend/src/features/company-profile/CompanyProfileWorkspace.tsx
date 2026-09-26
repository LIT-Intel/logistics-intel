/**
 * CompanyProfileWorkspace — the Company Profile v2 surface (Overview,
 * Trade Lanes, Lane History) mounted inside CompanyProfileV2's tab body.
 *
 * One data load (useShipmentDataset), all filtering client-side through the
 * unit-tested selectors; every widget renders the shared view-model so any
 * period/metric/facet change updates the whole workspace at once.
 */
import { useMemo } from "react";
import { Database } from "lucide-react";
import { miLabel } from "./data/format";
import type { RecentBolInput } from "./data/normalizeShipments";
import type { ShipmentDataset } from "./data/types";
import { computeLanes, computeView } from "./data/selectors";
import { useCountUp } from "./data/useCountUp";
import { useShipmentDataset } from "./data/useCompanyShipments";
import { useProfileState } from "./data/useProfileState";
import { Card, FONT_BODY, FONT_DISPLAY } from "./components/ui";
import { StoryHeader } from "./components/StoryHeader";
import { StickyFilterBar } from "./components/StickyFilterBar";
import { HistoryBrush } from "./components/HistoryBrush";
import { DataTraceDrawer } from "./components/DataTraceDrawer";
import { InsightRail } from "./components/InsightRail";
import { OverviewTab } from "./components/overview/OverviewTab";
import { TradeLanesTab } from "./components/lanes/TradeLanesTab";
import { LaneHistoryTab } from "./components/history/LaneHistoryTab";

export type WorkspaceTab = "overview" | "lanes" | "history";

export interface CompanyProfileWorkspaceProps {
  tab: WorkspaceTab;
  companyKey: string | null | undefined; // source_company_key / slug
  companyName: string;
  recentBols?: RecentBolInput[] | null; // snapshot fallback (already fetched by the page)
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
  /** Pre-normalized dataset (public design preview) — skips the archive fetch. */
  demoDataset?: ShipmentDataset | null;
}

export function CompanyProfileWorkspace({
  tab,
  companyKey,
  companyName,
  recentBols,
  meta,
  savedContacts,
  refreshedNote,
  onSwitchTab,
  demoDataset,
}: CompanyProfileWorkspaceProps) {
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
    () =>
      dataset && ready && (tab === "lanes" || tab === "history")
        ? computeLanes(dataset, state, actions)
        : null,
    [dataset, ready, state, actions, tab],
  );

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
          No shipment archive yet
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-[#64748b]" style={{ fontFamily: FONT_BODY }}>
          Bills of lading for {companyName} haven&apos;t been materialized into the archive yet.
          The Supply Chain tab still shows the live snapshot while the archive builds.
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

  const mark = companyName
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, 4)
    .toUpperCase();
  const firstMonthLabel = miLabel(dataset.rows.length ? dataset.rows[0].mi : 0, dataset.firstYear);

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
      {isSnapshotFallback && (
        <div
          className="mb-3 flex items-center gap-2 rounded-[10px] border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.10)] px-3.5 py-2.5 text-[12.5px] text-[#92400e]"
          style={{ fontFamily: FONT_BODY }}
        >
          <Database className="h-4 w-4 shrink-0" />
          Archive backfilling — showing the ImportYeti snapshot sample ({view.totalBols} BOLs).
          Figures reconcile against these records only.
        </div>
      )}

      <StoryHeader view={view} companyName={companyName} mark={mark} />

      <StickyFilterBar view={view} extra={extra} companyName={companyName} mark={mark} />

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
