import React from "react";
import { Sparkles, TrendingUp, AlertCircle, Zap, Play, FileText } from "lucide-react";

/**
 * Phase 2 — Dashboard "AI Trade Brief" card.
 *
 * Dark-gradient accent surface (#0B1736 → #0F1D38 → #102240) with cyan
 * radial accent. Headline + supporting paragraph + bullet rows + 2 ghost
 * CTAs.
 *
 * Data source is intentionally narrow: every clause is grounded in real
 * saved-account aggregates (`tradeInsights` is the templated output of
 * LITDashboard's `useMemo` over `realSavedCompanies` / `topAggregatedLanes`).
 * No external AI service, no fabricated metrics. Empty state when the
 * user has no saved accounts to aggregate.
 */
export default function StrategicBriefCard({
  insights,
  topLanes,
  savedAccountsCount,
  loading,
}) {
  const hasInsights = Array.isArray(insights) && insights.length > 0;
  const headline =
    hasInsights && Array.isArray(topLanes) && topLanes.length > 0
      ? `${topLanes[0].label.split("→")[0]?.trim() || topLanes[0].label} lanes lead your saved accounts.`
      : null;

  return (
    <div
      className="relative flex min-h-[340px] flex-col overflow-hidden rounded-xl border p-[18px]"
      style={{
        background: "linear-gradient(135deg, #0B1736 0%, #0F1D38 60%, #102240 100%)",
        borderColor: "#1E293B",
      }}
    >
      {/* Cyan radial accent — top-right corner */}
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-60 w-60"
        style={{
          background: "radial-gradient(circle, rgba(0,240,255,0.18) 0%, transparent 60%)",
        }}
        aria-hidden
      />

      {/* Eyebrow row */}
      <div className="relative mb-3 flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{
            background: "linear-gradient(135deg, #00F0FF, #3B82F6)",
            boxShadow: "0 0 12px rgba(0,240,255,0.4)",
          }}
        >
          <Sparkles className="h-3 w-3" style={{ color: "#0B1736" }} />
        </div>
        <span
          className="font-display text-[9px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "#7DD3FC" }}
        >
          AI Trade Brief
        </span>
        <span className="font-mono ml-auto text-[9px] text-slate-500">
          Updated just now
        </span>
      </div>

      {/* Headline */}
      <div
        className="font-display relative mb-2.5 text-[16px] font-bold leading-snug tracking-tight"
        style={{ color: "#F8FAFC" }}
      >
        {loading ? (
          <span style={{ color: "#94A3B8" }}>Generating brief…</span>
        ) : headline ? (
          headline
        ) : (
          <span style={{ color: "#94A3B8" }}>Save companies to generate a brief.</span>
        )}
      </div>

      {/* Supporting paragraph (grounded in real aggregates) */}
      <div
        className="font-body relative mb-3.5 text-[12px] leading-relaxed"
        style={{ color: "#CBD5E1" }}
      >
        {loading ? (
          "Loading saved-account aggregates…"
        ) : savedAccountsCount > 0 ? (
          <>
            <strong style={{ color: "#F8FAFC", fontWeight: 600 }}>
              {savedAccountsCount} saved {savedAccountsCount === 1 ? "account" : "accounts"}
            </strong>{" "}
            in your Command Center.
            {Array.isArray(topLanes) && topLanes.length > 0 && (
              <>
                {" "}
                Top lane:{" "}
                <strong style={{ color: "#86EFAC" }}>{topLanes[0].label}</strong>.
              </>
            )}
          </>
        ) : (
          "Your dashboard brief activates once you've saved at least one company in the Command Center."
        )}
      </div>

      {/* Insight bullets — only render real templated insights */}
      <div className="relative mb-3.5 flex flex-col gap-2">
        {hasInsights ? (
          insights.map((insight, i) => {
            const tone = pickInsightTone(insight, i);
            const Icon = tone.icon;
            return (
              <div key={`${i}-${insight.slice(0, 12)}`} className="flex items-start gap-2">
                <div
                  className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md"
                  style={{
                    background: tone.color + "22",
                    border: `1px solid ${tone.color}33`,
                  }}
                >
                  <Icon className="h-2.5 w-2.5" style={{ color: tone.color }} />
                </div>
                <div
                  className="font-body text-[11.5px] leading-relaxed"
                  style={{ color: "#E2E8F0" }}
                >
                  {insight}
                </div>
              </div>
            );
          })
        ) : (
          <div
            className="font-body text-[11.5px] italic"
            style={{ color: "#94A3B8" }}
          >
            {loading
              ? "Computing insights…"
              : "Insights appear once your saved set has activity to surface."}
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="relative mt-auto flex gap-1.5">
        <button
          type="button"
          disabled={!hasInsights}
          className="font-display inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-2 text-[11.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "rgba(255,255,255,0.08)",
            borderColor: "rgba(255,255,255,0.12)",
            color: "#F8FAFC",
          }}
        >
          <Play className="h-2.5 w-2.5" />
          Run Outreach
        </button>
        <button
          type="button"
          disabled={!hasInsights}
          className="font-display inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-2 text-[11.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "transparent",
            borderColor: "rgba(255,255,255,0.12)",
            color: "#CBD5E1",
          }}
        >
          <FileText className="h-2.5 w-2.5" />
          Read Brief
        </button>
      </div>
    </div>
  );
}

function pickInsightTone(insight, index) {
  // Lightweight keyword routing — avoids needing a sentiment model. Falls
  // back to the default "rising" tone (lime green) when nothing matches.
  const txt = String(insight || "").toLowerCase();
  if (txt.includes("no verified contacts") || txt.includes("declining") || txt.includes("dropped")) {
    return { color: "#FCA5A5", icon: AlertCircle };
  }
  if (txt.includes("shipped in the last") || txt.includes("prioritize")) {
    return { color: "#FCD34D", icon: Zap };
  }
  return { color: index === 0 ? "#86EFAC" : "#7DD3FC", icon: TrendingUp };
}