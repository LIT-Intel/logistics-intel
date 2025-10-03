import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { LayoutGrid, List as ListIcon, Search as SearchIcon, ChevronRight, MapPin, Package, TrendingUp, Calendar, Mail, Phone, ExternalLink, Filter, XCircle, Factory } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchCompanies, getCompanyShipments } from '@/lib/api/search';
import { getFilterOptions } from '@/lib/api';

const brand = {
  heading: 'text-[28px] font-bold tracking-tight text-purple-700',
  kpiIcon: 'h-5 w-5 text-indigo-600',
  chip: 'rounded-full'
};

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
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onOpen(row)} className="rounded-xl">View Details <ChevronRight className="ml-1 h-4 w-4" /></Button>
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
      <DialogContent className="max-w-5xl p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-9 w-9"><AvatarFallback className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white">{initials}</AvatarFallback></Avatar>
            <span className="text-slate-900 font-semibold">{row.company_name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2">
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
        <div className="px-6 pb-6">
          <Tabs defaultValue="shipments">
            <TabsList className="grid w-full grid-cols-4">
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
      </DialogContent>
    </Dialog>
  );
}

export default function SearchAppPage() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'cards'|'list'>('cards');
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [opts, setOpts] = useState<{ modes: string[]; origins: string[]; destinations: string[] }>({ modes: [], origins: [], destinations: [] });
  const [origin, setOrigin] = useState<string[]>([]);
  const [dest, setDest] = useState<string[]>([]);
  const [hs, setHs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await searchCompanies({ q: null, limit: 24, offset: 0 });
        const norm = (data?.rows || data || []).map((r: any)=> ({
          ...r,
          tags: r.tags || [],
        }));
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
      const data = await searchCompanies({ q: query || null, origin, dest, hs, limit: 24, offset: 0 });
      const norm = (data?.rows || data || []).map((r: any)=> ({ ...r, tags: r.tags || [] }));
      setRows(norm);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!query) return rows;
    return rows.filter((r: any) => String(r.company_name||'').toLowerCase().includes(query.toLowerCase()));
  }, [query, rows]);

  return (
    <TooltipProvider>
      <div className="min-h-[90vh] w-full bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className={brand.heading}>Search</h1>
              <p className="text-sm text-muted-foreground">Find shippers & receivers. Use filters for origin/dest/HS. Click a card to view details.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-2 rounded-xl"><Filter className="h-4 w-4 text-purple-600"/>Filters</Button>
              <Button variant="ghost" className="gap-2 text-muted-foreground rounded-xl" onClick={() => { setQuery(''); }}><XCircle className="h-4 w-4"/>Clear</Button>
            </div>
          </div>

          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                <Input
                  placeholder="Search by company name or alias (e.g., UPS, Maersk)…"
                  className="pl-9 rounded-xl bg-white/90 h-11"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                />
              </div>
              <Button onClick={runSearch} className="rounded-xl h-11 px-4"><SearchIcon className="h-4 w-4 mr-2"/>Search</Button>
              <Button variant="outline" className="gap-2 rounded-xl h-11" onClick={() => setFiltersOpen(true)}><Filter className="h-4 w-4 text-purple-600"/>Filters</Button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button variant={view === 'cards' ? 'default' : 'outline'} size="sm" onClick={() => setView('cards')} className="rounded-xl"><LayoutGrid className="h-4 w-4 mr-2"/> Cards</Button>
              <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')} className="rounded-xl"><ListIcon className="h-4 w-4 mr-2"/> List</Button>
              {loading && <span className="text-xs text-muted-foreground">Searching…</span>}
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="mt-10 text-center">
              <div className="mx-auto w-fit rounded-2xl border p-8 bg-white/80 shadow-sm">
                <Factory className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/>
                <div className="font-medium">No companies match “{query}”.</div>
                <div className="text-sm text-muted-foreground">Try a broader term or clear filters.</div>
              </div>
            </div>
          )}

          {filtered.length > 0 && view === 'cards' && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-[280px]">
              <AnimatePresence>
                {filtered.map((r: any) => (
                  <CompanyCard key={r.company_id || r.company_name} row={r} onOpen={(row) => { setActive(row); setOpen(true); }} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {filtered.length > 0 && view === 'list' && (
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: any) => (
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DetailsDialog open={open} onOpenChange={setOpen} row={active} />

        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="max-w-xl rounded-2xl">
            <DialogHeader>
              <DialogTitle>Filters</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Origin</div>
                <div className="flex flex-wrap gap-2">
                  {opts.origins.map((o) => {
                    const active = origin.includes(o);
                    return (
                      <Button key={o} variant={active ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setOrigin((prev)=> active ? prev.filter(x=> x!==o) : [...prev, o])}>{o}</Button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Destination</div>
                <div className="flex flex-wrap gap-2">
                  {opts.destinations.map((d) => {
                    const active = dest.includes(d);
                    return (
                      <Button key={d} variant={active ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setDest((prev)=> active ? prev.filter(x=> x!==d) : [...prev, d])}>{d}</Button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">HS Codes</div>
                <Input placeholder="e.g. 9403, 8501" onChange={(e)=> setHs(e.target.value.split(',').map(s=> s.trim()).filter(Boolean))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setOrigin([]); setDest([]); setHs([]); }}>Clear</Button>
                <Button onClick={() => { setFiltersOpen(false); runSearch(); }}>Apply</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

