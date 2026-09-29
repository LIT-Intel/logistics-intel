/**
 * AccountsTable — Command Center §4.3: account-health card (stacked
 * segment bar + click-to-filter legend) and the 11-column companies
 * table. Every value comes from computeAccountsView's row VMs.
 */
import { type CSSProperties } from "react";
import {
  Check,
  ChevronRight,
  CircleDashed,
  Clock,
  FileText,
  HeartPulse,
  Minus,
  Route,
  Send,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import LogoTile from "@/features/dashboard/components/LogoTile";
import { SampleChip } from "./SampleDataBanner";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";
const EASE = "cubic-bezier(0.16,1,0.3,1)";
const CARD: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
};

/** Signal icon strings from the VM → lucide components. */
export const SIG_ICONS: Record<string, typeof TrendingUp> = {
  "circle-dashed": CircleDashed,
  route: Route,
  clock: Clock,
  "trending-down": TrendingDown,
  "file-text": FileText,
  "trending-up": TrendingUp,
  minus: Minus,
};

// Deterministic lane-tag color (the VMs carry no per-lane color; this is
// presentation-only — stable per origin code, no data invented).
const LANE_PALETTE = ["#0891b2", "#2563eb", "#7c3aed", "#059669", "#d97706", "#e11d48", "#0e7490", "#4f46e5"];
export const laneColor = (s: string): string =>
  s ? LANE_PALETTE[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % LANE_PALETTE.length] : "#cbd5e1";

const GRID =
  "28px minmax(240px,1.7fr) 104px 124px 150px 70px 88px 62px minmax(150px,1fr) minmax(160px,1fr) 70px";
const ROW_PAD = "12px 20px";

function Checkbox({
  bd,
  bg,
  onClick,
  label,
}: {
  bd: string;
  bg: string;
  onClick: () => void;
  label: string;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={bg !== "#FFFFFF"}
      aria-label={label}
      tabIndex={0}
      className="cc-focus"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      style={{
        width: 16,
        height: 16,
        borderRadius: 5,
        border: `1.5px solid ${bd}`,
        background: bg,
        display: "grid",
        placeItems: "center",
        color: "#fff",
        cursor: "pointer",
        boxSizing: "border-box",
      }}
    >
      <Check size={10} strokeWidth={3.5} />
    </span>
  );
}

export interface AccountsTableProps {
  /** computeAccountsView() result — rendered verbatim. */
  view: any;
  page: number;
  onPage: (page: number) => void;
  onClearAll: () => void;
  onDiscover: () => void;
  /** "12M = {period}" footer label (from the real data window). */
  period: string;
  reduced?: boolean;
}

export default function AccountsTable({
  view,
  page,
  onPage,
  onClearAll,
  onDiscover,
  period,
  reduced,
}: AccountsTableProps) {
  return (
    <>
      {/* ── Account health card ───────────────────────────────────────── */}
      <section style={{ ...CARD, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              font: `600 11px ${F_DISPLAY}`,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#0e7490",
            }}
          >
            <HeartPulse size={14} />
            Account health · shipments 12M vs prior 12M
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Click a segment to filter</div>
        </div>
        <div style={{ display: "flex", gap: 4, height: 12, marginTop: 14 }}>
          {view.healthSegs.map((h: any) => (
            <div
              key={h.id}
              title={h.label}
              onClick={h.onClick}
              style={{
                flex: h.flex,
                background: h.color,
                borderRadius: 4,
                cursor: "pointer",
                opacity: h.opacity,
                transition: reduced ? "none" : `flex 500ms ${EASE},opacity 200ms`,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 22px", marginTop: 12 }}>
          {view.healthSegs.map((h: any) => (
            <button
              key={h.id}
              type="button"
              className="cc-legend cc-focus"
              onClick={h.onClick}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                opacity: h.opacity,
                padding: "4px 8px",
                margin: "0 -8px",
                borderRadius: 8,
                background: h.bg,
                border: "none",
                transition: reduced ? "none" : "opacity 200ms,background 200ms",
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 3, background: h.color }} />
              <span style={{ font: `600 13px ${F_BODY}`, color: "#0F172A" }}>{h.label}</span>
              <span style={{ font: `600 12px ${F_MONO}`, color: "#475569" }}>{h.count}</span>
              <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8" }}>{h.spend}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Table card ────────────────────────────────────────────────── */}
      <section style={{ ...CARD, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1320 }}>
            {/* header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 12,
                padding: "10px 20px",
                background: "#F8FAFC",
                borderBottom: "1px solid #EEF2F6",
                font: `600 10px ${F_DISPLAY}`,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#94a3b8",
                alignItems: "center",
              }}
            >
              <Checkbox bd={view.allBd} bg={view.allBg} onClick={view.selAll} label="Select all companies" />
              <span>Company</span>
              <span>Stage</span>
              <span>Last shipment</span>
              <span>Shipments 12M</span>
              <span>TEU</span>
              <span>Est. spend</span>
              <span>YoY</span>
              <span>Top lane</span>
              <span>Signal</span>
              <span />
            </div>

            {/* rows */}
            {view.rows.map((c: any) => {
              const SigIcon = SIG_ICONS[c.sigIcon] ?? Minus;
              return (
                <div
                  key={c.key}
                  className="cc-row"
                  role="button"
                  tabIndex={0}
                  onClick={c.onClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") c.onClick();
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID,
                    gap: 12,
                    padding: ROW_PAD,
                    borderTop: "1px solid #F1F5F9",
                    alignItems: "center",
                    fontSize: 13,
                    cursor: "pointer",
                    background: c.rowBg,
                  }}
                >
                  <Checkbox bd={c.chkBd} bg={c.chkBg} onClick={c.onCheck} label={`Select ${c.name}`} />

                  {/* Company */}
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <LogoTile name={c.name} domain={c.logoDomain} size={34} radius={9} fontSize={11} />
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontWeight: 600,
                          minWidth: 0,
                        }}
                      >
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                          {c.name}
                        </span>
                        {c.isSample && <SampleChip />}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          color: "#94a3b8",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          title={c.ownerName ?? undefined}
                          style={{
                            width: 14,
                            height: 14,
                            flex: "none",
                            borderRadius: 999,
                            background: c.ownerColor,
                            color: "#fff",
                            display: "grid",
                            placeItems: "center",
                            font: `600 7px ${F_DISPLAY}`,
                          }}
                        >
                          {c.ownerKey}
                        </span>
                        {c.city} · {c.contactsLabel}
                      </span>
                    </span>
                  </span>

                  {/* Stage */}
                  <span>
                    <span
                      style={{
                        font: `600 11px ${F_BODY}`,
                        color: c.stageFg,
                        background: c.stageBg,
                        borderRadius: 999,
                        padding: "3px 9px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.stage}
                    </span>
                  </span>

                  {c.has ? (
                    <>
                      {/* Last shipment */}
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            font: `600 12px ${F_BODY}`,
                            color: c.lastFg,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: c.lastFg }} />
                          {c.lastAgo}
                        </span>
                        <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8" }}>{c.lastDate}</span>
                      </span>

                      {/* Shipments 12M + sparkline */}
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ font: `600 13px ${F_MONO}`, color: "#1d4ed8", width: 48, fontVariantNumeric: "tabular-nums" }}>
                          {c.ship}
                        </span>
                        <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ flex: 1, height: 22, overflow: "visible" }} aria-hidden>
                          <path
                            d={c.spark}
                            fill="none"
                            stroke="#00c8d4"
                            strokeWidth={1.6}
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>

                      {/* TEU */}
                      <span style={{ font: `500 12px ${F_MONO}`, color: "#334155", fontVariantNumeric: "tabular-nums" }}>{c.teu}</span>

                      {/* Est. spend */}
                      <span style={{ font: `600 12px ${F_MONO}`, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{c.spend}</span>

                      {/* YoY */}
                      <span style={{ font: `600 11px ${F_MONO}`, color: c.yoyFg, fontVariantNumeric: "tabular-nums" }}>{c.yoy}</span>

                      {/* Top lane */}
                      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        {c.laneOc && (
                          <span
                            style={{
                              flex: "none",
                              font: `600 10px ${F_MONO}`,
                              color: "#fff",
                              background: laneColor(c.laneOc),
                              borderRadius: 4,
                              padding: "2px 5px",
                            }}
                          >
                            {c.laneOc}
                          </span>
                        )}
                        <span style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.lane}
                        </span>
                        <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8" }}>{c.laneShare}</span>
                      </span>
                    </>
                  ) : (
                    // No-history: the six data columns collapse into one cell.
                    <span
                      style={{
                        gridColumn: "span 6",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        color: "#94a3b8",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          height: 1,
                          background: "repeating-linear-gradient(90deg,#E2E8F0 0 4px,transparent 4px 8px)",
                          maxWidth: 40,
                        }}
                      />
                      No U.S. import records in the last 24 months
                    </span>
                  )}

                  {/* Signal */}
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      font: `600 12px ${F_BODY}`,
                      color: c.sigColor,
                      minWidth: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <SigIcon size={14} style={{ flex: "none" }} />
                    {c.sig}
                  </span>

                  {/* Actions */}
                  <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      title="Add to Campaign"
                      className="cc-sendbtn cc-focus"
                      onClick={(e) => {
                        e.stopPropagation();
                        c.onCheck();
                      }}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: "1px solid #E5E7EB",
                        background: "transparent",
                        display: "grid",
                        placeItems: "center",
                        color: "#475569",
                        cursor: "pointer",
                      }}
                    >
                      <Send size={14} />
                    </button>
                    <span
                      title="Open Intelligence Panel"
                      style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", color: "#94a3b8" }}
                    >
                      <ChevronRight size={15} />
                    </span>
                  </span>
                </div>
              );
            })}

            {/* empty state */}
            {view.noRows && (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#64748b", fontSize: 14 }}>
                {view.hasFilters ? (
                  <>
                    No companies match these filters.{" "}
                    <span
                      onClick={onClearAll}
                      style={{ color: "#3b82f6", fontWeight: 600, cursor: "pointer" }}
                    >
                      Clear filters
                    </span>
                  </>
                ) : (
                  <>
                    No saved companies yet.{" "}
                    <span
                      onClick={onDiscover}
                      style={{ color: "#3b82f6", fontWeight: 600, cursor: "pointer" }}
                    >
                      Discover Companies
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 20px",
            borderTop: "1px solid #EEF2F6",
            fontSize: 12,
            color: "#64748b",
          }}
        >
          <span>{view.footer}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {view.pages > 1 && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  className="cc-pagebtn cc-focus"
                  disabled={page <= 0}
                  onClick={() => onPage(page - 1)}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "#FFFFFF",
                    font: `600 11px ${F_BODY}`,
                    color: "#334155",
                    cursor: "pointer",
                  }}
                >
                  Prev
                </button>
                <span style={{ fontFamily: F_MONO, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
                  {page + 1} / {view.pages}
                </span>
                <button
                  type="button"
                  className="cc-pagebtn cc-focus"
                  disabled={page >= view.pages - 1}
                  onClick={() => onPage(page + 1)}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "#FFFFFF",
                    font: `600 11px ${F_BODY}`,
                    color: "#334155",
                    cursor: "pointer",
                  }}
                >
                  Next
                </button>
              </span>
            )}
            <span style={{ fontFamily: F_MONO, color: "#94a3b8" }}>12M = {period}</span>
          </span>
        </div>
      </section>
    </>
  );
}
