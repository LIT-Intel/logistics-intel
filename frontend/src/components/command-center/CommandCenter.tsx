"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { listSavedCompanies, enrichCompaniesFromKpis } from "@/lib/api";
import { listOrgSharedCompanyRecords } from "@/api/orgSaves";
import { formatSafeShipmentDate } from "@/lib/dateUtils";
import type { CommandCenterRecord } from "@/types/importyeti";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Plus,
  Search,
  Send,
  Upload,
  LayoutGrid,
  KanbanSquare,
  CheckSquare,
  BarChart3,
  DollarSign,
  Briefcase,
  TrendingUp,
  Trophy,
} from "lucide-react";
import AddToCampaignModal from "./AddToCampaignModal";
import PipelineGate from "@/features/crm/PipelineGate";
import TasksView from "@/features/crm/TasksView";
import PipelineReports from "@/features/crm/PipelineReports";
import CreateDealModal, { type CreateDealPrefill } from "@/features/crm/CreateDealModal";
import ViewAsFilter from "@/features/crm/ViewAsFilter";
import { listStages, type DealStage, myOverdueTaskCount } from "@/api/crm";
import { loadCommandCenterKpis, type CommandCenterKpis } from "@/api/commandCenterKpis";
import {
  CommandCenterThemeProvider,
  CrmThemeToggle,
  useCrmTheme,
  type CrmThemeTokens,
} from "@/features/crm/CommandCenterTheme";
// AddCompanyModal import removed — manual company entry no longer offered.

type SavedCompaniesResponse =
  | CommandCenterRecord[]
  | {
      rows?: CommandCenterRecord[];
    }
  | null
  | undefined;

type ListRow = {
  record: CommandCenterRecord;
  key: string;
  companyId: string | null;
  // companyUuid is the lit_companies.id primary key (FK target for
  // lit_campaign_companies.company_id). companyId above stays as the
  // human-readable source_company_key slug used everywhere else for
  // display + KPI joins. Surfaced from getSavedCompanies's
  // `record.company.id` after the Phase C unify fix.
  companyUuid: string | null;
  companyName: string;
  stage: string;
  address: string | null;
  /** Structured location fields (lit_companies.city / .state) — drive the
   *  City and State/Region filters + the free-text search haystack. */
  city: string | null;
  state: string | null;
  domain: string | null;
  website: string | null;
  countryCode: string | null;
  shipments12m: number;
  teu12m: number | null;
  estSpend12m: number | null;
  fclShipments12m: number | null;
  lclShipments12m: number | null;
  lastActivity: string | null;
  topRoute12m: string | null;
  recentRoute: string | null;
  /** Name of the ORG-MATE who saved this company, when the row is a shared
   *  save (not the viewer's own). Drives the "Saved by X" chip so shared
   *  saves are distinguishable, never silently merged. */
  sharedBy: string | null;
  /** lit_saved_companies.id for the row — links a new deal to the account. */
  savedId: string | null;
  /** lit_saved_companies.created_at — when the viewer (or org-mate) saved
   *  this company. Drives the default "Recently saved" sort. */
  savedAt: string | null;
};

type SortableKey = keyof Pick<ListRow, 'companyName' | 'lastActivity' | 'shipments12m' | 'teu12m' | 'estSpend12m' | 'topRoute12m' | 'savedAt'>;

// Sort keys that hold ISO date strings — compared as timestamps, never via
// the numeric/locale fallback (parseFloat("2026-08-01") === 2026 would make
// same-year dates compare equal).
const DATE_SORT_KEYS: ReadonlySet<SortableKey> = new Set(['savedAt', 'lastActivity']);

// Human labels for the header subtitle ("… · Sorted by recently saved") and
// the sort <select> in the toolbar.
const SORT_LABELS: Record<SortableKey, string> = {
  savedAt:      'recently saved',
  shipments12m: 'shipments 12M',
  teu12m:       'TEU 12M',
  estSpend12m:  'est. spend',
  lastActivity: 'last shipment',
  companyName:  'company name',
  topRoute12m:  'top route',
};

// Toolbar sort options (order = menu order). Column-header clicks can still
// reach every sortable column; this select covers the common cases.
const SORT_OPTIONS: Array<{ key: SortableKey; label: string }> = [
  { key: 'savedAt',      label: 'Recently saved' },
  { key: 'shipments12m', label: 'Shipments 12M' },
  { key: 'teu12m',       label: 'TEU 12M' },
  { key: 'estSpend12m',  label: 'Est. spend' },
  { key: 'lastActivity', label: 'Last shipment' },
  { key: 'companyName',  label: 'Company name' },
];

// Phase B.3 — table trimmed to 9 columns. Stage and Contacts dropped per the
// validated design source (LIT Platform.html). Stage data still gets fetched
// to avoid breaking server contracts; we just stop rendering it. Contact
// counts are still loaded and stored in `contactCounts` so we never break
// the upstream lit_contacts probe.
//
// Phase B.8 — column widths re-tuned again (overflow fix). The B.6 split gave
// the actions column 9% of the 1200px table min-width (~108px) with
// overflow:hidden on the cell, which permanently clipped the third (Deal)
// button — users had to zoom the browser out to widen the percentage column.
// Fix: every data column gets a fixed px width sized to its content, the
// actions column gets a width that actually fits all three buttons, and
// Company is the single flex column that absorbs the remaining space. Table
// min-width drops to 1080 so the whole grid (actions included) fits a 1440px
// window with the sidebar open; the overflow-x wrapper stays as a safety net
// for anything narrower.
const TABLE_COLS: Array<{ key: SortableKey | 'activity' | 'status' | 'actions'; label: string; width: string; sortable: boolean }> = [
  { key: 'companyName',  label: 'Company',       width: 'auto',  sortable: true },
  { key: 'lastActivity', label: 'Last Shipment', width: '102px', sortable: true },
  { key: 'shipments12m', label: 'Shipments 12M', width: '106px', sortable: true },
  { key: 'teu12m',       label: 'TEU 12M',       width: '76px',  sortable: true },
  { key: 'estSpend12m',  label: 'Est. Spend',    width: '88px',  sortable: true },
  { key: 'topRoute12m',  label: 'Top Route',     width: '140px', sortable: true },
  { key: 'activity',     label: 'Activity',      width: '90px',  sortable: false },
  { key: 'status',       label: 'Status',        width: '96px',  sortable: false },
  { key: 'actions',      label: 'View',          width: '208px', sortable: false },
];

// Fixed px columns above sum to 906; at the 1080px table min-width the flex
// Company column keeps ≥174px, which still fits avatar + truncated name.
const TABLE_MIN_WIDTH = 1080;

const STATUS_STYLE = {
  active:   { bg: '#F0FDF4', color: '#15803d', border: '#BBF7D0', dot: '#22C55E', label: 'Active'   },
  pending:  { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', dot: '#F59E0B', label: 'Pending'  },
  inactive: { bg: '#F1F5F9', color: '#64748b', border: '#E2E8F0', dot: '#94A3B8', label: 'Inactive' },
};

// Dark-mode status pills — brighter fg on translucent tinted fills so they stay
// legible on deep-slate panels. Same keys as STATUS_STYLE.
const STATUS_STYLE_DARK = {
  active:   { bg: 'rgba(34,197,94,0.14)',  color: '#4ADE80', border: 'rgba(34,197,94,0.35)',  dot: '#22C55E', label: 'Active'   },
  pending:  { bg: 'rgba(245,158,11,0.16)', color: '#FBBF24', border: 'rgba(245,158,11,0.35)', dot: '#F59E0B', label: 'Pending'  },
  inactive: { bg: 'rgba(148,163,184,0.14)',color: '#94A3B8', border: 'rgba(148,163,184,0.3)', dot: '#94A3B8', label: 'Inactive' },
};

type StatusKey = keyof typeof STATUS_STYLE;
function statusStyle(mode: 'light' | 'dark', key: StatusKey) {
  return (mode === 'dark' ? STATUS_STYLE_DARK : STATUS_STYLE)[key];
}

const PAGE_SIZE = 25;

function normalizeSavedCompaniesResponse(input: SavedCompaniesResponse): CommandCenterRecord[] {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.rows)) return input.rows;
  return [];
}

function recordKey(record: CommandCenterRecord) {
  return (
    record.company?.company_id ||
    (record as any)?.company?.source_company_key ||
    record.company?.name ||
    (record as any)?.company?.company_name ||
    (record as any)?.saved_company_id ||
    ""
  );
}

// Canonical company key: ImportYeti keys arrive as both `tesla` and the
// legacy URL-path form `company/tesla` for the SAME company. Comparing raw
// keys made the org-shared merge (and historical duplicate saved rows)
// render the same company twice. Always compare canonical forms.
function canonicalCompanyKey(key: string | null | undefined): string {
  if (!key || typeof key !== "string") return "";
  return key.toLowerCase().replace(/^company\//, "");
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// Phase B.5 — delegate to the shared safe-shipment-date helper so a
// future-dated `last_shipment_date` (an artefact of bad source data) no
// longer leaks into the Command Center "Last Shipment" column. The
// helper returns "—" for null / unparseable / future inputs.
function formatDate(value?: string | null) {
  return formatSafeShipmentDate(value, "—");
}


function statusForRow(row: ListRow): 'active' | 'pending' | 'inactive' {
  if ((row.shipments12m || 0) > 0) return 'active';
  if (row.stage === 'prospect' || row.stage === 'qualified') return 'pending';
  return 'inactive';
}

function buildListRow(record: CommandCenterRecord): ListRow {
  const company = record.company || ({} as any);
  const kpis = (company as any)?.kpis || {};
  const sourceCompanyKey = company?.company_id || (company as any)?.source_company_key || null;

  return {
    record,
    key: recordKey(record),
    companyId: sourceCompanyKey,
    companyUuid: ((company as any)?.id as string | null) ?? null,
    companyName: company?.name || (company as any)?.company_name || "Company",
    stage: String((record as any)?.stage || "prospect"),
    address: company?.address || null,
    city: ((company as any)?.city as string | null) ?? null,
    state: ((company as any)?.state as string | null) ?? null,
    domain: (company as any)?.domain || null,
    website: (company as any)?.website || null,
    countryCode: company?.country_code || null,
    shipments12m: Number(kpis?.shipments_12m || 0),
    teu12m: kpis?.teu_12m != null ? Number(kpis.teu_12m) : null,
    estSpend12m: kpis?.est_spend_12m != null ? Number(kpis.est_spend_12m) : null,
    fclShipments12m: kpis?.fcl_shipments_12m != null ? Number(kpis.fcl_shipments_12m) : null,
    lclShipments12m: kpis?.lcl_shipments_12m != null ? Number(kpis.lcl_shipments_12m) : null,
    lastActivity: kpis?.last_activity || null,
    topRoute12m: kpis?.top_route_12m || null,
    recentRoute: kpis?.recent_route || null,
    sharedBy: ((record as any)?.shared_by?.name as string | undefined) ?? null,
    savedId:
      ((record as any)?.saved_id as string | undefined) ??
      ((record as any)?.saved_company_id as string | undefined) ??
      ((record as any)?.id as string | undefined) ??
      null,
    // lit_saved_companies.created_at. getSavedCompanies() maps it to
    // `saved_at`; the dev-mode path and org-shared records also expose it
    // as `created_at` on the record root.
    savedAt:
      ((record as any)?.saved_at as string | undefined) ??
      (record?.created_at as string | undefined) ??
      null,
  };
}

type CrmView = "accounts" | "pipeline" | "tasks" | "reports";

/**
 * Command Center shell — view switcher across the CRM surfaces. The
 * original saved-accounts list becomes the "Accounts" tab; "Pipeline" is
 * the Kanban deals board and "Tasks" is the My-tasks list (CRM Phase 1).
 */
export default function CommandCenter() {
  // The provider wraps the whole surface so every child (shell + views + drawer)
  // can read the active theme and the `.dark` class is scoped here only.
  return (
    <CommandCenterThemeProvider>
      <CommandCenterInner />
    </CommandCenterThemeProvider>
  );
}

function CommandCenterInner() {
  const { theme, mode } = useCrmTheme();
  const [view, setView] = useState<CrmView>("accounts");
  const [overdueCount, setOverdueCount] = useState(0);
  // Owner/admin "view as [member]" filter. Empty string = All members (whole
  // org). Threaded into the KPI RPC + every CRM view (pipeline/tasks/reports).
  // The ViewAsFilter control renders nothing for regular members, so this stays
  // "" for them and every read falls back to their own RLS-scoped rows.
  const [viewAsUserId, setViewAsUserId] = useState<string>("");
  // Header KPI snapshot — one org-scoped lit_pipeline_summary() call. Starts
  // at clean zeros so the bar renders 0s (never blanks) before data lands and
  // on any empty/error state.
  const [kpis, setKpis] = useState<CommandCenterKpis>({
    openPipelineValue: 0,
    activeDealCount: 0,
    weightedForecast: 0,
    wonMtdValue: 0,
    overdueTaskCount: 0,
  });

  // Load the viewer's overdue-task count for the Tasks tab badge.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const n = await myOverdueTaskCount();
        if (alive) setOverdueCount(n);
      } catch {
        /* badge is cosmetic */
      }
    })();
    return () => {
      alive = false;
    };
  }, [view]);

  // Load header KPIs once (org-scoped RPC). Refreshed on tab switches so the
  // numbers stay current after the viewer edits deals/tasks in another view.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Forward the owner/admin "view as" filter so the header KPIs match the
      // filtered board. Ignored server-side for regular members.
      const k = await loadCommandCenterKpis(viewAsUserId || null);
      if (alive) setKpis(k);
    })();
    return () => {
      alive = false;
    };
  }, [view, viewAsUserId]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: theme.bg }}>
      {/* View switcher — the tab row is horizontally scrollable so all four
          tabs + the theme toggle stay reachable on narrow phones. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 16px 0", background: theme.panel, borderBottom: `1px solid ${theme.border}`, flexShrink: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <ViewTab active={view === "accounts"} onClick={() => setView("accounts")} icon={<LayoutGrid style={{ width: 14, height: 14 }} />} label="Accounts" />
        <ViewTab active={view === "pipeline"} onClick={() => setView("pipeline")} icon={<KanbanSquare style={{ width: 14, height: 14 }} />} label="Pipeline" />
        <ViewTab active={view === "tasks"} onClick={() => setView("tasks")} icon={<CheckSquare style={{ width: 14, height: 14 }} />} label="Tasks" badge={overdueCount || undefined} />
        <ViewTab active={view === "reports"} onClick={() => setView("reports")} icon={<BarChart3 style={{ width: 14, height: 14 }} />} label="Reports" />
        {/* Theme toggle lives at the end of the tab row so it's always visible
            (and reachable on mobile via the scrollable row). */}
        <div style={{ marginLeft: "auto", paddingLeft: 8, paddingBottom: 6, flexShrink: 0 }}>
          <CrmThemeToggle />
        </div>
      </div>

      {/* KPI header bar — below the tabs, above the content. Compact colored
          KpiChip idiom (icon square + tone + bold number + small label), same
          as the dashboard. Reflows to 2-up on phones, one row on desktop. */}
      <KpiHeaderBar
        kpis={kpis}
        overdueForViewer={overdueCount}
        viewAsUserId={viewAsUserId}
        onViewAsChange={setViewAsUserId}
      />

      {view === "accounts" ? (
        <AccountsView />
      ) : view === "pipeline" ? (
        <PipelineGate viewAsUserId={viewAsUserId} />
      ) : view === "tasks" ? (
        <TasksView onCountChange={setOverdueCount} viewAsUserId={viewAsUserId} />
      ) : (
        <PipelineReports viewAsUserId={viewAsUserId} />
      )}
    </div>
  );
}

// ── Header KPI bar ──────────────────────────────────────────────────────────
// Mirrors the dashboard's KpiChip: a colored icon square + bold mono number +
// small uppercase label. Tasteful and compact — a workspace header strip, not
// the deep analytics view (Reports tab owns that).
const KPI_TONES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
};

function KpiChip({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof KPI_TONES;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <span
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          KPI_TONES[tone] || KPI_TONES.blue,
        ].join(" ")}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="font-mono truncate text-[18px] font-bold leading-none tracking-tight text-slate-900 dark:text-slate-100">
          {value}
        </div>
        <div className="mt-1 truncate text-[9.5px] font-semibold uppercase tracking-[0.07em] text-slate-400 dark:text-slate-500" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {label}
        </div>
        {hint ? (
          <div className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KpiHeaderBar({
  kpis,
  overdueForViewer,
  viewAsUserId,
  onViewAsChange,
}: {
  kpis: CommandCenterKpis;
  overdueForViewer: number;
  viewAsUserId: string;
  onViewAsChange: (userId: string) => void;
}) {
  // "Tasks due" surfaces the org-scoped open-overdue count from the RPC as the
  // primary number; the viewer's own overdue count drives the highlight hint.
  const { theme } = useCrmTheme();
  const tasksDue = kpis.overdueTaskCount;
  const tasksHint = overdueForViewer > 0 ? `${formatNumber(overdueForViewer)} overdue for you` : undefined;

  return (
    <div
      style={{
        padding: "12px 24px",
        background: theme.panel,
        borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0,
      }}
    >
      {/* Owner/admin "view as [member]" filter — renders nothing for members. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, minHeight: 0 }}>
        <ViewAsFilter value={viewAsUserId} onChange={onViewAsChange} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-5">
        <KpiChip label="Open pipeline" value={formatCurrency(kpis.openPipelineValue)} icon={DollarSign} tone="blue" />
        <KpiChip label="Active deals" value={formatNumber(kpis.activeDealCount)} icon={Briefcase} tone="indigo" />
        <KpiChip label="Weighted forecast" value={formatCurrency(kpis.weightedForecast)} icon={TrendingUp} tone="violet" />
        <KpiChip label="Tasks due" value={formatNumber(tasksDue)} hint={tasksHint} icon={CheckSquare} tone="amber" />
        <KpiChip label="Won MTD" value={formatCurrency(kpis.wonMtdValue)} icon={Trophy} tone="emerald" />
      </div>
    </div>
  );
}

function ViewTab({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  const { theme } = useCrmTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        border: "none",
        borderBottom: `2px solid ${active ? theme.accentBorder : "transparent"}`,
        background: "transparent",
        color: active ? theme.accentSoftText : theme.textMuted,
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        marginBottom: -1,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {icon}
      {label}
      {badge ? (
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#dc2626", color: "#FFFFFF", fontSize: 10, fontWeight: 700 }}>{badge}</span>
      ) : null}
    </button>
  );
}

function AccountsView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, mode } = useCrmTheme();

  const [savedCompanies, setSavedCompanies] = useState<CommandCenterRecord[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [pipelineRow, setPipelineRow] = useState<CreateDealPrefill | null>(null);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // Default sort: most recently saved first (lit_saved_companies.created_at,
  // desc). Shipment volume and every other column stay one click away via
  // the toolbar select or the column headers.
  const [sortKey, setSortKey] = useState<SortableKey>('savedAt');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  // Filters panel — collapsible below the search row. Active filters
  // narrow the visible saved-company list. Reset clears every filter
  // including the search term.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterCountry, setFilterCountry] = useState<string>("");
  const [filterCity, setFilterCity] = useState<string>("");
  const [filterState, setFilterState] = useState<string>("");
  // Route country — matched against the route/lane strings (top + recent),
  // so "CN" narrows to lanes touching China regardless of direction.
  const [filterRouteCountry, setFilterRouteCountry] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "pending" | "inactive">("all");
  const [filterHasContacts, setFilterHasContacts] = useState<"all" | "yes" | "no">("all");
  const [filterMinShipments, setFilterMinShipments] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"all" | "fcl" | "lcl">("all");
  const [filterLane, setFilterLane] = useState<string>("");
  const [contactCountsMap, setContactCountsMap] = useState<Record<string, number>>({});

  // Phase E — per-company contact counts. Loaded once after saved companies
  // arrive, via a single bulk `lit_contacts` select scoped by the set of
  // company_ids on the page. Silent-fail: if the query errors the map stays
  // empty. Phase B.3 — counts no longer rendered (column removed) but we
  // keep the probe to preserve the API surface.
  const [, setContactCounts] = useState<Record<string, number>>({});

  // Phase E — "Add to Campaign" per-row action. When set, the existing
  // AddToCampaignModal mounts with that row's company id + name pre-filled.
  const [campaignModalRow, setCampaignModalRow] = useState<ListRow | null>(null);

  // Phase B.3 — top-right "Add Company" action wires to the existing
  // AddCompanyModal state removed with the manual-entry feature.

  const reloadSavedCompanies = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const response = (await listSavedCompanies()) as SavedCompaniesResponse;
      const ownRows = normalizeSavedCompaniesResponse(response);
      // Org-shared saves (org-mates' rows, visible only while the workspace's
      // Account-sharing toggle is ON — RLS scopes the read). Appended after
      // the viewer's own rows with `shared_by` set so they render a
      // "Saved by X" chip. Companies the viewer ALSO saved keep the own row.
      let rows = ownRows;
      try {
        // Canonical-key comparison — `company/tesla` and `tesla` are the
        // same company; raw-key comparison used to let an org-mate's
        // variant-key save through as a visual duplicate.
        const ownKeys = new Set(
          ownRows
            .map((r) =>
              canonicalCompanyKey(
                r.company?.company_id ?? (r as any)?.company?.source_company_key,
              ),
            )
            .filter(Boolean),
        );
        const sharedRecords = (await listOrgSharedCompanyRecords()).filter(
          (r: any) => !ownKeys.has(canonicalCompanyKey(r?.company?.company_id)),
        );
        if (sharedRecords.length) rows = [...ownRows, ...sharedRecords];
      } catch {
        /* shared saves are additive — never block the viewer's own list */
      }
      try {
        const companyIds = rows
          .map((r) => r.company?.company_id ?? (r as any)?.company?.source_company_key)
          .filter((id): id is string => Boolean(id));
        const kpiMap = await enrichCompaniesFromKpis(companyIds);
        const enriched = rows.map((r) => {
          const cid = r.company?.company_id ?? (r as any)?.company?.source_company_key;
          const kpiRow = cid ? kpiMap[cid] : null;
          if (!kpiRow) return r;
          const existingKpis = (r.company as any)?.kpis || {};
          return {
            ...r,
            company: {
              ...r.company,
              kpis: {
                ...existingKpis,
                last_activity:     existingKpis.last_activity     ?? kpiRow.last_shipment_date    ?? null,
                teu_12m:           existingKpis.teu_12m           ?? kpiRow.all_time_teu_from_series ?? null,
                fcl_shipments_12m: existingKpis.fcl_shipments_12m ?? kpiRow.fcl_shipments ?? null,
                lcl_shipments_12m: existingKpis.lcl_shipments_12m ?? kpiRow.lcl_shipments ?? null,
              },
            },
          };
        });
        setSavedCompanies(enriched);
      } catch {
        setSavedCompanies(rows);
      }
    } catch (error: any) {
      setSavedError(error?.message ?? "Failed to load saved companies");
      setSavedCompanies([]);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!isMounted) return;
      await reloadSavedCompanies();
    })();
    return () => { isMounted = false; };
  }, [reloadSavedCompanies]);

  // Load the org's pipeline stages once so the per-row "Add to pipeline"
  // action can prefill a new deal. Silent-fail — the button just disables.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await listStages();
        if (alive) setDealStages(s);
      } catch {
        /* pipeline optional on the accounts view */
      }
    })();
    return () => { alive = false; };
  }, []);

  // Bulk-load contact counts once saved companies arrive. One query
  // (`.select("company_id").in("company_id", [...])`), counted client-side
  // into a Record<company_id, number>. Silent fail.
  useEffect(() => {
    let isMounted = true;
    const ids = savedCompanies
      .map((r) => r.company?.company_id ?? (r as any)?.company?.source_company_key)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) {
      setContactCounts({});
      return () => {
        isMounted = false;
      };
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from("lit_contacts")
          .select("company_id")
          .in("company_id", ids);
        if (!isMounted) return;
        if (error || !Array.isArray(data)) {
          setContactCounts({});
          return;
        }
        const counts: Record<string, number> = {};
        for (const row of data as Array<{ company_id?: string | null }>) {
          const key = row?.company_id;
          if (!key) continue;
          counts[key] = (counts[key] || 0) + 1;
        }
        setContactCounts(counts);
        setContactCountsMap(counts);
      } catch {
        if (isMounted) {
          setContactCounts({});
          setContactCountsMap({});
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [savedCompanies]);

  // Belt-and-braces display dedupe: one row per canonical company key.
  // The DB now has a canonical-key unique index + the save-company edge fn
  // is variant-aware, but any residual key-variant rows (or a shared row
  // slipping past the merge filter) must still never render twice.
  const listRows = useMemo(() => {
    const rows = savedCompanies.map(buildListRow).filter((r) => r.key);
    const seen = new Set<string>();
    return rows.filter((r) => {
      const ck = canonicalCompanyKey(r.key) || r.key;
      if (seen.has(ck)) return false;
      seen.add(ck);
      return true;
    });
  }, [savedCompanies]);

  // Country options derived from the loaded list. Sorted, deduped,
  // empty values filtered out.
  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of listRows) {
      if (r.countryCode) set.add(r.countryCode);
    }
    return Array.from(set).sort();
  }, [listRows]);

  // City / state options — derived from the structured lit_companies fields
  // on the loaded list, same idiom as countryOptions.
  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of listRows) {
      const c = r.city?.trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listRows]);

  const stateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of listRows) {
      const s = r.state?.trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listRows]);

  // Filtering pipeline. Order: text search -> country -> city -> state ->
  // route country -> status -> contacts presence -> mode (FCL/LCL share) ->
  // lane substring -> min-shipments threshold. Empty / "all" filters
  // short-circuit. All client-side over the loaded list (the list is
  // loaded in full, then paginated client-side).
  const filteredRows = useMemo(() => {
    const lower = searchTerm.trim().toLowerCase();
    const minShipmentsNum = filterMinShipments.trim() === "" ? null : Number(filterMinShipments);
    const laneLower = filterLane.trim().toLowerCase();
    const routeCountryLower = filterRouteCountry.trim().toLowerCase();
    return listRows.filter((row) => {
      // Free-text search covers: company name, city, state, full address,
      // country, route/lane strings (top + recent), domain and website.
      const haystack = [row.companyName, row.domain, row.website, row.address, row.city, row.state, row.countryCode, row.topRoute12m, row.recentRoute]
        .filter(Boolean).join(" ").toLowerCase();
      if (lower && !haystack.includes(lower)) return false;
      if (filterCountry && row.countryCode !== filterCountry) return false;
      if (filterCity && (row.city?.trim() || "") !== filterCity) return false;
      if (filterState && (row.state?.trim() || "") !== filterState) return false;
      if (routeCountryLower) {
        const lanes = [row.topRoute12m, row.recentRoute].filter(Boolean).join(" ").toLowerCase();
        if (!lanes.includes(routeCountryLower)) return false;
      }
      if (filterStatus !== "all" && statusForRow(row) !== filterStatus) return false;
      if (filterHasContacts !== "all") {
        const cnt = row.companyUuid ? contactCountsMap[row.companyUuid] || 0 : 0;
        if (filterHasContacts === "yes" && cnt <= 0) return false;
        if (filterHasContacts === "no"  && cnt >  0) return false;
      }
      if (filterMode === "fcl" && !((row.fclShipments12m || 0) > 0)) return false;
      if (filterMode === "lcl" && !((row.lclShipments12m || 0) > 0)) return false;
      if (laneLower) {
        const lanes = [row.topRoute12m, row.recentRoute].filter(Boolean).join(" ").toLowerCase();
        if (!lanes.includes(laneLower)) return false;
      }
      if (minShipmentsNum != null && !Number.isNaN(minShipmentsNum)) {
        if ((row.shipments12m || 0) < minShipmentsNum) return false;
      }
      return true;
    });
  }, [listRows, searchTerm, filterCountry, filterCity, filterState, filterRouteCountry, filterStatus, filterHasContacts, filterMode, filterLane, filterMinShipments, contactCountsMap]);

  // Reset every filter at once. Search term included so "Reset
  // filters" actually clears the visible list view.
  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setFilterCountry("");
    setFilterCity("");
    setFilterState("");
    setFilterRouteCountry("");
    setFilterStatus("all");
    setFilterHasContacts("all");
    setFilterMinShipments("");
    setFilterMode("all");
    setFilterLane("");
  }, []);

  const activeFilterCount = (
    (filterCountry ? 1 : 0) +
    (filterCity ? 1 : 0) +
    (filterState ? 1 : 0) +
    (filterRouteCountry.trim() ? 1 : 0) +
    (filterStatus !== "all" ? 1 : 0) +
    (filterHasContacts !== "all" ? 1 : 0) +
    (filterMode !== "all" ? 1 : 0) +
    (filterLane.trim() ? 1 : 0) +
    (filterMinShipments.trim() ? 1 : 0)
  );

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      // Date keys (savedAt / lastActivity) compare as timestamps — the
      // numeric fallback below would reduce ISO dates to their year via
      // parseFloat and treat same-year dates as equal. Missing/unparseable
      // dates always sink to the bottom regardless of direction.
      if (DATE_SORT_KEYS.has(sortKey)) {
        const at = Date.parse(String(a[sortKey] ?? ''));
        const bt = Date.parse(String(b[sortKey] ?? ''));
        const aOk = !Number.isNaN(at);
        const bOk = !Number.isNaN(bt);
        if (aOk && bOk) return sortDir * (at - bt);
        if (aOk) return -1;
        if (bOk) return 1;
        return 0;
      }
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const an = parseFloat(String(av).replace(/[^0-9.-]/g, ''));
      const bn = parseFloat(String(bv).replace(/[^0-9.-]/g, ''));
      if (!isNaN(an) && !isNaN(bn)) return sortDir * (an - bn);
      return sortDir * String(av).localeCompare(String(bv));
    });
  }, [filteredRows, sortKey, sortDir]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCountry, filterCity, filterState, filterRouteCountry, filterStatus, filterHasContacts, filterMode, filterLane, filterMinShipments]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage]);

  const pageStart = sortedRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd   = sortedRows.length ? Math.min(currentPage * PAGE_SIZE, sortedRows.length) : 0;

  function toggleSort(key: SortableKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(-1); }
  }

  function handleOpenCompany(row: ListRow) {
    if (!row.companyId) {
      toast({ title: "Company unavailable", description: "This saved record does not have a source company key yet.", variant: "destructive" });
      return;
    }
    try {
      localStorage.setItem("lit:selectedCompany", JSON.stringify({
        company_id: row.companyId,
        source_company_key: row.companyId,
        name: row.companyName,
        domain: row.domain,
        website: row.website,
      }));
    } catch { /* ignore */ }
    navigate(`/app/companies/${encodeURIComponent(row.companyId)}`);
  }

  // "Add to pipeline" — open the Create Deal modal prefilled with this
  // account (+ its enriched contacts). companyUuid is the lit_companies.id
  // used to resolve contacts; companyId is the source_company_key.
  function handleAddToPipeline(row: ListRow) {
    if (!dealStages.length) {
      toast({ title: "Pipeline unavailable", description: "No workspace pipeline yet — open the Pipeline tab to create your first deal.", variant: "destructive" });
      return;
    }
    setPipelineRow({
      savedCompanyId: row.savedId,
      companyKey: row.companyId,
      companyUuid: row.companyUuid,
      companyName: row.companyName,
    });
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: theme.bg }}>
      {/* Header — Phase B.3 design-source alignment.
          KPI strip removed (was 4 tiles). Filter chips removed (was All /
          High value / Active / Recent). Subtitle now exactly:
          "{N} saved companies · Sorted by shipments". Top-right action row
          adds an Import button (disabled, "coming soon") and an Add Company
          button that mounts the existing AddCompanyModal. */}
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${theme.border}`,
          background:
            mode === 'dark'
              ? `radial-gradient(circle at 0% 0%, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0) 35%), linear-gradient(180deg, ${theme.panel} 0%, ${theme.bg} 100%)`
              : 'radial-gradient(circle at 0% 0%, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0) 35%), linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 700, color: mode === 'dark' ? '#A5B4FC' : '#6366F1', letterSpacing: '0.24em', textTransform: 'uppercase' }}>
              Revenue Intelligence
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, color: theme.heading, letterSpacing: '-0.02em', marginTop: 4 }}>
              Command Center
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
              {sortedRows.length} saved companies · Sorted by {SORT_LABELS[sortKey]}
            </div>
          </div>

          {/* Import + Add Company removed — LIT doesn't offer manual upload.
              Companies enter the workspace only via Pulse save. */}
        </div>

        {/* Search row — chips removed in Phase B.3. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 340 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: theme.textFaint }} />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search companies, routes, domains…"
              style={{
                width: '100%', background: theme.inputBg, border: `1.5px solid ${theme.borderStrong}`, borderRadius: 10,
                padding: '7px 12px 7px 30px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                color: theme.text, outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = theme.accentBorder; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)'; }}
              onBlur={(e)  => { e.target.style.borderColor = theme.borderStrong; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 10,
              border: '1.5px solid ' + (activeFilterCount > 0 ? theme.accentBorder : theme.borderStrong),
              background: activeFilterCount > 0 ? theme.accentSoft : theme.panel,
              color: activeFilterCount > 0 ? theme.accentSoftText : theme.text,
              fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Filter style={{ width: 13, height: 13 }} />
            Filters
            {activeFilterCount > 0 ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                background: theme.accentBorder, color: '#FFFFFF', fontSize: 10, fontWeight: 700,
              }}>{activeFilterCount}</span>
            ) : null}
          </button>

          {/* Sort control — mirrors (and drives) the column-header sort.
              Selecting an option applies the natural direction for it:
              newest/biggest first, except company name which sorts A→Z. */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textMuted }}>
              Sort
            </span>
            <select
              value={sortKey}
              onChange={(e) => {
                const key = e.target.value as SortableKey;
                setSortKey(key);
                setSortDir(key === 'companyName' ? 1 : -1);
              }}
              style={{ ...fieldControlStyle(theme), width: 'auto', minWidth: 150 }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: theme.textFaint, fontFamily: "'DM Sans', sans-serif", marginLeft: 'auto' }}>
            {formatNumber(sortedRows.length)} shown
          </div>
        </div>

        {filtersOpen ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <FilterField label="Country">
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                style={fieldControlStyle(theme)}
              >
                <option value="">All countries</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FilterField>

            <FilterField label="City">
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                style={fieldControlStyle(theme)}
              >
                <option value="">All cities</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FilterField>

            <FilterField label="State / Region">
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                style={fieldControlStyle(theme)}
              >
                <option value="">All states</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Route country">
              <input
                type="text"
                value={filterRouteCountry}
                onChange={(e) => setFilterRouteCountry(e.target.value)}
                placeholder="e.g. CN or China"
                style={fieldControlStyle(theme)}
              />
            </FilterField>

            <FilterField label="Status">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                style={fieldControlStyle(theme)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </FilterField>

            <FilterField label="Contacts">
              <select
                value={filterHasContacts}
                onChange={(e) => setFilterHasContacts(e.target.value as any)}
                style={fieldControlStyle(theme)}
              >
                <option value="all">All accounts</option>
                <option value="yes">With contacts</option>
                <option value="no">Without contacts</option>
              </select>
            </FilterField>

            <FilterField label="Mode">
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as any)}
                style={fieldControlStyle(theme)}
              >
                <option value="all">FCL + LCL</option>
                <option value="fcl">FCL only</option>
                <option value="lcl">LCL only</option>
              </select>
            </FilterField>

            <FilterField label="Lane contains">
              <input
                type="text"
                value={filterLane}
                onChange={(e) => setFilterLane(e.target.value)}
                placeholder="e.g. CN→US"
                style={fieldControlStyle(theme)}
              />
            </FilterField>

            <FilterField label="Min shipments 12M">
              <input
                type="number"
                min={0}
                value={filterMinShipments}
                onChange={(e) => setFilterMinShipments(e.target.value)}
                placeholder="0"
                style={fieldControlStyle(theme)}
              />
            </FilterField>

            <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  padding: '7px 12px',
                  border: `1.5px solid ${theme.borderStrong}`,
                  borderRadius: 10,
                  background: theme.panel,
                  color: theme.textMuted,
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset filters
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Table area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {savedLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 0', color: theme.textMuted, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
            <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
            Loading saved companies…
          </div>
        ) : savedError ? (
          <div style={{ padding: '40px 24px', color: theme.danger, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{savedError}</div>
        ) : sortedRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: theme.panelMuted, marginBottom: 16 }}>
              <Building2 style={{ width: 24, height: 24, color: theme.textFaint }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.heading, fontFamily: "'Space Grotesk', sans-serif" }}>No saved companies match this view</div>
            <div style={{ fontSize: 13, color: theme.textMuted, fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>Try changing your search, or add a new company.</div>
          </div>
        ) : (
          <>
          {/* Phase B.7 — desktop renders the 9-column table (≥md). Mobile
              renders compact cards instead so narrow viewports don't have to
              horizontally scroll a 1200px table. */}
          <div className="hidden md:block" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: theme.panel, borderBottom: `1px solid ${theme.border}` }}>
                {TABLE_COLS.map((col) => {
                  const isSorted = col.sortable && col.key === sortKey;
                  return (
                    <th
                      key={col.key}
                      style={{
                        width: col.width, textAlign: 'left', padding: '10px 10px',
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
                        color: theme.textFaint, fontFamily: "'Space Grotesk', sans-serif",
                        cursor: col.sortable ? 'pointer' : 'default',
                        whiteSpace: 'nowrap', userSelect: 'none',
                        background: theme.panel,
                      }}
                      onClick={() => col.sortable && toggleSort(col.key as SortableKey)}
                    >
                      {col.label}
                      {isSorted && (
                        <span style={{ marginLeft: 3, color: theme.accentBorder }}>{sortDir > 0 ? '↑' : '↓'}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody style={{ background: theme.panel }}>
              {paginatedRows.map((row, index) => {
                const st = statusStyle(mode, statusForRow(row));
                const hasActivity = (row.shipments12m || 0) > 0;
                return (
                  <motion.tr
                    key={row.key}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.012 }}
                    onClick={() => handleOpenCompany(row)}
                    style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', transition: 'background 120ms', background: theme.panel }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.hover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = theme.panel)}
                  >
                    {/* Company */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <CompanyAvatar
                          name={row.companyName}
                          domain={row.domain || row.website || undefined}
                          size="sm"
                          className="shrink-0"
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row.companyName}
                            </span>
                            {row.sharedBy ? (
                              <span
                                title={`Saved by ${row.sharedBy} (workspace share)`}
                                style={{
                                  flexShrink: 0, fontSize: 9, fontWeight: 700,
                                  fontFamily: "'Space Grotesk', sans-serif",
                                  color: mode === 'dark' ? '#A5B4FC' : '#4338CA',
                                  background: mode === 'dark' ? 'rgba(99,102,241,0.18)' : '#EEF2FF',
                                  border: `1px solid ${mode === 'dark' ? 'rgba(99,102,241,0.4)' : '#C7D2FE'}`, borderRadius: 9999,
                                  padding: '1px 7px', whiteSpace: 'nowrap',
                                }}
                              >
                                Saved by {row.sharedBy}
                              </span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: 10, color: theme.textFaint, fontFamily: "'DM Sans', sans-serif", marginTop: 1 }}>
                            {row.address || row.countryCode || row.domain || '—'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Last Shipment */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                      <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: "'DM Sans', sans-serif" }}>
                        {formatDate(row.lastActivity)}
                      </span>
                    </td>

                    {/* Shipments 12M */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: mode === 'dark' ? '#93C5FD' : '#1d4ed8' }}>
                        {formatNumber(row.shipments12m)}
                      </span>
                    </td>

                    {/* TEU 12M */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: mode === 'dark' ? '#CBD5E1' : '#374151' }}>
                        {formatNumber(row.teu12m, 1)}
                      </span>
                    </td>

                    {/* Est. Spend */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: mode === 'dark' ? '#CBD5E1' : '#374151' }}>
                        {formatCurrency(row.estSpend12m)}
                      </span>
                    </td>

                    {/* Top Route — Phase B.6: truncate inside the fixed
                        column width so long lane labels don't bleed into the
                        Activity column. The <span> wraps on its container so
                        the chip background sizes to text up to the column
                        edge, then ellipses; full label surfaces via title. */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', overflow: 'hidden' }}>
                      <span
                        title={row.topRoute12m || row.recentRoute || ''}
                        style={{
                          display: 'block',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                          color: theme.textMuted,
                          background: theme.panelMuted,
                          padding: '2px 7px',
                          borderRadius: 4,
                        }}
                      >
                        {row.topRoute12m || row.recentRoute || '—'}
                      </span>
                    </td>

                    {/* Activity — Phase B.6: td gets overflow:hidden + nowrap
                        and an explicit minWidth: 84 so the badge sizes to its
                        content within the 9% column width without ever
                        pushing into Status/View, and never collapses below
                        legibility on narrow viewports. */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 84 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        fontSize: 11, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                        padding: '2px 7px', borderRadius: 9999, whiteSpace: 'nowrap',
                        ...(hasActivity
                          ? { color: mode === 'dark' ? '#4ADE80' : '#15803d', background: 'rgba(34,197,94,0.14)' }
                          : { color: theme.textFaint, background: theme.panelMuted }),
                      }}>
                        {hasActivity ? '↑ Active' : '→ Idle'}
                      </span>
                    </td>

                    {/* Status — Phase B.6: minWidth 96 floors the column
                        so the dot+label pill always renders in full at any
                        viewport above the 1200px table min-width. */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 96 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                        fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                        {st.label}
                      </span>
                    </td>

                    {/* View action — Phase B.8: the column is a fixed 208px
                        (see TABLE_COLS), sized so all three buttons
                        (View → / Add / Deal) render in full on one line.
                        Previously 9% of the table min-width (~108px) with
                        overflow:hidden, which clipped the Deal button at
                        normal zoom. */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenCompany(row); }}
                          style={{
                            fontSize: 11, fontWeight: 600,
                            background: mode === 'dark' ? 'rgba(59,130,246,0.16)' : '#EFF6FF',
                            color: mode === 'dark' ? '#93C5FD' : '#3b82f6',
                            border: `1px solid ${mode === 'dark' ? 'rgba(59,130,246,0.4)' : '#BFDBFE'}`, borderRadius: 6, padding: '4px 10px',
                            cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap',
                          }}
                        >
                          View →
                        </button>
                        {row.companyId ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setCampaignModalRow(row); }}
                            title="Add to Campaign"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: 11,
                              fontWeight: 600,
                              background: theme.panel,
                              color: theme.textMuted,
                              border: `1px solid ${theme.border}`,
                              borderRadius: 6,
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontFamily: "'Space Grotesk', sans-serif",
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Send style={{ width: 11, height: 11 }} />
                            Add
                          </button>
                        ) : null}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddToPipeline(row); }}
                          title="Add to pipeline"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 11,
                            fontWeight: 600,
                            background: theme.panel,
                            color: mode === 'dark' ? '#A5B4FC' : '#4338CA',
                            border: `1px solid ${mode === 'dark' ? 'rgba(99,102,241,0.4)' : '#C7D2FE'}`,
                            borderRadius: 6,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontFamily: "'Space Grotesk', sans-serif",
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Plus style={{ width: 11, height: 11 }} />
                          Deal
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Phase B.7 — mobile card view (<md). Each card mirrors the table
              row's data: company identity, last shipment, shipments 12M, TEU
              12M, top route, status pill, and View affordance. Tapping the
              card opens the company; the small Add icon stops propagation
              and opens the Add-to-Campaign modal. */}
          <div className="block md:hidden p-3 space-y-2">
            {paginatedRows.map((row) => {
              const st = statusStyle(mode, statusForRow(row));
              return (
                <div
                  key={`m-${row.key}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenCompany(row)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenCompany(row); } }}
                  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50 transition cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:shadow-none dark:hover:bg-slate-800"
                >
                  <div className="flex items-start gap-3">
                    <CompanyAvatar
                      name={row.companyName}
                      domain={row.domain || row.website || undefined}
                      size="sm"
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate dark:text-slate-100" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {row.companyName}
                      </div>
                      {row.sharedBy ? (
                        <span
                          className="mt-0.5 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-px text-[9px] font-bold text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          Saved by {row.sharedBy}
                        </span>
                      ) : null}
                      <div className="text-[11px] text-slate-500 truncate dark:text-slate-400" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {row.address || row.countryCode || row.domain || '—'}
                      </div>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999,
                      background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                      fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Last Shipment</div>
                      <div className="text-slate-700 dark:text-slate-300">{formatSafeShipmentDate(row.lastActivity, '—')}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Shipments 12M</div>
                      <div className="font-mono text-blue-700 font-semibold dark:text-blue-300">{formatNumber(row.shipments12m)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">TEU 12M</div>
                      <div className="font-mono text-slate-900 dark:text-slate-100">{formatNumber(row.teu12m, 1)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Top Route</div>
                      <div className="truncate text-slate-700 dark:text-slate-300" title={row.topRoute12m || row.recentRoute || ''}>
                        {row.topRoute12m || row.recentRoute || '—'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-300">View →</span>
                    <div className="flex items-center gap-1.5">
                      {row.companyId ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setCampaignModalRow(row); }}
                          title="Add to Campaign"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          <Send className="h-3 w-3" />
                          Add
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleAddToPipeline(row); }}
                        title="Add to pipeline"
                        className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        <Plus className="h-3 w-3" />
                        Deal
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {/* Add-to-Campaign modal. Pass the lit_companies.id UUID — the FK
          target — not the source_company_key slug. */}
      {campaignModalRow ? (
        <AddToCampaignModal
          open={Boolean(campaignModalRow)}
          onClose={() => setCampaignModalRow(null)}
          company={{
            company_id: campaignModalRow.companyUuid,
            name: campaignModalRow.companyName,
          }}
        />
      ) : null}

      {/* Create-deal modal — prefilled from the saved company row. */}
      {pipelineRow ? (
        <CreateDealModal
          stages={dealStages}
          prefill={pipelineRow}
          onClose={() => setPipelineRow(null)}
          onCreated={() => {
            setPipelineRow(null);
            toast({ title: "Deal added to pipeline", description: "Open the Pipeline tab to see it." });
          }}
        />
      ) : null}

      {/* AddCompanyModal removed — manual entry is no longer offered. */}

      {/* Pagination */}
      {!savedLoading && !savedError && sortedRows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: `1px solid ${theme.border}`, background: theme.panelAlt, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: "'DM Sans', sans-serif" }}>
            Showing {pageStart}–{pageEnd} of {sortedRows.length} companies
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px',
                borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.panel,
                fontSize: 12, fontWeight: 600, color: theme.textMuted, cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.4 : 1, fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
              Prev
            </button>
            <span style={{ padding: '0 10px', height: 32, display: 'inline-flex', alignItems: 'center', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.panel, fontSize: 12, fontWeight: 700, color: theme.text, fontFamily: "'Space Grotesk', sans-serif" }}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px',
                borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.panel,
                fontSize: 12, fontWeight: 600, color: theme.textMuted, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.4 : 1, fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Next
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Theme-aware form-control style shared by the filter selects/inputs. Replaces
// the former static selectStyle/inputStyle constants so dark mode themes them.
function fieldControlStyle(theme: CrmThemeTokens): React.CSSProperties {
  return {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 8,
    border: `1.5px solid ${theme.borderStrong}`,
    background: theme.inputBg,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 12.5,
    color: theme.text,
    outline: 'none',
  };
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useCrmTheme();
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: theme.textMuted,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}