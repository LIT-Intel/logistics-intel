import {
  AlertTriangle,
  BarChart3,
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import LitPill from "@/components/ui/LitPill";

/**
 * Phase 3 — AI Research / Pulse Brief tab.
 *
 * Renders the Pulse brief inline (vs the prior modal). All wiring
 * delegates to the parent's existing Pulse / Share / Export handlers
 * (B.14 / B.16 era) so plan gating, error mapping (PULSE_ERROR_COPY /
 * EXPORT_ERROR_COPY), and Edge Function caching behavior are preserved
 * unchanged. Provider names (Tavily / Gemini) are NEVER surfaced — only
 * neutral "AI brief" / "search source" copy per Phase B.16 directive.
 *
 * Layout: dark gradient hero with action chips, then numbered intelligence
 * sections (Executive / Trade Snapshot / Lanes / Opportunities / Risks /
 * Outreach Hook). Right sidebar surfaces a brief outline + supporting-data
 * summary + confidence (when the Edge Function provides it).
 */

type PulseSection = {
  title?: string;
  body?: string;
  bullets?: string[];
};

type PulseBrief = {
  generatedAt?: string | null;
  cached?: boolean;
  sections?: {
    executive_summary?: PulseSection | string;
    trade_snapshot?: PulseSection | string;
    lane_movement?: PulseSection | string;
    opportunity_signals?: PulseSection | string;
    risk_lanes?: PulseSection | string;
    outreach_hook?: PulseSection | string;
  } | null;
  confidence?: number | null;
  sources_count?: number | null;
} | null;

type CDPResearchProps = {
  companyName: string;
  pulseBrief: PulseBrief;
  pulseLoading: boolean;
  pulseError: { code: string; message: string } | null;
  onPulse: () => void;
  onShareHtml: () => void;
  onExportPdf: () => void;
  shareLoading?: boolean;
  exportLoading?: boolean;
};

const SECTION_ORDER: Array<{
  key:
    | "executive_summary"
    | "trade_snapshot"
    | "lane_movement"
    | "opportunity_signals"
    | "risk_lanes"
    | "outreach_hook";
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent?: boolean;
}> = [
  { key: "executive_summary", label: "Executive Summary", icon: FileText },
  { key: "trade_snapshot", label: "Trade Snapshot", icon: BarChart3 },
  { key: "lane_movement", label: "Lane Movement", icon: TrendingUp },
  { key: "opportunity_signals", label: "Opportunity Signals", icon: Target, accent: true },
  { key: "risk_lanes", label: "Risk & Problem Lanes", icon: AlertTriangle },
  { key: "outreach_hook", label: "Suggested Outreach Hook", icon: Send, accent: true },
];

export default function CDPResearch({
  companyName,
  pulseBrief,
  pulseLoading,
  pulseError,
  onPulse,
  onShareHtml,
  onExportPdf,
  shareLoading,
  exportLoading,
}: CDPResearchProps) {
  const sections = pulseBrief?.sections || null;
  const hasBrief = Boolean(sections);

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
      {/* Brief — main column */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Brief header (dark gradient) */}
        <div
          className="relative overflow-hidden p-5"
          style={{
            background:
              "linear-gradient(135deg, #0B1736 0%, #0F1D38 60%, #102240 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-50 w-50"
            style={{
              background:
                "radial-gradient(circle, rgba(0,240,255,0.18) 0%, transparent 60%)",
            }}
            aria-hidden
          />
          <div className="relative mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-md"
                style={{
                  background: "rgba(0,240,255,0.12)",
                  border: "1px solid rgba(0,240,255,0.25)",
                }}
              >
                <Sparkles className="h-3 w-3" style={{ color: "#00F0FF" }} />
              </div>
              <span
                className="font-display text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#00F0FF" }}
              >
                Pulse · Account Intelligence Brief
              </span>
            </div>
            {pulseBrief?.generatedAt && (
              <span
                className="font-mono text-[10px] font-semibold"
                style={{ color: "#94A3B8" }}
              >
                Updated {formatRelativeShort(pulseBrief.generatedAt)}
                {pulseBrief.cached ? " · cached" : ""}
              </span>
            )}
          </div>
          <h2
            className="font-display relative m-0 text-[22px] font-bold leading-tight tracking-tight"
            style={{ color: "#F8FAFC" }}
          >
            {companyName}
          </h2>

          {/* Action chips */}
          <div className="relative mt-3 flex gap-2">
            <BriefActionButton
              icon={pulseLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
              label={pulseLoading ? "Generating…" : hasBrief ? "Re-run" : "Generate"}
              onClick={onPulse}
              disabled={pulseLoading}
            />
            <BriefActionButton
              icon={shareLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Share2 className="h-2.5 w-2.5" />}
              label="Share"
              onClick={onShareHtml}
              disabled={shareLoading || !hasBrief}
            />
            <BriefActionButton
              icon={exportLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
              label="Export PDF"
              onClick={onExportPdf}
              disabled={exportLoading || !hasBrief}
            />
            <BriefActionButton
              icon={<Copy className="h-2.5 w-2.5" />}
              label="Copy"
              onClick={() => copyBriefToClipboard(pulseBrief)}
              disabled={!hasBrief}
            />
          </div>
        </div>

        {/* Body — sections or empty / error / loading */}
        {pulseError ? (
          <div className="border-t border-slate-100 px-5 py-6">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">
              {pulseError.message}
            </div>
          </div>
        ) : pulseLoading ? (
          <div className="border-t border-slate-100 px-5 py-12 text-center">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-blue-500" />
            <p className="font-body text-[12px] text-slate-500">
              Assembling intelligence brief…
            </p>
          </div>
        ) : !hasBrief ? (
          <div className="border-t border-slate-100 px-5 py-12 text-center">
            <p className="font-display mb-1 text-[13px] font-semibold text-slate-700">
              No brief generated yet
            </p>
            <p className="font-body mx-auto mb-3 max-w-md text-[12px] text-slate-400">
              Generate an account intelligence brief from the latest snapshot
              data and public web context. Cached briefs reload instantly.
            </p>
            <button
              type="button"
              onClick={onPulse}
              className="font-display inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm"
            >
              <Sparkles className="h-3 w-3" />
              Generate brief
            </button>
          </div>
        ) : (
          <>
            {SECTION_ORDER.map((sectionDef, i) => {
              const raw = sections?.[sectionDef.key];
              if (!raw) return null;
              const Icon = sectionDef.icon;
              return (
                <section
                  key={sectionDef.key}
                  className="border-b border-slate-100 px-5 py-4 last:border-b-0"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={[
                        "font-mono inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                        sectionDef.accent
                          ? "bg-slate-900 text-cyan-300"
                          : "bg-slate-100 text-slate-500",
                      ].join(" ")}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Icon
                      className={[
                        "h-3.5 w-3.5",
                        sectionDef.accent ? "text-blue-700" : "text-slate-500",
                      ].join(" ")}
                    />
                    <h3 className="font-display m-0 text-[14px] font-bold tracking-tight text-slate-900">
                      {sectionDef.label}
                    </h3>
                  </div>
                  <SectionBody section={raw} />
                </section>
              );
            })}

            {/* Feedback bar */}
            <div className="flex items-center justify-between gap-2 bg-[#FAFBFC] px-5 py-3">
              <span className="font-body text-[11px] text-slate-500">
                Was this brief useful?
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-label="Useful"
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                >
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="Not useful"
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                >
                  <ThumbsDown className="h-3 w-3" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sidebar */}
      <aside className="flex flex-col gap-2.5 lg:sticky lg:top-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
            Brief Outline
          </div>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {SECTION_ORDER.map((s, i) => {
              const present = Boolean(sections?.[s.key]);
              return (
                <li
                  key={s.key}
                  className={[
                    "flex items-center gap-2 text-[11px]",
                    present ? "text-slate-700" : "text-slate-300",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "font-mono inline-flex h-[18px] w-[18px] items-center justify-center rounded text-[9px] font-bold",
                      present
                        ? "bg-slate-100 text-slate-500"
                        : "bg-slate-50 text-slate-300",
                    ].join(" ")}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
            Generation
          </div>
          {pulseBrief ? (
            <div className="flex flex-col gap-1.5 text-[11px] text-slate-600">
              <span>
                Sections rendered:{" "}
                <strong className="font-mono text-slate-900">
                  {sections ? Object.values(sections).filter(Boolean).length : 0}
                </strong>
              </span>
              {pulseBrief.cached != null && (
                <span>
                  Cache:{" "}
                  <LitPill tone={pulseBrief.cached ? "green" : "slate"}>
                    {pulseBrief.cached ? "Hit" : "Fresh"}
                  </LitPill>
                </span>
              )}
              {pulseBrief.generatedAt && (
                <span className="font-mono text-[10px] text-slate-400">
                  {formatAbsolute(pulseBrief.generatedAt)}
                </span>
              )}
            </div>
          ) : (
            <p className="font-body text-[11px] text-slate-400">
              No generation metadata yet.
            </p>
          )}
        </div>

        {pulseBrief?.confidence != null && (
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Confidence
            </div>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full rounded bg-gradient-to-r from-emerald-500 to-green-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, Number(pulseBrief.confidence) * 100))}%`,
                  }}
                />
              </div>
              <span className="font-mono text-[12px] font-bold text-green-700">
                {Math.round(Number(pulseBrief.confidence) * 100)}%
              </span>
            </div>
            <p className="font-body text-[10px] leading-relaxed text-slate-500">
              Based on {pulseBrief.sources_count ?? "verified"} sources from the
              latest snapshot and public web context.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function SectionBody({ section }: { section: PulseSection | string }) {
  if (typeof section === "string") {
    return (
      <p className="font-body m-0 text-[13px] leading-relaxed text-slate-700">
        {section}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {section.body && (
        <p className="font-body m-0 text-[13px] leading-relaxed text-slate-700">
          {section.body}
        </p>
      )}
      {Array.isArray(section.bullets) && section.bullets.length > 0 && (
        <ul className="m-0 list-none p-0">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 py-1">
              <span
                className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blue-500"
                aria-hidden
              />
              <span className="font-body text-[12px] leading-relaxed text-slate-700">
                {b}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BriefActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-display inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: "rgba(255,255,255,0.08)",
        borderColor: "rgba(255,255,255,0.15)",
        color: "#F8FAFC",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

async function copyBriefToClipboard(brief: PulseBrief) {
  if (!brief?.sections) return;
  try {
    const text = SECTION_ORDER.map((s) => {
      const raw = brief.sections?.[s.key];
      if (!raw) return null;
      const body =
        typeof raw === "string"
          ? raw
          : [raw.body, ...(raw.bullets || []).map((b) => `• ${b}`)]
              .filter(Boolean)
              .join("\n");
      return `## ${s.label}\n\n${body}`;
    })
      .filter(Boolean)
      .join("\n\n");
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // clipboard unavailable — caller will see the disabled state
  }
}

function formatRelativeShort(value: string) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const delta = Date.now() - t;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (delta < hour) return "just now";
  if (delta < day) return `${Math.round(delta / hour)}h ago`;
  if (delta < 7 * day) return `${Math.round(delta / day)}d ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatAbsolute(value: string) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}