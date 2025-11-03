import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, List as ListIcon, Sliders, TrendingUp, Ship, Clock, Box, Zap, X, MapPin, Search as SearchIcon, Bookmark, Bell, ArrowRight, Lock, DollarSign } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { hasFeature } from '@/lib/access';

// Keep existing app wiring and proxies intact
import { searchCompanies, getFilterOptions, saveCompanyToCrm, getCompanyKey, getCompanyKpis } from '@/lib/api';
import { API_BASE } from '@/lib/env';
import { Button } from '@/components/ui/button';
import AutocompleteInput from '@/components/search/AutocompleteInput';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import CompanyModal from '@/components/search/CompanyModal';
import { FiltersDrawer } from '@/components/FiltersDrawer';
import SearchEmpty from '@/components/SearchEmpty';

// --- Design Tokens (UI only; no API impact) ---
const STYLES = {
  brandPurple: '#7F3DFF',
  neutralGrayLight: '#F9FAFB',
  neutralBorder: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
};

// --- Helpers ---
function kLastActivity(v: any): string {
  if (!v) return '—';
  if (typeof v === 'object' && 'value' in v) return String((v as any).value || '—');
  return String(v);
}

function ResultKPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 border border-gray-200 rounded-xl bg-white text-center min-h-[96px] flex flex-col items-center justify-center w-full overflow-hidden">
      <div className="flex items-center justify-center mb-1 shrink-0">{icon}</div>
      <div className="text-xl font-bold text-gray-900 truncate w-full max-w-full" title={String(value ?? '—')}>{value ?? '—'}</div>
      <div className="text-[11px] uppercase text-gray-500 font-medium mt-1 truncate w-full max-w-full" title={label}>{label}</div>
    </div>
  );
}

function SaveToCommandCenterButton({ row, size = 'sm', activeFilters }: { row: any; size?: 'sm'|'md'; activeFilters?: any }) {
  const { user } = useAuth() as any;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(() => {
    try {
      const a = JSON.parse(localStorage.getItem('lit_companies') || '[]');
      const key = getCompanyKey({ company_id: row?.company_id, company_name: row?.company_name });
      return Array.isArray(a) && a.some((c: any) => String(c?.id||'') === key);
    } catch { return false; }
  });
  const [showUpsell, setShowUpsell] = useState(false);
  const onClick = async () => {
    if (saving || saved) return;
    // Gating: require subscription unless whitelisted email
    const email = String(user?.email || '').toLowerCase();
    const allowed = email === 'vraymond@logisticintel.com' || email === 'support@logisticintel.com' || hasFeature('crm');
    if (!allowed) { setShowUpsell(true); return; }
    setSaving(true);
    try {
      const cname = String(row?.company_name || '');
      const cid = getCompanyKey({ company_id: row?.company_id, company_name: cname });
      try { await saveCompanyToCrm({ company_id: cid, company_name: cname, source: 'search' }); } catch {}
      const lsKey = 'lit_companies';
      const existing = JSON.parse(localStorage.getItem(lsKey) || '[]');
      if (!existing.find((c: any)=> String(c?.id||'') === cid)) {
        const kpis = {
          shipments12m: row?.shipments_12m || 0,
          lastActivity: kLastActivity(row?.last_activity),
          originsTop: Array.isArray(row?.top_routes) ? row.top_routes.map((r: any)=> r.origin_country) : [],
          destsTop: Array.isArray(row?.top_routes) ? row.top_routes.map((r: any)=> r.dest_country) : [],
          carriersTop: Array.isArray(row?.top_carriers) ? row.top_carriers.map((c: any)=> c.carrier) : [],
        };
        const fresh = { id: cid, name: cname, kpis, savedAt: Date.now() };
        localStorage.setItem(lsKey, JSON.stringify([fresh, ...existing]));
        try { window.dispatchEvent(new StorageEvent('storage', { key: lsKey } as any)); } catch {}
      }
      // Persist selection for Command Center hydration with filters
      try {
        const cc = {
          company_id: cid,
          name: cname,
          savedAt: new Date().toISOString(),
          filters: normalizeFilters(activeFilters || {})
        };
        localStorage.setItem('cc:savedCompany', JSON.stringify(cc));
        localStorage.setItem('lit:selectedCompany', JSON.stringify({ company_id: cid, name: cname, domain: (row as any)?.domain ?? null }));
      } catch {}
      // Navigate to Command Center
      try { window.location.href = '/app/command-center'; } catch {}
      setSaved(true);
    } finally { setSaving(false); }
  };
  return (
    <>
      <button
        onClick={onClick}
        disabled={saving || saved}
        className={cn('px-4 py-2 text-sm text-white rounded-lg transition hover:opacity-90')}
        style={{ backgroundColor: saved ? '#10B981' : STYLES.brandPurple }}
      >
        {saved ? 'Saved' : (saving ? 'Saving…' : 'Save')}
      </button>
      {showUpsell && (
        <div className="fixed inset-0 z-50 bg-gray-900/75 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EEE6FF' }}>
                <Lock className="w-5 h-5" style={{ color: STYLES.brandPurple }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xl font-bold mb-1" style={{ color: STYLES.textPrimary }}>Command Center Access</div>
                <div className="text-sm text-gray-700">Saving companies requires a Pro subscription. Upgrade to unlock saving, contacts enrichment, and alerts.</div>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="px-3 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100" onClick={()=> setShowUpsell(false)}>Not right now</button>
                  <button className="px-3 py-2 text-sm rounded-lg text-white inline-flex items-center gap-1" style={{ backgroundColor: STYLES.brandPurple }} onClick={()=> setShowUpsell(false)}>
                    <DollarSign className="w-4 h-4"/> Upgrade Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const KPI_CACHE = new Map<string, { teus12m: number | null; growthRate: number | null }>();

function ResultCard({ r, onOpen }: { r: any; onOpen: (r: any) => void }) {
  const top = r.top_routes?.[0];
  const name = r.company_name;
  const id = r.company_id || '—';
  const shipments12m = r.shipments_12m ?? 0;
  const lastActivity = kLastActivity(r.last_activity);
  const [teus12m, setTeus12m] = useState<number | null>(null);
  const [growthRate, setGrowthRate] = useState<number | null>(null);
  useEffect(() => {
    const cid = String(r?.company_id || '').trim();
    const cacheKey = cid || `name:${String(r?.company_name || '').toLowerCase()}`;
    if (KPI_CACHE.has(cacheKey)) {
      const k = KPI_CACHE.get(cacheKey)!;
      setTeus12m(k.teus12m); setGrowthRate(k.growthRate); return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data: any = await getCompanyKpis({ company_id: cid || undefined, company_name: cid ? undefined : String(r?.company_name || '') });
        if (cancelled || !data) return;
        const rawTeu = data.total_teus_12m ?? data.teus_12m ?? data.total_teus ?? null;
        const rawGrowth = data.growth_rate ?? data.growthRate ?? null;
        const teuVal = rawTeu != null ? Number(rawTeu) : null;
        const growthVal = rawGrowth != null ? Number(rawGrowth) : null;
        KPI_CACHE.set(cacheKey, { teus12m: teuVal, growthRate: growthVal });
        setTeus12m(teuVal); setGrowthRate(growthVal);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [r?.company_id, r?.company_name]);
  const totalTeusDisplay = teus12m != null ? teus12m.toLocaleString() : ((r as any)?.total_teus != null ? Number((r as any)?.total_teus).toLocaleString() : '—');
  const growthRateDisplay = (() => {
    const val = growthRate ?? (r as any)?.growth_rate;
    if (val == null || isNaN(Number(val))) return '—';
    const n = Number(val);
    const pct = Math.abs(n) <= 1 ? n * 100 : n;
    const rounded = Math.round(pct);
    return `${n >= 0 ? '+' : ''}${rounded}%`;
  })();
  const initials = (name||'').split(' ').map((p: string)=>p[0]).join('').slice(0,2).toUpperCase();
  const key = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
  const [saved, setSaved] = useState<boolean>(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('lit_companies') || '[]');
      return Array.isArray(arr) && arr.some((c: any) => String(c?.id||'') === key);
    } catch { return false; }
  });
  useEffect(() => {
    const onStorage = () => {
      try {
        const arr = JSON.parse(localStorage.getItem('lit_companies') || '[]');
        setSaved(Array.isArray(arr) && arr.some((c: any) => String(c?.id||'') === key));
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const topBorder = { borderTop: `4px solid ${STYLES.brandPurple}` } as const;
  const alias = (r as any)?.domain || '';
  return (
    <div className="rounded-xl bg-white p-5 min-h-[220px] shadow-md hover:shadow-lg transition border border-gray-200 cursor-default" style={topBorder}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] text-slate-500">Company</div>
          <div className="truncate text-xl font-bold text-gray-900" title={name}>{name}</div>
          <div className="text-sm text-gray-500 truncate">{alias || `ID: ${id}`}</div>
          <div className="mt-2 flex items-center gap-2">
            <SaveToCommandCenterButton row={r} />
            <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 text-[11px] px-2 py-0.5">
              Ready
            </span>
          </div>
        </div>
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center text-sm font-semibold select-none">{initials}</div>
      </div>
      <div className="mt-4 border-t border-b border-gray-200 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResultKPI icon={<Ship className="w-4 h-4" style={{ color: STYLES.brandPurple }}/>} label="Shipments (12m)" value={shipments12m} />
        <ResultKPI icon={<Clock className="w-4 h-4 text-gray-500" />} label="Last Activity" value={lastActivity} />
        <ResultKPI icon={<Box className="w-4 h-4 text-gray-500" />} label="Total TEUs" value={totalTeusDisplay} />
        <ResultKPI icon={<TrendingUp className="w-4 h-4 text-gray-500" />} label="Growth Rate" value={growthRateDisplay} />
      </div>
      <div className="flex justify-between items-center mt-3">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          {top ? (<><MapPin className="w-3.5 h-3.5 text-red-500" />{top.origin_country} → {top.dest_country}</>) : 'No route data'}
        </div>
        <button onClick={() => onOpen(r)} className="text-sm text-gray-700 hover:text-gray-900 font-medium inline-flex items-center">Details <ArrowRight className="w-4 h-4 ml-1"/></button>
      </div>
    </div>
  );
}

function ResultsCards({ rows, onOpen, filters }: { rows: any[]; onOpen: (r: any)=>void; filters: any }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {rows.map((r) => (
        <ResultCard key={getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name })} r={r} onOpen={onOpen} filters={filters} />
      ))}
    </div>
  );
}

function ResultsList({ rows, onOpen, selectedKey, filters }: { rows: any[]; onOpen: (r: any)=>void; selectedKey?: string | null; filters: any }) {
  const [savedSet, setSavedSet] = useState<Set<string>>(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('lit_companies') || '[]');
      const s = new Set<string>();
      for (const c of Array.isArray(arr) ? arr : []) { if (c?.id) s.add(String(c.id)); }
      return s;
    } catch { return new Set<string>(); }
  });
  useEffect(() => {
    const onStorage = () => {
      try {
        const arr = JSON.parse(localStorage.getItem('lit_companies') || '[]');
        const s = new Set<string>();
        for (const c of Array.isArray(arr) ? arr : []) { if (c?.id) s.add(String(c.id)); }
        setSavedSet(s);
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return (
    <div className="overflow-x-auto rounded-xl shadow-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            {['Company', 'Shipments (12m)', 'Last Activity', 'Top Route', 'Actions'].map((col) => (
              <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider bg-gray-50">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((r) => {
            const key = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
            const top = r.top_routes?.[0];
            const isSaved = savedSet.has(key);
            return (
              <tr key={key} className={cn("hover:bg-gray-50 transition", selectedKey === key ? "ring-2 ring-indigo-500 ring-offset-1" : "") }>
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="font-medium text-gray-900 truncate max-w-[360px]" title={r.company_name}>{r.company_name}</p>
                  <p className="text-xs text-gray-500">ID: {r.company_id || '—'}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.shipments_12m ?? '—'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kLastActivity(r.last_activity)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center">
                  <MapPin className="w-4 h-4 mr-1 text-red-500" /> {top ? `${top.origin_country} → ${top.dest_country}` : '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <SaveToCommandCenterButton row={r} activeFilters={filters} />
                  <Button variant="ghost" size="sm" className="ml-2" onClick={() => onOpen(r)}>Details</Button>
                  {isSaved && (
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-2 py-0.5 align-middle">Saved</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [view, setView] = useState<'Cards'|'List'|'Filters'|'Explore'>('List');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<any | null>(null);
  const [filterOptions, setFilterOptions] = useState<any>(null);
  const [filters, setFilters] = useState({
    origin: null as string | null,
    destination: null as string | null,
    hs: null as string | null,
    mode: null as 'air' | 'ocean' | null,
    date_start: null as string | null,
    date_end: null as string | null,
    year: null as string | null,
    origin_city: null as string | null,
    dest_city: null as string | null,
    dest_state: null as string | null,
    dest_postal: null as string | null,
    dest_port: null as string | null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getFilterOptions();
        if (cancelled) return;
        setFilterOptions(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const text = err instanceof Error && err.message ? err.message : '';
        const message = text.includes('/public/getFilterOptions')
          ? text.replace('GET /public/getFilterOptions', `GET ${API_BASE}/public/getFilterOptions`)
          : `GET ${API_BASE}/public/getFilterOptions — ${text || 'unknown error'}`;
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildSearchPayload = useCallback(
    (opts: { offset?: number; limit?: number } = {}) => {
      const nextLimit = opts.limit ?? limit;
      const payload: Record<string, any> = {
        q: q.trim(),
        limit: nextLimit,
        offset: opts.offset ?? 0,
      };

      const origin = typeof filters.origin === 'string' ? filters.origin.trim() : '';
      if (origin) payload.origin = [origin];

      const destination = typeof filters.destination === 'string' ? filters.destination.trim() : '';
      if (destination) payload.dest = [destination];

      if (filters.mode) payload.mode = filters.mode;

      if (filters.hs) {
        payload.hs = String(filters.hs)
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
      }

      if (filters.date_start) payload.startDate = filters.date_start;
      if (filters.date_end) payload.endDate = filters.date_end;
      if (filters.origin_city) payload.origin_city = filters.origin_city;
      if (filters.dest_city) payload.dest_city = filters.dest_city;
      if (filters.dest_state) payload.dest_state = filters.dest_state;
      if (filters.dest_postal) payload.dest_postal = filters.dest_postal;
      if (filters.dest_port) payload.dest_port = filters.dest_port;

      return payload;
    },
    [q, filters, limit]
  );

  const performSearch = useCallback(
    async (targetPage: number, customLimit?: number) => {
      const nextLimit = customLimit ?? limit;
      const safePage = Math.max(1, targetPage);
      const offset = (safePage - 1) * nextLimit;

      setLoading(true);
      setError(null);
      setHasSearched(true);
      try {
        const payload = buildSearchPayload({ offset, limit: nextLimit });
        const result = await searchCompanies(payload);
        const nextRows = Array.isArray(result?.rows) ? result.rows : [];
        const nextTotal = typeof result?.total === 'number' ? result.total : nextRows.length;

        setRows(nextRows);
        setTotal(nextTotal);
        setPage(safePage);
        if (limit !== nextLimit) {
          setLimit(nextLimit);
        }
        setHasNext(offset + nextLimit < nextTotal);
      } catch (err) {
        const text = err instanceof Error && err.message ? err.message : '';
        const message = text.includes('/public/searchCompanies')
          ? text.replace('POST /public/searchCompanies', `POST ${API_BASE}/public/searchCompanies`)
          : `POST ${API_BASE}/public/searchCompanies — ${text || 'unknown error'}`;
        setError(message);
        setRows([]);
        setTotal(0);
        setHasNext(false);
      } finally {
        setLoading(false);
      }
    },
    [buildSearchPayload, limit]
  );

  const doSearch = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    void performSearch(1);
  }, [performSearch]);

  const handlePrev = useCallback(() => {
    if (loading || page <= 1) return;
    void performSearch(page - 1);
  }, [loading, page, performSearch]);

  const handleNext = useCallback(() => {
    if (loading || !hasNext) return;
    void performSearch(page + 1);
  }, [loading, hasNext, page, performSearch]);

  const handleLimitChange = useCallback(
    (nextLimit: number) => {
      if (nextLimit === limit) return;
      if (!hasSearched) {
        setLimit(nextLimit);
        setPage(1);
        return;
      }
      setLimit(nextLimit);
      setPage(1);
      void performSearch(1, nextLimit);
    },
    [limit, hasSearched, performSearch]
  );

  const dedupedRows = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of rows) {
      const key = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }, [rows]);

  useEffect(() => {
    try {
      localStorage.setItem('cc:activeFilters', JSON.stringify(normalizeFilters(filters)));
    } catch {}
  }, [filters]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: STYLES.neutralGrayLight }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px] py-6">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 mb-2">Search</h1>
          <p className="text-base text-gray-600 mb-6">Find shippers & receivers. Use filters for origin/dest/HS.</p>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Search Bar */}
        <form onSubmit={doSearch} className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <AutocompleteInput
              value={q}
              onChange={setQ}
              onSubmit={() => doSearch()}
              placeholder="Search by company name or alias (e.g., UPS, Maersk)…"
              disabled={loading}
            />
          </div>
          <Button
            data-test="search-button"
            type="submit"
            className="h-12 px-6 rounded-lg"
            disabled={loading}
          >
            <SearchIcon className="w-4 h-4 mr-2" />
            {loading ? 'Searching…' : 'Search'}
          </Button>
        </form>

        {/* View Toggle + Page Size */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {['Cards','List','Filters','Explore'].map((opt) => (
            <button
              key={opt}
              onClick={() => setView(opt as any)}
              className={cn('px-4 py-2 text-sm rounded-lg font-semibold transition flex items-center gap-1.5', view === opt ? 'bg-white text-indigo-700 shadow-md' : 'text-gray-600 bg-gray-100 hover:bg-gray-200')}
            >
              {opt === 'Cards' && <LayoutGrid className="w-4 h-4" />}
              {opt === 'List' && <ListIcon className="w-4 h-4" />}
              {opt === 'Filters' && <Sliders className="w-4 h-4" />}
              {opt === 'Explore' && <Zap className="w-4 h-4" />}
              {opt}
            </button>
          ))}
          {loading && <span className="text-xs text-gray-500 self-center">Searching…</span>}
          <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
            <span>Per page</span>
            <select
              className="h-9 rounded-lg border border-gray-300 px-2"
              value={limit}
              onChange={(e)=> {
                handleLimitChange(Number(e.target.value));
              }}
              disabled={loading}
            >
              {[20,30,50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {typeof total === 'number' && (
              <span className="ml-2 text-xs text-gray-500">Total: {total.toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* Filters Drawer */}
          <FiltersDrawer
          open={Boolean(view === 'Filters' || filtersOpen)}
          onOpenChange={(v) => { setFiltersOpen(v); if (!v && view === 'Filters') setView('Cards'); }}
          filters={filterOptions || {}}
          values={{
            origin: filters.origin ?? undefined,
            destination: filters.destination ?? undefined,
            mode: filters.mode ?? undefined,
            date_start: filters.date_start ?? undefined,
            date_end: filters.date_end ?? undefined,
            year: filters.year ?? undefined,
            origin_city: filters.origin_city ?? undefined,
            dest_city: filters.dest_city ?? undefined,
            dest_state: filters.dest_state ?? undefined,
            dest_postal: filters.dest_postal ?? undefined,
            dest_port: filters.dest_port ?? undefined,
          }}
          onChange={(patch) => {
            setFilters((prev) => ({
              origin: typeof patch.origin === 'string' ? patch.origin : (patch.origin === undefined ? null : prev.origin),
              destination: typeof patch.destination === 'string' ? patch.destination : (patch.destination === undefined ? null : prev.destination),
              hs: prev.hs,
              mode: typeof patch.mode === 'string' ? (patch.mode as any) : (patch.mode === undefined ? null : prev.mode),
              date_start: typeof patch.date_start === 'string' ? patch.date_start : (patch.date_start === undefined ? null : prev.date_start),
              date_end: typeof patch.date_end === 'string' ? patch.date_end : (patch.date_end === undefined ? null : prev.date_end),
              year: typeof patch.year === 'string' ? patch.year : (patch.year === undefined ? null : prev.year),
              origin_city: typeof patch.origin_city === 'string' ? patch.origin_city : (patch.origin_city === undefined ? null : prev.origin_city),
              dest_city: typeof patch.dest_city === 'string' ? patch.dest_city : (patch.dest_city === undefined ? null : prev.dest_city),
              dest_state: typeof patch.dest_state === 'string' ? patch.dest_state : (patch.dest_state === undefined ? null : prev.dest_state),
              dest_postal: typeof patch.dest_postal === 'string' ? patch.dest_postal : (patch.dest_postal === undefined ? null : prev.dest_postal),
              dest_port: typeof patch.dest_port === 'string' ? patch.dest_port : (patch.dest_port === undefined ? null : prev.dest_port),
            }));
          }}
          onApply={() => {
            void performSearch(1);
            setFiltersOpen(false);
            if (view === 'Filters') setView('Cards');
          }}
        />

        {/* Results */}
        {!hasSearched && rows.length === 0 && <SearchEmpty state="idle" />}
        {hasSearched && rows.length === 0 && !loading && <SearchEmpty state="no-results" />}

        {rows.length > 0 && (
          <div className="pt-2">
            {view === 'Cards' && <ResultsCards rows={dedupedRows} onOpen={(r)=> setModal(r)} filters={filters} />}
            {view === 'List' && (
              <ResultsList
                rows={dedupedRows}
                onOpen={(r)=> setModal(r)}
                selectedKey={modal ? getCompanyKey({ company_id: modal?.company_id, company_name: modal?.company_name }) : null}
                filters={filters}
              />
            )}
            {/* Pagination controls */}
            <div className="mt-4 flex items-center justify-between">
              <button
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                onClick={handlePrev}
                disabled={loading || page <= 1}
              >
                Prev
              </button>
              <div className="text-sm text-gray-600">Page {page}</div>
              <button
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                onClick={handleNext}
                disabled={loading || !hasNext}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <CompanyModal company={modal} open={Boolean(modal)} onClose={(open)=>{ if (!open) setModal(null); }} />
    </div>
  );
}

// Map current search filters to persistent payload for Command Center
function normalizeFilters(f: any) {
  const out: any = {
    startDate: f?.date_start ?? null,
    endDate: f?.date_end ?? null,
    origin_country: f?.origin ? [String(f.origin).toUpperCase()] : [],
    dest_country: f?.destination ? [String(f.destination).toUpperCase()] : [],
    origin_city: [], origin_state: [], origin_postal: [], origin_port: [],
    dest_city: [], dest_state: [], dest_postal: [], dest_port: [],
    hs: f?.hs ? String(f.hs).split(',').map((s:string)=> s.trim()).filter(Boolean) : [],
  };
  return out;
}
