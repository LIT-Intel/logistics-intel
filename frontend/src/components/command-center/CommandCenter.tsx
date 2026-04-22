"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { listSavedCompanies, enrichCompaniesFromKpis } from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { useToast } from "@/components/ui/use-toast";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Search,
} from "lucide-react";

type FilterTab = "all" | "high_value" | "active" | "recent";

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

const FILTER_TABS: Array<{ id: FilterTab; label: string }> = [
  { id: "all", label: "All saved" },
  { id: "high_value", label: "High value" },
  { id: "active", label: "Active shippers" },
  { id: "recent", label: "Recent activity" },
];

const TABLE_COLS: Array<{ key: SortableKey | 'activity' | 'status' | 'actions'; label: string; width: string; sortable: boolean }> = [
  { key: 'companyName',  label: 'Company',       width: '22%', sortable: true },
  { key: 'lastActivity', label: 'Last Shipment',  width: '12%', sortable: true },
  { key: 'shipments12m', label: 'Shipments 12m',  width: '11%', sortable: true },
  { key: 'teu12m',       label: 'TEU 12m',        width: '9%',  sortable: true },
  { key: 'estSpend12m',  label: 'Est. Spend',     width: '10%', sortable: true },
  { key: 'topRoute12m',  label: 'Top Route',      width: '12%', sortable: true },
  { key: 'activity',     label: 'Activity',       width: '9%',  sortable: false },
  { key: 'status',       label: 'Status',         width: '9%',  sortable: false },
  { key: 'actions',      label: '',               width: '6%',  sortable: false },
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function companyInitialColor(name: string) {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1'];
  return colors[(name.charCodeAt(0) || 0) % colors.length];
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
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortableKey>('shipments12m');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  useEffect(() => {
    let isMounted = true;

    async function loadSavedCompanies() {
      setSavedLoading(true);
      setSavedError(null);

      try {
        const response = (await listSavedCompanies()) as SavedCompaniesResponse;
        const rows = normalizeSavedCompaniesResponse(response);

        if (!isMounted) return;

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
        if (!isMounted) return;
        setSavedError(error?.message ?? "Failed to load saved companies");
        setSavedCompanies([]);
      } finally {
        if (isMounted) setSavedLoading(false);
      }
    }

    loadSavedCompanies();
    return () => { isMounted = false; };
  }, []);

  const listRows = useMemo(() => savedCompanies.map(buildListRow).filter((r) => r.key), [savedCompanies]);

  const filteredRows = useMemo(() => {
    const lower = searchTerm.trim().toLowerCase();
    return listRows.filter((row) => {
      const haystack = [row.companyName, row.domain, row.website, row.address, row.countryCode, row.topRoute12m, row.recentRoute]
        .filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !lower || haystack.includes(lower);
      const lastActivityTime = row.lastActivity ? new Date(row.lastActivity).getTime() : null;
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let matchesFilter = true;
      if (activeFilter === "high_value")   matchesFilter = (row.estSpend12m || 0) >= 100000 || (row.teu12m || 0) >= 100;
      else if (activeFilter === "active")  matchesFilter = (row.shipments12m || 0) >= 12;
      else if (activeFilter === "recent")  matchesFilter = !!lastActivityTime && lastActivityTime >= thirtyDaysAgo;
      return matchesSearch && matchesFilter;
    });
  }, [listRows, searchTerm, activeFilter]);

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

  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeFilter]);

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

  const summaryMetrics = useMemo(() => ({
    totalCompanies: listRows.length,
    totalShipments: listRows.reduce((s, r) => s + (r.shipments12m || 0), 0),
    activeAccounts:  listRows.filter((r) => (r.shipments12m || 0) > 0).length,
  }), [listRows]);

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
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB', background: '#FFFFFF', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Command Center
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {sortedRows.length} saved companies · {formatNumber(summaryMetrics.totalShipments)} shipments · {summaryMetrics.activeAccounts} active
            </div>
          </div>
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTER_TABS.map((tab) => {
              const active = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    borderRadius: 9999, padding: '5px 12px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 120ms',
                    fontFamily: "'Space Grotesk', sans-serif",
                    ...(active
                      ? { background: '#0F172A', color: '#fff', border: '1px solid #0F172A' }
                      : { background: '#FFFFFF', color: '#475569', border: '1px solid #E5E7EB' }),
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 340, marginLeft: 4 }}>
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
            <div style={{ fontSize: 13, color: '#64748b', fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>Try changing your filters or save more companies from Search.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
                        <div style={{
                          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                          background: companyInitialColor(row.companyName),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff',
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}>
                          {row.companyName[0]?.toUpperCase() ?? '?'}
                        </div>
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

                    {/* Shipments 12m */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
                        {formatNumber(row.shipments12m)}
                      </span>
                    </td>

                    {/* TEU 12m */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151' }}>
                        {formatNumber(row.teu12m, 1)}
                      </span>
                    </td>

                    {/* Est. Spend */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151' }}>
                        {formatCurrency(row.estSpend12m)}
                      </span>
                    </td>

                    {/* Top Route */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#64748b', background: '#F1F5F9', padding: '2px 7px', borderRadius: 4 }}>
                        {row.topRoute12m || row.recentRoute || '—'}
                      </span>
                    </td>

                    {/* Activity */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                        padding: '2px 7px', borderRadius: 9999,
                        ...(hasActivity
                          ? { color: '#15803d', background: 'rgba(34,197,94,0.1)' }
                          : { color: '#94A3B8', background: '#F1F5F9' }),
                      }}>
                        {hasActivity ? '↑ Active' : '→ Idle'}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
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

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
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
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
