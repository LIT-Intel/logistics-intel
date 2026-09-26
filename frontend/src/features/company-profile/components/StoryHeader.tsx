/**
 * StoryHeader — editorial hero (README §5.3): meta row + actions, 72px logo
 * tile + 56px H1 (when `showTitle`), data-driven narrative sentence, status
 * card with pulsing dot, and the looping BOL ticker.
 *
 * All numbers come precomputed from the ProfileView (`view.story`, `view.S`,
 * `view.cadence`, `view.recent`) — this component renders them verbatim.
 */
import React from "react";
import { Download, ListPlus, Send, Star } from "lucide-react";
import type { ProfileView } from "../data/selectors";
import type { TraceRowVM } from "../data/selectors";
import { EASE_OUT, FONT_BODY, FONT_DISPLAY, FONT_MONO, useReducedMotion } from "./ui";

const KEYFRAMES_ID = "lit-profile-v2-keyframes";
const KEYFRAMES_CSS =
  "@keyframes litping{75%,100%{transform:scale(2.6);opacity:0}}" +
  "@keyframes litmarquee{to{transform:translateX(-50%)}}";

/** Injects the litping / litmarquee keyframes once per document. */
function useHeroKeyframes(): void {
  React.useEffect(() => {
    if (document.getElementById(KEYFRAMES_ID)) return;
    const el = document.createElement("style");
    el.id = KEYFRAMES_ID;
    el.textContent = KEYFRAMES_CSS;
    document.head.appendChild(el);
  }, []);
}

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export interface StoryHeaderProps {
  /** null while the shipment dataset loads (or when a company has no BOL
   *  archive at all, e.g. MX pedimento identities) — the hero then renders
   *  title + meta + actions only. */
  view: ProfileView | null;
  companyName: string;
  /** Monogram override; defaults to first 4 letters of the name, upper-cased. */
  mark?: string;
  /** When true render the FULL editorial hero (meta row + actions + logo tile
   *  + 56px H1). When false render only narrative + status card + ticker. */
  showTitle?: boolean;
  meta?: { role?: string; hq?: string; website?: string; owner?: string; stage?: string };
  starred?: boolean;
  onToggleStar?: () => void;
  onExport?: () => void;
  onAddToList?: () => void;
  onStartOutreach?: () => void;
  /** Extra buttons appended after Start Outreach (overflow menu etc.). */
  trailingActions?: React.ReactNode;
}

export function StoryHeader({
  view,
  companyName,
  mark,
  showTitle = false,
  meta,
  starred = false,
  onToggleStar,
  onExport,
  onAddToList,
  onStartOutreach,
  trailingActions,
}: StoryHeaderProps) {
  useHeroKeyframes();
  const reduced = useReducedMotion();
  const [tickerPaused, setTickerPaused] = React.useState(false);

  const monogram = (mark ?? companyName.slice(0, 4)).toUpperCase();
  const story = (view?.story ?? {}) as Record<string, string>;
  const S = view?.S;
  const cadence: any[] = Array.isArray(view?.cadence) ? view!.cadence : [];

  // ---- status card derivations (per the design's renderVals) --------------
  const lastDays = S?.lastDays ?? null;
  const statusLabel =
    lastDays != null && lastDays <= 45
      ? `Active shipper · ${lastDays}d since last BOL`
      : `Quiet · ${lastDays != null ? lastDays + "d since last BOL" : "no BOLs"}`;
  const nMonths = view?.nMonths || cadence.length || 1;
  const shipmentsN = S?.shipments ?? 0;
  const perShip = shipmentsN ? Math.round((nMonths * 30.4) / shipmentsN) : null;
  const cadenceLabel = perShip ? `1 BOL every ${perShip} days` : "—";
  const activeMonths = cadence.filter((b) => b && b.v > 0).length;
  const monthsLabel = `${activeMonths} of ${nMonths}`;

  const ticker: TraceRowVM[] = (view?.recent ?? []).slice(0, 8);
  const tickerItems = reduced ? ticker : [...ticker, ...ticker];

  const metaBits: React.ReactNode[] = [];
  const pushMeta = (node: React.ReactNode, key: string) => {
    if (metaBits.length) {
      metaBits.push(
        <span key={key + "-sep"} className="text-[#CBD5E1]">
          ·
        </span>,
      );
    }
    metaBits.push(<React.Fragment key={key}>{node}</React.Fragment>);
  };
  if (meta?.hq) pushMeta(<span>{meta.hq}</span>, "hq");
  if (meta?.website) {
    const href = /^https?:\/\//i.test(meta.website) ? meta.website : "https://" + meta.website;
    pushMeta(
      <a href={href} target="_blank" rel="noreferrer" className="text-[#3b82f6] hover:text-[#2563eb]">
        {meta.website}
      </a>,
      "web",
    );
  }
  if (meta?.owner) pushMeta(<span>{`Owner ${meta.owner}`}</span>, "owner");
  if (meta?.stage) pushMeta(<span>{meta.stage}</span>, "stage");

  const iconBtn =
    "grid h-10 w-10 cursor-pointer place-items-center rounded-[10px] border border-[#E5E7EB] bg-white text-[#475569] hover:border-[#CBD5E1] hover:bg-[#F8FAFC] active:scale-95";

  return (
    <div>
      {showTitle && (
        <div
          className="flex flex-wrap items-center justify-between gap-4 text-[13px] text-[#64748b]"
          style={{ fontFamily: FONT_BODY }}
        >
          <div className="flex flex-wrap items-center gap-[10px]">
            {meta?.role && (
              <span
                className="rounded-[4px] px-[7px] py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1d4ed8]"
                style={{ fontFamily: FONT_MONO, background: "rgba(59,130,246,0.1)" }}
              >
                {meta.role}
              </span>
            )}
            {metaBits}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={starred ? "Unstar company" : "Star company"}
              onClick={onToggleStar}
              className={iconBtn}
              style={{ transition: `transform 160ms ${EASE_OUT}`, color: starred ? "#f59e0b" : undefined }}
            >
              <Star size={17} fill={starred ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              aria-label="Export"
              onClick={onExport}
              className={iconBtn}
              style={{ transition: `transform 160ms ${EASE_OUT}` }}
            >
              <Download size={17} />
            </button>
            <button
              type="button"
              onClick={onAddToList}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-white px-[14px] text-[13px] font-semibold text-[#0F172A] hover:border-[#CBD5E1] hover:bg-[#F8FAFC] active:scale-[0.97]"
              style={{ fontFamily: FONT_BODY, transition: `transform 160ms ${EASE_OUT}` }}
            >
              <ListPlus size={16} />
              Add to List
            </button>
            <button
              type="button"
              onClick={onStartOutreach}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] bg-[#3b82f6] px-4 text-[13px] font-semibold text-white hover:bg-[#2563eb] active:scale-[0.97]"
              style={{
                fontFamily: FONT_BODY,
                boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
                transition: `transform 160ms ${EASE_OUT}`,
              }}
            >
              <Send size={16} />
              Start Outreach
            </button>
            {trailingActions}
          </div>
        </div>
      )}

      <div
        className="grid items-end gap-10"
        style={{ gridTemplateColumns: "minmax(0,1fr) auto", marginTop: showTitle ? 22 : 0 }}
      >
        <div className="min-w-0">
          {showTitle && (
            <div className="flex items-center gap-5">
              <div
                className="grid h-[72px] w-[72px] flex-none place-items-center rounded-[20px] bg-[#0F172A] text-[16px] font-bold tracking-[0.05em] text-white"
                style={{ fontFamily: FONT_DISPLAY, boxShadow: "0 12px 30px rgba(15,23,42,0.2)" }}
              >
                {monogram}
              </div>
              <h1
                className="m-0 text-[56px] font-bold text-[#0F172A]"
                style={{
                  fontFamily: FONT_DISPLAY,
                  lineHeight: 1.02,
                  letterSpacing: "-0.04em",
                  textWrap: "balance" as React.CSSProperties["textWrap"],
                }}
              >
                {companyName}
              </h1>
            </div>
          )}
          {view && (
          <p
            className="mb-0 max-w-[880px] text-[19px] text-[#475569]"
            style={{
              fontFamily: FONT_BODY,
              lineHeight: 1.55,
              marginTop: showTitle ? 20 : 0,
              textWrap: "pretty" as React.CSSProperties["textWrap"],
            }}
          >
            <span className="font-semibold text-[#0F172A]" style={TABULAR}>
              {story.shipments} shipments
            </span>{" "}
            and{" "}
            <span className="font-semibold text-[#0F172A]" style={TABULAR}>
              {story.teu} TEU
            </span>{" "}
            in {story.period},{" "}
            <span className="font-semibold" style={{ color: story.deltaFg, ...TABULAR }}>
              {story.delta}
            </span>{" "}
            year over year. {story.topLane} carries {story.topShare}; {story.topCarrier} moves{" "}
            {story.topCarrierShare}.
          </p>
          )}
        </div>

        {/* status card */}
        {view && (
        <div className="flex min-w-[240px] flex-col gap-[10px] rounded-2xl border border-[#EEF2F6] bg-[#F8FAFC] px-5 py-[18px]">
          <div
            className="flex items-center gap-2 text-[13px] font-semibold text-[#047857]"
            style={{ fontFamily: FONT_BODY }}
          >
            <span className="relative h-2 w-2">
              {!reduced && (
                <span
                  className="absolute inset-0 rounded-full bg-[#10b981]"
                  style={{ animation: "litping 1.8s cubic-bezier(0,0,0.2,1) infinite" }}
                />
              )}
              <span className="absolute inset-0 rounded-full bg-[#10b981]" />
            </span>
            {statusLabel}
          </div>
          <div className="flex justify-between gap-4 text-[13px]" style={{ fontFamily: FONT_BODY }}>
            <span className="text-[#64748b]">Last arrival</span>
            <span className="text-[12px] font-semibold" style={{ fontFamily: FONT_MONO, ...TABULAR }}>
              {story.lastDate ?? "—"}
            </span>
          </div>
          <div className="flex justify-between gap-4 text-[13px]" style={{ fontFamily: FONT_BODY }}>
            <span className="text-[#64748b]">Cadence</span>
            <span className="text-[12px] font-semibold" style={{ fontFamily: FONT_MONO, ...TABULAR }}>
              {cadenceLabel}
            </span>
          </div>
          <div className="flex justify-between gap-4 text-[13px]" style={{ fontFamily: FONT_BODY }}>
            <span className="text-[#64748b]">Active months</span>
            <span className="text-[12px] font-semibold" style={{ fontFamily: FONT_MONO, ...TABULAR }}>
              {monthsLabel}
            </span>
          </div>
        </div>
        )}
      </div>

      {/* BOL ticker */}
      {ticker.length > 0 && (
        <div
          onMouseEnter={() => setTickerPaused(true)}
          onMouseLeave={() => setTickerPaused(false)}
          className="mt-7 overflow-hidden border-y border-[#EEF2F6]"
          style={
            reduced
              ? undefined
              : {
                  WebkitMaskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)",
                  maskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)",
                }
          }
        >
          <div
            className="flex"
            style={
              reduced
                ? undefined
                : {
                    width: "max-content",
                    animation: "litmarquee 48s linear infinite",
                    animationPlayState: tickerPaused ? "paused" : "running",
                  }
            }
          >
            {tickerItems.map((r, i) => (
              <div
                key={r.id + "-" + i}
                onClick={r.onClick}
                aria-hidden={!reduced && i >= ticker.length ? true : undefined}
                className="flex cursor-pointer items-center gap-[10px] whitespace-nowrap border-r border-[#EEF2F6] px-[22px] py-3 hover:bg-[#F8FAFC]"
              >
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: r.color }} />
                <span className="text-[11px] font-medium text-[#94a3b8]" style={{ fontFamily: FONT_MONO, ...TABULAR }}>
                  {r.date}
                </span>
                <span className="text-[13px] font-semibold text-[#0F172A]" style={{ fontFamily: FONT_BODY }}>
                  {r.route}
                </span>
                <span className="text-[11px] font-medium text-[#475569]" style={{ fontFamily: FONT_MONO, ...TABULAR }}>
                  {r.equip} · {r.scac}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
