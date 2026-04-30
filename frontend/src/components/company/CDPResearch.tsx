import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Box,
  Building2,
  Container,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  Newspaper,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Truck,
  Users,
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

type CDPResearchProps = {
  companyName: string;
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

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <BriefHeader
          companyName={companyName}
          pulseBrief={pulseBrief}
          pulseLoading={pulseLoading}
          hasReport={hasReport}
          onPulse={onPulse}
          onRefresh={onRefresh}
          onShareHtml={onShareHtml}
          onExportPdf={onExportPdf}
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
            navigate={navigate}
          />
        )}
      </div>

      <PulseSidebar
        pulseBrief={pulseBrief}
        pulseUsage={pulseUsage}
        report={report}
      />
    </div>
  );
}

function BriefHeader({
  companyName,
  pulseBrief,
  pulseLoading,
  hasReport,
  onPulse,
  onRefresh,
  onShareHtml,
  onExportPdf,
  shareLoading,
  exportLoading,
}: {
  companyName: string;
  pulseBrief: PulseBrief;
  pulseLoading: boolean;
  hasReport: boolean;
  onPulse: () => void;
  onRefresh: () => void;
  onShareHtml: () => void;
  onExportPdf: () => void;
  shareLoading?: boolean;
  exportLoading?: boolean;
}) {
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
        style={{ color: "#F8FAFC" }}
      >
        {companyName}
      </h2>

      <div className="relative mt-3 flex flex-wrap gap-2">
        <BriefActionButton
          icon={pulseLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : hasReport ? <RefreshCw className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
          label={pulseLoading ? "Generating…" : hasReport ? "Refresh Pulse AI" : "Generate Pulse AI"}
          onClick={hasReport ? onRefresh : onPulse}
          disabled={pulseLoading}
        />
        <BriefActionButton
          icon={shareLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Share2 className="h-2.5 w-2.5" />}
          label="Share"
          onClick={onShareHtml}
          disabled={shareLoading || !hasReport}
        />
        <BriefActionButton
          icon={exportLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
          label="Export PDF"
          onClick={onExportPdf}
          disabled={exportLoading || !hasReport}
        />
        <BriefActionButton
          icon={<Copy className="h-2.5 w-2.5" />}
          label="Copy"
          onClick={() => copyReportToClipboard(pulseBrief?.report ?? null)}
          disabled={!hasReport}
        />
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
  navigate,
}: {
  report: PulseReport;
  companyName: string;
  navigate?: (path: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-3">
        <SummaryTile
          icon={<Building2 className="h-3 w-3" />}
          eyebrow="Company Summary"
          section={report.company_summary}
        />
        <SummaryTile
          icon={<TrendingUp className="h-3 w-3" />}
          eyebrow="Why Now"
          accent
          section={report.why_now}
        />
        <SummaryTile
          icon={<Target className="h-3 w-3" />}
          eyebrow="Sales Angle"
          accent
          section={report.sales_angle}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-2">
        <SourcedSection
          tone="lit"
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          title="LIT Verified Trade Data"
          subtitle="Shipments, lanes, carriers, containers, suppliers"
          section={report.lit_verified_trade_data}
        />
        <SourcedSection
          tone="web"
          icon={<Newspaper className="h-3.5 w-3.5" />}
          title="External Web Signals"
          subtitle="Public news, announcements, leadership, regulatory"
          section={report.external_web_signals}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-2">
        <Section
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          title="Buying Signals"
          section={report.buying_signals}
          tone="positive"
        />
        <Section
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          title="Risk Flags"
          section={report.risk_flags}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-2">
        <Section
          icon={<Container className="h-3.5 w-3.5" />}
          title="Carrier Opportunities"
          section={report.carrier_opportunities}
        />
        <Section
          icon={<Truck className="h-3.5 w-3.5" />}
          title="Forwarder Displacement"
          section={report.forwarder_displacement_opportunities}
        />
        <Section
          icon={<Box className="h-3.5 w-3.5" />}
          title="Container & Mode Insights"
          section={report.container_and_mode_insights}
        />
        <Section
          icon={<Globe2 className="h-3.5 w-3.5" />}
          title="Lane Insights"
          section={report.lane_insights}
        />
        <Section
          icon={<MapPin className="h-3.5 w-3.5" />}
          title="Supplier Insights"
          section={report.supplier_insights}
        />
        <Section
          icon={<Users className="h-3.5 w-3.5" />}
          title="Recommended Personas"
          section={report.recommended_personas}
        />
      </div>

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

      {hasContent(report.next_best_actions) && (
        <div className="border-b border-slate-100 px-5 py-4">
          <Section
            icon={<Send className="h-3.5 w-3.5" />}
            title="Next Best Actions"
            accent
            section={report.next_best_actions}
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
  const sectionsPresent = report
    ? SECTION_OUTLINE.filter((s) => Boolean(report[s.key])).length
    : 0;

  return (
    <aside className="flex flex-col gap-2.5 lg:sticky lg:top-2">
      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
          Brief Outline
        </div>
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {SECTION_OUTLINE.map((s, i) => {
            const present = Boolean(report?.[s.key]);
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
          Pulse AI usage
        </div>
        {pulseUsage?.plan || pulseUsage?.limit != null ? (
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
              reports / billing period
            </span>
            {pulseBrief?.cached != null && (
              <span>
                Cache:{" "}
                <LitPill tone={pulseBrief.cached ? "green" : "slate"}>
                  {pulseBrief.cached ? "Hit" : "Fresh"}
                </LitPill>
              </span>
            )}
            {pulseBrief?.generatedAt && (
              <span className="font-mono text-[10px] text-slate-400">
                Generated {formatAbsolute(pulseBrief.generatedAt)}
              </span>
            )}
          </div>
        ) : (
          <p className="font-body text-[11px] text-slate-400">
            Plan info appears after the first generation.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
          Generation
        </div>
        <div className="flex flex-col gap-1.5 text-[11px] text-slate-600">
          <span>
            Sections rendered:{" "}
            <strong className="font-mono text-slate-900">
              {sectionsPresent}
            </strong>
            <span className="text-slate-400"> / {SECTION_OUTLINE.length}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

const SECTION_OUTLINE: Array<{ key: keyof PulseReport; label: string }> = [
  { key: "company_summary", label: "Company Summary" },
  { key: "why_now", label: "Why Now" },
  { key: "sales_angle", label: "Sales Angle" },
  { key: "lit_verified_trade_data", label: "LIT Verified Trade Data" },
  { key: "external_web_signals", label: "External Web Signals" },
  { key: "buying_signals", label: "Buying Signals" },
  { key: "risk_flags", label: "Risk Flags" },
  { key: "carrier_opportunities", label: "Carrier Opportunities" },
  { key: "forwarder_displacement_opportunities", label: "Forwarder Displacement" },
  { key: "container_and_mode_insights", label: "Container & Mode Insights" },
  { key: "lane_insights", label: "Lane Insights" },
  { key: "supplier_insights", label: "Supplier Insights" },
  { key: "recommended_personas", label: "Recommended Personas" },
  { key: "recommended_contacts", label: "Recommended Contacts" },
  { key: "campaign_recommendations", label: "Campaign Recommendations" },
  { key: "email_openers", label: "Email Openers" },
  { key: "linkedin_openers", label: "LinkedIn Openers" },
  { key: "next_best_actions", label: "Next Best Actions" },
  { key: "similar_companies", label: "Similar Companies" },
  { key: "web_sources", label: "Web Sources" },
];

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

async function copyReportToClipboard(report: PulseReport | null) {
  if (!report) return;
  try {
    const lines: string[] = [];
    for (const { key, label } of SECTION_OUTLINE) {
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