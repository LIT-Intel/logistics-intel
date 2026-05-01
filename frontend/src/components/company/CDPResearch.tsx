import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Box,
  Building2,
  Clock,
  Container,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Linkedin,
  Loader2,
  Mail,
  Maximize2,
  MapPin,
  Megaphone,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";
import LitPill from "@/components/ui/LitPill";

/**
 * Phase 5 — Pulse AI tab (was "AI Research").
 *
 * Wired to the `pulse-ai-enrich` Supabase Edge Function. The function
 * returns either a cached or freshly generated report; the tab renders
 * ONLY sections that come back populated, never fabricated.
 *
 * Hard rules (per Phase 5 brief):
 *   - LIT verified trade data and external web signals are visually
 *     separated. We never blend a news/web sentence into a verified
 *     shipment metric block.
 *   - LIMIT_EXCEEDED is surfaced (not hidden) and points at upgrade.
 *   - Provider names (Tavily / Gemini / OpenAI / etc.) are NEVER shown.
 *   - Similar Companies route to /app/search?q=<encoded name>.
 */

type Bullet = string | { label?: string; body?: string; tone?: string };

type SectionShape =
  | string
  | string[]
  | {
      summary?: string;
      body?: string;
      headline?: string;
      bullets?: Bullet[];
      items?: Bullet[];
      [key: string]: unknown;
    };

type SimilarCompany = {
  name: string;
  reason?: string | null;
  search_query?: string | null;
  search_url?: string | null;
};

type RecommendedContact = {
  name?: string;
  title?: string;
  reason?: string;
  email?: string;
  linkedin?: string | null;
};

type WebSource = {
  title?: string;
  url?: string;
  domain?: string;
  date?: string;
};

type PulseReport = {
  company_summary?: SectionShape;
  why_now?: SectionShape;
  sales_angle?: SectionShape;
  lit_verified_trade_data?: SectionShape;
  external_web_signals?: SectionShape;
  buying_signals?: SectionShape;
  risk_flags?: SectionShape;
  carrier_opportunities?: SectionShape;
  forwarder_displacement_opportunities?: SectionShape;
  container_and_mode_insights?: SectionShape;
  lane_insights?: SectionShape;
  supplier_insights?: SectionShape;
  recommended_personas?: SectionShape;
  recommended_contacts?: RecommendedContact[];
  campaign_recommendations?: SectionShape;
  email_openers?: string[];
  linkedin_openers?: string[];
  next_best_actions?: SectionShape;
  similar_companies?: SimilarCompany[];
  web_sources?: WebSource[];
  confidence_score?: number | null;
  missing_data?: string[] | string | null;
};

type PulseBrief = {
  generatedAt?: string | null;
  cached?: boolean;
  report?: PulseReport | null;
  reportRow?: Record<string, any> | null;
  confidence?: number | null;
  model?: string | null;
} | null;

type PulseError = { code: string; message: string } | null;

type PulseUsage = { plan?: string | null; limit?: number | null } | null;

type TradeKpis = {
  shipments12m?: number | null;
  teu12m?: number | null;
  activeLanes?: number | null;
  topLaneLabel?: string | null;
  topLaneShare?: number | null;
  yoyPct?: number | null;
};

type CDPResearchProps = {
  companyName: string;
  companyMeta?: {
    ticker?: string | null;
    hq?: string | null;
    teuYr?: number | null;
    vertical?: string | null;
  };
  tradeKpis?: TradeKpis;
  pulseBrief: PulseBrief;
  pulseLoading: boolean;
  pulseError: PulseError;
  pulseUsage: PulseUsage;
  onPulse: () => void;
  onRefresh: () => void;
  onShareHtml: () => void;
  onExportPdf: () => void;
  shareLoading?: boolean;
  exportLoading?: boolean;
  navigate?: (path: string) => void;
};

export default function CDPResearch({
  companyName,
  companyMeta,
  tradeKpis,
  pulseBrief,
  pulseLoading,
  pulseError,
  pulseUsage,
  onPulse,
  onRefresh,
  onShareHtml,
  onExportPdf,
  shareLoading,
  exportLoading,
  navigate,
}: CDPResearchProps) {
  const report = pulseBrief?.report || null;
  const hasReport = Boolean(report && Object.keys(report).length > 0);
  const limitExceeded = pulseError?.code === "LIMIT_EXCEEDED";
  const [expanded, setExpanded] = useState(false);

  const onShareEmail = () => {
    if (typeof window === "undefined") return;
    const subject = `Pulse AI brief — ${companyName}`;
    const body = reportToMarkdown(companyName, pulseBrief);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const briefBody = (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <BriefHeader
        companyName={companyName}
        companyMeta={companyMeta}
        pulseBrief={pulseBrief}
        pulseLoading={pulseLoading}
        hasReport={hasReport}
        onPulse={onPulse}
        onRefresh={onRefresh}
        onShareHtml={onShareHtml}
        onExportPdf={onExportPdf}
        onShareEmail={onShareEmail}
        onExpand={() => setExpanded(true)}
        expanded={expanded}
        shareLoading={shareLoading}
        exportLoading={exportLoading}
      />

      {limitExceeded ? (
        <LimitExceededState message={pulseError!.message} usage={pulseUsage} />
      ) : pulseError ? (
        <ErrorState message={pulseError.message} onRetry={onPulse} />
      ) : pulseLoading ? (
        <LoadingState />
      ) : !hasReport ? (
        <EmptyState onPulse={onPulse} usage={pulseUsage} />
      ) : (
        <ReportBody
          report={report!}
          companyName={companyName}
          tradeKpis={tradeKpis}
          navigate={navigate}
        />
      )}
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        {briefBody}
        <PulseSidebar
          pulseBrief={pulseBrief}
          pulseUsage={pulseUsage}
          report={report}
        />
      </div>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative my-6 w-full max-w-5xl px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="absolute right-6 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-md hover:bg-slate-50"
              aria-label="Close expanded brief"
            >
              <X className="h-4 w-4" />
            </button>
            {briefBody}
          </div>
        </div>
      )}
    </>
  );
}

function BriefHeader({
  companyName,
  companyMeta,
  pulseBrief,
  pulseLoading,
  hasReport,
  onPulse,
  onRefresh,
  onShareHtml,
  onExportPdf,
  onShareEmail,
  onExpand,
  expanded,
  shareLoading,
  exportLoading,
}: {
  companyName: string;
  companyMeta?: CDPResearchProps["companyMeta"];
  pulseBrief: PulseBrief;
  pulseLoading: boolean;
  hasReport: boolean;
  onPulse: () => void;
  onRefresh: () => void;
  onShareHtml: () => void;
  onExportPdf: () => void;
  onShareEmail: () => void;
  onExpand: () => void;
  expanded?: boolean;
  shareLoading?: boolean;
  exportLoading?: boolean;
}) {
  const subtitleBits: string[] = [];
  if (companyMeta?.ticker) subtitleBits.push(companyMeta.ticker);
  if (companyMeta?.hq) subtitleBits.push(companyMeta.hq);
  if (companyMeta?.teuYr != null) subtitleBits.push(`~${Number(companyMeta.teuYr).toLocaleString()} TEU/yr`);
  if (companyMeta?.vertical) subtitleBits.push(companyMeta.vertical);
  const subtitle = subtitleBits.join(" · ");
  return (
    <div
      className="relative overflow-hidden p-5"
      style={{
        background: "linear-gradient(135deg, #0B1736 0%, #0F1D38 60%, #102240 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-50 w-50"
        style={{
          background: "radial-gradient(circle, rgba(0,240,255,0.18) 0%, transparent 60%)",
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
            Pulse AI · Account Intelligence
          </span>
        </div>
        {pulseBrief?.generatedAt && (
          <span
            className="font-mono text-[10px] font-semibold"
            style={{ color: "#94A3B8" }}
          >
            {pulseBrief.cached ? "Cached · " : ""}
            {formatRelativeShort(pulseBrief.generatedAt)}
          </span>
        )}
      </div>
      <h2
        className="font-display relative m-0 text-[22px] font-bold leading-tight tracking-tight"
        style={{ color: "#F8FAFC", letterSpacing: "-0.02em" }}
      >
        {companyName}
      </h2>
      {subtitle && (
        <div
          className="font-body relative mt-1 text-[13px]"
          style={{ color: "#CBD5E1" }}
        >
          {subtitle}
        </div>
      )}

      <div className="relative mt-3 flex flex-wrap gap-2">
        <BriefActionButton
          icon={pulseLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : hasReport ? <RefreshCw className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
          label={pulseLoading ? "Generating…" : hasReport ? "Refresh" : "Generate Pulse AI"}
          onClick={hasReport ? onRefresh : onPulse}
          disabled={pulseLoading}
        />
        <BriefActionButton
          icon={<Copy className="h-2.5 w-2.5" />}
          label="Copy"
          onClick={() => copyReportToClipboard(pulseBrief?.report ?? null)}
          disabled={!hasReport}
        />
        <BriefActionButton
          icon={shareLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Share2 className="h-2.5 w-2.5" />}
          label="Share link"
          onClick={onShareHtml}
          disabled={shareLoading || !hasReport}
        />
        <BriefActionButton
          icon={<Mail className="h-2.5 w-2.5" />}
          label="Email"
          onClick={onShareEmail}
          disabled={!hasReport}
        />
        <BriefActionButton
          icon={exportLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
          label="Export PDF"
          onClick={onExportPdf}
          disabled={exportLoading || !hasReport}
        />
        {!expanded && (
          <BriefActionButton
            icon={<Maximize2 className="h-2.5 w-2.5" />}
            label="Expand"
            onClick={onExpand}
            disabled={!hasReport}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({
  onPulse,
  usage,
}: {
  onPulse: () => void;
  usage: PulseUsage;
}) {
  return (
    <div className="border-t border-slate-100 px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
        <Sparkles className="h-4 w-4 text-blue-500" />
      </div>
      <p className="font-display mb-1 text-[14px] font-semibold text-slate-900">
        Generate Pulse AI
      </p>
      <p className="font-body mx-auto mb-4 max-w-md text-[12px] text-slate-500">
        Generate a freight sales intelligence brief using verified trade data,
        contacts, shipment activity, and external company signals.
      </p>
      <button
        type="button"
        onClick={onPulse}
        className="font-display inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm"
      >
        <Sparkles className="h-3 w-3" />
        Generate Pulse AI
      </button>
      {usage?.limit != null && (
        <p className="font-body mt-3 text-[10px] text-slate-400">
          {usage.plan ? `${capitalize(usage.plan)} plan · ` : ""}
          {usage.limit} reports / billing period
        </p>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="border-t border-slate-100 px-5 py-12 text-center">
      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-blue-500" />
      <p className="font-display mb-1 text-[13px] font-semibold text-slate-700">
        Generating Pulse AI…
      </p>
      <p className="font-body mx-auto max-w-md text-[12px] text-slate-500">
        Analyzing shipment patterns, carrier mix, containers, suppliers,
        contacts, and public company signals.
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="border-t border-slate-100 px-5 py-6">
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
        <div className="font-display mb-1 text-[12px] font-semibold text-rose-700">
          Pulse AI failed
        </div>
        <div className="font-body text-[11px] text-rose-700">{message}</div>
        <button
          type="button"
          onClick={onRetry}
          className="font-display mt-2 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700"
        >
          <RefreshCw className="h-3 w-3" />
          Try again
        </button>
      </div>
    </div>
  );
}

function LimitExceededState({
  message,
  usage,
}: {
  message: string;
  usage: PulseUsage;
}) {
  return (
    <div className="border-t border-slate-100 px-5 py-8">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-5">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-700" />
          <span className="font-display text-[13px] font-semibold text-amber-900">
            Pulse AI report limit reached
          </span>
        </div>
        <p className="font-body mb-3 text-[12px] text-amber-800">{message}</p>
        {usage?.limit != null && (
          <p className="font-body mb-3 text-[11px] text-amber-700">
            {usage.plan ? `${capitalize(usage.plan)} plan` : "Current plan"}
            {" · "}
            {usage.limit} reports / billing period.
          </p>
        )}
        <a
          href="/app/billing"
          className="font-display inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-amber-500 to-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm"
        >
          <Zap className="h-3 w-3" />
          Upgrade plan
        </a>
      </div>
    </div>
  );
}

function ReportBody({
  report,
  companyName,
  tradeKpis,
  navigate,
}: {
  report: PulseReport;
  companyName: string;
  tradeKpis?: TradeKpis;
  navigate?: (path: string) => void;
}) {
  const exec = mergeText(report.company_summary, report.why_now);
  const angle = sectionText(report.sales_angle);
  const opportunityBlocks = buildOpportunityBlocks(report);
  const riskBullets = sectionAllBullets(report.risk_flags);
  const hookCopy =
    Array.isArray(report.email_openers) && report.email_openers.length
      ? report.email_openers[0]
      : sectionText(report.next_best_actions);

  return (
    <div className="flex flex-col">
      {/* 01 Executive */}
      <BriefSection idx="01" title="Executive Account Summary" icon={<FileText className="h-3.5 w-3.5" />}>
        {exec ? (
          <p
            className="font-body m-0 text-[13px] leading-[1.65]"
            style={{ color: "#374151" }}
            dangerouslySetInnerHTML={{ __html: emphasizeNumbers(exec) }}
          />
        ) : (
          <EmptyLine text="Summary not yet generated." />
        )}
        {angle && (
          <p
            className="font-body mt-2 text-[12px] leading-[1.55] italic"
            style={{ color: "#475569" }}
          >
            {angle}
          </p>
        )}
      </BriefSection>

      {/* 02 Trade Activity Snapshot */}
      <BriefSection idx="02" title="Trade Activity Snapshot" icon={<BarChart3 className="h-3.5 w-3.5" />}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SnapshotTile
            label="12m Volume (TEU)"
            value={tradeKpis?.teu12m != null ? Math.round(tradeKpis.teu12m).toLocaleString() : "—"}
            sub={tradeKpis?.yoyPct != null ? `${tradeKpis.yoyPct >= 0 ? "↑ +" : "↓ "}${Math.abs(tradeKpis.yoyPct)}% YoY` : null}
            up={tradeKpis?.yoyPct != null ? tradeKpis.yoyPct >= 0 : null}
          />
          <SnapshotTile
            label="Shipments (12m)"
            value={tradeKpis?.shipments12m != null ? Number(tradeKpis.shipments12m).toLocaleString() : "—"}
            sub="BOL records"
          />
          <SnapshotTile
            label="Active Lanes"
            value={tradeKpis?.activeLanes != null ? String(tradeKpis.activeLanes) : "—"}
            sub={null}
          />
          <SnapshotTile
            label="Top Lane"
            value={tradeKpis?.topLaneShare != null ? `${Math.round(tradeKpis.topLaneShare * 100)}%` : "—"}
            sub={tradeKpis?.topLaneLabel || null}
            up={true}
          />
        </div>
      </BriefSection>

      {/* 03 Top Lanes */}
      <BriefSection idx="03" title="Top Lanes & Lane Movement" icon={<TrendingUp className="h-3.5 w-3.5" />}>
        {hasContent(report.lane_insights) ? (
          <BulletProse section={report.lane_insights} />
        ) : (
          <EmptyLine text="Lane intelligence will appear once trade lane data is on file." />
        )}
      </BriefSection>

      {/* 04 Opportunity Signals (accent) */}
      <BriefSection
        idx="04"
        title="Opportunity Signals"
        icon={<Target className="h-3.5 w-3.5" />}
        accent
      >
        {opportunityBlocks.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {opportunityBlocks.map((b) => (
              <OpportunityCard key={b.label} block={b} />
            ))}
          </div>
        ) : (
          <EmptyLine text="No opportunity signals surfaced yet." />
        )}
      </BriefSection>

      {/* 05 Risk & Problem Lanes */}
      <BriefSection idx="05" title="Risk & Problem Lanes" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
        {riskBullets.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {riskBullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#EF4444" }} />
                <span
                  className="font-body text-[12px] leading-[1.55]"
                  style={{ color: "#374151" }}
                  dangerouslySetInnerHTML={{ __html: bulletToHtml(bullet) }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyLine text="No risk flags on file." />
        )}
      </BriefSection>

      {/* 06 Suggested Outreach Hook (accent + gradient) */}
      <BriefSection idx="06" title="Suggested Outreach Hook" icon={<Send className="h-3.5 w-3.5" />} accent>
        {hookCopy ? (
          <HookCard copy={hookCopy} />
        ) : (
          <EmptyLine text="Hook will appear once outreach openers are generated." />
        )}
      </BriefSection>

      {/* Continuation: secondary sections (kept after numbered six) */}
      {Array.isArray(report.recommended_contacts) &&
        report.recommended_contacts.length > 0 && (
          <div className="border-b border-slate-100 px-5 py-4">
            <SectionHeader
              icon={<Users className="h-3.5 w-3.5" />}
              title="Recommended Contacts"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {report.recommended_contacts.map((c, i) => (
                <RecommendedContactCard key={`${c.name}-${i}`} contact={c} />
              ))}
            </div>
          </div>
        )}

      {(hasContent(report.email_openers) || hasContent(report.linkedin_openers) || hasContent(report.campaign_recommendations)) && (
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-3">
          <Section
            icon={<Megaphone className="h-3.5 w-3.5" />}
            title="Campaign Recommendations"
            section={report.campaign_recommendations}
          />
          <OpenersCard
            icon={<Mail className="h-3.5 w-3.5" />}
            title="Email Openers"
            openers={report.email_openers}
          />
          <OpenersCard
            icon={<Linkedin className="h-3.5 w-3.5" />}
            title="LinkedIn Openers"
            openers={report.linkedin_openers}
          />
        </div>
      )}

      {Array.isArray(report.similar_companies) &&
        report.similar_companies.length > 0 && (
          <div className="border-b border-slate-100 px-5 py-4">
            <SectionHeader
              icon={<Sparkles className="h-3.5 w-3.5" />}
              title="Similar Companies"
              subtitle={`Click to search LIT for similar ${companyName} accounts`}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {report.similar_companies.slice(0, 5).map((sc, i) => (
                <SimilarCompanyCard
                  key={`${sc.name}-${i}`}
                  similar={sc}
                  onSelect={(query) => {
                    if (typeof window === "undefined") return;
                    const url = `/app/search?q=${encodeURIComponent(query)}`;
                    if (navigate) navigate(url);
                    else window.location.assign(url);
                  }}
                />
              ))}
            </div>
          </div>
        )}

      <FooterRow report={report} />
    </div>
  );
}

function BriefSection({
  idx,
  title,
  icon,
  accent,
  children,
}: {
  idx: string;
  title: string;
  icon?: React.ReactNode;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative border-b border-[#F1F5F9] px-5 py-[18px] last:border-b-0">
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="font-mono inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-[10px] font-bold"
          style={{
            background: accent ? "#0F172A" : "#F1F5F9",
            color: accent ? "#00F0FF" : "#64748B",
          }}
        >
          {idx}
        </span>
        {icon && (
          <span style={{ color: accent ? "#1d4ed8" : "#64748B" }}>{icon}</span>
        )}
        <h3
          className="font-display m-0 text-[14px] font-bold"
          style={{ color: "#0F172A", letterSpacing: "-0.01em" }}
        >
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function SnapshotTile({
  label,
  value,
  sub,
  up,
}: {
  label: string;
  value: string;
  sub?: string | null;
  up?: boolean | null;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: "#FAFBFC", border: "1px solid #F1F5F9" }}
    >
      <div
        className="font-display text-[9px] font-bold uppercase"
        style={{ color: "#94A3B8", letterSpacing: "0.08em" }}
      >
        {label}
      </div>
      <div
        className="font-mono mt-0.5 text-[16px] font-bold"
        style={{ color: "#0F172A" }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="font-body text-[10px]"
          style={{ color: up === true ? "#15803D" : up === false ? "#B91C1C" : "#64748B" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ block }: { block: OpportunityBlock }) {
  const palette = OPPORTUNITY_PALETTE[block.tone];
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: palette.bg, border: `1px solid ${palette.bd}` }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="font-display text-[10px] font-bold uppercase"
          style={{ color: palette.fg, letterSpacing: "0.06em" }}
        >
          {block.label}
        </span>
      </div>
      <p
        className="font-body m-0 text-[12px] leading-[1.55]"
        style={{ color: "#374151" }}
        dangerouslySetInnerHTML={{ __html: emphasizeNumbers(block.body) }}
      />
    </div>
  );
}

function HookCard({ copy }: { copy: string }) {
  return (
    <div
      className="rounded-lg px-3.5 py-3"
      style={{
        background: "linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)",
        border: "1px solid #BFDBFE",
      }}
    >
      <div
        className="font-display mb-1.5 text-[10px] font-bold uppercase"
        style={{ color: "#1d4ed8", letterSpacing: "0.08em" }}
      >
        Opening angle
      </div>
      <p
        className="font-body m-0 text-[13px] italic leading-[1.6]"
        style={{ color: "#1E293B" }}
      >
        {copy.startsWith('"') ? copy : `"${copy.replace(/^["']|["']$/g, "")}"`}
      </p>
    </div>
  );
}

function BulletProse({ section }: { section?: SectionShape }) {
  const text = sectionText(section);
  const bullets = sectionAllBullets(section);
  if (!text && bullets.length === 0) return <EmptyLine text="No data on file." />;
  return (
    <>
      {text && (
        <p
          className="font-body m-0 mb-2 text-[12px] leading-[1.55]"
          style={{ color: "#374151" }}
          dangerouslySetInnerHTML={{ __html: emphasizeNumbers(text) }}
        />
      )}
      {bullets.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full" style={{ background: "#94A3B8" }} />
              <span
                className="font-body text-[12px] leading-[1.55]"
                style={{ color: "#374151" }}
                dangerouslySetInnerHTML={{ __html: bulletToHtml(b) }}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p
      className="font-body m-0 text-[11px]"
      style={{ color: "#94A3B8" }}
    >
      {text}
    </p>
  );
}

type OpportunityBlock = { label: string; tone: "green" | "blue" | "purple"; body: string };
const OPPORTUNITY_PALETTE: Record<OpportunityBlock["tone"], { fg: string; bg: string; bd: string }> = {
  green:  { fg: "#15803D", bg: "#F0FDF4", bd: "#BBF7D0" },
  blue:   { fg: "#1d4ed8", bg: "#EFF6FF", bd: "#BFDBFE" },
  purple: { fg: "#6D28D9", bg: "#F5F3FF", bd: "#DDD6FE" },
};

function buildOpportunityBlocks(report: PulseReport): OpportunityBlock[] {
  const out: OpportunityBlock[] = [];
  const buying = sectionText(report.buying_signals) || sectionAllBullets(report.buying_signals).map(bulletToText).join(" ");
  const carrier = sectionText(report.carrier_opportunities) || sectionAllBullets(report.carrier_opportunities).map(bulletToText).join(" ");
  const forwarder = sectionText(report.forwarder_displacement_opportunities) || sectionAllBullets(report.forwarder_displacement_opportunities).map(bulletToText).join(" ");
  const lane = sectionText(report.lane_insights) || sectionAllBullets(report.lane_insights).map(bulletToText).join(" ");
  const supplier = sectionText(report.supplier_insights) || sectionAllBullets(report.supplier_insights).map(bulletToText).join(" ");
  if (buying) out.push({ label: "Buying signals", tone: "green", body: buying });
  if (forwarder) out.push({ label: "Forwarder displacement", tone: "green", body: forwarder });
  if (carrier) out.push({ label: "Carrier opportunity", tone: "blue", body: carrier });
  if (supplier) out.push({ label: "Supplier signal", tone: "purple", body: supplier });
  if (lane && out.length < 4) out.push({ label: "Lane consolidation", tone: "purple", body: lane });
  return out.slice(0, 4);
}

function sectionAllBullets(section: SectionShape | undefined): Bullet[] {
  if (!section) return [];
  if (typeof section === "string") return [];
  if (Array.isArray(section)) return section as Bullet[];
  if (Array.isArray(section.bullets)) return section.bullets as Bullet[];
  if (Array.isArray(section.items)) return section.items as Bullet[];
  return [];
}

function bulletToText(bullet: Bullet): string {
  if (typeof bullet === "string") return bullet;
  return bullet?.body || bullet?.label || "";
}

function bulletToHtml(bullet: Bullet): string {
  const t = bulletToText(bullet);
  return emphasizeNumbers(t);
}

function emphasizeNumbers(text: string): string {
  if (!text) return "";
  // Bold key numeric tokens (percentages, +/-, numbers with commas, $ amounts).
  return text.replace(
    /(\$[\d,]+(?:\.\d+)?[KMB]?|\b[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b[+-]?\d+(?:\.\d+)?%|\b\d+\s*(?:TEU|BOL|shipments?|lanes?)\b)/gi,
    '<strong style="color:#0F172A">$1</strong>',
  );
}

function mergeText(a: SectionShape | undefined, b: SectionShape | undefined): string {
  const at = sectionText(a);
  const bt = sectionText(b);
  if (at && bt) return `${at} ${bt}`;
  return at || bt || "";
}

function reportToMarkdown(name: string, brief: PulseBrief): string {
  const r = brief?.report;
  if (!r) return `Pulse AI brief for ${name}\n\n(brief not yet generated)`;
  const lines: string[] = [`Pulse AI Brief — ${name}`, ""];
  const push = (label: string, body: string) => {
    if (!body) return;
    lines.push(`## ${label}`);
    lines.push(body);
    lines.push("");
  };
  push("Executive summary", mergeText(r.company_summary, r.why_now));
  push("Sales angle", sectionText(r.sales_angle));
  push("LIT verified trade data", sectionText(r.lit_verified_trade_data));
  push("External web signals", sectionText(r.external_web_signals));
  push("Buying signals", sectionText(r.buying_signals));
  push("Risk flags", sectionAllBullets(r.risk_flags).map((b) => `• ${bulletToText(b)}`).join("\n"));
  push("Carrier opportunities", sectionText(r.carrier_opportunities));
  push("Forwarder displacement", sectionText(r.forwarder_displacement_opportunities));
  push("Lane insights", sectionText(r.lane_insights));
  push("Supplier insights", sectionText(r.supplier_insights));
  if (Array.isArray(r.email_openers) && r.email_openers.length) {
    lines.push("## Email opener");
    lines.push(r.email_openers[0]);
    lines.push("");
  }
  return lines.join("\n");
}

function SummaryTile({
  icon,
  eyebrow,
  section,
  accent,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  section: SectionShape | undefined;
  accent?: boolean;
}) {
  const text = sectionText(section);
  const empty = !text && !sectionBullets(section).length;
  return (
    <div
      className={[
        "rounded-lg border px-3.5 py-3",
        accent
          ? "border-blue-100 bg-blue-50/60"
          : "border-slate-100 bg-slate-50/60",
      ].join(" ")}
    >
      <div className="font-display mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        <span className={accent ? "text-blue-700" : "text-slate-500"}>{icon}</span>
        {eyebrow}
      </div>
      {empty ? (
        <p className="font-body text-[11px] text-slate-400">—</p>
      ) : (
        <>
          {text && (
            <p className="font-body text-[12px] leading-relaxed text-slate-700">
              {text}
            </p>
          )}
          <BulletList bullets={sectionBullets(section)} />
        </>
      )}
    </div>
  );
}

function SourcedSection({
  tone,
  icon,
  title,
  subtitle,
  section,
}: {
  tone: "lit" | "web";
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  section: SectionShape | undefined;
}) {
  const text = sectionText(section);
  const bullets = sectionBullets(section);
  const empty = !text && bullets.length === 0;
  const palette =
    tone === "lit"
      ? {
          border: "border-emerald-200",
          bg: "bg-emerald-50/40",
          chipBg: "bg-emerald-100",
          chipText: "text-emerald-800",
          eyebrow: "text-emerald-700",
        }
      : {
          border: "border-amber-200",
          bg: "bg-amber-50/40",
          chipBg: "bg-amber-100",
          chipText: "text-amber-800",
          eyebrow: "text-amber-700",
        };

  return (
    <div className={["rounded-lg border", palette.border, palette.bg, "p-3.5"].join(" ")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div
            className={[
              "font-display inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]",
              palette.eyebrow,
            ].join(" ")}
          >
            {icon}
            {title}
          </div>
          {subtitle && (
            <div className="font-body mt-0.5 text-[10px] text-slate-500">
              {subtitle}
            </div>
          )}
        </div>
        <span
          className={[
            "font-display whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]",
            palette.chipBg,
            palette.chipText,
          ].join(" ")}
        >
          {tone === "lit" ? "LIT verified" : "Web"}
        </span>
      </div>
      {empty ? (
        <p className="font-body text-[11px] italic text-slate-400">
          {tone === "lit"
            ? "No verified trade data summary on this report."
            : "No public web signals on this report."}
        </p>
      ) : (
        <>
          {text && (
            <p className="font-body mb-1 text-[12px] leading-relaxed text-slate-700">
              {text}
            </p>
          )}
          <BulletList bullets={bullets} />
        </>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  section,
  tone,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  section: SectionShape | undefined;
  tone?: "positive" | "warning" | "neutral";
  accent?: boolean;
}) {
  const text = sectionText(section);
  const bullets = sectionBullets(section);
  const empty = !text && bullets.length === 0;
  if (empty) return null;
  return (
    <div
      className={[
        "rounded-lg border p-3.5",
        accent
          ? "border-blue-200 bg-blue-50/60"
          : tone === "positive"
            ? "border-green-200 bg-green-50/40"
            : tone === "warning"
              ? "border-rose-200 bg-rose-50/40"
              : "border-slate-200 bg-white",
      ].join(" ")}
    >
      <div className="font-display mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-tight text-slate-900">
        <span
          className={
            tone === "positive"
              ? "text-green-700"
              : tone === "warning"
                ? "text-rose-700"
                : accent
                  ? "text-blue-700"
                  : "text-slate-500"
          }
        >
          {icon}
        </span>
        {title}
      </div>
      {text && (
        <p className="font-body mb-1 text-[12px] leading-relaxed text-slate-700">
          {text}
        </p>
      )}
      <BulletList bullets={bullets} tone={tone} />
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-blue-700">{icon}</span>
      <div>
        <div className="font-display text-[13px] font-bold tracking-tight text-slate-900">
          {title}
        </div>
        {subtitle && (
          <div className="font-body text-[10px] text-slate-500">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function BulletList({
  bullets,
  tone,
}: {
  bullets: Bullet[];
  tone?: "positive" | "warning" | "neutral";
}) {
  if (!Array.isArray(bullets) || bullets.length === 0) return null;
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {bullets.map((b, i) => {
        const text = typeof b === "string" ? b : b?.body || b?.label || "";
        const label = typeof b === "string" ? null : b?.label;
        if (!text) return null;
        return (
          <li key={i} className="flex items-start gap-1.5">
            <span
              className={[
                "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                tone === "warning"
                  ? "bg-rose-500"
                  : tone === "positive"
                    ? "bg-green-500"
                    : "bg-blue-500",
              ].join(" ")}
              aria-hidden
            />
            <span className="font-body text-[12px] leading-relaxed text-slate-700">
              {label && <strong className="text-slate-900">{label}: </strong>}
              {text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RecommendedContactCard({ contact }: { contact: RecommendedContact }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="font-display text-[12px] font-bold text-slate-900">
        {contact.name || "Unnamed contact"}
      </div>
      {contact.title && (
        <div className="font-body mt-0.5 text-[11px] text-slate-600">
          {contact.title}
        </div>
      )}
      {contact.reason && (
        <div className="font-body mt-1 text-[11px] leading-snug text-slate-500">
          {contact.reason}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="font-display inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-white"
          >
            <Mail className="h-2.5 w-2.5" />
            Email
          </a>
        )}
        {contact.linkedin && (
          <a
            href={contact.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-white"
          >
            <Linkedin className="h-2.5 w-2.5" />
            LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}

function OpenersCard({
  icon,
  title,
  openers,
}: {
  icon: React.ReactNode;
  title: string;
  openers?: string[];
}) {
  if (!Array.isArray(openers) || openers.length === 0) return null;
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3.5">
      <div className="font-display mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-tight text-slate-900">
        <span className="text-blue-700">{icon}</span>
        {title}
      </div>
      <div className="space-y-2">
        {openers.slice(0, 3).map((line, i) => (
          <div
            key={i}
            className="rounded-md border border-blue-100 bg-white p-2"
          >
            <p className="font-body text-[11.5px] leading-relaxed text-slate-700">
              {line}
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(line).catch(() => undefined);
                }
              }}
              className="font-display mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700"
            >
              <Copy className="h-2 w-2" />
              Copy
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimilarCompanyCard({
  similar,
  onSelect,
}: {
  similar: SimilarCompany;
  onSelect: (query: string) => void;
}) {
  const query = similar.search_query || similar.name;
  return (
    <button
      type="button"
      onClick={() => onSelect(query)}
      className="group flex w-full items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50/40"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
        <Building2 className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[12px] font-bold text-slate-900">
          {similar.name}
        </div>
        {similar.reason && (
          <div className="font-body mt-0.5 line-clamp-2 text-[11px] text-slate-500">
            {similar.reason}
          </div>
        )}
        <div className="font-display mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700">
          Search in LIT
          <ArrowRight className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}

function FooterRow({ report }: { report: PulseReport }) {
  const sources = Array.isArray(report.web_sources) ? report.web_sources : [];
  const missing = normalizeStringList(report.missing_data);
  const confidence =
    typeof report.confidence_score === "number" ? report.confidence_score : null;

  return (
    <div className="bg-[#FAFBFC] px-5 py-4">
      {sources.length > 0 && (
        <div className="mb-4">
          <div className="font-display mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            <Globe2 className="h-3 w-3" />
            Web Sources
          </div>
          <div className="space-y-1">
            {sources.slice(0, 8).map((src, i) => {
              const href = src.url || "#";
              const label =
                src.title || src.domain || (src.url ? hostname(src.url) : "Source");
              return (
                <a
                  key={`${src.url}-${i}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body block truncate text-[11px] text-slate-600 hover:text-blue-700"
                >
                  <ExternalLink className="mr-1 inline h-2.5 w-2.5 text-slate-400" />
                  {label}
                  {src.date && (
                    <span className="font-mono ml-1 text-[10px] text-slate-400">
                      {formatRelativeShort(src.date)}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50/60 p-3">
          <div className="font-display mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Missing or limited data
          </div>
          <p className="font-body mb-1 text-[10px] text-amber-700">
            This is context, not a failure — Pulse AI flags fields that
            weren't reachable so the report stays honest.
          </p>
          <ul className="m-0 list-none space-y-0.5 p-0">
            {missing.slice(0, 6).map((m, i) => (
              <li
                key={i}
                className="font-body flex items-start gap-1.5 text-[11px] text-amber-800"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="font-body text-[11px] text-slate-500">
          Was this brief useful?
        </span>
        <div className="flex items-center gap-1.5">
          {confidence != null && (
            <LitPill tone={confidence >= 0.7 ? "green" : confidence >= 0.4 ? "blue" : "slate"}>
              Confidence {Math.round(confidence * 100)}%
            </LitPill>
          )}
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
    </div>
  );
}

function PulseSidebar({
  pulseBrief,
  pulseUsage,
  report,
}: {
  pulseBrief: PulseBrief;
  pulseUsage: PulseUsage;
  report: PulseReport | null;
}) {
  const confidence = clampConfidence(
    pulseBrief?.confidence ?? report?.confidence_score ?? null,
  );
  const supporting = computeSupportingCounts(report, pulseBrief);

  return (
    <aside className="flex flex-col gap-2.5 lg:sticky lg:top-2">
      <div className="rounded-xl border border-slate-200 bg-white p-3 px-3.5">
        <div
          className="font-display mb-2 text-[10px] font-bold uppercase"
          style={{ color: "#94A3B8", letterSpacing: "0.08em" }}
        >
          Brief Outline
        </div>
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {BRIEF_OUTLINE_6.map((s, i) => {
            const present = isOutlinePresent(s.key, report);
            return (
              <li
                key={s.key}
                className={[
                  "flex items-center gap-2 text-[11px]",
                  present ? "text-slate-700" : "text-slate-300",
                ].join(" ")}
              >
                <span
                  className="font-mono inline-flex h-[18px] w-[18px] items-center justify-center rounded text-[9px] font-bold"
                  style={{
                    background: present ? "#F1F5F9" : "#F8FAFC",
                    color: present ? "#94A3B8" : "#CBD5E1",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 px-3.5">
        <div
          className="font-display mb-2 text-[10px] font-bold uppercase"
          style={{ color: "#94A3B8", letterSpacing: "0.08em" }}
        >
          Supporting Data
        </div>
        <div className="flex flex-col">
          <SupportingRow icon={<FileText className="h-2.5 w-2.5" />} label="BOL records" value={supporting.bol} />
          <SupportingRow icon={<Newspaper className="h-2.5 w-2.5" />} label="Web sources" value={supporting.webSources} />
          <SupportingRow icon={<ShieldCheck className="h-2.5 w-2.5" />} label="Verified contacts" value={supporting.contacts} />
          <SupportingRow icon={<Clock className="h-2.5 w-2.5" />} label="Last update" value={supporting.lastUpdate} last />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 px-3.5">
        <div
          className="font-display mb-2 text-[10px] font-bold uppercase"
          style={{ color: "#94A3B8", letterSpacing: "0.08em" }}
        >
          Confidence
        </div>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded" style={{ background: "#F1F5F9" }}>
            <div
              className="h-full rounded"
              style={{
                width: `${confidence != null ? confidence : 0}%`,
                background: "linear-gradient(90deg, #10B981, #22C55E)",
              }}
            />
          </div>
          <span
            className="font-mono text-[12px] font-bold"
            style={{ color: confidence != null ? "#15803D" : "#94A3B8" }}
          >
            {confidence != null ? `${confidence}%` : "—"}
          </span>
        </div>
        <p
          className="font-body m-0 text-[10px] leading-[1.5]"
          style={{ color: "#64748B" }}
        >
          {confidence != null
            ? "Based on verified shipment data, public web signals, and contact coverage."
            : "Confidence appears once a brief is generated."}
        </p>
      </div>

      {(pulseUsage?.plan || pulseUsage?.limit != null) && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 px-3.5">
          <div
            className="font-display mb-2 text-[10px] font-bold uppercase"
            style={{ color: "#94A3B8", letterSpacing: "0.08em" }}
          >
            Pulse AI usage
          </div>
          <div className="flex flex-col gap-1.5 text-[11px] text-slate-600">
            <span>
              Plan:{" "}
              <strong className="font-display text-slate-900">
                {pulseUsage?.plan ? capitalize(pulseUsage.plan) : "—"}
              </strong>
            </span>
            <span>
              Cap:{" "}
              <strong className="font-mono text-slate-900">
                {pulseUsage?.limit ?? "—"}
              </strong>{" "}
              reports / period
            </span>
            {pulseBrief?.cached != null && (
              <span>
                Cache:{" "}
                <LitPill tone={pulseBrief.cached ? "green" : "slate"}>
                  {pulseBrief.cached ? "Hit" : "Fresh"}
                </LitPill>
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function SupportingRow({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-1"
      style={{ borderBottom: last ? "none" : "1px solid #F1F5F9" }}
    >
      <span
        className="font-body inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: "#475569" }}
      >
        <span style={{ color: "#94A3B8" }}>{icon}</span>
        {label}
      </span>
      <span
        className="font-mono text-[11px] font-semibold"
        style={{ color: "#0F172A" }}
      >
        {value}
      </span>
    </div>
  );
}

type OutlineKey =
  | "executive"
  | "snapshot"
  | "lanes"
  | "opportunity"
  | "risk"
  | "hook";

const BRIEF_OUTLINE_6: Array<{ key: OutlineKey; label: string }> = [
  { key: "executive", label: "Executive Summary" },
  { key: "snapshot", label: "Trade Snapshot" },
  { key: "lanes", label: "Lane Movement" },
  { key: "opportunity", label: "Opportunity Signals" },
  { key: "risk", label: "Risk Lanes" },
  { key: "hook", label: "Outreach Hook" },
];

function isOutlinePresent(key: OutlineKey, report: PulseReport | null): boolean {
  if (!report) return false;
  switch (key) {
    case "executive":
      return Boolean(sectionText(report.company_summary) || sectionText(report.why_now));
    case "snapshot":
      return true; // tiles render even if KPIs unknown
    case "lanes":
      return hasContent(report.lane_insights);
    case "opportunity":
      return (
        hasContent(report.buying_signals) ||
        hasContent(report.carrier_opportunities) ||
        hasContent(report.forwarder_displacement_opportunities) ||
        hasContent(report.supplier_insights)
      );
    case "risk":
      return hasContent(report.risk_flags);
    case "hook":
      return Array.isArray(report.email_openers) && report.email_openers.length > 0;
    default:
      return false;
  }
}

function clampConfidence(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Confidence may be 0-1 or 0-100. Normalize to 0-100.
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function computeSupportingCounts(report: PulseReport | null, brief: PulseBrief) {
  const webSources = Array.isArray(report?.web_sources) ? report!.web_sources!.length : 0;
  const contacts = Array.isArray(report?.recommended_contacts) ? report!.recommended_contacts!.length : 0;
  return {
    bol: "—",
    webSources: webSources > 0 ? String(webSources) : "—",
    contacts: contacts > 0 ? String(contacts) : "—",
    lastUpdate: brief?.generatedAt ? formatRelativeShort(brief.generatedAt) : "—",
  };
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

function sectionText(section: SectionShape | undefined): string {
  if (!section) return "";
  if (typeof section === "string") return section;
  if (Array.isArray(section)) return "";
  return String(
    section.summary || section.body || section.headline || "",
  );
}

function sectionBullets(section: SectionShape | undefined): Bullet[] {
  if (!section) return [];
  if (typeof section === "string") return [];
  if (Array.isArray(section)) return section as Bullet[];
  if (Array.isArray(section.bullets)) return section.bullets;
  if (Array.isArray(section.items)) return section.items;
  return [];
}

function hasContent(section: SectionShape | undefined): boolean {
  if (!section) return false;
  return Boolean(sectionText(section)) || sectionBullets(section).length > 0;
}

function normalizeStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : (v as any)?.label || (v as any)?.body || ""))
      .filter(Boolean);
  }
  if (typeof value === "string") return [value];
  return [];
}

const COPY_OUTLINE: Array<{ key: keyof PulseReport; label: string }> = [
  { key: "company_summary", label: "Company Summary" },
  { key: "why_now", label: "Why Now" },
  { key: "sales_angle", label: "Sales Angle" },
  { key: "lit_verified_trade_data", label: "LIT Verified Trade Data" },
  { key: "external_web_signals", label: "External Web Signals" },
  { key: "buying_signals", label: "Buying Signals" },
  { key: "risk_flags", label: "Risk Flags" },
  { key: "carrier_opportunities", label: "Carrier Opportunities" },
  { key: "forwarder_displacement_opportunities", label: "Forwarder Displacement" },
  { key: "lane_insights", label: "Lane Insights" },
  { key: "supplier_insights", label: "Supplier Insights" },
  { key: "next_best_actions", label: "Next Best Actions" },
];

async function copyReportToClipboard(report: PulseReport | null) {
  if (!report) return;
  try {
    const lines: string[] = [];
    for (const { key, label } of COPY_OUTLINE) {
      const val = report[key];
      if (!val) continue;
      lines.push(`## ${label}`);
      const text = sectionText(val as SectionShape);
      if (text) lines.push(text);
      const bullets = sectionBullets(val as SectionShape);
      for (const b of bullets) {
        const t = typeof b === "string" ? b : b?.body || b?.label || "";
        if (t) lines.push(`• ${t}`);
      }
      lines.push("");
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(lines.join("\n"));
    }
  } catch {
    // clipboard unavailable
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

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function capitalize(str: string) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}