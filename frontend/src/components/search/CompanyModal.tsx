import React, { useEffect, useMemo, useState } from 'react';
import { getCompanyShipmentsUnified, getCompanyDetails, getCompanyKpis, saveCompanyToCrm, getCompanyKey } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { litUI } from '@/lib/uiTokens';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import KpiGrid from './KpiGrid';
import { computeKpis } from './computeKpis';
import ContactsGate from '@/components/search/ContactsGate';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Box, Clock, TrendingUp, Ship } from 'lucide-react';
import { hasFeature } from '@/lib/access';
import { useAuth } from '@/auth/AuthProvider';
import { hasFeature } from '@/lib/access';
function inferTEUs(desc?: string | null, containerCount?: number | null) {
  if (!containerCount || containerCount <= 0) return null;
  const d = (desc || '').toUpperCase();
  const has40 = /\b40(F|RF|HC|RC)?\b/.test(d) || / 40(RF|RC)/.test(d);
  const has20 = /\b20(F|RF|HC|RC)?\b/.test(d) || / 20(RF|RC)/.test(d);
  if (has40 && !has20) return containerCount * 2;
  if (has20 && !has40) return containerCount * 1;
  return null;
}

type Company = {
  company_id?: string | null;
  company_name: string;
  shipments_12m?: number | null;
  last_activity?: { value?: string } | string | null;
};

type ModalProps = {
  company: Company | null;
  open: boolean;
  onClose: (open: boolean) => void;
};

export default function CompanyModal({ company, open, onClose }: ModalProps) {
  const { user } = useAuth() as any;
  const [activeTab, setActiveTab] = useState<'profile' | 'shipments' | 'contacts'>('profile');

  const [details, setDetails] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiServer, setKpiServer] = useState<any>(null);

  const [shipments, setShipments] = useState<any[]>([]);
  const [shipLoading, setShipLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState<number | null>(null);

  const cid = company?.company_id || undefined;
  const cname = company?.company_name || '';

  useEffect(() => {
    if (!open || !company) return;
    setActiveTab('profile');
    setShipments([]);
    setPage(1);
    setTotal(null);
  }, [open, company?.company_id, company?.company_name]);

  useEffect(() => {
    if (!open || !company) return;
    let cancelled = false;
    (async () => {
      setKpiLoading(true);
      try {
        const res = await getCompanyDetails({ company_id: cid, fallback_name: cname });
        if (!cancelled) setDetails(res || {});
        // also fetch server KPIs to render instantly
        try {
          const k = await getCompanyKpis({ company_id: cid, company_name: cid ? undefined : cname });
          if (!cancelled) setKpiServer(k);
        } catch {}
      } catch (e) {
        if (!cancelled) setDetails({});
      } finally {
        if (!cancelled) setKpiLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, cid, cname]);

  useEffect(() => {
    if (!open || !company || activeTab !== 'shipments') return;
    let cancelled = false;
    (async () => {
      setShipLoading(true);
      try {
        const { rows, total: t } = await getCompanyShipmentsUnified({
          company_id: cid,
          company_name: cid ? undefined : cname,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        });
        if (!cancelled) {
          setShipments(rows || []);
          if (typeof t === 'number') setTotal(t);
        }
      } catch (e) {
        if (!cancelled) setShipments([]);
      } finally {
        if (!cancelled) setShipLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, company, activeTab, page, pageSize, cid, cname]);

  const kpis = useMemo(() => {
    const rows = shipments || [];
    const totalShipments = typeof total === 'number' ? total : rows.length;
    const totalContainers = rows.reduce((s, r) => s + (Number(r.container_count) || 0), 0);
    const totalWeight = rows.reduce((s, r) => s + (Number(r.gross_weight_kg) || 0), 0);
    const totalTEU = totalContainers;
    return { totalShipments, totalContainers, totalWeight, totalTEU };
  }, [shipments, total]);

  // Merge details KPIs with card KPIs (fallback when details are sparse)
  const mergedKpi = useMemo(() => {
    const cardShipments12m = (company?.shipments_12m ?? 0) as number;
    const cardLast = typeof company?.last_activity === 'string'
      ? (company?.last_activity as string)
      : ((company?.last_activity as any)?.value ?? null);
    const cardTopRoutes = (company as any)?.top_routes ?? [];
    const cardTopCarriers = (company as any)?.top_carriers ?? [];
    const d = (details?.kpis ?? {}) as any;
    return {
      shipments_12m: (typeof d.shipments_12m === 'number' ? d.shipments_12m : cardShipments12m) as number,
      last_activity: (typeof d.last_activity === 'string' ? d.last_activity : (d?.last_activity?.value ?? cardLast)) as string | null,
      top_routes: Array.isArray(d.top_routes) ? d.top_routes : cardTopRoutes,
      top_carriers: Array.isArray(d.top_carriers) ? d.top_carriers : cardTopCarriers,
    } as { shipments_12m: number; last_activity: string | null; top_routes: any[]; top_carriers: any[] };
  }, [details, company]);

  const subscribedBriefing = hasFeature('briefing');
  const subscribedContacts = hasFeature('contacts');
  const isWhitelisted = String(user?.email||'').toLowerCase() === 'vraymond@logisticintel.com';
  async function handleSaveToCommandCenter() {
    try {
      const cname = String(company?.company_name || '');
      const cid = getCompanyKey({ company_id: company?.company_id || undefined, company_name: cname });
      try { await saveCompanyToCrm({ company_id: cid, company_name: cname, source: 'search' }); } catch {}
      const lsKey = 'lit_companies';
      const existing = JSON.parse(localStorage.getItem(lsKey) || '[]');
      if (!existing.find((c: any)=> String(c?.id||'') === cid)) {
        const cardLast = (typeof company?.last_activity === 'object' && (company as any)?.last_activity?.value)
          ? (company as any).last_activity.value
          : ((company as any)?.last_activity ?? null);
        const kpis = {
          shipments12m: (company as any)?.shipments_12m || 0,
          lastActivity: cardLast,
          originsTop: Array.isArray((company as any)?.top_routes) ? (company as any).top_routes.map((r: any)=> r.origin_country) : [],
          destsTop: Array.isArray((company as any)?.top_routes) ? (company as any).top_routes.map((r: any)=> r.dest_country) : [],
          carriersTop: Array.isArray((company as any)?.top_carriers) ? (company as any).top_carriers.map((c: any)=> c.carrier) : [],
        };
        const fresh = { id: cid, name: cname, kpis };
        localStorage.setItem(lsKey, JSON.stringify([fresh, ...existing]));
        try { window.dispatchEvent(new StorageEvent('storage', { key: lsKey } as any)); } catch {}
      }
    } catch (e) {
      // silent fail; UI remains
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] max-h-[90vh] p-0 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <DialogHeader className="p-0">
                <DialogTitle className="text-2xl md:text-3xl font-semibold" style={{ color: litUI.brandPrimary }}>
                  {company?.company_name || 'Company'}
                </DialogTitle>
                <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-3">
                  <span>ID: {company?.company_id || '—'}</span>
                  <span>
                    Domain: {(() => {
                      const raw = (details?.website as string) || '';
                      const host = raw.replace(/^https?:\/\//,'').replace(/\/.*$/,'');
                      return host || '—';
                    })()}
                  </span>
                  <span>
                    Website: {details?.website ? (
                      <a className="text-violet-700 hover:underline" href={String(details.website)} target="_blank" rel="noreferrer">{String(details.website).replace(/^https?:\/\//,'')}</a>
                    ) : '—'}
                  </span>
                </div>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={handleSaveToCommandCenter} className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">Save to Command Center</button>
                <button aria-label="Close" onClick={() => onClose(false)} className="shrink-0 rounded-full border p-2 hover:bg-neutral-50"><X className="h-4 w-4"/></button>
              </div>
            </div>
            {/* Featured profile card */}
            <div className="mt-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50/80 to-indigo-50/80 shadow-sm p-3 sm:p-4">
              <div className="text-sm font-medium mb-1" style={{ color: litUI.brandPrimary }}>Profile</div>
              <div className="text-sm text-neutral-700 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2">
                <span>HQ: {(details?.hq_city || details?.hq_state || details?.hq_country) ? [details?.hq_city, details?.hq_state, details?.hq_country].filter(Boolean).join(', ') : '—'}</span>
                <span className="hidden sm:inline text-neutral-400">•</span>
                <span>
                  Website: {details?.website ? (
                    <a className="text-violet-700 hover:underline" href={String(details.website)} target="_blank" rel="noreferrer">{details.website}</a>
                  ) : '—'}
                </span>
              </div>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="sticky top-0 z-10 bg-white grid grid-cols-3 gap-2 w-full">
              <TabsTrigger value="profile" className="w-full justify-center rounded-xl py-2 text-sm font-medium border data-[state=active]:bg-violet-600 data-[state=active]:text-white">Profile</TabsTrigger>
              <TabsTrigger value="shipments" className="w-full justify-center rounded-xl py-2 text-sm font-medium border data-[state=active]:bg-violet-600 data-[state=active]:text-white">Shipments</TabsTrigger>
              <TabsTrigger value="contacts" className="w-full justify-center rounded-xl py-2 text-sm font-medium border data-[state=active]:bg-violet-600 data-[state=active]:text-white">Contacts</TabsTrigger>
            </TabsList>
            <TabsContent value="profile" className="mt-2 overflow-auto p-3 sm:p-4">
              {/* KPI cards at top of Profile */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <KpiGrid items={[
                  { label: 'Shipments (12m)', value: kpiServer?.shipments_12m ?? (company?.shipments_12m ?? '—') },
                  { label: 'Last activity', value: (kpiServer?.last_activity?.value ?? (typeof company?.last_activity === 'string' ? company?.last_activity : (company as any)?.last_activity?.value) ?? '—') },
                  { label: 'TEUs', value: (kpiServer?.teus_12m ?? '—') },
                  { label: 'Growth Rate', value: (kpiServer?.growth_rate ?? '—') },
                ]} />
              </div>
              {/* Bar chart placeholder for 12 months shipments */}
              <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50 p-3">
                <div className="text-sm font-medium text-violet-800 mb-2">Shipments (last 12 months)</div>
                <div className="h-40 flex items-end gap-1">
                  {/* Placeholder bars; keeping style only */}
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex-1 rounded-t bg-violet-600" style={{ height: `${20 + (i%6)*10}px` }} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-neutral-500">Company ID:</span> <span className="font-medium">{company?.company_id || '—'}</span></div>
                <div><span className="text-neutral-500">Website:</span> {details?.website ? (
                  <a className="text-violet-700 hover:underline font-medium" href={String(details.website)} target="_blank" rel="noreferrer">{String(details.website).replace(/^https?:\/\//,'')}</a>
                ) : '—'}</div>
                <div><span className="text-neutral-500">HQ:</span> <span className="font-medium">{(details?.hq_city || details?.hq_state || details?.hq_country) ? [details?.hq_city, details?.hq_state, details?.hq_country].filter(Boolean).join(', ') : '—'}</span></div>
              </div>
            </TabsContent>
            <TabsContent value="shipments" className="mt-2 flex-1 min-h-0 flex flex-col p-1 sm:p-2">
              {shipLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading shipments…</div>
              ) : shipments.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">No shipments found.</div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="grid grid-cols-4 gap-4 text-center mb-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Total (server)</div>
                      <div className="text-base font-semibold">{(total ?? shipments.length).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Containers (page)</div>
                      <div className="text-base font-semibold">{kpis.totalContainers.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Weight kg (page)</div>
                      <div className="text-base font-semibold">{kpis.totalWeight.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">TEU est. (page)</div>
                      <div className="text-base font-semibold">{kpis.totalTEU.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto border rounded-md">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Mode</th>
                          <th className="px-3 py-2 text-left">Origin</th>
                          <th className="px-3 py-2 text-left">Destination</th>
                          <th className="px-3 py-2 text-left">Origin Port</th>
                          <th className="px-3 py-2 text-left">Destination Port</th>
                          <th className="px-3 py-2 text-right">Value (USD)</th>
                          <th className="px-3 py-2 text-right">Weight (kg)</th>
                          <th className="px-3 py-2 text-right">Containers</th>
                          <th className="px-3 py-2 text-right">TEUs*</th>
                          <th className="px-3 py-2 text-left">Carrier</th>
                          <th className="px-3 py-2 text-left">HS</th>
                          <th className="px-3 py-2 text-left">Commodity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shipments.map((s, i) => {
                          const teu = inferTEUs(s?.commodity_description, s?.container_count);
                          return (
                            <tr key={i} className="border-t hover:bg-muted/20">
                              <td className="px-3 py-2">{s?.date?.value || s?.shipment_date?.value || '—'}</td>
                              <td className="px-3 py-2">{s?.mode || '—'}</td>
                              <td className="px-3 py-2">{s?.origin_country || '—'}</td>
                              <td className="px-3 py-2">{s?.dest_country || '—'}</td>
                              <td className="px-3 py-2">{s?.origin_port || '—'}</td>
                              <td className="px-3 py-2">{s?.dest_port || '—'}</td>
                              <td className="px-3 py-2 text-right">{s?.value_usd == null ? '—' : Number(s.value_usd).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">{s?.gross_weight_kg == null ? '—' : Number(s.gross_weight_kg).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">{s?.container_count ?? '—'}</td>
                              <td className="px-3 py-2 text-right">{teu ?? '—'}</td>
                              <td className="px-3 py-2">{s?.carrier || '—'}</td>
                              <td className="px-3 py-2">{s?.hs_code || '—'}</td>
                              <td className="px-3 py-2 max-w-[360px] truncate">{s?.commodity_description || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-xs text-muted-foreground">Page {page} • Page size {pageSize}{typeof total === 'number' ? ` • ${total} total` : ''}</div>
                    <div className="space-x-2">
                      <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
                      <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage((p) => p + 1)} disabled={typeof total === 'number' ? page * pageSize >= total : shipments.length < pageSize}>Next</button>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="contacts" className="mt-2 p-1 sm:p-2">
              {/* Always show business-card style preview with CTA per spec */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, idx) => (
                  <div key={idx} className="rounded-lg shadow-sm border border-gray-200 p-4 flex items-start gap-4 bg-white">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate">Decision Maker</p>
                      <p className="text-xs text-gray-600 mb-1 truncate">Title</p>
                      <p className="text-sm text-gray-700 truncate">email@example.com</p>
                      <p className="text-sm text-gray-700 truncate">(555) 000-0000</p>
                    </div>
                    <Button size="sm" className="px-3 py-1 text-xs text-white rounded" style={{ backgroundColor: '#7F3DFF' }}>Save to Command Center</Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500">These are sample cards. Save the company to Command Center to view real contacts and enrichment.</div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
