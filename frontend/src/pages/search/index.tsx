import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, List as ListIcon, Sliders, TrendingUp, Ship, Clock, Box, Zap, MapPin, Search as SearchIcon, ArrowRight, Lock, DollarSign } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { hasFeature } from '@/lib/access';

// Keep existing app wiring and proxies intact
import { LogoSearchHit, postSearchCompanies, getFilterOptions, saveCompanyToCrm, getCompanyKey, getCompanyKpis, searchCompanyLogo, postImportYetiSearch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import AutocompleteInput from '@/components/search/AutocompleteInput';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { buildGoogleMapsSearchUrl, shortId } from '@/lib/format';
import CompanyModal from '@/components/search/CompanyModal';
import { FiltersDrawer } from '@/components/FiltersDrawer';
import SearchEmpty from '@/components/SearchEmpty';
import CompanyLogo from '@/components/search/CompanyLogo';
import ShipperCard from '@/components/search/ShipperCard';
import useDebounce from '@/hooks/useDebounce';
import type { ImportYetiSearchRow } from '@/types/importyeti';

// --- Design Tokens (UI only; no API impact) ---
const STYLES = {
  brandPurple: '#7F3DFF',
  neutralGrayLight: '#F9FAFB',
  neutralBorder: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
};

// --- Helpers ---
function normalizeSearchRow(item: any) {
  if (!item || typeof item !== 'object') return item;
  const company_id = item.company_id ?? item.id ?? null;
  const company_code = item.company_code ?? null;
  const name = item.company_name ?? item.name ?? '';
  const kpis = item.kpis ?? {};
  const shipmentsRaw = kpis.shipments_12m ?? item.shipments_12m ?? null;
  const rawLast = kpis.last_activity ?? item.last_activity ?? null;
  const last_activity = (rawLast && typeof rawLast === 'object' && 'value' in rawLast)
    ? rawLast.value ?? null
    : rawLast ?? null;
  const formatRoutes = (routes: any) => {
    if (!Array.isArray(routes)) return [];
    return routes.map((entry) => {
      if (!entry) return entry;
      if (typeof entry === 'object') {
        if (entry.origin_country || entry.dest_country) return entry;
        if (entry.route) {
          const [origin, dest] = String(entry.route).split('→');
          return {
            origin_country: origin?.trim() || null,
            dest_country: dest?.trim() || null,
            shipments: entry.shipments ?? entry.count ?? entry.freq ?? null,
          };
        }
      }
      if (typeof entry === 'string') {
        const [origin, dest] = entry.split('→');
        return {
          origin_country: origin?.trim() || null,
          dest_country: dest?.trim() || null,
          shipments: null,
        };
      }
      return entry;
    });
  };

  const formatCarriers = (carriers: any) => {
    if (!Array.isArray(carriers)) return [];
    return carriers.map((entry) => {
      if (!entry) return entry;
      if (typeof entry === 'object') {
        if (entry.carrier) return entry;
        if (entry.name) return { carrier: entry.name, share_pct: entry.share_pct ?? entry.freq ?? null };
      }
      if (typeof entry === 'string') {
        return { carrier: entry, share_pct: null };
      }
      return entry;
    });
  };

  const top_routes = formatRoutes(kpis.top_routes ?? item.top_routes ?? item.routes ?? []);
  const top_carriers = formatCarriers(kpis.top_carriers ?? item.top_carriers ?? []);

  return {
    ...item,
    company_id,
    company_code,
    company_name: name,
    shipments_12m: shipmentsRaw != null ? Number(shipmentsRaw) : null,
    last_activity,
    kpis: {
      ...kpis,
      shipments_12m: shipmentsRaw != null ? Number(shipmentsRaw) : null,
      last_activity,
    },
    top_routes,
    top_carriers,
      short_id: company_code ?? (company_id ? `#${shortId(String(company_id))}` : null),
  };
}

const getShortId = (row: any) => row?.company_code ?? (row?.company_id ? `#${shortId(String(row.company_id))}` : null);

const formatNumberDisplay = (value: any) => {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat().format(num);
};

const formatDateDisplay = (value: any) => {
  if (!value) return '—';
  const raw = typeof value === 'object' && value !== null && 'value' in value ? (value as any).value : value;
  if (!raw) return '—';
  const dt = new Date(String(raw));
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toISOString().slice(0, 10);
};

function ResultKPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 border border-gray-200 rounded-xl bg-white text-center min-h-[96px] flex flex-col items-center justify-center w-full overflow-hidden">
      <div className="flex items-center justify-center mb-1 shrink-0">{icon}</div>
      <div className="text-xl font-bold text-gray-900 truncate w-full max-w-full" title={String(value ?? '—')}>{value ?? '—'}</div>
      <div className="text-[11px] uppercase text-gray-500 font-medium mt-1 truncate w-full max-w-full" title={label}>{label}</div>
    </div>
  );
}

function GoogleBadgeSmall() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-[#4285F4] shadow-sm">
      G
    </span>
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
          shipments12m: Number(row?.shipments_12m ?? 0),
          lastActivity: formatDateDisplay(row?.last_activity),
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

function ResultCard({ r, onOpen, filters, logo }: { r: any; onOpen: (r: any) => void; filters: any; logo?: LogoSearchHit | null }) {
  const top = r.top_routes?.[0];
  const name = r.company_name;
  const shortIdValue = getShortId(r);
  const shipmentsDisplay = formatNumberDisplay(r?.kpis?.shipments_12m ?? r.shipments_12m);
  const lastActivityDisplay = formatDateDisplay(r?.kpis?.last_activity ?? r.last_activity);
  const [teus12m, setTeus12m] = useState<number | null>(null);
  const [growthRate, setGrowthRate] = useState<number | null>(null);
  const domainRawCandidate = typeof logo?.domain === 'string' && logo.domain.trim()
    ? logo.domain.trim()
    : (typeof (r as any)?.domain === 'string' ? (r as any).domain.trim() : '');
  const websiteLabel = domainRawCandidate ? domainRawCandidate.replace(/^https?:\/\//, '') : '';
  const websiteHref = websiteLabel
    ? (domainRawCandidate.startsWith('http') ? domainRawCandidate : `https://${websiteLabel}`)
    : null;
  const googleUrl = buildGoogleMapsSearchUrl(websiteHref || name);
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
  const key = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
  const topBorder = { borderTop: `4px solid ${STYLES.brandPurple}` } as const;
  return (
    <div className="rounded-xl bg-white p-5 min-h-[220px] shadow-md hover:shadow-lg transition border border-gray-200 cursor-default" style={topBorder}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <CompanyLogo domain={domainRawCandidate || undefined} name={name} size={48} />
          <div className="min-w-0">
            <div className="text-[13px] text-slate-500">Company</div>
            <div className="truncate text-xl font-bold text-gray-900" title={name}>{name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              {shortIdValue && <span className="font-mono text-gray-500">{shortIdValue}</span>}
              {websiteHref && (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-indigo-700 hover:bg-indigo-100"
                >
                  {websiteLabel}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {googleUrl && (
            <a
              href={googleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-slate-100"
              title={`Open ${name} in Google Maps`}
            >
              <span className="sr-only">Open in Google Maps</span>
              <GoogleBadgeSmall />
            </a>
          )}
          <div className="flex items-center gap-2">
            <SaveToCommandCenterButton row={r} activeFilters={filters} />
            <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 text-[11px] px-2 py-0.5">
              Ready
            </span>
          </div>
        </div>
      </div>
        <div className="mt-4 border-t border-b border-gray-200 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <ResultKPI icon={<Ship className="w-4 h-4" style={{ color: STYLES.brandPurple }}/>} label="Shipments" value={shipmentsDisplay} />
          <ResultKPI icon={<Clock className="w-4 h-4 text-gray-500" />} label="Last Activity" value={lastActivityDisplay} />
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

function ResultsCards({ rows, onOpen, filters, logos }: { rows: any[]; onOpen: (r: any)=>void; filters: any; logos: Record<string, LogoSearchHit> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {rows.map((r, idx) => {
        const key = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
        const logo = key ? logos[key] : undefined;
        return (
          <ResultCard
            key={key || `card-${idx}`}
            r={r}
            onOpen={onOpen}
            filters={filters}
            logo={logo}
          />
        );
      })}
    </div>
  );
}

function ResultsList({ rows, onOpen, selectedKey, filters, logos }: { rows: any[]; onOpen: (r: any)=>void; selectedKey?: string | null; filters: any; logos: Record<string, LogoSearchHit> }) {
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
            const shortId = getShortId(r);
            const shipmentsDisplay = formatNumberDisplay(r?.kpis?.shipments_12m ?? r.shipments_12m);
            const lastActivityDisplay = formatDateDisplay(r?.kpis?.last_activity ?? r.last_activity);
              const logoInfo = key ? logos[key] : undefined;
              const domainRawCandidate = typeof logoInfo?.domain === 'string' && logoInfo.domain.trim()
                ? logoInfo.domain.trim()
                : (typeof (r as any)?.domain === 'string' ? (r as any).domain.trim() : '');
              const websiteLabel = domainRawCandidate ? domainRawCandidate.replace(/^https?:\/\//, '') : '';
              const websiteHref = websiteLabel
                ? (domainRawCandidate.startsWith('http') ? domainRawCandidate : `https://${websiteLabel}`)
                : null;
              const googleUrl = buildGoogleMapsSearchUrl(websiteHref || r.company_name);
            return (
              <tr key={key} className={cn("hover:bg-gray-50 transition", selectedKey === key ? "ring-2 ring-indigo-500 ring-offset-1" : "") }>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <CompanyLogo domain={domainRawCandidate || undefined} name={r.company_name} size={36} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate max-w-[360px]" title={r.company_name}>{r.company_name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span>ID: {shortId ?? (r.company_id || '—')}</span>
                          {websiteHref && (
                            <a
                              href={websiteHref}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-indigo-700 hover:bg-indigo-100"
                            >
                              {websiteLabel}
                            </a>
                          )}
                          {googleUrl && (
                            <a
                              href={googleUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-slate-100"
                              title={`Open ${r.company_name} in Google Maps`}
                            >
                              <span className="sr-only">Open in Google Maps</span>
                              <GoogleBadgeSmall />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shipmentsDisplay}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{lastActivityDisplay}</td>
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

function getImportYetiSlugsFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = localStorage.getItem('lit_companies');
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    const collected = new Set<string>();
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const candidateList = [
        (entry as any).importYetiSlug,
        (entry as any).importyeti_slug,
        (entry as any).slug,
      ];
      const externalKey = (entry as any).externalKey;
      if (typeof externalKey === 'string' && externalKey.startsWith('importyeti:')) {
        candidateList.push(externalKey.split(':')[1]);
      }
      for (const value of candidateList) {
        if (typeof value === 'string' && value.trim()) {
          collected.add(value.trim());
          break;
        }
      }
    }
    return collected;
  } catch {
    return new Set<string>();
  }
}

export default function SearchPage() {
  const { user } = useAuth() as any;
  const [keyword, setKeyword] = useState('');
  const latestKeywordRef = useRef('');
  const debouncedKeyword = useDebounce(keyword, 250);
  const [searchMode, setSearchMode] = useState<'shippers' | 'companies'>('shippers');
  const [bootstrapped, setBootstrapped] = useState(false);
  const didInitRef = useRef(false);
  const initSearchRef = useRef(false);
  const shipperControllerRef = useRef<AbortController | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [logoMap, setLogoMap] = useState<Record<string, LogoSearchHit>>({});
  const logoMapRef = useRef<Record<string, LogoSearchHit>>({});
  const [shipperRows, setShipperRows] = useState<ImportYetiSearchRow[]>([]);
  const [shipperMeta, setShipperMeta] = useState<{ total: number; offset: number; limit: number; count: number; page: number } | null>(null);
  const [shipperLoading, setShipperLoading] = useState(false);
  const [shipperError, setShipperError] = useState<string | null>(null);
  const [shipperPage, setShipperPage] = useState(1);
  const [savedSlugs, setSavedSlugs] = useState<Set<string>>(() => getImportYetiSlugsFromStorage());
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [showShipperUpsell, setShowShipperUpsell] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'Cards'|'List'|'Filters'|'Explore'>('List');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<{ mode: 'shippers'; shipper: ImportYetiSearchRow } | { mode: 'companies'; company: any } | null>(null);
  const [filterOptions, setFilterOptions] = useState<{ modes: string[]; origins: string[]; destinations: string[] } | null>(null);
  const [resultsMeta, setResultsMeta] = useState<{ total: number; offset: number; limit: number; count: number } | null>(null);
  const [hasSearchedCompanies, setHasSearchedCompanies] = useState(false);
  const [hasSearchedShippers, setHasSearchedShippers] = useState(false);
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
    logoMapRef.current = logoMap;
  }, [logoMap]);

  const handleKeywordChange = useCallback((value: string) => {
    latestKeywordRef.current = value;
    setKeyword(value);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = () => {
      setSavedSlugs(getImportYetiSlugsFromStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => () => {
    if (shipperControllerRef.current) {
      shipperControllerRef.current.abort();
      shipperControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getFilterOptions();
        if (cancelled) return;
        setFilterOptions({
          modes: Array.isArray(data?.modes) ? data.modes : [],
          origins: Array.isArray(data?.origins) ? data.origins : [],
          destinations: Array.isArray(data?.destinations) ? data.destinations : [],
        });
      } catch (err) {
        if (cancelled) return;
        setFilterOptions(null);
        setError((prev) => prev ?? (err instanceof Error ? err.message : String(err)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (didInitRef.current) return;
    if (typeof window === 'undefined') {
      didInitRef.current = true;
      setBootstrapped(true);
      return;
    }
    didInitRef.current = true;
    try {
      const url = new URL(window.location.href);
      const modeParam = url.searchParams.get('mode');
      const keywordParam = url.searchParams.get('keyword') ?? url.searchParams.get('q');
      if (modeParam === 'companies') {
        setSearchMode('companies');
      }
      if (typeof keywordParam === 'string' && keywordParam.length) {
        setKeyword(keywordParam);
        latestKeywordRef.current = keywordParam;
      }
    } catch {}
    setTimeout(() => setBootstrapped(true), 0);
  }, []);

  useEffect(() => {
    if (!didInitRef.current || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (searchMode === 'shippers') {
      params.delete('mode');
    } else {
      params.set('mode', searchMode);
    }
    const trimmedKeyword = debouncedKeyword.trim();
    if (trimmedKeyword) {
      params.set('keyword', trimmedKeyword);
      params.set('q', trimmedKeyword);
    } else {
      params.delete('keyword');
      params.delete('q');
    }
    const nextSearch = params.toString();
    const nextUrl = nextSearch ? `${window.location.pathname}?${nextSearch}${window.location.hash}` : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [searchMode, debouncedKeyword]);

  useEffect(() => {
    if (searchMode === 'shippers' && view !== 'Cards') {
      setView('Cards');
    }
    if (searchMode === 'shippers' && filtersOpen) {
      setFiltersOpen(false);
    }
  }, [searchMode, view, filtersOpen]);

  useEffect(() => {
    if (searchMode === 'companies') {
      initSearchRef.current = false;
    }
  }, [searchMode]);

  useEffect(() => {
    setModal(null);
    if (searchMode !== 'shippers' && shipperControllerRef.current) {
      shipperControllerRef.current.abort();
      shipperControllerRef.current = null;
      setShipperLoading(false);
    }
  }, [searchMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('cc:activeFilters', JSON.stringify(normalizeFilters(filters)));
    } catch {}
  }, [filters]);

  const buildSearchPayload = useCallback(
    (targetPage: number, pageSize: number) => {
      const safePage = Math.max(1, targetPage);
      const limitValue = Math.max(1, pageSize);
      const offset = (safePage - 1) * limitValue;
      const trimmed = (latestKeywordRef.current || '').trim();
      const body: Record<string, any> = {
        limit: limitValue,
        offset,
      };
      if (trimmed.length) body.keyword = trimmed;

      const splitToArray = (value: string | null | undefined) => {
        if (!value) return undefined;
        return String(value)
          .split(/[,|]+/)
          .map((part) => part.trim())
          .filter(Boolean);
      };

      const origin = splitToArray(filters.origin);
      if (origin && origin.length) body.origin = origin;

      const destination = splitToArray(filters.destination);
      if (destination && destination.length) body.dest = destination;

      const hsValues = splitToArray(filters.hs);
      if (hsValues && hsValues.length) body.hs = hsValues;

      if (filters.mode) body.mode = filters.mode;

      if (filters.date_start) body.startDate = filters.date_start;
      if (filters.date_end) body.endDate = filters.date_end;
      if (filters.origin_city) body.origin_city = filters.origin_city;
      if (filters.dest_city) body.dest_city = filters.dest_city;
      if (filters.dest_state) body.dest_state = filters.dest_state;
      if (filters.dest_postal) body.dest_postal = filters.dest_postal;
      if (filters.dest_port) body.dest_port = filters.dest_port;

      return { body, offset, limitValue, safePage };
    },
    [filters]
  );

    const fetchResults = useCallback(
      async (targetPage: number, targetLimit: number = limit) => {
        const { body, offset, limitValue, safePage } = buildSearchPayload(targetPage, targetLimit);
        if (offset === 0) {
          setLogoMap({});
        }
        setLoading(true);
        setError(null);
        setHasSearchedCompanies(true);
      try {
          const data = await postSearchCompanies(body);
          const resultRows = Array.isArray(data?.rows)
            ? data.rows
            : Array.isArray(data?.items)
              ? data.items
              : Array.isArray(data?.results)
                ? data.results
                : [];
          const normalizedRows = Array.isArray(resultRows) ? resultRows.map(normalizeSearchRow) : [];
          const meta = data?.meta ?? {};
          const total = typeof meta.total === 'number'
            ? meta.total
            : (typeof data?.total === 'number'
              ? data.total
              : normalizedRows.length);
          const effectiveOffset = typeof meta.offset === 'number' ? meta.offset : offset;
          const effectiveLimit = typeof meta.limit === 'number' ? meta.limit : limitValue;

          setRows(normalizedRows);
          setPage(safePage);
          setLimit(limitValue);
          setResultsMeta({
            total: Number(total || 0),
            offset: Number(effectiveOffset || 0),
            limit: Number(effectiveLimit || limitValue),
            count: normalizedRows.length,
          });
        } catch (err) {
          setRows([]);
          setResultsMeta(null);
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [buildSearchPayload, limit]
  );

  const run = useCallback(
    (reset = true, overrideLimit?: number) => {
      void fetchResults(reset ? 1 : page, overrideLimit ?? limit);
    },
    [fetchResults, page, limit]
  );

  const fetchShippers = useCallback(
    async (targetPage: number, targetLimit: number = limit) => {
      const trimmed = (latestKeywordRef.current || '').trim();
      if (!trimmed.length) {
        if (shipperControllerRef.current) {
          shipperControllerRef.current.abort();
          shipperControllerRef.current = null;
        }
        setShipperRows([]);
        setShipperMeta(null);
        setShipperError(null);
        setShipperLoading(false);
        setHasSearchedShippers(false);
        setShipperPage(1);
        return;
      }
      if (shipperControllerRef.current) {
        shipperControllerRef.current.abort();
      }
      const controller = new AbortController();
      shipperControllerRef.current = controller;
      const safePage = Math.max(1, targetPage);
      const limitValue = Math.max(1, targetLimit);
      const offset = (safePage - 1) * limitValue;
      setShipperLoading(true);
      setShipperError(null);
      setHasSearchedShippers(true);
      try {
        const data = await postImportYetiSearch({ keyword: trimmed, limit: limitValue, offset, signal: controller.signal });
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const meta = data?.meta ?? {};
        const total = typeof meta.total === 'number' ? meta.total : rows.length;
        const metaPage = typeof meta.page === 'number' && Number.isFinite(meta.page) ? Math.max(1, Number(meta.page)) : safePage;
        const metaLimit = typeof meta.page_size === 'number' && Number.isFinite(meta.page_size) ? Number(meta.page_size) : limitValue;
        const metaOffset = typeof meta.offset === 'number' && Number.isFinite(meta.offset) ? Number(meta.offset) : (metaPage - 1) * metaLimit;
        setShipperRows(rows);
        setShipperPage(metaPage);
        setShipperMeta({
          total: Number(total || 0),
          offset: Number(metaOffset || 0),
          limit: Number(metaLimit || limitValue),
          count: rows.length,
          page: metaPage,
        });
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setShipperRows([]);
          setShipperMeta(null);
          setShipperError(err?.message ?? 'Failed to load shippers');
        }
      } finally {
        if (shipperControllerRef.current === controller) {
          shipperControllerRef.current = null;
        }
        if (!controller.signal.aborted) {
          setShipperLoading(false);
        }
      }
    },
    [limit]
  );

  const next = useCallback(() => {
    if (loading || !resultsMeta) return;
    if (resultsMeta.offset + resultsMeta.count >= resultsMeta.total) return;
    void fetchResults(page + 1);
  }, [fetchResults, loading, page, resultsMeta]);

  const prev = useCallback(() => {
    if (loading || !resultsMeta) return;
    if (resultsMeta.offset <= 0 || page <= 1) return;
    void fetchResults(page - 1);
  }, [fetchResults, loading, page, resultsMeta]);

  const shipperHasNextPage = useMemo(() => {
    if (!shipperMeta) return false;
    return shipperMeta.offset + shipperMeta.count < shipperMeta.total;
  }, [shipperMeta]);

  const shipperNext = useCallback(() => {
    if (shipperLoading || !shipperMeta) return;
    if (!shipperHasNextPage) return;
    void fetchShippers(shipperPage + 1);
  }, [fetchShippers, shipperHasNextPage, shipperLoading, shipperMeta, shipperPage]);

  const shipperPrev = useCallback(() => {
    if (shipperLoading || !shipperMeta) return;
    if (shipperPage <= 1) return;
    void fetchShippers(Math.max(1, shipperPage - 1));
  }, [fetchShippers, shipperLoading, shipperMeta, shipperPage]);

  // Autocomplete handled by <AutocompleteInput/>; no inline panel

  useEffect(() => {
    if (!bootstrapped) return;
    if (searchMode !== 'shippers') return;
    const trimmed = debouncedKeyword.trim();
    if (!trimmed.length) {
      if (shipperControllerRef.current) {
        shipperControllerRef.current.abort();
        shipperControllerRef.current = null;
      }
      setShipperRows([]);
      setShipperMeta(null);
      setShipperError(null);
      setShipperLoading(false);
      setHasSearchedShippers(false);
      setShipperPage(1);
      return;
    }
    void fetchShippers(1, limit);
  }, [bootstrapped, searchMode, debouncedKeyword, fetchShippers, limit]);

  useEffect(() => {
    if (!bootstrapped) return;
    if (searchMode !== 'companies') return;
    if (initSearchRef.current) return;
    const trimmed = (latestKeywordRef.current || '').trim();
    if (!trimmed.length) return;
    initSearchRef.current = true;
    void fetchResults(1, limit);
  }, [bootstrapped, searchMode, fetchResults, limit]);

  const hasNextPage = resultsMeta ? resultsMeta.offset + resultsMeta.count < resultsMeta.total : false;

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
    if (!dedupedRows.length) return;
    const controller = new AbortController();
    const pending = dedupedRows
      .map((row) => {
        const key = getCompanyKey({ company_id: row?.company_id, company_name: row?.company_name });
        const domainCandidate = typeof row?.domain === 'string' ? row.domain.trim() : '';
        const nameCandidate = typeof row?.company_name === 'string' ? row.company_name.trim() : '';
        const query = domainCandidate || nameCandidate;
        return { key, query };
      })
      .filter((entry) => entry.key && entry.query && !logoMapRef.current[entry.key]);

    if (!pending.length) return () => controller.abort();

    (async () => {
      const results = await Promise.all(
        pending.map(async ({ key, query }) => {
          try {
            const hits = await searchCompanyLogo(query, controller.signal);
            return [key, hits[0] ?? null] as const;
          } catch {
            return [key, null] as const;
          }
        })
      );

      setLogoMap((prev) => {
        const next = { ...prev };
        for (const [key, hit] of results) {
          if (hit) {
            next[key] = hit;
          }
        }
        return next;
      });
    })();

    return () => controller.abort();
  }, [dedupedRows]);

  const doSearch = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchMode === 'shippers') {
      setShipperPage(1);
      void fetchShippers(1, limit);
      return;
    }
    run(true);
  }, [fetchShippers, limit, run, searchMode]);

  const modalCompany = modal?.mode === 'companies' ? modal.company : null;
  const modalKey = modalCompany ? getCompanyKey({ company_id: modalCompany?.company_id, company_name: modalCompany?.company_name }) : null;
  const modalLogo = modalKey ? logoMap[modalKey] : undefined;
  const modalDomain = modalLogo?.domain ?? (modalCompany as any)?.domain ?? null;
  const modalWebsite = (modalCompany as any)?.website ?? modalDomain ?? null;
  const modalShipper = modal?.mode === 'shippers' ? modal.shipper : null;
  const activeError = searchMode === 'shippers' ? shipperError : error;
  const currentHasSearched = searchMode === 'shippers' ? hasSearchedShippers : hasSearchedCompanies;
  const isBooting = !bootstrapped;
  const totalShippers = shipperMeta?.total ?? shipperRows.length;
  const isLoading = searchMode === 'shippers' ? shipperLoading : loading;

  const handleModeSelect = useCallback((mode: 'shippers' | 'companies') => {
    setSearchMode(mode);
  }, []);

  const ensureCanSaveShipper = useCallback(() => {
    const email = String(user?.email || '').toLowerCase();
    const allowed =
      email === 'vraymond@logisticintel.com' ||
      email === 'support@logisticintel.com' ||
      hasFeature('crm');
    if (!allowed) {
      setShowShipperUpsell(true);
      return false;
    }
    return true;
  }, [user]);

  const handleSaveShipper = useCallback(async (row: ImportYetiSearchRow) => {
    if (!row?.slug) return;
    if (!ensureCanSaveShipper()) return;
    if (savingSlug === row.slug) return;
    if (typeof window === 'undefined') return;
    setSavingSlug(row.slug);
    try {
      await saveCompanyToCrm({
        company_name: row.title,
        slug: row.slug,
        source: 'importyeti',
      });
      const lsKey = 'lit_companies';
      let existing: any[] = [];
      try {
        const raw = localStorage.getItem(lsKey);
        const parsed = raw ? JSON.parse(raw) : [];
        existing = Array.isArray(parsed) ? parsed : [];
      } catch {
        existing = [];
      }
      const entry = {
        id: `importyeti:${row.slug}`,
        name: row.title,
        slug: row.slug,
        source: 'importyeti',
        importYetiSlug: row.slug,
        savedAt: Date.now(),
        externalKey: `importyeti:${row.slug}`,
        kpis: {
          totalShipments: Number(row.total_shipments ?? 0),
          shipments12m: row.shipments_12m ?? null,
          country: row.country ?? null,
        },
      };
      const nextList = [entry, ...existing.filter((item) => item && item.id !== entry.id)];
      localStorage.setItem(lsKey, JSON.stringify(nextList));
      try {
        const filtersPayload = normalizeFilters(filters);
        localStorage.setItem('cc:savedCompany', JSON.stringify({
          slug: row.slug,
          source: 'importyeti',
          name: row.title,
          savedAt: new Date().toISOString(),
          externalKey: entry.externalKey,
          filters: filtersPayload,
        }));
        localStorage.setItem('lit:selectedCompany', JSON.stringify({
          company_id: entry.id,
          name: row.title,
          slug: row.slug,
          source: 'importyeti',
        }));
      } catch {}
      setSavedSlugs((prev) => {
        const next = new Set(prev);
        next.add(row.slug);
        return next;
      });
      try {
        window.dispatchEvent(new StorageEvent('storage', { key: 'lit_companies' } as any));
      } catch {}
      try {
        window.location.href = '/app/command-center';
      } catch {}
    } catch (err) {
      console.error(err);
    } finally {
      setSavingSlug(null);
    }
  }, [ensureCanSaveShipper, filters, saveCompanyToCrm, savingSlug]);

  const handleViewShipper = useCallback((row: ImportYetiSearchRow) => {
    setModal({ mode: 'shippers', shipper: row });
  }, []);

  const handleViewCompany = useCallback((row: any) => {
    setModal({ mode: 'companies', company: row });
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: STYLES.neutralGrayLight }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px] py-6">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 mb-2">Search</h1>
          <p className="text-base text-gray-600 mb-6">Find shippers & receivers. Use filters for origin/dest/HS.</p>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => handleModeSelect('shippers')}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                searchMode === 'shippers' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              Shippers
            </button>
            <button
              type="button"
              onClick={() => handleModeSelect('companies')}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                searchMode === 'companies' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              Companies
            </button>
          </div>
          <span className="text-xs sm:text-sm text-slate-500">
            {searchMode === 'shippers'
              ? 'ImportYeti verified shippers and shipment intelligence.'
              : 'Company enrichment with filters, lanes, and contacts.'}
          </span>
        </div>

        {activeError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {activeError}
          </div>
        )}

        <form onSubmit={doSearch} className="mb-4 flex gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <AutocompleteInput
              value={keyword}
              onKeyword={handleKeywordChange}
              onSubmit={() => doSearch()}
              placeholder={searchMode === 'shippers' ? 'Search verified shippers (e.g., Walmart, Nike)…' : 'Search by company name or alias (e.g., UPS, Maersk)…'}
              disabled={isLoading}
            />
          </div>
          <Button data-test="search-button" type="submit" className="h-12 rounded-lg px-6" disabled={isLoading}>
            <SearchIcon className="mr-2 h-4 w-4" />
            {isLoading ? 'Searching…' : 'Search'}
          </Button>
        </form>

        {searchMode === 'shippers' ? (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {shipperLoading && <span className="text-xs text-gray-500">Searching…</span>}
            <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              <span>Per page</span>
              <select
                className="h-9 rounded-lg border border-gray-300 px-2"
                value={limit}
                onChange={(e) => {
                  const nextLimit = Number(e.target.value);
                  setLimit(nextLimit);
                  setShipperPage(1);
                  void fetchShippers(1, nextLimit);
                }}
                disabled={shipperLoading}
              >
                {[20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="ml-2 text-xs text-gray-500">Total: {Number(totalShippers || 0).toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {['Cards', 'List', 'Filters', 'Explore'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setView(opt as any)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition',
                  view === opt ? 'bg-white text-indigo-700 shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {opt === 'Cards' && <LayoutGrid className="h-4 w-4" />}
                {opt === 'List' && <ListIcon className="h-4 w-4" />}
                {opt === 'Filters' && <Sliders className="h-4 w-4" />}
                {opt === 'Explore' && <Zap className="h-4 w-4" />}
                {opt}
              </button>
            ))}
            {loading && <span className="self-center text-xs text-gray-500">Searching…</span>}
            <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              <span>Per page</span>
              <select
                className="h-9 rounded-lg border border-gray-300 px-2"
                value={limit}
                onChange={(e) => {
                  const nextLimit = Number(e.target.value);
                  setLimit(nextLimit);
                  run(true, nextLimit);
                }}
                disabled={loading}
              >
                {[20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {resultsMeta && (
                <span className="ml-2 text-xs text-gray-500">Total: {resultsMeta.total.toLocaleString()}</span>
              )}
            </div>
          </div>
        )}

        {searchMode === 'companies' && (
          <FiltersDrawer
            open={Boolean(view === 'Filters' || filtersOpen)}
            onOpenChange={(v) => {
              setFiltersOpen(v);
              if (!v && view === 'Filters') setView('Cards');
            }}
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
                origin: typeof patch.origin === 'string' ? patch.origin : patch.origin === undefined ? null : prev.origin,
                destination: typeof patch.destination === 'string' ? patch.destination : patch.destination === undefined ? null : prev.destination,
                hs: prev.hs,
                mode: typeof patch.mode === 'string' ? (patch.mode as any) : patch.mode === undefined ? null : prev.mode,
                date_start: typeof patch.date_start === 'string' ? patch.date_start : patch.date_start === undefined ? null : prev.date_start,
                date_end: typeof patch.date_end === 'string' ? patch.date_end : patch.date_end === undefined ? null : prev.date_end,
                year: typeof patch.year === 'string' ? patch.year : patch.year === undefined ? null : prev.year,
                origin_city: typeof patch.origin_city === 'string' ? patch.origin_city : patch.origin_city === undefined ? null : prev.origin_city,
                dest_city: typeof patch.dest_city === 'string' ? patch.dest_city : patch.dest_city === undefined ? null : prev.dest_city,
                dest_state: typeof patch.dest_state === 'string' ? patch.dest_state : patch.dest_state === undefined ? null : prev.dest_state,
                dest_postal: typeof patch.dest_postal === 'string' ? patch.dest_postal : patch.dest_postal === undefined ? null : prev.dest_postal,
                dest_port: typeof patch.dest_port === 'string' ? patch.dest_port : patch.dest_port === undefined ? null : prev.dest_port,
              }));
            }}
            onApply={() => {
              run(true);
              setFiltersOpen(false);
              if (view === 'Filters') setView('Cards');
            }}
          />
        )}

        {isBooting ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            Preparing search results…
          </div>
        ) : searchMode === 'shippers' ? (
          <div className="pt-2">
            {shipperLoading && shipperRows.length === 0 && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="h-48 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="h-full w-full animate-pulse rounded-xl bg-slate-100" />
                  </div>
                ))}
              </div>
            )}
            {!shipperLoading && shipperRows.length === 0 && (
              <SearchEmpty state={currentHasSearched ? 'no-results' : 'idle'} />
            )}
            {shipperRows.length > 0 && (
              <>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {shipperRows.map((row) => (
                    <ShipperCard
                      key={row.slug || `${row.title}-${row.total_shipments}`}
                      row={row}
                      onView={handleViewShipper}
                      onSave={handleSaveShipper}
                      saving={Boolean(row.slug && savingSlug === row.slug)}
                      saved={Boolean(row.slug && savedSlugs.has(row.slug))}
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={shipperPrev}
                    disabled={shipperLoading || shipperPage <= 1}
                  >
                    Prev
                  </button>
                  <div className="text-sm text-gray-600">Page {shipperPage}</div>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={shipperNext}
                    disabled={shipperLoading || !shipperHasNextPage}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="pt-2">
            {!currentHasSearched && dedupedRows.length === 0 && <SearchEmpty state="idle" />}
            {currentHasSearched && dedupedRows.length === 0 && !loading && <SearchEmpty state="no-results" />}
            {dedupedRows.length > 0 && (
              <>
                {view === 'Cards' && (
                  <ResultsCards rows={dedupedRows} onOpen={handleViewCompany} filters={filters} logos={logoMap} />
                )}
                {view === 'List' && (
                  <ResultsList
                    rows={dedupedRows}
                    onOpen={handleViewCompany}
                    selectedKey={modalCompany ? getCompanyKey({ company_id: modalCompany?.company_id, company_name: modalCompany?.company_name }) : null}
                    filters={filters}
                    logos={logoMap}
                  />
                )}
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={prev}
                    disabled={loading || !resultsMeta || resultsMeta.offset === 0}
                  >
                    Prev
                  </button>
                  <div className="text-sm text-gray-600">Page {page}</div>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={next}
                    disabled={loading || !hasNextPage}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

        {/* Detail Modal */}
        {modal?.mode === 'companies' && (
          <CompanyModal
            mode="companies"
            company={modalCompany}
            open={Boolean(modal)}
            onClose={(open) => {
              if (!open) setModal(null);
            }}
            logoDomain={modalDomain ?? null}
            websiteUrl={modalWebsite ?? null}
          />
        )}
        {modal?.mode === 'shippers' && (
          <CompanyModal
            mode="shippers"
            shipper={modalShipper ?? null}
            open={Boolean(modal)}
            onClose={() => setModal(null)}
            onSave={handleSaveShipper}
            saving={Boolean(modalShipper?.slug && savingSlug === modalShipper.slug)}
            saved={Boolean(modalShipper?.slug && savedSlugs.has(modalShipper.slug))}
          />
        )}

        {showShipperUpsell && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/75 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: '#EEE6FF' }}>
                  <Lock className="h-5 w-5" style={{ color: STYLES.brandPurple }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 text-xl font-bold" style={{ color: STYLES.textPrimary }}>
                    Command Center Access
                  </div>
                  <div className="text-sm text-gray-700">
                    Saving shippers requires a Pro subscription. Upgrade to unlock saving, contacts enrichment, and alerts.
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      type="button"
                      onClick={() => setShowShipperUpsell(false)}
                    >
                      Not right now
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-white"
                      style={{ backgroundColor: STYLES.brandPurple }}
                      type="button"
                      onClick={() => setShowShipperUpsell(false)}
                    >
                      <DollarSign className="h-4 w-4" /> Upgrade Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
