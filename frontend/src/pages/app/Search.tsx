import React, { useMemo, useState, useEffect } from 'react';
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
import { LayoutGrid, List as ListIcon, Search as SearchIcon, ChevronRight, MapPin, Package, TrendingUp, Calendar, Mail, Phone, ExternalLink, Filter, XCircle, Factory } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchCompanies, getCompanyShipments } from '@/lib/api/search';
import { InlineFilters } from '@/components/search/InlineFilters';
import { getFilterOptions, saveCompanyToCrm } from '@/lib/api';

const brand = {
  heading: 'text-[28px] font-bold tracking-tight text-purple-700',
  kpiIcon: 'h-5 w-5 text-indigo-600',
  chip: 'rounded-full'
};

function SaveButton({ row }: { row: any }) {
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  async function onClick() {
    if (saving || saved) return;
    setSaving(true);
    try {
      let cid = String(row?.company_id || '');
      const cname = String(row?.company_name || '');
      if (!cname) throw new Error('missing name');
      if (!cid) {
        const base = cname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 20);
        cid = `comp_${base || 'company'}_${Math.random().toString(36).slice(2, 6)}`;
      }
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

function CarrierPill({ c, n }: { c: string; n: number }) {
  return (
    <Badge variant="outline" className={cn(brand.chip, 'px-3 py-1 font-medium border-indigo-200')}>
      <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5 text-purple-600" />{c}</span>
      <span className="ml-2 text-muted-foreground">{n}</span>
    </Badge>
  );
}

function CompanyCard({ row, onOpen }: { row: any; onOpen: (r: any) => void }) {
  const initials = row.company_name?.split(' ').map((p: string) => p[0]).join('').slice(0,2).toUpperCase();
  const isSaved = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('lit_companies')||'[]').map((c:any)=> String(c?.id||''))).has(String(row?.company_id||'')); } catch { return false; }
  })();
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <Card className="group transition-shadow rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm hover:shadow-md min-h-[260px] flex flex-col">
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
            <KPI value={row.last_activity ?? '—'} label="Last activity" icon={<Calendar className={brand.kpiIcon} />} />
            <KPI value={row.top_carriers?.[0]?.carrier ?? '—'} label="Top carrier" icon={<Package className={brand.kpiIcon} />} />
          </div>
          <Separator className="my-4" />
          <div className="mt-auto">
            <div className="flex flex-wrap gap-2">
              {row.top_routes?.length ? row.top_routes.map((r: any, i: number) => (
                <RoutePill key={i} o={r.origin_country} d={r.dest_country} n={r.cnt} />
              )) : (<span className="text-sm text-muted-foreground">No route data yet</span>)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.top_carriers?.length ? row.top_carriers.map((c: any, i: number) => (
                <CarrierPill key={i} c={c.carrier} n={c.cnt} />
              )) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function DetailsDialog({ open, onOpenChange, row }: { open: boolean; onOpenChange: (v: boolean) => void; row: any }) {
  const [shipments, setShipments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !row) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await getCompanyShipments({ company_id: row.company_id ?? null, company_name: row.company_name ?? null, limit: 50, offset: 0 });
        const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
        setShipments(rows);
      } catch (e: any) {
        setError(e?.message || 'Failed to load shipments');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, row?.company_id, row?.company_name]);

  if (!row) return null;
  const initials = row.company_name?.split(' ').map((p: string) => p[0]).join('').slice(0,2).toUpperCase();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 w-screen h-[100dvh] max-h-[100dvh] rounded-none sm:rounded-2xl sm:w-auto sm:h-auto sm:max-w-5xl">
        <div className="flex flex-col h-full">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 sticky top-0 bg-white z-10 border-b">
            <DialogTitle className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9"><AvatarFallback className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white">{initials}</AvatarFallback></Avatar>
                <span className="text-slate-900 font-semibold truncate max-w-[60vw] sm:max-w-none">{row.company_name}</span>
              </div>
              <DialogClose asChild>
                <button className="inline-flex items-center justify-center rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 sm:hidden"><XCircle className="h-4 w-4"/></button>
              </DialogClose>
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 sm:px-6 pb-3 sm:pb-2 overflow-y-auto sm:overflow-visible flex-1 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' as any }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="col-span-2 border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Snapshot</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <KPI value={row.shipments_12m} label="Shipments (12m)" icon={<TrendingUp className={brand.kpiIcon} />} />
                  <KPI value={row.last_activity ?? '—'} label="Last activity" icon={<Calendar className={brand.kpiIcon} />} />
                  <KPI value={row.top_carriers?.[0]?.carrier ?? '—'} label="Top carrier" icon={<Package className={brand.kpiIcon} />} />
                </div>
                <Separator className="my-4" />
                <div>
                  <div className="text-sm font-medium mb-2">Top routes</div>
                  <div className="flex flex-wrap gap-2">
                    {row.top_routes?.length ? row.top_routes.map((r: any, i: number) => (
                      <Badge key={i} variant="secondary" className={cn(brand.chip, 'px-3 py-1 font-medium bg-indigo-50 border-indigo-100')}>
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-indigo-600" />{r.origin_country} → {r.dest_country}</span>
                        <span className="ml-2 text-muted-foreground">{r.cnt}</span>
                      </Badge>
                    )) : <span className="text-sm text-muted-foreground">No route data</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Quick actions</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="default" className="justify-start rounded-xl"><Mail className="h-4 w-4 mr-2"/>Email Contact</Button>
                <Button variant="secondary" className="justify-start rounded-xl"><Phone className="h-4 w-4 mr-2"/>Call via CRM</Button>
                <Button variant="outline" className="justify-start rounded-xl"><ExternalLink className="h-4 w-4 mr-2"/>Open Company Page</Button>
              </CardContent>
            </Card>
          </div>
          </div>
          <Separator />
          <div className="px-4 sm:px-6 pb-20 sm:pb-4">
            <Tabs defaultValue="shipments">
              <TabsList className="flex sm:grid w-full sm:grid-cols-4 overflow-x-auto gap-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="shipments">Shipments</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
              </TabsList>
            <TabsContent value="overview" className="mt-4"><div className="text-sm text-muted-foreground">Company metadata, enrichment summary, confidence scores…</div></TabsContent>
            <TabsContent value="shipments" className="mt-4">
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-5 text-xs uppercase text-muted-foreground p-3 bg-slate-50/60">
                  <div>Date</div><div>Mode</div><div>Origin → Dest</div><div>HS</div><div>Carrier</div>
                </div>
                <Separator />
                {loading && (
                  <div className="p-4 text-sm text-muted-foreground">Loading…</div>
                )}
                {error && (
                  <div className="p-4 text-sm text-red-600">{error}</div>
                )}
                {!loading && !error && (
                  <div className="divide-y">
                    {shipments.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground">No shipments found.</div>
                    )}
                    {shipments.map((s: any, i: number) => {
                      const date = s.shipped_on || s.date || s.dt || '—';
                      const mode = s.mode || s.transport_mode || '—';
                      const origin = s.origin || s.origin_port || s.origin_country || s.o || '—';
                      const dest = s.destination || s.dest || s.destination_port || s.dest_country || s.d || '—';
                      const hs = s.hs || s.hs_code || '—';
                      const carrier = s.carrier || s.line || s.airline || '—';
                      return (
                        <div key={i} className="grid grid-cols-5 p-3 text-sm">
                          <div>{date}</div>
                          <div className="capitalize">{mode}</div>
                          <div>{origin} → {dest}</div>
                          <div>{hs}</div>
                          <div>{carrier}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </TabsContent>
            <TabsContent value="contacts" className="mt-4"><div className="text-sm text-muted-foreground">Linked contacts and enrichment actions…</div></TabsContent>
            <TabsContent value="campaigns" className="mt-4"><div className="text-sm text-muted-foreground">Recent sequences and follow-ups…</div></TabsContent>
            </Tabs>
          </div>
          <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 border-t p-2 flex justify-end">
            <DialogClose asChild>
              <button className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-slate-700"><XCircle className="h-4 w-4"/>Close</button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SearchAppPage() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'cards'|'list'>('cards');
  const [rows, setRows] = useState<any[]>([]);
  const [lastPayload, setLastPayload] = useState<any>(null);
  const [lastEndpoint, setLastEndpoint] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [opts, setOpts] = useState<{ modes: string[]; origins: string[]; destinations: string[] }>({ modes: [], origins: [], destinations: [] });
  const [filters, setFilters] = useState<{origin:string[]; dest:string[]; hs:string[]}>({ origin: [], dest: [], hs: [] });
  const [loading, setLoading] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(()=>{
    try {
      const a = JSON.parse(localStorage.getItem('lit_companies') || '[]');
      return new Set<string>(a.map((c: any)=> String(c?.id||'' )).filter(Boolean));
    } catch { return new Set(); }
  });

  useEffect(() => {
    (async () => {
      try {
        const payload = { q: null, limit: 24, offset: 0 } as const;
        setLastPayload(payload);
        setLastEndpoint('/public/searchCompanies');
        console.log('[LIT] initial search → payload', payload);
        const data = await searchCompanies(payload as any);
        const arr = (data?.rows || data || []);
        const norm = arr.map((r: any) => normalizeRow(r)).filter((r:any)=> r.company_id && r.company_name);
        console.log('[LIT] initial search → rows', norm.length, norm.slice(0,2));
        setRows(norm);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const fo = await getFilterOptions();
        setOpts({ modes: fo.modes || [], origins: fo.origins || [], destinations: fo.destinations || [] });
      } catch {}
    })();
  }, []);

  async function runSearch() {
    setLoading(true);
    try {
      const payload = { q: (query?.trim() || null), origin: (filters.origin?.length ? filters.origin : null), dest: (filters.dest?.length ? filters.dest : null), hs: (filters.hs?.length ? filters.hs : null), limit: 24, offset: 0 };
      setLastPayload(payload);
      setLastEndpoint('/public/searchCompanies');
      console.log('[LIT] runSearch → payload', payload);
      const data = await searchCompanies(payload);
      const arr = (data?.rows || data || []);
      const norm = arr.map((r: any) => normalizeRow(r)).filter((r:any)=> r.company_id && r.company_name);
      console.log('[LIT] runSearch → rows', norm.length, norm.slice(0,2));
      setRows(norm);
    } catch (e) {
      console.error('[LIT] runSearch error', e);
    } finally {
      setLoading(false);
    }
  }

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
    if (!query) return rows;
    return rows.filter((r: any) => String(r.company_name||'').toLowerCase().includes(query.toLowerCase()));
  }, [query, rows]);

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full bg-slate-50">
        <div className="pl-[5px] pr-[5px] pt-[5px]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className={brand.heading}>Search</h1>
              <p className="text-sm text-muted-foreground">Find shippers & receivers. Use filters for origin/dest/HS. Click a card to view details.</p>
            </div>
            <div />
          </div>

          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                <Input
                  placeholder="Search by company name or alias (e.g., UPS, Maersk)…"
                  className="pl-9 rounded-xl bg-white/90 h-12 text-base"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                />
              </div>
              <Button onClick={runSearch} className="rounded-xl h-12 px-4"><SearchIcon className="h-4 w-4 mr-2"/>Search</Button>
              <Button variant="outline" onClick={() => setFiltersOpen(v=>!v)} className="rounded-xl h-12 px-4 gap-2"><Filter className="h-4 w-4 text-purple-600"/>Filters</Button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button variant={view === 'cards' ? 'default' : 'outline'} size="sm" onClick={() => setView('cards')} className="rounded-xl"><LayoutGrid className="h-4 w-4 mr-2"/> Cards</Button>
              <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')} className="rounded-xl"><ListIcon className="h-4 w-4 mr-2"/> List</Button>
              {loading && <span className="text-xs text-muted-foreground">Searching…</span>}
            </div>
            {filtersOpen && (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm font-medium mb-2">Origin</div>
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-auto pr-1">
                      {opts.origins.map((o) => {
                        const isOn = filters.origin.includes(o);
                        return (
                          <Button key={o} variant={isOn ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setFilters(prev=> ({ ...prev, origin: isOn ? prev.origin.filter(x=>x!==o) : [...prev.origin, o] }))}>{o}</Button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-2">Destination</div>
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-auto pr-1">
                      {opts.destinations.map((d) => {
                        const isOn = filters.dest.includes(d);
                        return (
                          <Button key={d} variant={isOn ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setFilters(prev=> ({ ...prev, dest: isOn ? prev.dest.filter(x=>x!==d) : [...prev.dest, d] }))}>{d}</Button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-2">HS Codes</div>
                    <Input placeholder="e.g. 9403, 8501" onChange={(e)=> setFilters(prev=> ({ ...prev, hs: e.target.value.split(',').map(s=> s.trim()).filter(Boolean) }))} />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setFilters({ origin: [], dest: [], hs: [] }); }}>Clear</Button>
                  <Button onClick={() => { runSearch(); }}>Apply</Button>
                </div>
              </div>
            )}
            <InlineFilters filters={filters} onRemove={(type, val)=>{ setFilters(prev=> ({ ...prev, [type]: prev[type].filter(v=> v!==val) })); }} />
            <div className="mt-1 text-[11px] text-muted-foreground select-text">
              <div>Endpoint: <code>{lastEndpoint}</code></div>
              <div>Payload: <code>{JSON.stringify(lastPayload)}</code></div>
              <div>Rows: <code>{rows?.length ?? 0}</code></div>
            </div>
          </div>

          {rows.length === 0 && (
            <div className="mt-10 text-center">
              <div className="mx-auto w-fit rounded-2xl border p-8 bg-white/80 shadow-sm">
                <Factory className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/>
                <div className="font-medium">No companies match “{query}”.</div>
                <div className="text-sm text-muted-foreground">Try a broader term or clear filters.</div>
              </div>
            </div>
          )}

          {rows.length > 0 && view === 'cards' && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-[280px]">
              <AnimatePresence>
                {rows.map((r: any) => (
                  <CompanyCard key={r.company_id || r.company_name} row={r} onOpen={(row) => { setActive(row); setOpen(true); }} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {rows.length > 0 && view === 'list' && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white/95 shadow-sm overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600"/>
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="w-[34%] text-slate-700">Company</TableHead>
                    <TableHead className="w-[12%] text-slate-700">Shipments (12m)</TableHead>
                    <TableHead className="w-[18%] text-slate-700">Last Activity</TableHead>
                    <TableHead className="w-[18%] text-slate-700">Top Routes</TableHead>
                    <TableHead className="w-[18%] text-slate-700">Top Carrier</TableHead>
                    <TableHead className="w-[10%] text-slate-700 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => (
                    <TableRow key={r.company_id || r.company_name} className="hover:bg-slate-50/60 border-l-2 border-transparent hover:border-l-purple-400 transition-colors">
                      <TableCell>
                        <div className="font-medium text-slate-900">{r.company_name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(r.tags||[]).map((t: string, i: number) => (
                            <Badge key={i} variant="outline" className="rounded-full border-indigo-200 text-slate-600">{t}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{r.shipments_12m ?? '—'}</TableCell>
                      <TableCell>{r.last_activity ?? '—'}</TableCell>
                      <TableCell>{r.top_routes?.[0] ? `${r.top_routes[0].origin_country} → ${r.top_routes[0].dest_country} (${r.top_routes[0].cnt})` : '—'}</TableCell>
                      <TableCell>{r.top_carriers?.[0]?.carrier ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <SaveButton row={r} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DetailsDialog open={open} onOpenChange={setOpen} row={active} />
      </div>
    </TooltipProvider>
  );
}

