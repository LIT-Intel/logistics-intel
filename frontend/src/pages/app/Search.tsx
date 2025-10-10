import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { LayoutGrid, List as ListIcon, Search as SearchIcon, ChevronRight, MapPin, Package, TrendingUp, Calendar, Mail, Phone, ExternalLink, Filter, XCircle, Factory, Bell, Bookmark, Sparkles } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
// canonical helpers and API wrappers
import { saveCompanyToCrm, buildCompanyShipmentsUrl, getCompanyKey } from '@/lib/api';
import { useSearch } from '@/app/search/useSearch';
import SearchFilters from '@/components/search/SearchFilters';
import SearchEmpty from '@/components/SearchEmpty';
import ResultsGrid from '@/components/ResultsGrid';
import CompanyModal from '@/components/search/CompanyModal';
import { useToast } from '@/components/ui/use-toast';

const brand = {
  heading: 'text-[28px] font-bold tracking-tight text-purple-700',
  kpiIcon: 'h-5 w-5 text-indigo-600',
  chip: 'rounded-full'
};

function AlertsPanel() {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white/95 p-4">
      <div className="flex items-center gap-2 mb-3 text-slate-900 font-semibold"><Bell className="h-4 w-4 text-indigo-600"/> Alerts</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border p-3">
          <div className="font-medium text-slate-900 mb-1">Volume Spike</div>
          <div className="text-xs text-slate-600 mb-2">Alert when shipments increase by X% over last 30 days.</div>
          <div className="flex items-center gap-2"><input type="number" className="w-24 border rounded px-2 py-1" placeholder="30" /> <span className="text-xs text-slate-600">%</span></div>
          <div className="mt-2"><Button size="sm" className="rounded-xl">Save Alert</Button></div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="font-medium text-slate-900 mb-1">New Shipper</div>
          <div className="text-xs text-slate-600 mb-2">Alert on new shippers in the last 3–6 months.</div>
          <div className="flex items-center gap-2"><select className="border rounded px-2 py-1 text-sm"><option>3 months</option><option>6 months</option></select></div>
          <div className="mt-2"><Button size="sm" className="rounded-xl">Save Alert</Button></div>
        </div>
      </div>
      <div className="mt-4 text-xs text-slate-500">Alerts are a placeholder until backend wiring is complete.</div>
    </div>
  );
}

function SaveButton({ row }: { row: any }) {
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  async function onClick() {
    if (saving || saved) return;
    setSaving(true);
    try {
      const cname = String(row?.company_name || '');
      if (!cname) throw new Error('missing name');
      const cid = getCompanyKey({ company_id: row?.company_id, company_name: cname });
      try { await saveCompanyToCrm({ company_id: cid, company_name: cname, source: 'search' }); } catch {}
      const lsKey = 'lit_companies';
      const existing = JSON.parse(localStorage.getItem(lsKey) || '[]');
      if (!existing.find((c: any)=> String(c?.id||'') === cid)) {
        const kpis = {
          shipments12m: row?.shipments_12m || 0,
          lastActivity: row?.last_activity || null,
          originsTop: Array.isArray(row?.top_routes) ? row.top_routes.map((r: any)=> r.origin_country) : [],
          destsTop: Array.isArray(row?.top_routes) ? row.top_routes.map((r: any)=> r.dest_country) : [],
          carriersTop: Array.isArray(row?.top_carriers) ? row.top_carriers.map((c: any)=> c.carrier) : [],
        };
        const fresh = { id: cid, name: cname, kpis, savedAt: Date.now() };
        localStorage.setItem(lsKey, JSON.stringify([fresh, ...existing]));
        window.dispatchEvent(new StorageEvent('storage', { key: lsKey } as any));
      }
      setSaved(true);
      // Do not navigate; avoid blank page. Command Center navigation should
      // only occur once we have a canonical company_id and explicit user intent.
    } catch (e) {
      console.error('save failed', e);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Button size="sm" variant={saved ? 'secondary' : 'default'} onClick={onClick} className="rounded-xl" disabled={saving || saved}>
      {saved ? 'Saved' : (saving ? 'Saving…' : 'Save')}
    </Button>
  );
}

function KPI({ value, label, icon }: { value: number | string | null; label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl p-2 shadow-sm border bg-white/80">{icon}</div>
      <div>
        <div className="text-xl font-semibold leading-tight">{value ?? '—'}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function RoutePill({ o, d, n }: { o: string; d: string; n: number }) {
  return (
    <Badge variant="secondary" className={cn(brand.chip, 'px-3 py-1 font-medium bg-indigo-50 border-indigo-100')}>
      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-indigo-600" />{o} → {d}</span>
      <span className="ml-2 text-muted-foreground">{n}</span>
    </Badge>
  );
}

// Top carriers chip removed in favor of emphasizing destinations

function CompanyCard({ row, onOpen, selected }: { row: any; onOpen: (r: any) => void; selected?: boolean }) {
  const initials = row.company_name?.split(' ').map((p: string) => p[0]).join('').slice(0,2).toUpperCase();
  const isSaved = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('lit_companies')||'[]').map((c:any)=> String(c?.id||''))).has(String(row?.company_id||'')); } catch { return false; }
  })();
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <Card className={cn('group transition-shadow rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm hover:shadow-md min-h-[260px] flex flex-col', selected ? 'ring-2 ring-indigo-500 ring-offset-1' : '')}>
        <div className="h-1 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 rounded-t-2xl" />
        <CardHeader className="pb-2 flex flex-row items-center gap-4">
          <Avatar className="h-10 w-10"><AvatarFallback className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white">{initials}</AvatarFallback></Avatar>
          <div className="flex-1">
            <CardTitle className="text-base font-semibold tracking-tight text-slate-900">{row.company_name}</CardTitle>
            <div className="mt-1 flex flex-wrap gap-2">
              {(row.tags||[]).map((t: string, i: number) => (
                <Badge key={i} variant="outline" className={cn(brand.chip, 'border-indigo-200 text-slate-600')}>{t}</Badge>
              ))}
              {isSaved && (
                <Badge variant="secondary" className="rounded-full bg-emerald-50 border-emerald-200 text-emerald-700">Saved</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SaveButton row={row} />
            <Button variant="secondary" size="sm" onClick={() => onOpen(row)} className="rounded-xl">View Details <ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex-1 flex flex-col">
          <div className="grid grid-cols-3 gap-4">
            <KPI value={row.shipments_12m} label="Shipments (12m)" icon={<TrendingUp className={brand.kpiIcon} />} />
            <KPI value={(typeof row.last_activity === 'object' ? (row.last_activity?.value || '—') : (row.last_activity ?? '—'))} label="Last activity" icon={<Calendar className={brand.kpiIcon} />} />
            <KPI value={row.top_routes?.[0]?.dest_country ?? '—'} label="Top destination" icon={<MapPin className={brand.kpiIcon} />} />
          </div>
          <Separator className="my-4" />
          <div className="mt-auto">
            <div className="flex flex-wrap gap-2">
              {row.top_routes?.length ? row.top_routes.map((r: any, i: number) => (
                <RoutePill key={i} o={r.origin_country} d={r.dest_country} n={r.cnt} />
              )) : (<span className="text-sm text-muted-foreground">No route data yet</span>)}
            </div>
            {/* Top carriers removed */}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Replaced inline DetailsDialog with shared CompanyModal component

function SearchAppPage() {
  const [view, setView] = useState<'cards'|'list'>('cards');
  // New filters model: typeahead + icon toggle
  const { q, setQ, rows, loading, run, next, prev, page, filters, setFilters } = useSearch();
  const [exploreTab, setExploreTab] = useState<'none'|'trending'|'new'|'saved'|'alerts'>('none');
  const [savedRows, setSavedRows] = useState<any[]>([]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(()=>{
    try {
      const a = JSON.parse(localStorage.getItem('lit_companies') || '[]');
      return new Set<string>(a.map((c: any)=> String(c?.id||'' )).filter(Boolean));
    } catch { return new Set(); }
  });
  const { toast } = useToast();
  function onSubmit(e?: React.FormEvent) { if (e) e.preventDefault(); run(true); }
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [modal, setModal] = useState<any | null>(null);
  const hasSearched = (q || '').trim().length > 0;

  // Do not auto-load results. Wait for user to search.

  // Debounced auto-search on filter or query change (prevents UI thrash)
  const lastSigRef = useRef<string>('');
  const hydratedRef = useRef<boolean>(false);
  const sig = JSON.stringify({ q: (q || '').trim() || null, filters });
  useEffect(() => {
    // Guard initial mount to avoid flip-flop if UI shows 'Any'
    if (!hydratedRef.current) {
      hydratedRef.current = true;
    }
    const id = setTimeout(() => {
      if (lastSigRef.current !== sig) {
        lastSigRef.current = sig;
        run(true);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [sig, run]);

  // All searching handled by useSearch(); no local fetch implementation

  function loadSavedCompanies() {
    try {
      const a = JSON.parse(localStorage.getItem('lit_companies') || '[]');
      const mapped = Array.isArray(a) ? a.map((c: any) => ({
        company_id: String(c?.id||''),
        company_name: String(c?.name||'Company'),
        shipments_12m: Number(c?.kpis?.shipments12m||0),
        last_activity: c?.kpis?.lastActivity || null,
        top_routes: Array.isArray(c?.kpis?.originsTop) && Array.isArray(c?.kpis?.destsTop)
          ? c.kpis.originsTop.slice(0,1).map((o:any, idx:number)=> ({ origin_country: String(o), dest_country: String(c.kpis.destsTop[idx]||o), cnt: 1 })) : [],
        top_carriers: Array.isArray(c?.kpis?.carriersTop) ? c.kpis.carriersTop.slice(0,1).map((carrier:any)=> ({ carrier, cnt: 1 })) : [],
        tags: [],
      })) : [];
      setSavedRows(mapped);
    } catch {
      setSavedRows([]);
    }
  }

  // Reset view on mount to ensure no default cards render
  useEffect(() => {
    setExploreTab('none');
  }, []);

  function normalizeRow(r: any) {
    const company_name = r.company_name || r.name || r.company || '';
    const company_id = r.company_id || r.id || null;
    const shipments_12m = r.shipments_12m ?? r.kpis?.shipments_12m ?? r.shipments ?? 0;
    let last_activity: any = r.last_activity ?? r.kpis?.last_activity ?? r.lastShipmentDate ?? null;
    if (last_activity && typeof last_activity === 'object' && 'value' in last_activity) last_activity = last_activity.value;
    const top_routes = r.top_routes || r.routesTop || [];
    const top_carriers = r.top_carriers || r.carriersTop || [];
    const tags = r.tags || [];
    return { ...r, company_name, company_id, shipments_12m, last_activity, top_routes, top_carriers, tags };
  }

  function dedupeByCompanyId(arr: any[]): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of Array.isArray(arr) ? arr : []) {
      const key = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  async function onSaveCompany(row: any) {
    const cid = String(row?.company_id || '');
    const cname = String(row?.company_name || '');
    if (!cid || !cname) return;
    setSavingIds(prev => new Set(prev).add(cid));
    try {
      await saveCompanyToCrm({ company_id: cid, company_name: cname, source: 'search' });
    } catch {}
    try {
      const lsKey = 'lit_companies';
      const existing = JSON.parse(localStorage.getItem(lsKey) || '[]');
      if (!existing.find((c: any)=> String(c?.id||'') === cid)) {
        const kpis = {
          shipments12m: row?.shipments_12m || 0,
          lastActivity: row?.last_activity || null,
          originsTop: Array.isArray(row?.top_routes) ? row.top_routes.map((r: any)=> r.origin_country) : [],
          destsTop: Array.isArray(row?.top_routes) ? row.top_routes.map((r: any)=> r.dest_country) : [],
          carriersTop: Array.isArray(row?.top_carriers) ? row.top_carriers.map((c: any)=> c.carrier) : [],
        };
        const fresh = { id: cid, name: cname, kpis };
        localStorage.setItem(lsKey, JSON.stringify([fresh, ...existing]));
      }
      setSavedIds(prev=> new Set(prev).add(cid));
      window.dispatchEvent(new StorageEvent('storage', { key: 'lit_companies' } as any));
    } catch {}
    setSavingIds(prev => { const n = new Set(prev); n.delete(cid); return n; });
  }

  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r: any) => String(r.company_name||'').toLowerCase().includes(q.toLowerCase()));
  }, [q, rows]);

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full bg-slate-50">
        <div className="pl-[5px] pr-[5px] pt-[5px]">
          <div className="mb-3">
            <h1 className={brand.heading}>Search</h1>
            <p className="text-sm text-muted-foreground">Find shippers & receivers. Use filters for origin/dest/HS. Click a card to view details.</p>
          </div>
          <div className="w-full">
            <main className="flex-1 min-w-0 max-w-6xl mx-auto">
              <div className="relative">
                <form onSubmit={onSubmit} className="flex items-center justify-center gap-2">
                  <div className="relative w-full max-w-3xl">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                    <Input
                      placeholder="Search by company name or alias (e.g., UPS, Maersk)…"
                      className="pl-9 rounded-xl bg-white/90 h-12 text-base"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                    />
                  </div>
                  <Button type="submit" onClick={() => onSubmit()} className="rounded-xl h-12 px-4"><SearchIcon className="h-4 w-4 mr-2"/>Search</Button>
                </form>
                <div className="mt-3 mb-2 flex items-center gap-2 justify-center">
                  <Button variant={view === 'cards' ? 'default' : 'outline'} size="sm" onClick={() => setView('cards')} className="rounded-xl"><LayoutGrid className="h-4 w-4 mr-2"/> Cards</Button>
                  <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')} className="rounded-xl"><ListIcon className="h-4 w-4 mr-2"/> List</Button>
                  {loading && <span className="text-xs text-muted-foreground">Searching…</span>}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-xl">Explore</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={()=>{ setExploreTab('trending'); }}>
                        <TrendingUp className="h-4 w-4 text-indigo-600"/> Trending Companies
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={()=>{ setExploreTab('new'); }}>
                        <Sparkles className="h-4 w-4 text-indigo-600"/> New Shippers (3–6M)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={()=>{ setExploreTab('saved'); loadSavedCompanies(); }}>
                        <Bookmark className="h-4 w-4 text-indigo-600"/> Saved Companies
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={()=>{ setExploreTab('alerts'); }}>
                        <Bell className="h-4 w-4 text-indigo-600"/> Alerts
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* New typeahead + icon filters; auto-search via debounce in component */}
                <div className="mt-3">
                  <SearchFilters
                    value={filters}
                    onChange={(next) => {
                      setFilters(next);
                    }}
                  />
                </div>
                {/* Build tag removed */}

                {exploreTab==='none' && !rows.length && (<SearchEmpty state="idle"/>)}

                {exploreTab==='saved' && savedRows.length === 0 && (
                  <div className="mt-10 text-center text-sm text-muted-foreground">No saved companies yet.</div>
                )}

                {exploreTab==='alerts' && (
                  <AlertsPanel />
                )}
                {exploreTab==='trending' && !hasSearched && rows.length === 0 && (<SearchEmpty state="idle"/>) }
                {exploreTab==='new' && !hasSearched && rows.length === 0 && (<SearchEmpty state="idle"/>) }

                {(
                  (rows.length > 0) || (exploreTab==='saved' && savedRows.length>0)
                ) && view === 'cards' && (
                  <div className="mt-6">
                    <ResultsGrid rows={dedupeByCompanyId(((exploreTab==='saved' && rows.length===0) ? savedRows : rows))} renderCard={(r)=> (
                      <CompanyCard
                        row={r}
                        selected={selectedKey === getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name })}
                        onOpen={(row) => { setModal(row); setSelectedKey(getCompanyKey({ company_id: row?.company_id, company_name: row?.company_name })); }}
                      />
                    )} />
                  </div>
                )}

                {(
                  (rows.length > 0) || (exploreTab==='saved' && savedRows.length>0)
                ) && view === 'list' && (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white/95 shadow-md overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600"/>
                    <Table>
                      <TableHeader className="bg-slate-50/80">
                        <TableRow>
                          <TableHead className="w-[34%] text-slate-700">Company</TableHead>
                          <TableHead className="w-[12%] text-slate-700">Shipments (12m)</TableHead>
                          <TableHead className="w-[18%] text-slate-700">Last Activity</TableHead>
                          <TableHead className="w-[18%] text-slate-700">Top Routes</TableHead>
                          <TableHead className="w-[18%] text-slate-700">Top Destination</TableHead>
                          <TableHead className="w-[10%] text-slate-700 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dedupeByCompanyId(((exploreTab==='saved' && rows.length===0) ? savedRows : rows)).map((r: any) => {
                          const k = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
                          const isActive = selectedKey === k;
                          return (
                          <TableRow
                            key={k}
                            onClick={() => { setModal(r); setSelectedKey(k); }}
                            className={cn('cursor-pointer hover:bg-slate-50/60 border-l-2 border-transparent hover:border-l-indigo-400 transition-colors', isActive ? 'bg-indigo-50/40 border-l-indigo-500' : '')}
                          >
                            <TableCell>
                              <div className="font-medium text-slate-900">{r.company_name}</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(r.tags||[]).map((t: string, i: number) => (
                                  <Badge key={i} variant="secondary" className="rounded-full bg-indigo-50 border-indigo-200 text-slate-700">{t}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{r.shipments_12m ?? '—'}</TableCell>
                            <TableCell>{(typeof r.last_activity === 'object' ? (r.last_activity?.value || '—') : (r.last_activity ?? '—'))}</TableCell>
                            <TableCell>{r.top_routes?.[0] ? `${r.top_routes[0].origin_country} → ${r.top_routes[0].dest_country} (${r.top_routes[0].cnt})` : '—'}</TableCell>
                            <TableCell>{r.top_routes?.[0]?.dest_country ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              <SaveButton row={r} />
                            </TableCell>
                          </TableRow>
                        );})}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {(
                  (rows.length > 0) || (exploreTab==='saved' && savedRows.length>0)
                ) && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-slate-600">Page {page}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={page<=1 || loading} onClick={prev}>Prev</Button>
                      <Button size="sm" variant="outline" disabled={loading} onClick={next}>Next</Button>
                    </div>
                  </div>
                )}
                {exploreTab==='none' && hasSearched && rows.length === 0 && (<SearchEmpty state="no-results"/>)}
              </div>
            </main>
          </div>

          {/* Empty states handled via SearchEmpty (idle vs no-results) */}
        </div>

        {modal && (
          <CompanyModal company={modal} shipmentsUrl={buildCompanyShipmentsUrl(modal, 50, 0)} onClose={() => setModal(null)} />
        )}
      </div>
    </TooltipProvider>
  );
}

import { ErrorBoundary } from '@/components/ErrorBoundary';
export default function SearchAppPageWrapper() {
  return (
    <ErrorBoundary>
      <SearchAppPage />
    </ErrorBoundary>
  );
}

