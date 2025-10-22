import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, List as ListIcon, Sliders, TrendingUp, Ship, Clock, Box, Zap, X, MapPin, Search as SearchIcon, Bookmark, Bell, ArrowRight, Lock, DollarSign } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { hasFeature } from '@/lib/access';

// Keep existing app wiring and proxies intact
import { useSearch } from '@/app/search/useSearch';
import { getFilterOptions, getFilterOptionsOnce, saveCompanyToCrm, getCompanyKey } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

function ResultCard({ r, onOpen }: { r: any; onOpen: (r: any) => void }) {
  const top = r.top_routes?.[0];
  const name = r.company_name;
  const id = r.company_id || '—';
  const shipments12m = r.shipments_12m ?? 0;
  const lastActivity = kLastActivity(r.last_activity);
  const totalTeus = (r as any)?.total_teus ?? '—';
  const growthRate = (r as any)?.growth_rate == null ? '—' : `${Math.round(Number((r as any)?.growth_rate) * 100)}%`;
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
          </div>
        </div>
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center text-sm font-semibold select-none">{initials}</div>
      </div>
      <div className="mt-4 border-t border-b border-gray-200 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResultKPI icon={<Ship className="w-4 h-4" style={{ color: STYLES.brandPurple }}/>} label="Shipments (12m)" value={shipments12m} />
        <ResultKPI icon={<Clock className="w-4 h-4 text-gray-500" />} label="Last Activity" value={lastActivity} />
        <ResultKPI icon={<Box className="w-4 h-4 text-gray-500" />} label="Total TEUs" value={totalTeus} />
        <ResultKPI icon={<TrendingUp className="w-4 h-4 text-gray-500" />} label="Growth Rate" value={growthRate} />
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
  // Keep existing search hook (wires to /api/lit/public/searchCompanies)
  const { q, setQ, rows, loading, run, next, prev, page, filters, setFilters } = useSearch();
  const [view, setView] = useState<'Cards'|'List'|'Filters'|'Explore'>('List');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<any | null>(null);
  const [filterOptionsReady, setFilterOptionsReady] = useState(false);
  const [filterOptions, setFilterOptions] = useState<any>(null);

  useEffect(() => {
    const ac = new AbortController();
    getFilterOptionsOnce((signal?: AbortSignal) => getFilterOptions(signal), ac.signal)
      .then((data) => { setFilterOptions(data); setFilterOptionsReady(true); })
      .catch(() => setFilterOptionsReady(true));
    return () => ac.abort();
  }, []);

  const hasSearched = (q || '').trim().length > 0;

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

  const doSearch = useCallback((e?: React.FormEvent) => { if (e) e.preventDefault(); run(true); }, [run]);
  // Persist filters for Command Center handoff
  useEffect(() => { try { localStorage.setItem('cc:activeFilters', JSON.stringify(normalizeFilters(filters))); } catch {} }, [filters]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: STYLES.neutralGrayLight }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px] py-6">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Search</h1>
          <p className="text-base text-gray-600 mb-6">Find shippers & receivers. Use filters for origin/dest/HS.</p>
        </header>

        {/* Search Bar */}
        <form onSubmit={doSearch} className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              data-test="search-input" placeholder="Test — Search by company name or alias (e.g., UPS, Maersk)…"
              className="pl-9 h-12 text-base rounded-lg"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            />
          </div>
          <Button type="submit" className="h-12 px-6 rounded-lg"><SearchIcon className="w-4 h-4 mr-2" /> Search</Button>
        </form>

        {/* View Toggle */}
        <div className="flex gap-3 mb-6">
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
        </div>

        {/* Filters Drawer */}
        <FiltersDrawer
          open={Boolean(view === 'Filters' || filtersOpen)}
          onOpenChange={(v) => { setFiltersOpen(v); if (!v && view === 'Filters') setView('Cards'); }}
          filters={filterOptions || {}}
          values={{ origin: filters.origin ?? undefined, destination: filters.destination ?? undefined, mode: filters.mode ?? undefined, date_start: filters.date_start ?? undefined, date_end: filters.date_end ?? undefined, year: filters.year ?? undefined }}
          onChange={(patch) => {
            setFilters((prev) => ({
              origin: typeof patch.origin === 'string' ? patch.origin : (patch.origin === undefined ? null : prev.origin),
              destination: typeof patch.destination === 'string' ? patch.destination : (patch.destination === undefined ? null : prev.destination),
              hs: prev.hs,
              mode: typeof patch.mode === 'string' ? (patch.mode as any) : (patch.mode === undefined ? null : prev.mode),
              date_start: typeof patch.date_start === 'string' ? patch.date_start : (patch.date_start === undefined ? null : prev.date_start),
              date_end: typeof patch.date_end === 'string' ? patch.date_end : (patch.date_end === undefined ? null : prev.date_end),
              year: typeof patch.year === 'string' ? patch.year : (patch.year === undefined ? null : prev.year),
            }));
          }}
          onApply={() => { run(true); setFiltersOpen(false); if (view === 'Filters') setView('Cards'); }}
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
