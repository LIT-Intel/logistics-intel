import { useState } from "react";
import {
  ArrowLeft,
  Bell,
  Building2,
  Download,
  ExternalLink,
  FolderPlus,
  Globe,
  Loader2,
  MapPin,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Send,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import LitCategoryChip from "@/components/ui/LitCategoryChip";
import LitFlag from "@/components/ui/LitFlag";
import LitHeaderIconBtn from "@/components/ui/LitHeaderIconBtn";
import LitKpiStrip from "@/components/ui/LitKpiStrip";
import LitPill from "@/components/ui/LitPill";
import { resolveEndpoint } from "@/lib/laneGlobe";

type CompanyShape = {
  id: string | null;
  name: string;
  domain?: string | null;
  website?: string | null;
  address?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  phone?: string | null;
};

type HeaderKpis = {
  shipments?: number | null;
  shipmentsAllTime?: number | null;
  teu?: number | null;
  spend?: number | null;
  spendAllTime?: number | null;
  /**
   * Label for the EST. SPEND tile. Driven by the year selector upstream:
   *   - current year selected → "EST. SPEND (12M)" (trailing window)
   *   - past year selected    → "EST. SPEND (2025 · current rates)"
   * When omitted, falls back to "EST. SPEND (12M)" for backward compat.
   */
  spendLabel?: string | null;
  tradeLanes?: number | null;
  contacts?: number | null;
  contactsVerified?: number | null;
  lastShipment?: string | null;
  topRoute?: string | null;
  fclCount?: number | null;
  lclCount?: number | null;
  /**
   * Est. Annual Revenue Opportunity in USD — computed upstream via
   * `buildRevenueOpportunity()` (ocean + customs + drayage + air +
   * trucking service-line sum). Kept on the type for back-compat with
   * the Revenue Opportunity tab; NOT rendered in the header strip
   * since header v8 (founder split "EST. SPEND" into ALL-TIME + ANNUAL
   * to remove confusion with broker revenue opportunity).
   */
  estRevOpp?: number | null;
};

type CDPHeaderProps = {
  company: CompanyShape;
  kpis: HeaderKpis;
  starred: boolean;
  onToggleStar: () => void;
  /**
   * True when the company is saved to the current user's CRM
   * (i.e., present in `lit_saved_companies`). Sourced from
   * `bundle?.identity?.sources?.saved?.present` in CompanyProfileV2.
   * When false the "In CRM" pill is hidden — viewing a company you
   * haven't saved does NOT put it in your CRM.
   */
  isSaved?: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onBack: () => void;
  onShare: () => void;
  onExportPdf: () => void;
  onAddToList: () => void;
  onStartOutreach: () => void;
  onPulse: () => void;
  shareLoading?: boolean;
  exportLoading?: boolean;
  refreshing?: boolean;
  manualRefreshing?: boolean;
  onRefresh: () => void;
  snapshotUpdatedAt?: string | null;
  /**
   * Year selector — affects the EST. SPEND tile only in this pass.
   * - `availableYears` is the list of years the snapshot timeSeries has
   *   data for (descending). Caller should cap at ~3 years.
   * - `selectedYear` is the currently active year.
   * - `onSelectYear` fires when the user picks a year.
   * When `availableYears` is empty or has only one entry, the selector
   * is hidden (no value in showing a single locked option).
   */
  availableYears?: number[];
  selectedYear?: number;
  onSelectYear?: (year: number) => void;
  /**
   * Enrichment Phase 2 — opens the Edit Company modal so the user can
   * persist name / website / industry / headcount corrections back to
   * `lit_companies`. When omitted, the pencil affordance is hidden.
   */
  onEditCompany?: () => void;
};

export default function CDPHeader({
  company,
  kpis,
  starred,
  onToggleStar,
  isSaved,
  panelOpen,
  onTogglePanel,
  onBack,
  onShare,
  onExportPdf,
  onAddToList,
  onStartOutreach,
  onPulse,
  shareLoading,
  exportLoading,
  refreshing,
  manualRefreshing,
  onRefresh,
  snapshotUpdatedAt,
  availableYears,
  selectedYear,
  onSelectYear,
  onEditCompany,
}: CDPHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const domain = company.domain || derivedDomain(company.name);
  const primaryLane = derivePrimaryLane(kpis.topRoute);
  const updatedLabel = formatUpdated(snapshotUpdatedAt);

  const kpiCells = [
    {
      // Lead KPI (header v8) — total importer freight spend across all
      // available history. Founder directive: brokers need to see the
      // cumulative book size first, then drill into annual. Sourced from
      // `spendAllTime` upstream (sum of every month in monthly_volumes
      // × current FBX avg $/TEU, with an outlier-month guard).
      // Renders "—" when the snapshot lacks monthly_volumes or
      // benchmarks haven't loaded — never fabricate.
      label: "EST. SPEND (ALL-TIME)",
      value:
        kpis.spendAllTime != null && Number(kpis.spendAllTime) > 0
          ? formatSpend(Number(kpis.spendAllTime))
          : "—",
      trend: "Cumulative · current rates",
    },
    {
      // Annual / trailing-12M companion to ALL-TIME. Year-aware label
      // driven by the year selector upstream:
      //   - current year → "EST. SPEND (12M)"   (trailing window)
      //   - past year    → "EST. SPEND (2025)"  (calendar year)
      // Value source switches in CompanyProfileV2.headerKpis between
      // `marketSpendBreakdown` (current) and `pastYearSpend` (past).
      label: kpis.spendLabel || "EST. SPEND (12M)",
      value:
        kpis.spend != null && Number(kpis.spend) > 0
          ? formatSpend(Number(kpis.spend))
          : "—",
      trend:
        kpis.spendLabel && kpis.spendLabel.includes("(20")
          ? "Calendar year · current rates"
          : "Trailing 12 months",
    },
    {
      label: "SHIPMENTS (12M)",
      value:
        kpis.shipments != null && kpis.shipments > 0
          ? Number(kpis.shipments).toLocaleString()
          : "—",
    },
    {
      label: "TEU (12M)",
      value:
        kpis.teu != null && Number(kpis.teu) > 0
          ? formatTeu(Number(kpis.teu))
          : "—",
    },
    {
      label: "TOTAL SHIPMENTS",
      value:
        kpis.shipmentsAllTime != null && kpis.shipmentsAllTime > 0
          ? Number(kpis.shipmentsAllTime).toLocaleString()
          : "—",
    },
    {
      label: "PRIMARY TRADE LANE",
      value: primaryLane || "—",
    },
    {
      label: "TRADE LANES",
      value:
        kpis.tradeLanes != null && kpis.tradeLanes > 0
          ? String(kpis.tradeLanes)
          : "—",
    },
    {
      label: "LAST SHIPMENT",
      value: kpis.lastShipment ? formatRelativeShort(kpis.lastShipment) : "—",
      trend: kpis.lastShipment ? formatAbsoluteShort(kpis.lastShipment) : null,
    },
  ];

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white">
      {/* Breadcrumb / meta row. Mobile-first padding so the breadcrumb +
          meta strip never hugs the screen edge on phones. */}
      <div className="flex items-center justify-between gap-3 px-3 pt-3 sm:px-6">
        <div className="font-body flex min-w-0 items-center gap-1.5 text-[12px] text-slate-500">
          <button
            type="button"
            onClick={onBack}
            className="font-body inline-flex items-center gap-1 truncate text-[12px] text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-3 w-3" />
            Command Center
          </button>
          <span className="text-slate-300">/</span>
          <span className="truncate font-semibold text-slate-900">{company.name}</span>
        </div>
        <div className="font-mono flex items-center gap-2 whitespace-nowrap text-[11px] text-slate-400">
          {Array.isArray(availableYears) &&
            availableYears.length > 1 &&
            typeof selectedYear === "number" &&
            typeof onSelectYear === "function" && (
              <>
                <YearSelector
                  years={availableYears}
                  selected={selectedYear}
                  onSelect={onSelectYear}
                />
                <span className="text-slate-200">·</span>
              </>
            )}
          {company.id && (
            <>
              <span>ID · {String(company.id).slice(0, 8)}</span>
              <span className="text-slate-200">·</span>
            </>
          )}
          {refreshing || manualRefreshing ? (
            <span className="inline-flex items-center gap-1 text-blue-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Refreshing intel…
            </span>
          ) : (
            <span>{updatedLabel}</span>
          )}
        </div>
      </div>

      {/* Identity row — editorial framing (Phase C). Bracketed `[RECEIVER]`
          chip above the H1 mirrors the marketing blog's category mark;
          H1 bumped from 22px to clamp(26px, 2.4vw, 32px) so the company
          name reads as the editorial subject of the page, not a small
          breadcrumb label. */}
      <div className="flex flex-wrap items-start gap-3 px-3 pb-3 pt-3 sm:gap-3.5 sm:px-6 sm:pt-3.5">
        <div className="shrink-0">
          <CompanyAvatar name={company.name} domain={domain} size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2">
            <LitCategoryChip label="Receiver" />
          </div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h1
              className="font-display m-0 truncate text-2xl font-semibold leading-[1.05] tracking-[-0.015em] text-slate-900 sm:text-3xl md:text-4xl"
              title={company.name}
            >
              {company.name}
            </h1>
            <button
              type="button"
              onClick={onToggleStar}
              aria-label={starred ? "Unstar company" : "Star company"}
              className="rounded p-0.5 transition-colors"
              style={{ color: starred ? "#F59E0B" : "#CBD5E1" }}
            >
              <Star
                className="h-4 w-4"
                fill={starred ? "currentColor" : "none"}
                strokeWidth={1.8}
              />
            </button>
            {onEditCompany && (
              <button
                type="button"
                onClick={onEditCompany}
                aria-label="Edit company"
                title="Edit name, website, industry, headcount"
                className="rounded p-0.5 text-slate-400 transition-colors hover:text-blue-600"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            )}
            {isSaved && (
              <LitPill tone="green">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                In CRM
              </LitPill>
            )}
          </div>

          <div className="font-body mb-2 text-[12px] leading-relaxed text-slate-600">
            {kpis.shipments != null && Number(kpis.shipments) > 0 ? (
              <>
                Trailing 12m:{" "}
                <strong className="font-mono font-semibold text-slate-900">
                  {Number(kpis.shipments || 0).toLocaleString()}
                </strong>{" "}
                shipments
                {kpis.teu != null && Number(kpis.teu) > 0 && (
                  <>
                    {" "}
                    /{" "}
                    <strong className="font-mono font-semibold text-slate-900">
                      {formatTeu(Number(kpis.teu))}
                    </strong>{" "}
                    TEU
                  </>
                )}
              </>
            ) : (
              <span className="text-slate-400">
                No recent trade activity recorded.
              </span>
            )}
          </div>

          {/* Chip row */}
          <div className="flex flex-wrap gap-1.5">
            {company.address && (
              <LitPill tone="slate" icon={<MapPin className="h-2.5 w-2.5" />}>
                {company.address}
              </LitPill>
            )}
            {domain && (
              <LitPill tone="slate" icon={<Globe className="h-2.5 w-2.5" />}>
                {domain}
              </LitPill>
            )}
            {company.countryCode && (
              <LitPill
                tone="slate"
                icon={<LitFlag code={company.countryCode} size={11} />}
              >
                {company.countryName || company.countryCode}
              </LitPill>
            )}
            {primaryLane && (
              <LitPill tone="blue" icon={<TrendingUp className="h-2.5 w-2.5" />}>
                Primary lane: {primaryLane}
              </LitPill>
            )}
          </div>
        </div>

        {/* Action cluster — wraps on <sm so all CTAs stay reachable on a
            phone without horizontal overflow; stays single-row on ≥sm. */}
        <div className="flex w-full shrink-0 flex-wrap items-center gap-1.5 sm:w-auto">
          {company.website && (
            <LitHeaderIconBtn
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label="Open website"
              onClick={() => {
                if (typeof window !== "undefined" && company.website) {
                  window.open(company.website, "_blank", "noopener,noreferrer");
                }
              }}
            />
          )}
          <div className="relative">
            <LitHeaderIconBtn
              icon={<MoreHorizontal className="h-3.5 w-3.5" />}
              label="More actions"
              onClick={() => setMoreOpen((v) => !v)}
            />
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
                onMouseLeave={() => setMoreOpen(false)}
              >
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onPulse();
                  }}
                  className="font-display flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Sparkles className="h-3 w-3 text-blue-500" />
                  Generate Pulse brief
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onShare();
                  }}
                  disabled={shareLoading}
                  className="font-display flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {shareLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
                  Share HTML link
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onRefresh();
                  }}
                  disabled={manualRefreshing}
                  className="font-display flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {manualRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                  Force refresh
                </button>
              </div>
            )}
          </div>
          <LitHeaderIconBtn
            icon={exportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            label="Export"
            onClick={onExportPdf}
            disabled={exportLoading}
          />
          <button
            type="button"
            onClick={onAddToList}
            className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-900 hover:bg-slate-50"
          >
            <FolderPlus className="h-3 w-3" />
            Add to List
          </button>
          <button
            type="button"
            onClick={onStartOutreach}
            className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]"
          >
            <Send className="h-3 w-3" />
            Start Outreach
          </button>
          <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <LitHeaderIconBtn
            icon={panelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            label={panelOpen ? "Hide details panel" : "Show details panel"}
            onClick={onTogglePanel}
          />
        </div>
      </div>

      {/* KPI strip */}
      <LitKpiStrip cells={kpiCells} />
    </div>
  );
}

function derivedDomain(name?: string | null) {
  if (!name) return null;
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : null;
}

function derivePrimaryLane(topRoute?: string | null) {
  if (!topRoute || typeof topRoute !== "string") return null;
  const parts = topRoute.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const fromMeta = resolveEndpoint(parts[0]);
  const toMeta = resolveEndpoint(parts[1]);
  const fromLabel = fromMeta?.countryCode || fromMeta?.countryName || parts[0];
  const toLabel = toMeta?.countryCode || toMeta?.countryName || parts[1];
  return `${fromLabel} → ${toLabel}`;
}

function formatUpdated(value?: string | null) {
  if (!value) return "Snapshot pending";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "Snapshot pending";
  const delta = Date.now() - t;
  const hour = 60 * 60 * 1000;
  if (delta < hour) return "Updated just now";
  if (delta < 24 * hour) return `Updated ${Math.round(delta / hour)} hr ago`;
  const day = 24 * hour;
  if (delta < 7 * day) return `Updated ${Math.round(delta / day)} d ago`;
  return `Updated ${new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function formatRelativeShort(value: string) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 0) return "—";
  const day = 24 * 60 * 60 * 1000;
  if (delta < day) return "Today";
  if (delta < 2 * day) return "1 day ago";
  if (delta < 30 * day) return `${Math.round(delta / day)} days ago`;
  if (delta < 365 * day) return `${Math.round(delta / (30 * day))} months ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatAbsoluteShort(value: string) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTeu(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Math.round(n).toLocaleString();
}

/**
 * Minimal year segmented control. Drives the EST. SPEND tile's temporal
 * scope. Style: text-only buttons separated by hairline dividers — stays
 * inside the meta-row's font/size rhythm so it doesn't add visual noise.
 * Selected year is highlighted in slate-900; others stay slate-400.
 */
function YearSelector({
  years,
  selected,
  onSelect,
}: {
  years: number[];
  selected: number;
  onSelect: (year: number) => void;
}) {
  // Cap at 3 entries (current + 2 prior) so the control never grows wide.
  const visible = years.slice(0, 3);
  return (
    <span
      role="group"
      aria-label="Spend year"
      className="font-mono inline-flex items-center gap-1 text-[11px]"
    >
      {visible.map((year, i) => {
        const active = year === selected;
        return (
          <span key={year} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(year)}
              aria-pressed={active}
              className={[
                "rounded px-1 transition-colors",
                active
                  ? "font-semibold text-slate-900"
                  : "text-slate-400 hover:text-slate-700",
              ].join(" ")}
            >
              {year}
            </button>
            {i < visible.length - 1 && (
              <span className="text-slate-200" aria-hidden>
                |
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function formatSpend(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}