/**
 * DashboardV2 — the "Morning Brief" dashboard rebuild (design handoff
 * `Dashboard Brief.dc.html` + README §2/§3).
 *
 * Pure UI over the already-built data layer:
 *   - useDashboardData()/useDashState()  (data/useDashboardData.ts)
 *   - computeDash()                       (data/computeDash.ts) — every
 *     displayed field, delta, color and onClick is precomputed there.
 *   - useCountUp two-pass idiom mirrors CompanyProfileWorkspace.
 *
 * Renders INSIDE the existing AppLayout (no chrome/sidebars here). The
 * map core (LaneMap/GlobeCanvas) is consumed untouched via
 * components/DashLaneMapCard.tsx.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Briefcase,
  Building2,
  Check,
  Compass,
  Container,
  DollarSign,
  GitBranchPlus,
  Moon,
  Radar,
  Send,
  ShieldCheck,
  Ship,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useCountUp } from "@/features/company-profile/data/useCountUp";
import { useReducedMotion } from "@/features/company-profile/components/ui";
import { computeDash, type DashView } from "./data/computeDash";
import { useDashboardData, useDashState } from "./data/useDashboardData";
import DashLaneMapCard from "./components/DashLaneMapCard";
import LogoTile from "./components/LogoTile";
import OutboundEngineCard from "./components/OutboundEngineCard";
import IntelligencePanel from "./components/IntelligencePanel";

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

const KPI_ICONS: Record<string, typeof Building2> = {
  "building-2": Building2,
  ship: Ship,
  container: Container,
  "dollar-sign": DollarSign,
  briefcase: Briefcase,
  radar: Radar,
};

const SIG_ICONS: Record<string, typeof TrendingUp> = {
  "trending-up": TrendingUp,
  "git-branch-plus": GitBranchPlus,
  "trending-down": TrendingDown,
  moon: Moon,
};

// Injected once — keyframes, hover states and the responsive rules that
// can't live in inline styles. All selectors are dv2-prefixed.
const DV2_CSS = `
@keyframes dv2marquee{to{transform:translateX(-50%)}}
@keyframes dv2ping{75%,100%{transform:scale(2.6);opacity:0}}
.dv2-marquee{display:flex;width:max-content;animation:dv2marquee 60s linear infinite}
.dv2-marquee:hover{animation-play-state:paused}
.dv2-ping{animation:dv2ping 1.8s cubic-bezier(0,0,0.2,1) infinite}
.dv2-static .dv2-marquee,.dv2-static .dv2-ping{animation:none}
@media (prefers-reduced-motion: reduce){.dv2-marquee,.dv2-ping{animation:none}}
.dv2-h1{margin:0;font:700 58px/1.02 ${F_DISPLAY};letter-spacing:-0.04em;color:#0F172A;text-wrap:balance}
@media (max-width:768px){.dv2-h1{font-size:34px}}
.dv2-body{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
.dv2-rail{position:sticky;top:72px;display:flex;flex-direction:column;gap:16px;min-width:0}
@media (max-width:1100px){.dv2-body{grid-template-columns:minmax(0,1fr)}.dv2-rail{position:static}}
.dv2-pad{padding-left:32px;padding-right:32px}
.dv2-greeting{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:40px;align-items:end;margin-top:34px}
.dv2-narrative{margin:18px 0 0;max-width:900px;font:400 19px/1.55 ${F_BODY};color:#475569}
@media (max-width:900px){.dv2-greeting{grid-template-columns:minmax(0,1fr);gap:20px;align-items:stretch}}
@media (max-width:640px){
  .dv2-pad{padding-left:16px;padding-right:16px}
  .dv2-narrative{font-size:15px;margin-top:12px}
  .dv2-topbtns{width:100%}
  .dv2-topbtns>button{flex:1;justify-content:center;padding:0 10px!important}
}
.dv2-ghostbtn{transition:transform 160ms ${EASE},border-color 200ms,background 200ms}
.dv2-ghostbtn:hover{border-color:rgba(0,200,212,0.5)!important;background:#F8FAFC!important}
.dv2-ghostbtn:active{transform:scale(0.97)}
.dv2-cta{transition:transform 160ms ${EASE},background 200ms}
.dv2-cta:hover{background:#2563eb!important}
.dv2-cta:active{transform:scale(0.97)}
.dv2-kpicard{transition:border-color 200ms ${EASE},box-shadow 200ms}
.dv2-kpicard:hover{border-color:rgba(0,200,212,0.5);box-shadow:0 12px 32px rgba(15,23,42,0.10)}
.dv2-tickitem:hover{background:#FFFFFF}
.dv2-seg:active{transform:scale(0.96)}
.dv2-lanerow:hover{background:#F1F5F9!important}
.dv2-acctrow:hover{background:#F8FAFC!important}
.dv2-sigrow:hover{background:#FAFBFC}
.dv2-panelx:hover{background:#1e293b}
.dv2-ghostdark:hover{background:#1e293b}
`;

export default function DashboardV2() {
  const navigate = useNavigate();
  const { user, fullName } = useAuth() as any;
  const { ds, loading, workspaceLanes } = useDashboardData();
  const { state, actions, endBrush, ready } = useDashState(ds);
  const reduced = useReducedMotion();

  // Two-pass count-up (same idiom as CompanyProfileWorkspace).
  const baseView = useMemo(
    () => (ds && ready ? computeDash(ds, state, actions) : null),
    [ds, ready, state, actions],
  );
  const disp = useCountUp(baseView ? baseView.targets : null);
  const view: DashView | null = useMemo(
    () => (ds && ready && disp ? computeDash(ds, { ...state, disp }, actions) : baseView),
    [ds, ready, state, actions, disp, baseView],
  );

  // Compact filter-bar identity once the header scrolls away (~420px).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  const hasView = !!view;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [hasView]);

  // Keep the drawer's content rendered during the close transition.
  const lastPanelRef = useRef<any>(null);
  if (view?.panel) lastPanelRef.current = view.panel;
  const panelData = view?.panel ?? lastPanelRef.current;

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName =
    fullName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "there";
  const firstName = String(displayName).trim().split(/\s+/)[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ── Loading skeleton ────────────────────────────────────────────────
  if (loading || (ds && !view)) {
    return (
      <div style={{ background: "#F1F5F9", minHeight: "100vh", fontFamily: F_BODY }} aria-busy>
        <style>{DV2_CSS}</style>
        <div className="dv2-pad" style={{ maxWidth: 1560, margin: "0 auto", paddingTop: 26, paddingBottom: 26 }}>
          <div
            className="motion-reduce:animate-none animate-pulse"
            style={{ ...CARD, height: 260, marginBottom: 20 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 120 }} />
            ))}
          </div>
          <div className="dv2-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 120 }} />
              <div className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 460 }} />
              <div className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 320 }} />
            </div>
            <div className="dv2-rail">
              {[0, 1, 2].map((i) => (
                <div key={i} className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 160 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state (no saved companies) ────────────────────────────────
  if (!ds || !view) {
    return (
      <div style={{ background: "#F1F5F9", minHeight: "100vh", fontFamily: F_BODY }}>
        <style>{DV2_CSS}</style>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "96px 32px", textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 20px",
              borderRadius: 16,
              background: "#0F172A",
              color: "#00F0FF",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 0 24px rgba(0,240,255,0.25)",
            }}
          >
            <Compass size={28} />
          </div>
          <h1 className="dv2-h1" style={{ fontSize: 40 }}>
            {greeting},{" "}
            <span
              style={{
                background: "linear-gradient(90deg,#2563eb,#00c8d4)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {firstName}.
            </span>
          </h1>
          <p style={{ margin: "16px auto 28px", maxWidth: 480, font: `400 16px/1.6 ${F_BODY}`, color: "#475569" }}>
            Your morning brief starts with your first saved company. Discover shippers moving real
            U.S. CBP volume and save them to your workspace — the portfolio story builds from there.
          </p>
          <button
            type="button"
            className="dv2-cta"
            onClick={() => navigate("/app/search")}
            style={{
              height: 44,
              background: "#3b82f6",
              border: "none",
              borderRadius: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0 20px",
              font: `600 14px ${F_BODY}`,
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
            }}
          >
            <Compass size={16} />
            Discover Companies
          </button>
        </div>
      </div>
    );
  }

  const v = view;
  const story = v.story;

  return (
    <div
      className={reduced ? "dv2-static" : undefined}
      style={{ background: "#F1F5F9", minHeight: "100vh", color: "#0F172A", fontFamily: F_BODY }}
    >
      <style>{DV2_CSS}</style>

      {/* ══ A. Full-bleed header ══════════════════════════════════════ */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg,#FFFFFF 0%,#F2FAFC 100%)",
          boxShadow: "inset 0 -1px 0 #E5E7EB",
        }}
      >
        {/* decorative 48px grid + glows (pointer-events none) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(15,23,42,0.045) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,0.045) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
            WebkitMaskImage: "radial-gradient(ellipse 70% 90% at 70% 0%,#000,transparent)",
            maskImage: "radial-gradient(ellipse 70% 90% at 70% 0%,#000,transparent)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -160,
            top: -220,
            width: 720,
            height: 720,
            borderRadius: 999,
            background: "radial-gradient(circle,rgba(0,240,255,0.16),transparent 62%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -200,
            bottom: -300,
            width: 640,
            height: 640,
            borderRadius: 999,
            background: "radial-gradient(circle,rgba(59,130,246,0.08),transparent 65%)",
            pointerEvents: "none",
          }}
        />

        <div className="dv2-pad" style={{ position: "relative", maxWidth: 1560, margin: "0 auto", paddingTop: 26 }}>
          {/* top row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13, color: "#64748b" }}>
              <span style={{ font: `700 15px ${F_DISPLAY}`, color: "#0F172A", letterSpacing: "-0.01em" }}>
                Logistics Intel
              </span>
              <span style={{ width: 1, height: 18, background: "#E2E8F0" }} />
              <span
                style={{
                  font: `600 10px ${F_MONO}`,
                  letterSpacing: "0.12em",
                  color: "#0e7490",
                  background: "rgba(0,240,255,0.10)",
                  border: "1px solid rgba(0,200,212,0.35)",
                  borderRadius: 4,
                  padding: "3px 7px",
                }}
              >
                DASHBOARD
              </span>
              <span>{dateLabel}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#475569" }}>
                <ShieldCheck size={14} style={{ color: "#10b981" }} />
                {v.companyCount} saved companies · U.S. CBP data
              </span>
            </div>
            <div className="dv2-topbtns" style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="dv2-ghostbtn"
                onClick={() => navigate("/app/search")}
                style={{
                  height: 40,
                  border: "1px solid #E5E7EB",
                  background: "#FFFFFF",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 14px",
                  font: `600 13px ${F_BODY}`,
                  color: "#0F172A",
                  cursor: "pointer",
                }}
              >
                <Compass size={15} style={{ color: "#0891b2" }} />
                Discover Companies
              </button>
              <button
                type="button"
                className="dv2-cta"
                onClick={() => navigate("/app/campaigns/new")}
                style={{
                  height: 40,
                  background: "#3b82f6",
                  border: "none",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 16px",
                  font: `600 13px ${F_BODY}`,
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
                }}
              >
                <Send size={15} />
                New Campaign
              </button>
            </div>
          </div>

          {/* greeting + status card */}
          <div className="dv2-greeting">
            <div style={{ minWidth: 0 }}>
              <h1 className="dv2-h1">
                {greeting},{" "}
                <span
                  style={{
                    background: "linear-gradient(90deg,#2563eb,#00c8d4)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {firstName}.
                </span>
              </h1>
              <p className="dv2-narrative">
                Your <b style={{ color: "#0F172A", fontWeight: 600 }}>{story.companies} saved shippers</b>{" "}
                moved{" "}
                <b style={{ color: "#0F172A", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {story.shipments} shipments
                </b>{" "}
                and{" "}
                <b style={{ color: "#0F172A", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {story.teu} TEU
                </b>{" "}
                in {story.period},{" "}
                <b style={{ fontWeight: 600, color: story.deltaFg }}>{story.delta}</b> year over
                year.{" "}
                {story.topLane !== "—" && (
                  <>
                    {story.topLane} carries {story.topLaneShare} of it.{" "}
                  </>
                )}
                <b style={{ color: "#0F172A", fontWeight: 600 }}>{story.signals} accounts</b> need
                attention today.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minWidth: 260,
                padding: "18px 20px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid #E5E7EB",
                boxShadow: "0 12px 30px rgba(15,23,42,0.08), inset 0 3px 0 #00F0FF",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, font: `600 13px ${F_BODY}`, color: "#0e7490" }}>
                <span style={{ position: "relative", width: 8, height: 8 }}>
                  <span
                    className="dv2-ping"
                    style={{ position: "absolute", inset: 0, borderRadius: 999, background: "#00F0FF" }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 999,
                      background: "#00F0FF",
                      boxShadow: "0 0 8px #00F0FF",
                    }}
                  />
                </span>
                Live · {v.openSignals} open signals
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>Pipeline value</span>
                <span style={{ font: `600 12px ${F_MONO}`, color: "#0F172A" }}>{story.pipeline}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>Quoting accounts</span>
                <span style={{ font: `600 12px ${F_MONO}`, color: "#0F172A" }}>{story.quoting}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>Top account</span>
                <span
                  style={{
                    font: `600 12px ${F_BODY}`,
                    color: "#0F172A",
                    maxWidth: 150,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {story.topCo}
                </span>
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
              gap: 12,
              marginTop: 32,
            }}
          >
            {v.kpis.map((k) => {
              const Icon = KPI_ICONS[k.icon] ?? Building2;
              return (
                <div
                  key={k.id}
                  className="dv2-kpicard"
                  style={{ ...CARD, position: "relative", overflow: "hidden", padding: "16px 18px 12px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      font: `600 10px ${F_DISPLAY}`,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#64748b",
                    }}
                  >
                    <Icon size={14} style={{ color: "#0891b2", flex: "none" }} />
                    {k.label}
                    {k.id === "spend" && v.spendModeled && (
                      <span
                        style={{
                          font: `600 9px ${F_MONO}`,
                          letterSpacing: "0.04em",
                          color: "#b45309",
                          background: "rgba(245,158,11,0.14)",
                          border: "1px solid rgba(245,158,11,0.35)",
                          borderRadius: 999,
                          padding: "1px 6px",
                          textTransform: "none",
                        }}
                      >
                        Modeled
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      font: `600 32px/1 ${F_MONO}`,
                      letterSpacing: "-0.04em",
                      color: "#0F172A",
                      margin: "14px 0 8px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {k.value}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, font: `500 11px ${F_MONO}`, color: "#64748b" }}>
                    {k.hasDelta && <span style={{ fontWeight: 600, color: k.dfg }}>{k.delta}</span>}
                    {k.prior}
                  </div>
                  {k.hasSpark && (
                    <svg
                      viewBox="0 0 100 28"
                      preserveAspectRatio="none"
                      style={{ width: "100%", height: 24, marginTop: 10, display: "block", overflow: "visible" }}
                    >
                      <path
                        d={k.spark}
                        fill="none"
                        stroke="#00c8d4"
                        strokeWidth={1.8}
                        vectorEffect="non-scaling-stroke"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>

          {/* compact-bar sentinel — filter bar goes compact once this scrolls out */}
          <div ref={sentinelRef} style={{ height: 1 }} />

          {/* activity ticker */}
          <div
            style={{
              marginTop: 26,
              borderTop: "1px solid #E5E7EB",
              overflow: "hidden",
              WebkitMaskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)",
              maskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)",
            }}
          >
            <div className="dv2-marquee">
              {v.ticker.map((r, i) => (
                <div
                  key={i}
                  className="dv2-tickitem"
                  onClick={r.onClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "13px 22px",
                    borderRight: "1px solid #EEF2F6",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: r.color }} />
                  <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8" }}>{r.month}</span>
                  <span style={{ font: `600 13px ${F_BODY}`, color: "#0F172A" }}>{r.co}</span>
                  <span style={{ font: `500 11px ${F_MONO}`, color: "#475569" }}>
                    {r.lane} · {r.n} BOLs
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ B. Sticky filter bar ══════════════════════════════════════ */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(248,250,252,0.9)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <div
          className="dv2-pad"
          style={{
            maxWidth: 1560,
            margin: "0 auto",
            paddingTop: 10,
            paddingBottom: 10,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              overflow: "hidden",
              whiteSpace: "nowrap",
              maxWidth: compact ? 200 : 0,
              opacity: compact ? 1 : 0,
              transition: reduced ? "none" : `max-width 300ms ${EASE}, opacity 200ms`,
            }}
          >
            <span style={{ font: `600 13px ${F_DISPLAY}`, color: "#0F172A" }}>Dashboard</span>
            <span style={{ width: 1, height: 18, background: "#E2E8F0" }} />
          </div>

          {/* presets */}
          <div style={{ display: "flex", gap: 2, background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, padding: 3 }}>
            {v.presets.map((p) => (
              <div
                key={p.id}
                className="dv2-seg"
                onClick={p.onClick}
                style={{
                  padding: "6px 11px",
                  borderRadius: 7,
                  font: `600 12px ${F_BODY}`,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  background: p.bg,
                  color: p.fg,
                  boxShadow: p.active ? "inset 0 -2px 0 #00F0FF" : "none",
                  transition: "background 200ms, color 200ms",
                }}
              >
                {p.label}
              </div>
            ))}
          </div>

          {/* metric */}
          <div style={{ display: "flex", gap: 2, background: "#EEF2F6", borderRadius: 10, padding: 3 }}>
            {v.metrics.map((m) => (
              <div
                key={m.id}
                className="dv2-seg"
                onClick={m.onClick}
                style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  font: `600 12px ${F_BODY}`,
                  cursor: "pointer",
                  background: m.bg,
                  color: m.fg,
                  boxShadow: m.shadow,
                }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* filter tokens */}
          {v.tokens.map((t, i) => (
            <div
              key={i}
              onClick={t.onRemove}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 30,
                padding: "0 8px 0 10px",
                borderRadius: 999,
                background: "#0F172A",
                color: "#FFFFFF",
                font: `500 12px ${F_BODY}`,
                cursor: "pointer",
              }}
            >
              <span style={{ color: "#94a3b8" }}>{t.dim}</span>
              {t.label}
              <X size={13} />
            </div>
          ))}
          {v.hasTokens && (
            <div
              onClick={() => v.tokens.forEach((t) => t.onRemove())}
              style={{ font: `600 12px ${F_BODY}`, color: "#3b82f6", cursor: "pointer" }}
            >
              Clear filters
            </div>
          )}

          <div style={{ flex: 1 }} />
          <div style={{ font: `500 12px ${F_MONO}`, color: "#475569", whiteSpace: "nowrap" }}>
            {v.period} <span style={{ color: "#94a3b8" }}>vs {v.priorLabel}</span>
          </div>
        </div>
      </div>

      {/* ══ C. Body ═══════════════════════════════════════════════════ */}
      <div className="dv2-pad" style={{ maxWidth: 1560, margin: "0 auto", paddingTop: 20, paddingBottom: 64 }}>
        <div className="dv2-body">
          {/* ── main column ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
            {/* 1. Portfolio history brush */}
            <section style={{ ...CARD, padding: "16px 20px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
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
                  <Activity size={13} />
                  Portfolio {v.unit} per month
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Drag across months to set the window</div>
              </div>
              <div
                style={{ position: "relative", userSelect: "none" }}
                onPointerUp={endBrush}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -4,
                    bottom: -4,
                    left: v.brush.left,
                    width: v.brush.width,
                    background: "rgba(0,240,255,0.08)",
                    border: "1px solid rgba(0,200,212,0.45)",
                    borderRadius: 6,
                    transition: reduced ? "none" : `left 200ms ${EASE}, width 200ms ${EASE}`,
                    pointerEvents: "none",
                  }}
                />
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
                  {v.timeline.map((b) => (
                    <div
                      key={b.mi}
                      title={b.label}
                      onMouseDown={b.onDown}
                      onMouseEnter={b.onEnter}
                      style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "ew-resize" }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: "3px 3px 1px 1px",
                          background: b.sel ? "linear-gradient(180deg,#00c8d4,#3b82f6)" : "#E2E8F0",
                          transform: `scaleY(${b.s})`,
                          transformOrigin: "bottom",
                          transition: reduced ? "none" : `transform 500ms ${EASE}, background 200ms`,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
                {v.timeline.map((b) => (
                  <div key={b.mi} style={{ flex: 1, font: `500 10px ${F_MONO}`, color: "#94a3b8", whiteSpace: "nowrap" }}>
                    {b.short}
                  </div>
                ))}
              </div>
            </section>

            {/* 2. Lane map (existing LaneMap, untouched) + glass overlay */}
            <DashLaneMapCard
              workspaceLanes={workspaceLanes}
              lanes={v.lanes}
              headline={`${story.topLane} leads with ${story.topLaneShare}`}
              unit={v.unit}
              reduced={reduced}
            />

            {/* 3. Top accounts */}
            <section style={{ ...CARD, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "18px 24px",
                  borderBottom: "1px solid #EEF2F6",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: "#0F172A",
                      color: "#00F0FF",
                      display: "grid",
                      placeItems: "center",
                      boxShadow: "0 0 12px rgba(0,240,255,0.2)",
                    }}
                  >
                    <Trophy size={16} />
                  </span>
                  <div>
                    <div style={{ font: `600 16px ${F_DISPLAY}` }}>Top accounts</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      Saved companies ranked by {v.unit}, {v.period}. Click to open the Intelligence Panel.
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 2, background: "#EEF2F6", borderRadius: 10, padding: 3 }}>
                  {v.sorts.map((o) => (
                    <div
                      key={o.id}
                      className="dv2-seg"
                      onClick={o.onClick}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 7,
                        font: `600 12px ${F_BODY}`,
                        cursor: "pointer",
                        background: o.bg,
                        color: o.fg,
                        boxShadow: o.shadow,
                      }}
                    >
                      {o.label}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 880 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "36px minmax(0,1.6fr) 100px 120px minmax(0,1fr) 70px 90px 120px",
                      gap: 12,
                      padding: "10px 24px",
                      background: "#F8FAFC",
                      font: `600 10px ${F_DISPLAY}`,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "#94a3b8",
                    }}
                  >
                    <span>#</span>
                    <span>Company</span>
                    <span>Stage</span>
                    <span>Top lane</span>
                    <span>{v.unit}</span>
                    <span>YoY</span>
                    <span>Trend</span>
                    <span>Signal</span>
                  </div>
                  {v.topAccounts.map((c: any) => (
                    <div
                      key={c.key}
                      className="dv2-acctrow"
                      onClick={c.onClick}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "36px minmax(0,1.6fr) 100px 120px minmax(0,1fr) 70px 90px 120px",
                        gap: 12,
                        padding: "12px 24px",
                        borderTop: "1px solid #F1F5F9",
                        alignItems: "center",
                        fontSize: 13,
                        cursor: "pointer",
                        background: c.rowBg,
                      }}
                    >
                      <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8" }}>{c.rank}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <LogoTile name={c.name} domain={c.logoDomain} size={32} radius={9} />
                        <span style={{ minWidth: 0 }}>
                          <span
                            style={{
                              display: "block",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {c.name}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.ownerId && (
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
                            )}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.city || "—"}</span>
                          </span>
                        </span>
                      </span>
                      <span>
                        <span
                          style={{
                            font: `600 11px ${F_BODY}`,
                            color: c.stageColor,
                            background: c.stageBg,
                            borderRadius: 999,
                            padding: "3px 9px",
                          }}
                        >
                          {c.stage}
                        </span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ width: 7, height: 7, flex: "none", borderRadius: 999, background: c.laneColor }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.topLane}</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ font: `600 13px ${F_MONO}`, width: 64 }}>{c.val}</span>
                        <span style={{ flex: 1, height: 4, background: "#EEF2F6", borderRadius: 999, overflow: "hidden" }}>
                          <span
                            style={{
                              display: "block",
                              height: "100%",
                              background: "linear-gradient(90deg,#3b82f6,#00c8d4)",
                              borderRadius: 999,
                              transform: `scaleX(${c.s})`,
                              transformOrigin: "left",
                              transition: reduced ? "none" : `transform 500ms ${EASE}`,
                            }}
                          />
                        </span>
                      </span>
                      <span style={{ font: `600 11px ${F_MONO}`, color: c.dfg }}>{c.delta}</span>
                      <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width: "100%", height: 22, overflow: "visible" }}>
                        <path d={c.spark} fill="none" stroke={c.laneColor} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
                      </svg>
                      {c.sigTitle ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 6, font: `600 12px ${F_BODY}`, color: c.sigColor }}>
                          <span style={{ width: 6, height: 6, flex: "none", borderRadius: 999, background: c.sigColor }} />
                          {c.sigTitle}
                        </span>
                      ) : (
                        <span style={{ font: `500 12px ${F_BODY}`, color: "#CBD5E1" }}>—</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* ── right rail ── */}
          <aside className="dv2-rail">
            {/* 1. What matters now */}
            <section style={{ ...CARD, boxShadow: "0 8px 30px rgba(15,23,42,0.06), inset 0 3px 0 #00F0FF", padding: "18px 20px 8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    font: `600 11px ${F_DISPLAY}`,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#0F172A",
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      background: "#0F172A",
                      color: "#00F0FF",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Radar size={13} />
                  </span>
                  What matters now
                </div>
                <span
                  style={{
                    font: `600 11px ${F_MONO}`,
                    color: "#1d4ed8",
                    background: "rgba(59,130,246,0.1)",
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  {v.openSignals} open
                </span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 360,
                  overflowY: "auto",
                  overflowX: "hidden",
                  scrollbarWidth: "thin",
                  scrollbarColor: "#CBD5E1 transparent",
                }}
              >
                {v.signals.length === 0 ? (
                  <div style={{ padding: "14px 0 18px", font: `400 13px ${F_BODY}`, color: "#64748b" }}>
                    All clear — no open signals.
                  </div>
                ) : (
                  v.signals.map((s: any) => {
                    const Icon = SIG_ICONS[s.icon] ?? TrendingUp;
                    return (
                      <div
                        key={s.key}
                        className="dv2-sigrow"
                        onClick={s.onClick}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "18px 30px minmax(0,1fr)",
                          gap: 10,
                          padding: "10px 0",
                          borderTop: "1px solid #F1F5F9",
                          cursor: "pointer",
                          opacity: s.opacity,
                          transition: "opacity 200ms",
                        }}
                      >
                        <span
                          onClick={(e) => s.onDone(e)}
                          role="checkbox"
                          aria-checked={s.done}
                          style={{
                            width: 16,
                            height: 16,
                            marginTop: 6,
                            borderRadius: 5,
                            border: `1.5px solid ${s.checkBorder}`,
                            background: s.checkBg,
                            display: "grid",
                            placeItems: "center",
                            color: "#fff",
                          }}
                        >
                          {s.done && <Check size={10} />}
                        </span>
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 9,
                            background: "#F8FAFC",
                            border: "1px solid #EEF2F6",
                            color: s.color,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Icon size={15} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ font: `600 13px ${F_BODY}`, textDecoration: s.strike }}>
                            {s.title} · {s.co}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.body}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* 2. Pipeline by stage */}
            <section style={{ ...CARD, padding: "18px 20px" }}>
              <div
                style={{
                  font: `600 11px ${F_DISPLAY}`,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  marginBottom: 12,
                }}
              >
                Pipeline by stage · annualized spend
              </div>
              {v.stages.map((s: any) => (
                <div key={s.label} onClick={s.onClick} style={{ padding: "7px 0", cursor: "pointer", opacity: s.opacity }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                      {s.label}{" "}
                      <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8" }}>{s.count}</span>
                    </span>
                    <span style={{ font: `600 12px ${F_MONO}` }}>{s.value}</span>
                  </div>
                  <div style={{ height: 6, background: "#F1F5F9", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        background: s.color,
                        borderRadius: 999,
                        transform: `scaleX(${s.s})`,
                        transformOrigin: "left",
                        transition: reduced ? "none" : `transform 600ms ${EASE}`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </section>

            {/* 3. Owners — saver attribution from lit_saved_companies.user_id */}
            {(v as any).owners?.length > 0 && (
              <section style={{ ...CARD, padding: "18px 20px 10px" }}>
                <div
                  style={{
                    font: `600 11px ${F_DISPLAY}`,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#64748b",
                    marginBottom: 6,
                  }}
                >
                  Owners
                </div>
                {(v as any).owners.map((o: any) => (
                  <div
                    key={o.id}
                    onClick={o.onClick}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: 8,
                      margin: "0 -8px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: o.bg,
                      opacity: o.opacity,
                      transition: reduced ? "none" : `background 200ms ${EASE}, opacity 200ms`,
                    }}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        flex: "none",
                        borderRadius: 999,
                        background: o.color,
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        font: `600 10px ${F_DISPLAY}`,
                      }}
                    >
                      {o.key}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.name}
                    </span>
                    <span style={{ font: `500 12px ${F_MONO}`, color: "#64748b" }}>{o.count}</span>
                  </div>
                ))}
              </section>
            )}

            {/* 4. Outbound Engine (dark accent card) */}
            <OutboundEngineCard />
          </aside>
        </div>
      </div>

      {/* ══ D. Intelligence Panel drawer ══════════════════════════════ */}
      <IntelligencePanel
        open={!!view?.panel}
        panel={panelData}
        period={v.period}
        unit={v.unit}
        reduced={reduced}
        onClose={() => actions.select(null)}
      />
    </div>
  );
}
