/**
 * IntelligencePanel — Dashboard rebuild §D (Morning Brief handoff).
 *
 * Fixed 520px dark drawer fed entirely by computeDash's `view.panel`
 * (every field precomputed). Esc close is handled by useDashState; the
 * scrim and ✕ call onClose (→ actions.select(null)).
 */
import { ArrowRight, GitBranchPlus, Moon, Send, TrendingDown, TrendingUp, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";
const EASE = "cubic-bezier(0.16,1,0.3,1)";
const DRAWER_EASE = "cubic-bezier(0.32,0.72,0,1)";

const SIG_ICONS: Record<string, typeof TrendingUp> = {
  "trending-up": TrendingUp,
  "git-branch-plus": GitBranchPlus,
  "trending-down": TrendingDown,
  moon: Moon,
};

interface Props {
  open: boolean;
  /** view.panel — kept rendered during the close transition. */
  panel: any | null;
  period: string;
  unit: string;
  reduced: boolean;
  onClose: () => void;
}

const kpiTile = (label: string, value: string) => (
  <div
    style={{
      padding: 12,
      border: "1px solid #1e293b",
      borderRadius: 10,
      background: "#020617",
    }}
  >
    <div
      style={{
        font: `600 10px ${F_DISPLAY}`,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#64748b",
      }}
    >
      {label}
    </div>
    <div style={{ font: `600 20px ${F_MONO}`, marginTop: 6 }}>{value}</div>
  </div>
);

export default function IntelligencePanel({ open, panel, period, unit, reduced, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(2,6,23,0.35)",
          zIndex: 900,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: reduced ? "none" : `opacity 250ms ${EASE}`,
        }}
      />
      <aside
        role="dialog"
        aria-modal={open || undefined}
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: "100vw",
          background: "#0F172A",
          color: "#f8fafc",
          zIndex: 901,
          borderLeft: "1px solid #1F2937",
          boxShadow: "-20px 0 40px rgba(2,6,23,0.4)",
          transform: open ? "translateX(0)" : "translateX(calc(100% + 64px))",
          transition: reduced ? "none" : `transform 350ms ${DRAWER_EASE}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -120,
            top: -120,
            width: 360,
            height: 360,
            borderRadius: 999,
            background: "radial-gradient(circle,rgba(0,240,255,0.12),transparent 70%)",
            pointerEvents: "none",
          }}
        />
        {panel && (
          <>
            {/* ── Header ── */}
            <div
              style={{
                position: "relative",
                padding: "22px 24px 18px",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div
                  style={{
                    font: `600 10px ${F_DISPLAY}`,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#00F0FF",
                  }}
                >
                  Intelligence Panel · {period}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close panel"
                  className="dv2-panelx"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid #334155",
                    background: "transparent",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    color: "#cbd5e1",
                  }}
                >
                  <X size={15} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
                <span
                  style={{
                    width: 48,
                    height: 48,
                    flex: "none",
                    borderRadius: 12,
                    background: "#1e293b",
                    border: "1px solid #334155",
                    display: "grid",
                    placeItems: "center",
                    font: `700 14px ${F_DISPLAY}`,
                  }}
                >
                  {panel.initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: `700 22px/1.15 ${F_DISPLAY}`, letterSpacing: "-0.02em" }}>
                    {panel.name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginTop: 6,
                      fontSize: 12,
                      fontFamily: F_BODY,
                      color: "#94a3b8",
                    }}
                  >
                    <span
                      style={{
                        font: `600 11px ${F_BODY}`,
                        color: panel.stageColor,
                        background: panel.stageBg,
                        borderRadius: 999,
                        padding: "2px 9px",
                      }}
                    >
                      {panel.stage}
                    </span>
                    {panel.city || "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Body ── */}
            <div
              style={{
                position: "relative",
                flex: 1,
                overflow: "auto",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {kpiTile("Shipments", panel.shipments)}
                {kpiTile("TEU", panel.teu)}
                {kpiTile("Est. spend", panel.spend)}
              </div>

              {/* 24-month bars */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    fontFamily: F_BODY,
                    color: "#94a3b8",
                  }}
                >
                  <span>24-month {unit}</span>
                  <span style={{ fontFamily: F_MONO, color: panel.dfg }}>{panel.delta} YoY</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 3,
                    height: 80,
                    marginTop: 10,
                  }}
                >
                  {(panel.bars ?? []).map((b: any, i: number) => (
                    <div
                      key={i}
                      title={b.title}
                      style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: b.bg,
                          borderRadius: "2px 2px 0 0",
                          transform: `scaleY(${b.s})`,
                          transformOrigin: "bottom",
                          transition: reduced ? "none" : `transform 500ms ${EASE}`,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Lanes */}
              <div>
                <div
                  style={{
                    font: `600 10px ${F_DISPLAY}`,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#64748b",
                    marginBottom: 8,
                  }}
                >
                  Lanes
                </div>
                {(panel.lanes ?? []).length === 0 && (
                  <div style={{ fontSize: 12, fontFamily: F_BODY, color: "#64748b" }}>
                    Lane-level history is still building for this company.
                  </div>
                )}
                {(panel.lanes ?? []).map((l: any) => (
                  <div key={l.key ?? l.label} style={{ padding: "8px 0" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        fontFamily: F_BODY,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                        <span
                          style={{
                            font: `600 10px ${F_MONO}`,
                            background: l.color,
                            borderRadius: 3,
                            padding: "1px 5px",
                          }}
                        >
                          {String(l.label ?? "").split("→")[0].trim().slice(0, 2).toUpperCase()}
                        </span>
                        {l.label}
                      </span>
                      <span style={{ font: `600 12px ${F_MONO}` }}>
                        {l.val} · {l.share}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: "#1e293b",
                        borderRadius: 999,
                        marginTop: 6,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: l.w,
                          background: l.color,
                          borderRadius: 999,
                          transition: reduced ? "none" : `width 500ms ${EASE}`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Signals */}
              <div>
                <div
                  style={{
                    font: `600 10px ${F_DISPLAY}`,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#64748b",
                    marginBottom: 8,
                  }}
                >
                  Signals
                </div>
                {(panel.sig ?? []).map((s: any, i: number) => {
                  const Icon = SIG_ICONS[s.icon] ?? TrendingUp;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "#020617",
                        border: "1px solid #1e293b",
                        marginBottom: 6,
                      }}
                    >
                      <Icon size={16} style={{ color: s.color, flex: "none", marginTop: 1 }} />
                      <div>
                        <div style={{ font: `600 13px ${F_BODY}` }}>{s.title}</div>
                        <div style={{ fontSize: 12, fontFamily: F_BODY, color: "#94a3b8" }}>
                          {s.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 12, fontFamily: F_BODY, color: "#64748b" }}>
                  Last shipment {panel.lastLabel}
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <div
              style={{
                position: "relative",
                padding: "16px 24px",
                borderTop: "1px solid #1e293b",
                display: "flex",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => navigate(`/app/companies/${encodeURIComponent(panel.key)}`)}
                className="dv2-cta"
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 10,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  font: `600 13px ${F_BODY}`,
                  cursor: "pointer",
                  boxShadow: "0 0 18px rgba(59,130,246,0.45)",
                }}
              >
                Open Company Profile
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => navigate("/app/campaigns/new")}
                className="dv2-ghostdark"
                style={{
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #334155",
                  background: "transparent",
                  color: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 14px",
                  font: `600 13px ${F_BODY}`,
                  cursor: "pointer",
                }}
              >
                <Send size={15} />
                Add to Campaign
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
