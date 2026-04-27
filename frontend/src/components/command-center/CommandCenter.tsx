"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { listSavedCompanies, enrichCompaniesFromKpis } from "@/lib/api";
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
} from "lucide-react";
import AddToCampaignModal from "./AddToCampaignModal";
import AddCompanyModal from "./AddCompanyModal";

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
};

type SortableKey = keyof Pick<ListRow, 'companyName' | 'lastActivity' | 'shipments12m' | 'teu12m' | 'estSpend12m' | 'topRoute12m'>;

// Phase B.3 — table trimmed to 9 columns. Stage and Contacts dropped per the
// validated design source (LIT Platform.html). Stage data still gets fetched
// to avoid breaking server contracts; we just stop rendering it. Contact
// counts are still loaded and stored in `contactCounts` so we never break
// the upstream lit_contacts probe.
//
// Phase B.6 — column widths re-tuned. The B.3 split squeezed Top Route into
// 11% which overlapped Activity/Status/View on common 1280–1440 viewports.
// New split (sums to 100%) gives Top Route a comfortable 15% with explicit
// truncation, while clamping the right-hand badges/actions to 9% each.
const TABLE_COLS: Array<{ key: SortableKey | 'activity' | 'status' | 'actions'; label: string; width: string; sortable: boolean }> = [
  { key: 'companyName',  label: 'Company',       width: '22%', sortable: true },
  { key: 'lastActivity', label: 'Last Shipment', width: '10%', sortable: true },
  { key: 'shipments12m', label: 'Shipments 12M', width: '9%',  sortable: true },
  { key: 'teu12m',       label: 'TEU 12M',       width: '8%',  sortable: true },
  { key: 'estSpend12m',  label: 'Est. Spend',    width: '9%',  sortable: true },
  { key: 'topRoute12m',  label: 'Top Route',     width: '15%', sortable: true },
  { key: 'activity',     label: 'Activity',      width: '9%',  sortable: false },
  { key: 'status',       label: 'Status',        width: '9%',  sortable: false },
  { key: 'actions',      label: 'View',          width: '9%',  sortable: false },
];

const STATUS_STYLE = {
  active:   { bg: '#F0FDF4', color: '#15803d', border: '#BBF7D0', dot: '#22C55E', label: 'Active'   },
  pending:  { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', dot: '#F59E0B', label: 'Pending'  },
  inactive: { bg: '#F1F5F9', color: '#64748b', border: '#E2E8F0', dot: '#94A3B8', label: 'Inactive' },
};

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
  };
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [savedCompanies, setSavedCompanies] = useState<CommandCenterRecord[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortableKey>('shipments12m');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

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
  // AddCompanyModal (not modified in this phase, only consumed).
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);

  const reloadSavedCompanies = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const response = (await listSavedCompanies()) as SavedCompaniesResponse;
      const rows = normalizeSavedCompaniesResponse(response);
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
      } catch {
        if (isMounted) setContactCounts({});
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [savedCompanies]);

  const listRows = useMemo(() => savedCompanies.map(buildListRow).filter((r) => r.key), [savedCompanies]);

  // Phase B.3 — search-only filtering. The four "All / High value / Active /
  // Recent" chips were removed per the validated design source.
  const filteredRows = useMemo(() => {
    const lower = searchTerm.trim().toLowerCase();
    return listRows.filter((row) => {
      const haystack = [row.companyName, row.domain, row.website, row.address, row.countryCode, row.topRoute12m, row.recentRoute]
        .filter(Boolean).join(" ").toLowerCase();
      return !lower || haystack.includes(lower);
    });
  }, [listRows, searchTerm]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const an = parseFloat(String(av).replace(/[^0-9.-]/g, ''));
      const bn = parseFloat(String(bv).replace(/[^0-9.-]/g, ''));
      if (!isNaN(an) && !isNaN(bn)) return sortDir * (an - bn);
      return sortDir * String(av).localeCompare(String(bv));
    });
  }, [filteredRows, sortKey, sortDir]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F8FAFC' }}>
      {/* Header — Phase B.3 design-source alignment.
          KPI strip removed (was 4 tiles). Filter chips removed (was All /
          High value / Active / Recent). Subtitle now exactly:
          "{N} saved companies · Sorted by shipments". Top-right action row
          adds an Import button (disabled, "coming soon") and an Add Company
          button that mounts the existing AddCompanyModal. */}
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #E5E7EB',
          background:
            'radial-gradient(circle at 0% 0%, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0) 35%), linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 700, color: '#6366F1', letterSpacing: '0.24em', textTransform: 'uppercase' }}>
              Revenue Intelligence
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginTop: 4 }}>
              Command Center
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {sortedRows.length} saved companies · Sorted by shipments
            </div>
          </div>

          {/* Top-right action buttons — Import (disabled) + Add Company. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              disabled
              title="Import flow coming soon"
              className="cursor-not-allowed opacity-60"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 9999,
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#475569',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              <Upload style={{ width: 14, height: 14 }} />
              Import
            </button>
            <button
              type="button"
              onClick={() => setAddCompanyOpen(true)}
              className="bg-[#0F172A] text-white hover:bg-[#1E293B]"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 9999,
                border: '1px solid #0F172A',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Space Grotesk', sans-serif",
                cursor: 'pointer',
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              Add Company
            </button>
          </div>
        </div>

        {/* Search row — chips removed in Phase B.3. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 340 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#94a3b8' }} />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search companies, routes, domains…"
              style={{
                width: '100%', background: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: 10,
                padding: '7px 12px 7px 30px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                color: '#0F172A', outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)'; }}
              onBlur={(e)  => { e.target.style.borderColor = '#CBD5E1'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8', fontFamily: "'DM Sans', sans-serif" }}>
            <Filter style={{ width: 13, height: 13 }} />
            {formatNumber(sortedRows.length)} shown
          </div>
        </div>
      </div>

      {/* Table area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {savedLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 0', color: '#64748b', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
            <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
            Loading saved companies…
          </div>
        ) : savedError ? (
          <div style={{ padding: '40px 24px', color: '#dc2626', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{savedError}</div>
        ) : sortedRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', marginBottom: 16 }}>
              <Building2 style={{ width: 24, height: 24, color: '#94a3b8' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', fontFamily: "'Space Grotesk', sans-serif" }}>No saved companies match this view</div>
            <div style={{ fontSize: 13, color: '#64748b', fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>Try changing your search, or add a new company.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {/* Phase B.6 — table sets a min-width: 1200px floor; the wrapper
              above carries the horizontal scroll. Below that viewport the
              fixed-% column widths would otherwise compress into overlapping
              text; horizontal scroll keeps every column honest at the cost
              of a scroll bar on narrow screens. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 1200 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
                {TABLE_COLS.map((col) => {
                  const isSorted = col.sortable && col.key === sortKey;
                  return (
                    <th
                      key={col.key}
                      style={{
                        width: col.width, textAlign: 'left', padding: '10px 14px',
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
                        color: '#94A3B8', fontFamily: "'Space Grotesk', sans-serif",
                        cursor: col.sortable ? 'pointer' : 'default',
                        whiteSpace: 'nowrap', userSelect: 'none',
                      }}
                      onClick={() => col.sortable && toggleSort(col.key as SortableKey)}
                    >
                      {col.label}
                      {isSorted && (
                        <span style={{ marginLeft: 3, color: '#3B82F6' }}>{sortDir > 0 ? '↑' : '↓'}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, index) => {
                const st = STATUS_STYLE[statusForRow(row)];
                const hasActivity = (row.shipments12m || 0) > 0;
                return (
                  <motion.tr
                    key={row.key}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.012 }}
                    onClick={() => handleOpenCompany(row)}
                    style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background 120ms' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    {/* Company */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <CompanyAvatar
                          name={row.companyName}
                          domain={row.domain || row.website || undefined}
                          size="sm"
                          className="shrink-0"
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.companyName}
                          </div>
                          <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: "'DM Sans', sans-serif", marginTop: 1 }}>
                            {row.address || row.countryCode || row.domain || '—'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Last Shipment */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <span style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Sans', sans-serif" }}>
                        {formatDate(row.lastActivity)}
                      </span>
                    </td>

                    {/* Shipments 12M */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
                        {formatNumber(row.shipments12m)}
                      </span>
                    </td>

                    {/* TEU 12M */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151' }}>
                        {formatNumber(row.teu12m, 1)}
                      </span>
                    </td>

                    {/* Est. Spend */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151' }}>
                        {formatCurrency(row.estSpend12m)}
                      </span>
                    </td>

                    {/* Top Route — Phase B.6: truncate inside the fixed
                        column width so long lane labels don't bleed into the
                        Activity column. The <span> wraps on its container so
                        the chip background sizes to text up to the column
                        edge, then ellipses; full label surfaces via title. */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', overflow: 'hidden' }}>
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
                          color: '#64748b',
                          background: '#F1F5F9',
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
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 84 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        fontSize: 11, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                        padding: '2px 7px', borderRadius: 9999, whiteSpace: 'nowrap',
                        ...(hasActivity
                          ? { color: '#15803d', background: 'rgba(34,197,94,0.1)' }
                          : { color: '#94A3B8', background: '#F1F5F9' }),
                      }}>
                        {hasActivity ? '↑ Active' : '→ Idle'}
                      </span>
                    </td>

                    {/* Status — Phase B.6: minWidth 96 floors the column
                        so the dot+label pill always renders in full at any
                        viewport above the 1200px table min-width. */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 96 }}>
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

                    {/* View action — Phase B.6: minWidth 80 keeps the
                        "View →" + Add buttons on a single line at narrow
                        viewports. */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 80 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenCompany(row); }}
                          style={{
                            fontSize: 11, fontWeight: 600, background: '#EFF6FF', color: '#3b82f6',
                            border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px',
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
                              background: '#FFFFFF',
                              color: '#475569',
                              border: '1px solid #E2E8F0',
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
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          </div>
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

      {/* Phase B.3 — top-right "Add Company" hooks the existing AddCompanyModal.
          On close (whether saved or cancelled) we re-call listSavedCompanies()
          so a freshly saved row appears without a hard reload. */}
      {addCompanyOpen ? (
        <AddCompanyModal
          open={addCompanyOpen}
          onClose={() => {
            setAddCompanyOpen(false);
            // Defer the refresh until the next tick so the modal's own
            // localStorage write (in saveRow / submit) lands first.
            setTimeout(() => { void reloadSavedCompanies(); }, 0);
          }}
          onSaved={() => {
            setAddCompanyOpen(false);
            setTimeout(() => { void reloadSavedCompanies(); }, 0);
          }}
        />
      ) : null}

      {/* Pagination */}
      {!savedLoading && !savedError && sortedRows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid #E5E7EB', background: '#FAFAFA', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Sans', sans-serif" }}>
            Showing {pageStart}–{pageEnd} of {sortedRows.length} companies
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px',
                borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF',
                fontSize: 12, fontWeight: 600, color: '#374151', cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.4 : 1, fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
              Prev
            </button>
            <span style={{ padding: '0 10px', height: 32, display: 'inline-flex', alignItems: 'center', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', fontSize: 12, fontWeight: 700, color: '#0F172A', fontFamily: "'Space Grotesk', sans-serif" }}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px',
                borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF',
                fontSize: 12, fontWeight: 600, color: '#374151', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
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