/**
 * Overview tab widgets (handoff README §6 items 2–3, 5–7).
 *
 * Every component renders the precomputed view-model verbatim — no math is
 * re-derived here except the insight-card picks, which are ported 1:1 from
 * the design's `renderVals()` (Company Profile v2.dc.html).
 */
import React from "react";
import {
  Anchor,
  CalendarClock,
  CalendarRange,
  Check,
  Container,
  DollarSign,
  Factory,
  Layers,
  Package,
  Route,
  Ship,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fmtMoney, fmtNum, miLabel } from "../../data/format";
import type { FacetItemVM, ProfileView } from "../../data/selectors";
import type { ShipmentDataset } from "../../data/types";
import type { ProfileExtraActions } from "../../data/useProfileState";
import {
  Card,
  DeltaPill,
  EASE_OUT,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  ModeledPill,
  Overline,
  ShareBar,
  Spark,
  useReducedMotion,
} from "../ui";

/** KPI icon ids (selectors' KDEFS) → lucide components. */
const KPI_ICON: Record<string, LucideIcon> = {
  ship: Ship,
  container: Container,
  "dollar-sign": DollarSign,
  package: Package,
  route: Route,
  layers: Layers,
  anchor: Anchor,
  factory: Factory,
  "calendar-clock": CalendarClock,
};

// ------------------------------------------------------------ InsightCards

interface InsightCard {
  kicker: string;
  Icon: LucideIcon;
  value: string;
  body: string;
  color: string;
  glow: string;
  onClick?: () => void;
}

/** §6.2 — dark derived-insight cards. Cards that are not computable hide. */
export function InsightCards({ view, ds }: { view: ProfileView; ds: ShipmentDataset }) {
  const top = view.lanes.find((l) => !l.dimmed);
  const movers = view.lanes
    .filter((l) => typeof l.deltaN === "number" && isFinite(l.deltaN) && l.shipmentsN >= 3)
    .sort((a, b) => Math.abs(b.deltaN as number) - Math.abs(a.deltaN as number));
  const mover = movers[0];
  const peak = view.cadence.slice().sort((a, b) => b.v - a.v)[0];
  const car = view.carriers[0];
  const fm = view.unitM === "est. spend" ? fmtMoney : fmtNum;

  const cards: InsightCard[] = [
    top && {
      kicker: "Primary lane",
      Icon: Route,
      value: top.share,
      body: `${top.label} · ${top.shipments} BOLs, ${top.teu} TEU`,
      color: "#00F0FF",
      glow: "rgba(0,240,255,0.25)",
      onClick: top.onClick,
    },
    mover && {
      kicker: (mover.deltaN as number) >= 0 ? "Fastest growing" : "Biggest decline",
      Icon: (mover.deltaN as number) >= 0 ? TrendingUp : TrendingDown,
      value: mover.delta,
      body: `${mover.label} vs ${view.priorLabel}`,
      color: (mover.deltaN as number) >= 0 ? "#34d399" : "#f87171",
      glow: (mover.deltaN as number) >= 0 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
      onClick: mover.onClick,
    },
    peak && {
      kicker: "Peak month",
      Icon: CalendarRange,
      value: miLabel(peak.mi, ds.firstYear),
      body: `${fm(peak.v)} ${view.unitM} · click for BOLs`,
      color: "#60a5fa",
      glow: "rgba(59,130,246,0.3)",
      onClick: peak.onClick,
    },
    car && {
      kicker: "Carrier share",
      Icon: Anchor,
      value: car.share,
      body: `${car.label} leads ${view.carriers.length} carriers`,
      color: "#a78bfa",
      glow: "rgba(139,92,246,0.3)",
      onClick: car.onClick,
    },
  ].filter(Boolean) as InsightCard[];

  if (!cards.length) return null;

  return (
    <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
      {cards.map((c) => (
        <div
          key={c.kicker}
          onClick={c.onClick}
          className="relative cursor-pointer overflow-hidden rounded-[14px] border border-[#1e293b] bg-[#0F172A] px-[18px] py-4 text-[#f8fafc] hover:border-[rgba(0,240,255,0.45)] active:scale-[0.98]"
          style={{
            boxShadow: "0 8px 30px rgba(15,23,42,0.14)",
            transition: `transform 160ms ${EASE_OUT}, border-color 200ms`,
          }}
        >
          <div
            className="pointer-events-none absolute right-[-30px] top-[-30px] h-[120px] w-[120px] rounded-full"
            style={{ background: `radial-gradient(circle,${c.glow},transparent 70%)` }}
          />
          <div
            className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: c.color, fontFamily: FONT_DISPLAY }}
          >
            <c.Icon size={14} />
            {c.kicker}
          </div>
          <div
            className="text-[22px] font-semibold leading-[1.1]"
            style={{ color: c.color, fontFamily: FONT_MONO, letterSpacing: "-0.03em", margin: "12px 0 6px" }}
          >
            {c.value}
          </div>
          <div className="text-[13px] font-medium leading-[1.4] text-[#cbd5e1]" style={{ fontFamily: FONT_BODY }}>
            {c.body}
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- KpiGrid

/** §6.3 — pinned KPI cards + Customize pin panel. */
export function KpiGrid({ view }: { view: ProfileView }) {
  const [customizing, setCustomizing] = React.useState(false);
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Overline>
          Key metrics · {view.periodLabel}{" "}
          <span
            className="font-medium normal-case tracking-normal text-[#94a3b8]"
            style={{ fontFamily: FONT_BODY }}
          >
            vs {view.priorLabel}
          </span>
        </Overline>
        <button
          type="button"
          onClick={() => setCustomizing((c) => !c)}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#475569] hover:bg-[#EEF2F6]"
          style={{ fontFamily: FONT_BODY }}
        >
          <SlidersHorizontal size={14} />
          Customize
        </button>
      </div>

      {customizing && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-[#CBD5E1] bg-white p-3">
          {view.kpis.map((k) => {
            const Icon = KPI_ICON[k.icon] ?? Ship;
            return (
              <button
                type="button"
                key={k.id}
                onClick={k.onPin}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold"
                style={{
                  fontFamily: FONT_BODY,
                  background: k.pinned ? "#0F172A" : "#FFFFFF",
                  color: k.pinned ? "#FFFFFF" : "#475569",
                  borderColor: k.pinned ? "#0F172A" : "#E2E8F0",
                }}
              >
                <Icon size={13} />
                {k.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        {view.pinnedKpis.map((k) => {
          const Icon = KPI_ICON[k.icon] ?? Ship;
          return (
            <div
              key={k.id}
              onClick={k.onTrace}
              className="relative cursor-pointer rounded-[14px] border border-[#E5E7EB] bg-white px-4 pb-3 pt-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] hover:border-[rgba(59,130,246,0.45)] hover:shadow-[0_12px_32px_rgba(15,23,42,0.10)] active:scale-[0.98]"
              style={{ transition: `border-color 200ms ${EASE_OUT}, box-shadow 200ms, transform 160ms` }}
            >
              <div
                className="flex items-center gap-2 text-[12px] font-semibold text-[#475569]"
                style={{ fontFamily: FONT_BODY }}
              >
                <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-lg bg-[rgba(59,130,246,0.1)] text-[#2563eb]">
                  <Icon size={14} />
                </span>
                {k.label}
                {k.modeled && <ModeledPill />}
              </div>
              <div
                className="text-[30px] font-semibold leading-none text-[#0F172A]"
                style={{
                  fontFamily: FONT_MONO,
                  letterSpacing: "-0.03em",
                  margin: "14px 0 8px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {k.value}
              </div>
              <div className="flex items-center gap-2 text-[12px] text-[#64748b]">
                <DeltaPill delta={k.delta} fg={k.deltaFg} bg={k.deltaBg} />
                <span className="text-[11px]" style={{ fontFamily: FONT_MONO }}>
                  {k.prior}
                </span>
              </div>
              {k.hasSpark && k.spark && (
                <div className="mt-2.5">
                  <Spark d={k.spark} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ CadenceChart

/** §6.5 left — monthly cadence bars (current vs same-month prior year). */
export function CadenceChart({
  view,
  extra,
  showPrior = true,
}: {
  view: ProfileView;
  extra: ProfileExtraActions;
  showPrior?: boolean;
}) {
  const reduced = useReducedMotion();
  const prior = showPrior && view.hasPrior;
  return (
    <Card className="min-w-0 px-6 py-5 min-[980px]:col-span-2">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <Overline>Monthly cadence · {view.readout.title}</Overline>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span
              className="text-[28px] font-semibold"
              style={{ fontFamily: FONT_MONO, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}
            >
              {view.readout.value}
            </span>
            <span className="text-[13px] text-[#64748b]">{view.unitM}</span>
          </div>
          <div className="mt-0.5 text-[12px] text-[#64748b]">{view.readout.sub}</div>
        </div>
        <div className="flex items-start gap-3.5 text-[12px] text-[#475569]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[#3b82f6]" />
            Selected period
          </span>
          {prior && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-[#E2E8F0]" />
              Same month, prior year
            </span>
          )}
        </div>
      </div>

      <div
        onMouseLeave={extra.clearHover}
        className="relative mt-[18px] flex h-[220px] items-end gap-1.5 border-b border-[#E2E8F0]"
      >
        {view.rbTicks.map((t, i) => (
          <div
            key={i}
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-[#EEF2F6]"
            style={{ top: t.top }}
          >
            <span
              className="absolute right-0 top-[-16px] text-[10px] text-[#94a3b8]"
              style={{ fontFamily: FONT_MONO }}
            >
              {t.label}
            </span>
          </div>
        ))}
        {view.cadence.map((b) => (
          <div
            key={b.mi}
            onMouseEnter={b.onEnter}
            onClick={b.onClick}
            className="relative flex h-full flex-1 cursor-pointer items-end gap-[2px]"
          >
            {prior && (
              <div
                className="h-full flex-1 rounded-t bg-[#E2E8F0]"
                style={{
                  transform: `scaleY(${b.ps})`,
                  transformOrigin: "bottom",
                  transition: reduced ? "none" : `transform 520ms ${EASE_OUT}`,
                  transitionDelay: reduced ? "0ms" : `${b.delay}ms`,
                }}
              />
            )}
            <div
              className="h-full flex-1 rounded-t"
              style={{
                background: b.bg,
                transform: `scaleY(${b.s})`,
                transformOrigin: "bottom",
                transition: reduced ? "background 160ms" : `transform 520ms ${EASE_OUT}, background 160ms`,
                transitionDelay: reduced ? "0ms" : `${b.delay}ms`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {view.cadence.map((b) => (
          <div
            key={b.mi}
            className="flex-1 text-center text-[11px] font-medium text-[#94a3b8]"
            style={{ fontFamily: FONT_MONO }}
          >
            {b.label}
          </div>
        ))}
      </div>
      <div className="mt-3 text-[12px] text-[#94a3b8]">Click a month to see its bills of lading</div>
    </Card>
  );
}

// ------------------------------------------------------------ EquipmentMix

/** §6.5 right — segmented equipment bar + checkable filter rows. */
export function EquipmentMix({ view }: { view: ProfileView }) {
  const reduced = useReducedMotion();
  if (view.ctypes.length === 0) return null;
  return (
    <Card className="min-w-0 px-6 py-5">
      <Overline>Equipment mix · by {view.unitM}</Overline>
      <div className="my-[18px] flex h-[14px] gap-[2px] overflow-hidden rounded-full">
        {view.ctypes.map((c) => (
          <div
            key={c.key}
            className="flex-none"
            style={{
              width: c.w,
              background: c.color,
              opacity: c.opacity,
              transition: reduced ? "opacity 200ms" : `width 500ms ${EASE_OUT}, opacity 200ms`,
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-[2px]">
        {view.ctypes.map((c) => (
          <div
            key={c.key}
            onClick={c.onClick}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-[9px] hover:bg-[#F1F5F9]"
            style={{ background: c.rowBg, opacity: c.opacity }}
          >
            <span
              className="grid h-4 w-4 flex-none place-items-center rounded text-white"
              style={{ border: `1.5px solid ${c.checkBorder}`, background: c.checkBg }}
            >
              <Check size={11} strokeWidth={3} />
            </span>
            <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: c.color }} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold" style={{ fontFamily: FONT_BODY }}>
                {c.label}
              </div>
              <div className="text-[11px] text-[#94a3b8]">{c.sub}</div>
            </div>
            <span className="text-[13px] font-semibold" style={{ fontFamily: FONT_MONO }}>
              {c.share}
            </span>
          </div>
        ))}
        {view.ctypeCoverage < 0.999 && (
          <div className="px-2 pt-2 text-[11px] text-[#94a3b8]">
            Equipment identified on {Math.round(view.ctypeCoverage * 100)}% of BOLs in view
          </div>
        )}
      </div>
    </Card>
  );
}

// -------------------------------------------------------------- FacetCard

/** §6.6 — generic top-N facet card (Suppliers / Products·HS / Carriers). */
export function FacetCard({
  title,
  icon: Icon,
  iconColor,
  items,
  onOpenTab,
  maxRows = 4,
  subAsChip = false,
}: {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  items: FacetItemVM[];
  onOpenTab?: () => void;
  maxRows?: number;
  subAsChip?: boolean;
}) {
  return (
    <Card className="min-w-0 px-5 pb-3 pt-5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[16px] font-semibold" style={{ fontFamily: FONT_DISPLAY }}>
          <Icon size={18} style={{ color: iconColor }} />
          {title}
        </div>
        {onOpenTab && (
          <button
            type="button"
            onClick={onOpenTab}
            className="text-[12px] font-semibold text-[#3b82f6] hover:text-[#2563eb]"
            style={{ fontFamily: FONT_BODY }}
          >
            Open tab
          </button>
        )}
      </div>
      {items.slice(0, maxRows).map((x) => (
        <div
          key={x.key}
          onClick={x.onClick}
          className="cursor-pointer rounded-lg px-2 py-2.5 hover:bg-[#F1F5F9]"
          style={{ background: x.rowBg, opacity: x.opacity }}
        >
          <div className="flex items-center gap-2.5">
            {subAsChip ? (
              <>
                <span
                  className="flex-none rounded px-[5px] py-[2px] text-[10px] font-semibold text-[#475569]"
                  style={{ fontFamily: FONT_MONO, background: "#F1F5F9" }}
                >
                  {x.sub}
                </span>
                <div className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ fontFamily: FONT_BODY }}>
                  {x.label}
                </div>
              </>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold" style={{ fontFamily: FONT_BODY }}>
                  {x.label}
                </div>
                <div className="text-[11px] text-[#94a3b8]">
                  {x.sub ? `${x.sub} · ` : ""}
                  {x.shipments} BOLs
                </div>
              </div>
            )}
            <span className="text-[13px] font-semibold" style={{ fontFamily: FONT_MONO }}>
              {x.val}
            </span>
            <span
              className="w-[38px] text-right text-[11px] font-semibold text-[#64748b]"
              style={{ fontFamily: FONT_MONO }}
            >
              {x.share}
            </span>
          </div>
          <ShareBar color={x.color} s={x.s} className="mt-2" />
        </div>
      ))}
    </Card>
  );
}

// -------------------------------------------------------- LatestBolsTable

const BOL_COLS = "120px 150px 1.3fr 1fr 90px 60px 90px";

/** §6.7 — latest 8 in-view bills of lading. */
export function LatestBolsTable({
  view,
  onAllShipments,
}: {
  view: ProfileView;
  onAllShipments?: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#EEF2F6] px-6 py-[18px]">
        <div>
          <div className="text-[16px] font-semibold" style={{ fontFamily: FONT_DISPLAY }}>
            Latest bills of lading
          </div>
          <div className="mt-0.5 text-[12px] text-[#64748b]">Every figure above sums from these records</div>
        </div>
        <button
          type="button"
          onClick={onAllShipments}
          className="text-[12px] font-semibold text-[#3b82f6] hover:text-[#2563eb]"
          style={{ fontFamily: FONT_BODY }}
        >
          All shipments
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div
            className="grid gap-3 bg-[#F8FAFC] px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]"
            style={{ gridTemplateColumns: BOL_COLS, fontFamily: FONT_DISPLAY }}
          >
            <span>Arrival</span>
            <span>BOL</span>
            <span>Route</span>
            <span>Product</span>
            <span>Equip.</span>
            <span className="text-right">TEU</span>
            <span className="flex items-center justify-end gap-1 text-right">
              Est. spend
              {view.modeled.spend && <ModeledPill />}
            </span>
          </div>
          {view.recent.map((r) => (
            <div
              key={r.id}
              onClick={r.onClick}
              className="grid cursor-pointer items-center gap-3 border-t border-[#F1F5F9] px-6 py-3 text-[13px] hover:bg-[#F8FAFC]"
              style={{ gridTemplateColumns: BOL_COLS }}
            >
              <span className="text-[12px] font-medium text-[#475569]" style={{ fontFamily: FONT_MONO }}>
                {r.date}
              </span>
              <span className="truncate text-[12px] font-medium text-[#1d4ed8]" style={{ fontFamily: FONT_MONO }}>
                {r.id}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: r.color }} />
                <span className="truncate">{r.route}</span>
              </span>
              <span className="truncate text-[#475569]">{r.product}</span>
              <span className="text-[12px] font-medium" style={{ fontFamily: FONT_MONO }}>
                {r.equip}
              </span>
              <span className="text-right text-[12px] font-semibold" style={{ fontFamily: FONT_MONO }}>
                {r.teu}
              </span>
              <span className="text-right text-[12px] font-semibold" style={{ fontFamily: FONT_MONO }}>
                {r.spend}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
