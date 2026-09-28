/**
 * TradeLanesOpenView — fullscreen "Cinematic" trade-lanes open view for the
 * Company Profile (design handoff `Trade Lanes Map.dc.html`, <sc-if m1> block;
 * README §4.1–4.2).
 *
 * MAP CORE UNTOUCHED: this file only composes the existing
 * `src/components/LaneMap.tsx` engine full-bleed behind absolutely-positioned
 * glass overlays (toolbar · lanes panel · lane-detail card · play/timeline).
 *
 * All state is LOCAL to this view (window, metric, selection, min-BOL filter,
 * play). Numbers come from the v2 `computeView` selector — nothing is
 * hand-aggregated here.
 *
 * Share portal (README §4.6): an optional `share` prop renders the Share
 * button + ShareMapDialog; `viewerMode` + `redactions` drive the public
 * read-only portal (redactions are UX only — the server never sends
 * excluded fields in the first place).
 */
import React from "react";
import ReactDOM from "react-dom";
import { ArrowRight, Pause, Play, Share2, X } from "lucide-react";
import AppLaneMap from "@/components/LaneMap";
import { computePresets, computeView, type ProfileView } from "../../data/selectors";
import { deltaToneDark, miLabel } from "../../data/format";
import type { Metric, ProfileActions, ShipmentDataset } from "../../data/types";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, useReducedMotion } from "../ui";
import { toGlobeLanes } from "./LaneMap";
import { ShareMapDialog } from "./ShareMapDialog";

// ---------------------------------------------------------------- tokens

const CYAN = "#00F0FF";
const EASE = "cubic-bezier(0.16,1,0.3,1)";
const DRAWER_EASE = "cubic-bezier(0.32,0.72,0,1)";

/** Dark glass surface per README §4.2. */
const GLASS: React.CSSProperties = {
  background: "rgba(2,6,23,0.72)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  color: "#f8fafc",
  boxShadow: "0 20px 40px rgba(2,6,23,0.4)",
};

const OVERLINE: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const DETAIL_OVERLINE: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#64748b",
};

const DONUT_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"];

type LaneItem = ProfileView["lanes"][number];

/** Segmented-control chip (dark toolbar style: active cyan / #020617). */
function Chip({
  label,
  active,
  mono = false,
  onClick,
}: {
  label: string;
  active: boolean;
  mono?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer whitespace-nowrap rounded-[7px] px-2.5 py-1.5"
      style={{
        fontFamily: mono ? FONT_MONO : FONT_BODY,
        fontWeight: 600,
        fontSize: mono ? 11 : 12,
        background: active ? CYAN : "transparent",
        color: active ? "#020617" : "#cbd5e1",
        border: "none",
        transition: "background 200ms, color 200ms",
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- component

export function TradeLanesOpenView(props: {
  ds: ShipmentDataset;
  companyName: string;
  initialM0: number;
  initialM1: number;
  onClose: () => void;
  /** When present, render the Share button + ShareMapDialog (owner surface). */
  share?: { companyKey: string; companyUuid?: string | null; companyName: string };
  /** Public share portal: hides Share + ✕ and pushes below the 48px viewer bar. */
  viewerMode?: boolean;
  /** Include flags from the share link (flag = false → redacted). */
  redactions?: { spend: boolean; bols: boolean; suppliers: boolean; carriers: boolean };
}) {
  const { ds, companyName, onClose, viewerMode, redactions } = props;
  const reduced = useReducedMotion();

  // ---- share-portal redaction flags (default: everything visible) --------
  const showSpend = redactions ? redactions.spend : true;
  const showBols = redactions ? redactions.bols : true;
  const showSuppliers = redactions ? redactions.suppliers : true;
  const showCarriers = redactions ? redactions.carriers : true;

  // ---- local state (never touches page state) ----------------------------
  const [win, setWin] = React.useState<[number, number]>([props.initialM0, props.initialM1]);
  const [m0, m1] = win;
  const [metric, setMetric] = React.useState<Metric>("shipments");
  /** spend redacted → the Spend metric is unavailable; force shipments. */
  const effMetric: Metric = !showSpend && metric === "spend" ? "shipments" : metric;
  const [shareOpen, setShareOpen] = React.useState(false);
  const shareOpenRef = React.useRef(false);
  shareOpenRef.current = shareOpen;
  const [minShip, setMinShip] = React.useState<0 | 5 | 25 | 100>(0);
  const [playing, setPlaying] = React.useState(false);
  /** undefined = "not chosen yet" → defaults to the top lane. */
  const [selState, setSelState] = React.useState<string | null | undefined>(undefined);
  const [vw, setVw] = React.useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1440));

  // ---- local brush anchor (design prototype's `this._brush`) -------------
  const brushAnchor = React.useRef<number | null>(null);

  // ---- play engine (3-month window stepping every 650ms) -----------------
  const playTimer = React.useRef<number | null>(null);
  const playMi = React.useRef(2);
  const stopPlay = React.useCallback(() => {
    if (playTimer.current != null) {
      window.clearInterval(playTimer.current);
      playTimer.current = null;
    }
    setPlaying(false);
  }, []);
  const togglePlay = React.useCallback(() => {
    if (playTimer.current != null) {
      stopPlay();
      return;
    }
    brushAnchor.current = null;
    playMi.current = 2;
    setWin([0, Math.min(2, ds.lastMi)]);
    setPlaying(true);
    playTimer.current = window.setInterval(() => {
      const n = playMi.current + 1;
      if (n > ds.lastMi) {
        stopPlay();
        return;
      }
      playMi.current = n;
      setWin([Math.max(0, n - 2), n]);
    }, 650);
  }, [ds.lastMi, stopPlay]);

  // ---- local brush (anchor exactly like the design prototype) ------------
  const brushStart = React.useCallback(
    (mi: number) => {
      stopPlay();
      brushAnchor.current = mi;
      setWin([mi, mi]);
    },
    [stopPlay],
  );
  const brushMove = React.useCallback((mi: number) => {
    const a = brushAnchor.current;
    if (a == null) return;
    setWin([Math.min(a, mi), Math.max(a, mi)]);
  }, []);

  /** All no-ops EXCEPT brushStart/brushMove, which drive the local window. */
  const inertActions = React.useMemo<ProfileActions>(
    () => ({
      toggle: () => {},
      preset: () => {},
      range: () => {},
      metric: () => {},
      hover: () => {},
      trace: () => {},
      pin: () => {},
      brushStart,
      brushMove,
    }),
    [brushStart, brushMove],
  );

  // ---- mount effects: scroll lock, Escape, brush release, resize ---------
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // when the share dialog is open, Escape closes the dialog only
      if (e.key === "Escape" && !shareOpenRef.current) onCloseRef.current();
    };
    const onUp = () => {
      brushAnchor.current = null;
    };
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", onResize);
      if (playTimer.current != null) window.clearInterval(playTimer.current);
    };
  }, []);

  // ---- derived data (all through computeView) ----------------------------
  const view = React.useMemo(
    () =>
      computeView(
        ds,
        { m0, m1, preset: null, metric: effMetric, f: {}, trace: null, hover: null, pins: [], intro: false, disp: null },
        inertActions,
      ),
    [ds, m0, m1, effMetric, inertActions],
  );

  const lanesShown = React.useMemo(
    () => view.lanes.filter((l) => l.shipmentsN >= minShip),
    [view.lanes, minShip],
  );

  // effective selection: init = top lane; must survive the min-BOL filter
  const sel: string | null =
    selState === undefined
      ? lanesShown[0]?.key ?? null
      : selState != null && lanesShown.some((l) => l.key === selState)
        ? selState
        : null;

  const detail = React.useMemo(
    () =>
      sel
        ? computeView(
            ds,
            {
              m0,
              m1,
              preset: null,
              metric: effMetric,
              f: { lane: [sel] },
              trace: null,
              hover: null,
              pins: [],
              intro: false,
              disp: null,
            },
            inertActions,
          )
        : null,
    [ds, m0, m1, effMetric, sel, inertActions],
  );

  const slv: LaneItem | undefined = sel ? view.lanes.find((l) => l.key === sel) : undefined;

  // Keep last non-null content so the card can slide OUT without emptying.
  const lastCardRef = React.useRef<{ slv: LaneItem; detail: ProfileView } | null>(null);
  if (slv && detail) lastCardRef.current = { slv, detail };
  const card = lastCardRef.current;

  const globeLanes = React.useMemo(() => toGlobeLanes(lanesShown), [lanesShown]);

  // ---- toolbar chips ------------------------------------------------------
  const presets = React.useMemo(() => computePresets(ds), [ds]);
  const yearChips = React.useMemo(() => {
    const all = presets
      .filter((p) => p.id !== "YTD")
      .map((p) => ({ ...p, label: p.id === "ALL" ? "All" : p.label }));
    if (vw >= 1180) return all;
    const years = all.filter((p) => /^\d{4}$/.test(p.id)).slice(0, 2);
    return all.filter((p) => p.id === "12M" || p.id === "ALL" || years.includes(p));
  }, [presets, vw]);

  const selectPreset = (pm0: number, pm1: number) => {
    stopPlay();
    brushAnchor.current = null;
    setWin([pm0, pm1]);
  };

  // ---- layout responsive flags -------------------------------------------
  const mobile = vw < 900;
  const timelineNarrow = vw < 1100;
  const sheetOpen = mobile && sel != null;

  const fitPadding = mobile
    ? { left: 16, top: 90, right: 16, bottom: 120 }
    : { left: 360, top: 110, right: 440, bottom: 150 };

  const windowShort =
    m0 === m1 ? miLabel(m0, ds.firstYear) : miLabel(m0, ds.firstYear).slice(0, 3) + " – " + miLabel(m1, ds.firstYear);

  const trans = (v: string) => (reduced ? "none" : v);

  // ---- render --------------------------------------------------------------
  const node = (
    <div
      className="fixed inset-0 z-[1000] overflow-hidden"
      style={{
        background: "#0b1220",
        fontFamily: FONT_BODY,
        color: "#f8fafc",
        // share portal: sit below the fixed 48px viewer top bar
        top: viewerMode ? 48 : 0,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={"Trade lanes · " + companyName}
    >
      {/* MAP — full-bleed behind overlays (existing engine, composed only) */}
      <div className="absolute inset-0 z-0">
        <AppLaneMap
          lanes={globeLanes}
          selectedLane={sel}
          onSelectLane={(k) => setSelState(k === sel ? null : k)}
          height="fill"
          variant="dark"
          volumeScale
          flow
          linesMode="always"
          unselectedStyle="ghost"
          zoomControlPosition="bottomright"
          fitPadding={fitPadding}
        />
      </div>

      {/* OVERLAY 1 — Toolbar */}
      <div
        className="absolute left-4 right-4 top-4 z-[600] box-border flex flex-nowrap items-center gap-3 overflow-hidden"
        style={{ ...GLASS, height: 60, padding: "10px 12px 10px 18px" }}
      >
        <div className="min-w-0 flex-auto overflow-hidden">
          <div
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}
          >
            Trade lanes · {companyName}
          </div>
          <div
            className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap tabular-nums"
            style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 11, color: "#94a3b8" }}
          >
            {view.lanes.length} lanes · {view.story.shipments} BOLs · {view.story.teu} TEU · {view.periodLabel}
          </div>
        </div>
        <div className="flex flex-none gap-[2px] rounded-[10px] p-[3px]" style={{ background: "rgba(255,255,255,0.06)" }}>
          {yearChips.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              active={!playing && p.m0 === m0 && p.m1 === m1}
              onClick={() => selectPreset(p.m0, p.m1)}
            />
          ))}
        </div>
        <div className="flex flex-none gap-[2px] rounded-[10px] p-[3px]" style={{ background: "rgba(255,255,255,0.06)" }}>
          {(
            [
              ["shipments", "Shipments"],
              ["teu", "TEU"],
              ...(showSpend ? [["spend", "Spend"]] : []),
            ] as [Metric, string][]
          ).map(([id, label]) => (
            <Chip
              key={id}
              label={label}
              active={effMetric === id}
              onClick={() => {
                stopPlay();
                setMetric(id);
              }}
            />
          ))}
        </div>
        {props.share && !viewerMode && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex h-9 flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] border-0 px-3.5 text-white active:scale-[.97] motion-reduce:active:scale-100"
            style={{
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 13,
              background: "#3b82f6",
              boxShadow: "0 0 18px rgba(59,130,246,0.5)",
              transition: trans(`transform 160ms ${EASE}`),
            }}
          >
            <Share2 size={15} />
            Share
          </button>
        )}
        {!viewerMode && (
          <button
            type="button"
            aria-label="Close trade lanes view"
            onClick={onClose}
            className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-[10px] text-[#cbd5e1] hover:bg-[rgba(255,255,255,0.08)]"
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.14)" }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* OVERLAY 2 — Lanes panel */}
      {!mobile && (
        <div
          className="absolute left-4 z-[600] flex w-[320px] flex-col overflow-hidden"
          style={{ ...GLASS, top: 92, bottom: 124 }}
        >
          <div className="border-b border-[rgba(255,255,255,0.08)] px-4 pb-2.5 pt-3.5">
            <div style={{ ...OVERLINE, color: CYAN }}>Lanes · ranked by {view.unitM}</div>
            <div className="mt-2.5 flex items-center gap-1">
              <span className="mr-1 text-[11px] font-medium text-[#94a3b8]">Min BOLs</span>
              {([0, 5, 25, 100] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    stopPlay();
                    setMinShip(n);
                  }}
                  className="cursor-pointer rounded-full px-[9px] py-[3px]"
                  style={{
                    fontFamily: FONT_MONO,
                    fontWeight: 600,
                    fontSize: 11,
                    border: "none",
                    background: minShip === n ? CYAN : "transparent",
                    color: minShip === n ? "#020617" : "#cbd5e1",
                    transition: "background 200ms, color 200ms",
                  }}
                >
                  {n ? n + "+" : "All"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-1.5">
            {lanesShown.map((l) => {
              const on = l.key === sel;
              const darkDelta = deltaToneDark(l.deltaN).fg;
              return (
                <div
                  key={l.key}
                  onClick={() => setSelState(on ? null : l.key)}
                  className="cursor-pointer rounded-[10px] px-3 py-2.5 hover:bg-[rgba(255,255,255,0.05)]"
                  style={{
                    background: on ? "rgba(0,240,255,0.10)" : "transparent",
                    boxShadow: on ? `inset 3px 0 0 ${CYAN}` : "none",
                    transition: "background 200ms",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <span style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 11, color: "#64748b" }}>
                      {l.rank}
                    </span>
                    <span
                      className="rounded px-[5px] py-[2px] text-white"
                      style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 10, background: l.color }}
                    >
                      {l.oc}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">{l.label}</div>
                      <div
                        className="overflow-hidden text-ellipsis whitespace-nowrap"
                        style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#64748b" }}
                      >
                        {l.sub}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums" style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 13 }}>
                        {l.val}
                      </div>
                      <div
                        className="tabular-nums"
                        style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 10, color: darkDelta }}
                      >
                        {l.delta}
                      </div>
                    </div>
                  </div>
                  <div
                    className="ml-7 mt-2 h-[3px] overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: l.color,
                        transform: `scaleX(${l.s})`,
                        transformOrigin: "left",
                        transition: trans(`transform 500ms ${EASE}`),
                        boxShadow: `0 0 8px ${l.color}`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 border-t border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-[11px] text-[#94a3b8]">
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-[18px] rounded-[2px] bg-[#94a3b8]" />
              Line weight = share
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border-2 border-white" />
              Origin port
            </span>
          </div>
        </div>
      )}

      {/* OVERLAY 3 — Lane detail card (white glass, slides in from the right;
          becomes a bottom sheet under 900px) */}
      <div
        className="absolute z-[600] flex flex-col overflow-hidden"
        style={{
          ...(mobile
            ? {
                left: 0,
                right: 0,
                bottom: 0,
                top: "auto" as const,
                height: "58vh",
                borderRadius: "16px 16px 0 0",
                transform: sel != null ? "translateY(0)" : "translateY(110%)",
              }
            : {
                right: 16,
                top: 92,
                bottom: 124,
                width: 400,
                maxWidth: "calc(100vw - 32px)",
                borderRadius: 16,
                transform: sel != null ? "translateX(0)" : "translateX(calc(100% + 24px))",
              }),
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          boxShadow: "0 30px 60px rgba(2,6,23,0.45)",
          color: "#0F172A",
          opacity: sel != null ? 1 : 0,
          pointerEvents: sel != null ? "auto" : "none",
          transition: trans(`transform 350ms ${DRAWER_EASE}, opacity 250ms`),
        }}
      >
        {card && (
          <>
            <div className="border-b border-[#EEF2F6] px-[18px] pb-3 pt-4">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="rounded px-1.5 py-[2px] text-white"
                    style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 11, background: card.slv.color }}
                  >
                    {card.slv.oc}
                  </span>
                  <ArrowRight size={14} color="#94a3b8" />
                  <span
                    className="rounded px-1.5 py-[2px] text-white"
                    style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 11, background: "#0F172A" }}
                  >
                    US
                  </span>
                  <span
                    className="truncate"
                    style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17 }}
                  >
                    {card.slv.label}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Close lane detail"
                  onClick={() => setSelState(null)}
                  className="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[#64748b] hover:bg-[#F1F5F9]"
                >
                  <X size={15} />
                </button>
              </div>
              <div
                className="mt-1.5 tabular-nums"
                style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 11, color: "#64748b" }}
              >
                {card.slv.sub} · {card.slv.share} of {view.unitM} ·{" "}
                <span style={{ color: card.slv.deltaFg }}>{card.slv.delta} YoY</span>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] pb-[18px] pt-3.5">
              {/* 2×2 KPI tiles */}
              <div className="grid grid-cols-2 gap-2">
                {(["shipments", "teu", "spend", "avgTeu"] as const).map((id) => {
                  const k = card.detail.kpis.find((x: any) => x.id === id);
                  if (!k) return null;
                  if (id === "spend" && !showSpend) {
                    // spend redacted by the share link → keep the tile, hide the value
                    return (
                      <div key={id} className="rounded-[10px] bg-[#F8FAFC] px-3 py-2.5">
                        <div style={{ ...DETAIL_OVERLINE, color: "#94a3b8" }}>Est. spend</div>
                        <div
                          className="mt-1"
                          style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 20, letterSpacing: "-0.03em", color: "#94a3b8" }}
                        >
                          Hidden
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={id} className="rounded-[10px] bg-[#F8FAFC] px-3 py-2.5">
                      <div style={{ ...DETAIL_OVERLINE, color: "#94a3b8" }}>
                        {k.label === "Est. freight spend" ? "Est. spend" : k.label}
                      </div>
                      <div
                        className="mt-1 tabular-nums"
                        style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 20, letterSpacing: "-0.03em" }}
                      >
                        {k.value}
                      </div>
                      <div
                        className="tabular-nums"
                        style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 10, color: k.deltaFg }}
                      >
                        {k.delta && k.delta !== "—" ? k.delta + " YoY" : k.delta}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Monthly bars: current vs prior year */}
              <div>
                <div className="flex justify-between" style={DETAIL_OVERLINE}>
                  <span>Monthly {view.unitM}</span>
                  <span
                    className="flex gap-2.5"
                    style={{
                      textTransform: "none",
                      letterSpacing: 0,
                      fontFamily: FONT_BODY,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: card.slv.color }} />
                      Now
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-[2px] bg-[#E2E8F0]" />
                      Prior year
                    </span>
                  </span>
                </div>
                <div className="mt-2.5 flex h-[110px] items-end gap-1 border-b border-[#E2E8F0]">
                  {card.detail.cadence.map((b: any) => (
                    <div key={b.mi} title={b.label} className="flex h-full flex-1 items-end gap-[1px]">
                      <div
                        className="h-full flex-1 rounded-t-[3px] bg-[#E2E8F0]"
                        style={{
                          transform: `scaleY(${b.ps})`,
                          transformOrigin: "bottom",
                          transition: trans(`transform 500ms ${EASE}`),
                        }}
                      />
                      <div
                        className="h-full flex-1 rounded-t-[3px]"
                        style={{
                          background: card.slv.color,
                          transform: `scaleY(${b.s})`,
                          transformOrigin: "bottom",
                          transition: trans(`transform 500ms ${EASE}`),
                          transitionDelay: reduced ? "0ms" : `${b.delay}ms`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1">
                  {card.detail.cadence.map((b: any) => (
                    <div
                      key={b.mi}
                      className="min-w-0 flex-1 overflow-hidden text-center"
                      style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 10, color: "#94a3b8" }}
                    >
                      {b.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Carrier mix donut (removed entirely when redacted) */}
              {showCarriers && (
              <div className="flex items-center gap-4">
                <svg viewBox="0 0 80 80" className="h-[84px] w-[84px] flex-none" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="40" cy="40" r="30" fill="none" stroke="#F1F5F9" strokeWidth="12" />
                  {(() => {
                    const C = 2 * Math.PI * 30;
                    let cum = 0;
                    return card.detail.carriers.slice(0, 4).map((c, i) => {
                      const seg = (
                        <circle
                          key={c.key}
                          cx="40"
                          cy="40"
                          r="30"
                          fill="none"
                          stroke={DONUT_COLORS[i]}
                          strokeWidth="12"
                          strokeDasharray={`${(c.shareN * C).toFixed(1)} ${C.toFixed(1)}`}
                          strokeDashoffset={(-cum * C).toFixed(1)}
                          style={{
                            transition: trans(`stroke-dasharray 600ms ${EASE}, stroke-dashoffset 600ms ${EASE}`),
                          }}
                        />
                      );
                      cum += c.shareN;
                      return seg;
                    });
                  })()}
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5" style={DETAIL_OVERLINE}>
                    Carrier mix
                  </div>
                  {card.detail.carriers.slice(0, 4).map((c, i) => (
                    <div key={c.key} className="flex items-center gap-2 py-[2px] text-[12px]">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: DONUT_COLORS[i] }} />
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      <span className="tabular-nums" style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 12 }}>
                        {c.share}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* Equipment (skipped entirely when unknown) */}
              {card.detail.ctypes.length > 0 && (
                <div>
                  <div className="mb-2" style={DETAIL_OVERLINE}>
                    Equipment
                  </div>
                  <div className="flex h-[10px] gap-[2px] overflow-hidden rounded-full">
                    {card.detail.ctypes.map((c) => (
                      <div
                        key={c.key}
                        title={`${c.key} ${c.share}`}
                        style={{ width: c.w, background: c.color, transition: trans(`width 500ms ${EASE}`) }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2.5 text-[11px] text-[#475569]">
                    {card.detail.ctypes.map((c) => (
                      <span key={c.key} className="flex items-center gap-[5px]">
                        <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: c.color }} />
                        {c.key} <b style={{ fontFamily: FONT_MONO }}>{c.share}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Suppliers on this lane */}
              <div>
                <div className="mb-1" style={DETAIL_OVERLINE}>
                  Suppliers on this lane
                </div>
                {showSuppliers ? (
                  card.detail.suppliers.slice(0, 3).map((x) => (
                    <div
                      key={x.key}
                      className="flex justify-between gap-2.5 border-b border-[#F1F5F9] py-[7px] text-[13px]"
                    >
                      <span className="min-w-0 truncate font-semibold">{x.label}</span>
                      <span
                        className="flex-none tabular-nums"
                        style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 12, color: "#475569" }}
                      >
                        {x.shipments} BOLs · {x.share}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between gap-2.5 border-b border-[#F1F5F9] py-[7px] text-[13px]">
                    <span className="min-w-0 truncate font-semibold text-[#94a3b8]">Hidden by sender</span>
                    <span
                      className="flex-none tabular-nums"
                      style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 12, color: "#94a3b8" }}
                    >
                      —
                    </span>
                  </div>
                )}
              </div>

              {/* Latest bills of lading (removed entirely when redacted) */}
              {showBols && (
              <div>
                <div className="mb-1" style={DETAIL_OVERLINE}>
                  Latest bills of lading
                </div>
                {card.detail.recent.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-[2px] border-b border-[#F1F5F9] py-2"
                  >
                    <span
                      className="truncate"
                      style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 11, color: "#1d4ed8" }}
                    >
                      {r.id}
                    </span>
                    <span
                      className="text-right tabular-nums"
                      style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 11 }}
                    >
                      {r.teu} TEU · {showSpend ? r.spend : "Hidden"}
                    </span>
                    <span className="col-span-2 text-[12px] text-[#64748b]">
                      {r.date} · {r.carrier} · {r.equip}
                    </span>
                  </div>
                ))}
              </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* OVERLAY 4 — Play / timeline bar */}
      {!sheetOpen && (
        <div
          className="absolute bottom-4 z-[600] flex items-center gap-3.5"
          style={{
            ...GLASS,
            padding: "12px 16px",
            left: mobile || timelineNarrow ? 16 : 352,
            right: mobile || timelineNarrow ? 16 : 432,
            minWidth: mobile ? undefined : 360,
          }}
        >
          <button
            type="button"
            aria-label={playing ? "Pause history playback" : "Play history"}
            onClick={togglePlay}
            className="grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-full border-0 active:scale-[.94] motion-reduce:active:scale-100"
            style={{
              background: CYAN,
              color: "#020617",
              boxShadow: "0 0 18px rgba(0,240,255,0.5)",
              transition: trans(`transform 160ms ${EASE}`),
            }}
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <div className="w-[110px] flex-none">
            <div style={{ ...OVERLINE, color: "#64748b" }}>
              {playing ? "Playing · 3-mo window" : "Play history"}
            </div>
            <div
              className="mt-[2px] whitespace-nowrap tabular-nums"
              style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 15 }}
            >
              {windowShort}
            </div>
          </div>
          <div className="relative min-w-0 flex-1 select-none">
            {/* cyan brush overlay */}
            <div
              className="pointer-events-none absolute rounded-md"
              style={{
                top: -3,
                bottom: -3,
                left: view.brush.left,
                width: view.brush.width,
                background: "rgba(0,240,255,0.10)",
                border: "1px solid rgba(0,240,255,0.45)",
                transition: trans(`left 200ms ${EASE}, width 200ms ${EASE}`),
              }}
            />
            <div className="flex h-11 items-end gap-[2px]">
              {view.timeline.map((b: any) => (
                <div
                  key={b.mi}
                  title={b.label}
                  onMouseDown={b.onDown}
                  onPointerDown={b.onDown}
                  onMouseEnter={b.onEnter}
                  onPointerEnter={b.onEnter}
                  className="flex h-full flex-1 cursor-ew-resize items-end"
                >
                  <div
                    className="h-full w-full rounded-[2px]"
                    style={{
                      background: b.sel ? CYAN : "rgba(148,163,184,0.35)",
                      transform: `scaleY(${b.s})`,
                      transformOrigin: "bottom",
                      transition: trans(`transform 400ms ${EASE}, background 200ms`),
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="relative mt-1 h-3.5">
              {view.years.map((y: any) => (
                <div
                  key={y.label}
                  className="absolute"
                  style={{ left: y.left, fontFamily: FONT_MONO, fontWeight: 500, fontSize: 10, color: "#64748b" }}
                >
                  {y.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SHARE DIALOG (owner surface only) */}
      {props.share && !viewerMode && (
        <ShareMapDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          companyKey={props.share.companyKey}
          companyUuid={props.share.companyUuid}
          companyName={props.share.companyName}
          initialState={{ m0, m1, metric: effMetric, lane: sel }}
          periodLabel={view.periodLabel}
          unitLabel={view.unitM}
          laneLabel={slv?.label}
        />
      )}
    </div>
  );

  return ReactDOM.createPortal(node, document.body);
}

export default TradeLanesOpenView;
