import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, List as ListIcon, Sliders, TrendingUp, Ship, Clock, Box, Zap, X, MapPin, Search as SearchIcon, Sparkles, Bookmark, Bell } from 'lucide-react';

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
    <div className="p-3 border border-gray-200 rounded-xl bg-white text-center">
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <div className="text-xl font-semibold text-gray-900">{value ?? '—'}</div>
      <div className="text-[11px] uppercase text-gray-500 font-medium mt-1">{label}</div>
    </div>
  );
}

function SaveToCommandCenterButton({ row, size = 'sm' }: { row: any; size?: 'sm'|'md' }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(() => {
    try {
      const a = JSON.parse(localStorage.getItem('lit_companies') || '[]');
      const key = getCompanyKey({ company_id: row?.company_id, company_name: row?.company_name });
      return Array.isArray(a) && a.some((c: any) => String(c?.id||'') === key);
    } catch { return false; }
  });
  const onClick = async () => {
    if (saving || saved) return;
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
      setSaved(true);
    } finally { setSaving(false); }
  };
  return (
    <button
      onClick={onClick}
      disabled={saving || saved}
      className={cn('px-4 py-2 text-sm text-white rounded-lg transition', saved ? 'opacity-70 cursor-default' : 'hover:opacity-90')}
      style={{ backgroundColor: STYLES.brandPurple }}
    >
      {saved ? 'Saved' : (saving ? 'Saving…' : 'Save')}
    </button>
  );
}

function ResultCard({ r, onOpen }: { r: any; onOpen: (r: any) => void }) {
  const top = r.top_routes?.[0];
  const name = r.company_name;
  const id = r.company_id || '—';
  const shipments12m = r.shipments_12m ?? 0;
  const lastActivity = kLastActivity(r.last_activity);
  const totalTeus = (r as any)?.total_teus ?? '—';
  const growthRate = (r as any)?.growth_rate ?? '—';
  const initials = (name||'').split(' ').map((p: string)=>p[0]).join('').slice(0,2).toUpperCase();
  return (
    <div className="rounded-xl shadow-sm bg-white p-5 hover:shadow-lg transition border border-gray-200 cursor-default">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] text-slate-500">Company</div>
          <div className="truncate text-lg font-semibold tracking-tight text-slate-900">{name}</div>
          <div className="mt-1 text-xs text-slate-400 truncate" title={id}>ID: {id}</div>
          <div className="mt-2"><SaveToCommandCenterButton row={r} /></div>
        </div>
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center text-sm font-semibold select-none">{initials}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResultKPI icon={<TrendingUp className="w-4 h-4" style={{ color: STYLES.brandPurple }}/>} label="Shipments (12m)" value={shipments12m} />
        <ResultKPI icon={<Clock className="w-4 h-4 text-gray-500" />} label="Last Activity" value={lastActivity} />
        <ResultKPI icon={<Box className="w-4 h-4 text-gray-500" />} label="Total TEUs" value={totalTeus} />
        <ResultKPI icon={<TrendingUp className="w-4 h-4 text-gray-500" />} label="Growth Rate" value={growthRate} />
      </div>
      <div className="flex justify-between items-center mt-3">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          {top ? (<><MapPin className="w-3.5 h-3.5 text-red-500" />{top.origin_country} → {top.dest_country}</>) : 'No route data'}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center text-xs font-semibold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
            <Sparkles className="w-3 h-3 mr-1" /> AI Ready
          </div>
          <Button variant="secondary" size="sm" onClick={() => onOpen(r)} className="rounded-xl">View Details</Button>
        </div>
      </div>
    </div>
  );
}

function ResultsCards({ rows, onOpen }: { rows: any[]; onOpen: (r: any)=>void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {rows.map((r) => (
        <ResultCard key={getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name })} r={r} onOpen={onOpen} />
      ))}
    </div>
  );
}

function ResultsList({ rows, onOpen }: { rows: any[]; onOpen: (r: any)=>void }) {
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
            return (
              <tr key={key} className="hover:bg-gray-50 transition">
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="font-medium text-gray-900">{r.company_name}</p>
                  <p className="text-xs text-gray-500">ID: {r.company_id || '—'}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.shipments_12m ?? '—'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kLastActivity(r.last_activity)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center">
                  <MapPin className="w-4 h-4 mr-1 text-red-500" /> {top ? `${top.origin_country} → ${top.dest_country}` : '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <SaveToCommandCenterButton row={r} />
                  <Button variant="ghost" size="sm" className="ml-2" onClick={() => onOpen(r)}>Details</Button>
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
  const [view, setView] = useState<'Cards'|'List'|'Filters'|'Explore'>('Cards');
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
              placeholder="Search by company name or alias (e.g., UPS, Maersk)…"
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
            {view === 'Cards' && <ResultsCards rows={dedupedRows} onOpen={(r)=> setModal(r)} />}
            {view === 'List' && <ResultsList rows={dedupedRows} onOpen={(r)=> setModal(r)} />}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <CompanyModal company={modal} open={Boolean(modal)} onClose={(open)=>{ if (!open) setModal(null); }} />
    </div>
  );
}
