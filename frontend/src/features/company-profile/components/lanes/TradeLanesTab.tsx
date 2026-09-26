/**
 * Trade Lanes tab — handoff README §7, markup ported from the
 * `<sc-if value="{{ isLanes }}">` block of "Company Profile v2.dc.html".
 *
 * Renders the `computeLanes()` view-model verbatim — items carry their own
 * onClick/onTrace handlers and precomputed colors/widths/scales; this file
 * never re-derives math.
 */
import React from "react";
import { Anchor, ArrowRight, Download, FileText } from "lucide-react";
import type { LanesView, ProfileView } from "../../data/selectors";
import {
  CARD_SHADOW,
  Card,
  DeltaPill,
  EASE_OUT,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  Overline,
  Spark,
  useReducedMotion,
} from "../ui";

type LaneD = LanesView["lanesD"][number];

/** 10px caps fact / table-header label. */
function CapsLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={"text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8] " + className}
      style={{ fontFamily: FONT_DISPLAY }}
    >
      {children}
    </div>
  );
}

function LaneCard({ l, unitM, reduced }: { l: LaneD; unitM: string; reduced: boolean }) {
  return (
    <div
      onClick={l.onClick}
      className="cursor-pointer rounded-[14px] border bg-white px-5 py-[18px] shadow-[0_8px_30px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_32px_rgba(15,23,42,0.10)] active:scale-[0.99]"
      style={{
        borderColor: l.border,
        opacity: l.opacity,
        ...(l.ring !== "none" ? { boxShadow: `${CARD_SHADOW}, ${l.ring}` } : null),
        transition: `opacity 200ms, box-shadow 200ms ${EASE_OUT}, transform 160ms ${EASE_OUT}`,
      }}
    >
      {/* header row */}
      <div className="flex items-center gap-[10px]">
        <span className="text-[11px] font-medium text-[#94a3b8]" style={{ fontFamily: FONT_MONO }}>
          {l.rank}
        </span>
        <span
          className="rounded-[4px] px-[6px] py-[2px] text-[11px] font-semibold text-white"
          style={{ fontFamily: FONT_MONO, background: l.color }}
        >
          {l.oc}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-[#0F172A]" style={{ fontFamily: FONT_DISPLAY }}>
            {l.label}
          </div>
          <div className="truncate text-[11px] text-[#94a3b8]" style={{ fontFamily: FONT_MONO }}>
            {l.route}
          </div>
        </div>
        <DeltaPill delta={l.delta} fg={l.deltaFg} bg={l.deltaBg} />
      </div>

      {/* value row */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div
            className="text-[32px] font-semibold leading-none tracking-[-0.04em] text-[#0F172A] [font-variant-numeric:tabular-nums]"
            style={{ fontFamily: FONT_MONO }}
          >
            {l.valFmt}
          </div>
          <div className="mt-[6px] text-[12px] text-[#64748b]">
            {unitM} · {l.share} of total
          </div>
        </div>
        <Spark d={l.spark} stroke={l.color} height={36} width="45%" strokeWidth={1.8} />
      </div>

      {/* carrier split bar + legend */}
      <div className="mb-2 mt-4 flex h-[6px] gap-[2px] overflow-hidden rounded-full">
        {l.carriers.map((c) => (
          <div
            key={c.key}
            title={`${c.label} ${c.share}`}
            style={{ width: c.w, background: c.color, transition: reduced ? undefined : `width 500ms ${EASE_OUT}` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-[10px] text-[11px] text-[#64748b]">
        {l.carriers.map((c) => (
          <span key={c.key} className="flex items-center gap-[5px]">
            <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: c.color }} />
            {c.label}{" "}
            <span className="text-[#0F172A] [font-variant-numeric:tabular-nums]" style={{ fontFamily: FONT_MONO }}>
              {c.share}
            </span>
          </span>
        ))}
      </div>

      {/* 2×3 fact grid */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-[10px] border-t border-[#F1F5F9] pt-[14px] text-[12px]">
        <div>
          <CapsLabel>BOLs · TEU</CapsLabel>
          <div className="mt-[3px] text-[13px] font-semibold [font-variant-numeric:tabular-nums]" style={{ fontFamily: FONT_MONO }}>
            {l.shipments} · {l.teu}
          </div>
        </div>
        <div>
          <CapsLabel>Est. spend</CapsLabel>
          <div className="mt-[3px] text-[13px] font-semibold [font-variant-numeric:tabular-nums]" style={{ fontFamily: FONT_MONO }}>
            {l.spend}
          </div>
        </div>
        <div className="min-w-0">
          <CapsLabel>Supplier</CapsLabel>
          <div className="mt-[3px] truncate font-semibold">{l.topSupplier}</div>
        </div>
        <div className="min-w-0">
          <CapsLabel>Product</CapsLabel>
          <div className="mt-[3px] truncate font-semibold">{l.topProduct}</div>
        </div>
        <div>
          <CapsLabel>Equipment · FCL</CapsLabel>
          <div className="mt-[3px] text-[13px] font-semibold [font-variant-numeric:tabular-nums]" style={{ fontFamily: FONT_MONO }}>
            {l.topEquip} · {l.fcl}
          </div>
        </div>
        <div>
          <CapsLabel>Last arrival</CapsLabel>
          <div className="mt-[3px] text-[13px] font-semibold [font-variant-numeric:tabular-nums]" style={{ fontFamily: FONT_MONO }}>
            {l.last}
          </div>
        </div>
      </div>

      {/* footer trace button */}
      <div
        onClick={(e) => l.onTrace(e)}
        className="mt-[14px] flex h-[34px] cursor-pointer items-center justify-center gap-[6px] rounded-[8px] bg-[#F8FAFC] text-[12px] font-semibold text-[#2563eb] hover:bg-[#EEF2F6]"
        style={{ fontFamily: FONT_BODY }}
      >
        <FileText size={13} />
        View {l.shipments} bills of lading
      </div>
    </div>
  );
}

export function TradeLanesTab({
  view,
  lanesView,
  hqLabel,
}: {
  view: ProfileView;
  lanesView: LanesView;
  hqLabel?: string;
}) {
  const reduced = useReducedMotion();

  const exportCsv = () => {
    const esc = (s: string) => '"' + String(s).replace(/"/g, '""') + '"';
    const header = ["lane", "route", "bols", "teu", "spend", "carrier", "supplier", "equip", "fcl", "last"].join(",");
    const lines = lanesView.lanesD.map((l) =>
      [l.label, l.route, l.shipments, l.teu, l.spend, l.topCarrier, l.topSupplier, l.topEquip, l.fcl, l.last]
        .map(esc)
        .join(","),
    );
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trade-lanes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* a) title block */}
      <div className="pb-1 pt-2">
        <h2
          className="m-0 text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-[#0F172A]"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Trade lanes
        </h2>
        <p
          className="mb-0 mt-[10px] max-w-[820px] text-[17px] leading-[1.55] text-[#475569]"
          style={{ fontFamily: FONT_BODY, textWrap: "pretty" } as React.CSSProperties}
        >
          <span className="font-semibold text-[#0F172A]">{lanesView.laneCount} active lanes</span> in{" "}
          {view.periodLabel}. {view.story.topLane} carries {view.story.topShare} of {view.unitM}. Select a lane to
          filter every chart on the profile.
        </p>
      </div>

      {/* b) lane cards grid */}
      <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        {lanesView.lanesD.map((l) => (
          <LaneCard key={l.key} l={l} unitM={view.unitM} reduced={reduced} />
        ))}
      </div>

      {/* c) lane mix + lane trend */}
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
        {/* Lane mix */}
        <Card className="px-6 py-5">
          <Overline>Lane mix · carrier share within each lane</Overline>
          <div className="mt-5 flex flex-col gap-4">
            {lanesView.lanesD.map((l) => (
              <div key={l.key} onClick={l.onClick} className="cursor-pointer" style={{ opacity: l.opacity }}>
                <div className="mb-[6px] flex justify-between text-[13px]">
                  <span className="font-semibold">{l.label}</span>
                  <span
                    className="text-[12px] font-semibold [font-variant-numeric:tabular-nums]"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    {l.valFmt}
                  </span>
                </div>
                <div className="h-[14px] overflow-hidden rounded-full bg-[#F1F5F9]">
                  <div
                    className="flex h-full gap-[2px] overflow-hidden rounded-full"
                    style={{ width: l.mixW, transition: reduced ? undefined : `width 600ms ${EASE_OUT}` }}
                  >
                    {l.carriers.map((c) => (
                      <div key={c.key} title={`${c.label} ${c.share}`} style={{ width: c.w, background: c.color }} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-[18px] flex flex-wrap gap-3 border-t border-[#F1F5F9] pt-[14px] text-[12px] text-[#475569]">
            {lanesView.carrierLegend.map((c) => (
              <span key={c.label} className="flex items-center gap-[6px]">
                <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
          </div>
        </Card>

        {/* Lane trend */}
        <Card className="px-6 py-5">
          <div className="flex flex-wrap justify-between gap-3">
            <Overline>Lane trend · same window, prior years</Overline>
            <div className="flex gap-3 text-[11px] text-[#64748b]">
              <span className="flex items-center gap-[5px]">
                <span className="h-[9px] w-[9px] rounded-[3px] bg-[#E2E8F0]" />
                −24M
              </span>
              <span className="flex items-center gap-[5px]">
                <span className="h-[9px] w-[9px] rounded-[3px] bg-[#94a3b8]" />
                −12M
              </span>
              <span className="flex items-center gap-[5px]">
                <span className="h-[9px] w-[9px] rounded-[3px] bg-[#3b82f6]" />
                Selected
              </span>
            </div>
          </div>
          <div className="mt-[22px] flex items-end gap-[18px]">
            {lanesView.lanesD.map((l) => (
              <div
                key={l.key}
                onClick={l.onClick}
                className="min-w-0 flex-1 cursor-pointer"
                style={{ opacity: l.opacity }}
              >
                <div className="flex h-[170px] items-end gap-1 border-b border-[#E2E8F0]">
                  {l.yoy.map((b) => (
                    <div
                      key={b.label}
                      title={`${b.label} · ${b.v}`}
                      className="flex h-full flex-1 flex-col items-center justify-end"
                    >
                      <div
                        className="h-full w-full rounded-t-[4px]"
                        style={{
                          background: b.bg,
                          transform: `scaleY(${b.s})`,
                          transformOrigin: "bottom",
                          transition: reduced ? undefined : `transform 560ms ${EASE_OUT}`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 truncate text-[12px] font-semibold" style={{ fontFamily: FONT_BODY }}>
                  {l.label}
                </div>
                <div
                  className="text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
                  style={{ fontFamily: FONT_MONO, color: l.deltaFg }}
                >
                  {l.delta} YoY
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* d) domestic leg */}
      <Card className="px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Overline>Domestic leg · port of entry{hqLabel ? " to " + hqLabel : ""}</Overline>
            <div className="mt-[10px] flex items-baseline gap-2">
              <span
                className="text-[30px] font-semibold tracking-[-0.03em] [font-variant-numeric:tabular-nums]"
                style={{ fontFamily: FONT_MONO }}
              >
                ~{lanesView.drayPerMonth}
              </span>
              <span className="text-[13px] text-[#64748b]">
                inland truckloads per month · {lanesView.drayTotal} in period
              </span>
            </div>
          </div>
          <span
            className="rounded-full px-[10px] py-[3px] text-[11px] font-semibold text-[#b45309]"
            style={{ fontFamily: FONT_BODY, background: "rgba(245,158,11,0.12)" }}
          >
            Modeled from import BOLs
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {lanesView.dray.map((d) => (
            <div
              key={d.port}
              className="grid items-center gap-3 rounded-[10px] bg-[#F8FAFC] px-[14px] py-3 text-[13px] [grid-template-columns:minmax(0,1fr)_90px_90px_110px]"
            >
              <span className="flex min-w-0 items-center gap-[10px]">
                <Anchor size={14} className="shrink-0 text-[#64748b]" />
                <span className="font-semibold">{d.port}</span>
                <ArrowRight size={14} className="shrink-0 text-[#CBD5E1]" />
                <span className="font-semibold">{hqLabel ?? "HQ"}</span>
              </span>
              <span
                className="text-right text-[12px] font-medium text-[#64748b] [font-variant-numeric:tabular-nums]"
                style={{ fontFamily: FONT_MONO }}
              >
                {d.miles == null ? "—" : `${d.miles} mi`}
              </span>
              <span
                className="text-right text-[12px] font-semibold [font-variant-numeric:tabular-nums]"
                style={{ fontFamily: FONT_MONO }}
              >
                {d.loads} loads
              </span>
              <span
                className="text-right text-[12px] font-medium text-[#64748b] [font-variant-numeric:tabular-nums]"
                style={{ fontFamily: FONT_MONO }}
              >
                {d.perMonth} / mo
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* e) all trade lanes table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#EEF2F6] px-6 py-[18px]">
          <div>
            <div className="text-[16px] font-semibold" style={{ fontFamily: FONT_DISPLAY }}>
              All trade lanes
            </div>
            <div className="mt-[2px] text-[12px] text-[#64748b]">
              Lane × carrier × supplier × equipment, {view.periodLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="flex h-[38px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] border border-[#E5E7EB] bg-white px-[14px] text-[13px] font-semibold text-[#0F172A] active:scale-[0.97]"
            style={{ fontFamily: FONT_BODY, transition: `transform 160ms ${EASE_OUT}` }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid gap-3 bg-[#F8FAFC] px-6 py-[10px] [grid-template-columns:1.2fr_70px_70px_90px_110px_1.3fr_90px_110px_110px]">
              <CapsLabel>Lane</CapsLabel>
              <CapsLabel className="text-right">BOLs</CapsLabel>
              <CapsLabel className="text-right">TEU</CapsLabel>
              <CapsLabel className="text-right">Spend</CapsLabel>
              <CapsLabel>Carrier</CapsLabel>
              <CapsLabel>Supplier</CapsLabel>
              <CapsLabel>Equip.</CapsLabel>
              <CapsLabel>Trend</CapsLabel>
              <CapsLabel>Last arrival</CapsLabel>
            </div>
            {lanesView.lanesD.map((l) => (
              <div
                key={l.key}
                onClick={(e) => l.onTrace(e)}
                className="grid cursor-pointer items-center gap-3 border-t border-[#F1F5F9] px-6 py-3 text-[13px] hover:bg-[#F8FAFC] [grid-template-columns:1.2fr_70px_70px_90px_110px_1.3fr_90px_110px_110px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="rounded-[3px] px-[5px] py-[1px] text-[10px] font-semibold text-white"
                    style={{ fontFamily: FONT_MONO, background: l.color }}
                  >
                    {l.oc}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{l.label}</span>
                    <span className="block truncate text-[11px] text-[#94a3b8]" style={{ fontFamily: FONT_MONO }}>
                      {l.route}
                    </span>
                  </span>
                </span>
                <span
                  className="text-right text-[12px] font-semibold [font-variant-numeric:tabular-nums]"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {l.shipments}
                </span>
                <span
                  className="text-right text-[12px] font-semibold [font-variant-numeric:tabular-nums]"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {l.teu}
                </span>
                <span
                  className="text-right text-[12px] font-semibold [font-variant-numeric:tabular-nums]"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {l.spend}
                </span>
                <span>{l.topCarrier}</span>
                <span className="truncate text-[#475569]">{l.topSupplier}</span>
                <span className="flex gap-1">
                  <span
                    className="rounded-[4px] bg-[#F1F5F9] px-[5px] py-[2px] text-[10px] font-semibold"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    {l.topEquip}
                  </span>
                  <span
                    className="rounded-[4px] px-[5px] py-[2px] text-[10px] font-semibold text-[#1d4ed8]"
                    style={{ fontFamily: FONT_MONO, background: "rgba(59,130,246,0.1)" }}
                  >
                    FCL {l.fcl}
                  </span>
                </span>
                <Spark d={l.spark} stroke={l.color} height={22} strokeWidth={1.6} />
                <span
                  className="text-[12px] font-medium text-[#475569] [font-variant-numeric:tabular-nums]"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {l.last}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
