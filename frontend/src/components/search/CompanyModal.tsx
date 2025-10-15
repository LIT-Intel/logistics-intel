import React, { useEffect, useMemo, useState } from 'react';
import { getCompanyShipmentsUnified, getCompanyDetails, getCompanyKpis } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { litUI } from '@/lib/uiTokens';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import KpiGrid from './KpiGrid';
import { computeKpis } from './computeKpis';
import ContactsGate from '@/components/search/ContactsGate';
import { Loader2, X } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'kpi' | 'shipments' | 'contacts'>('kpi');

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
    setActiveTab('kpi');
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
                <p className="text-sm text-muted-foreground mt-1">ID: {company?.company_id || '—'}</p>
              </DialogHeader>
              <button aria-label="Close" onClick={() => onClose(false)} className="shrink-0 rounded-full border p-2 hover:bg-neutral-50"><X className="h-4 w-4"/></button>
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
              <TabsTrigger value="kpi" className="w-full justify-center rounded-xl py-2 text-sm font-medium border data-[state=active]:bg-violet-600 data-[state=active]:text-white">KPI</TabsTrigger>
              <TabsTrigger value="shipments" className="w-full justify-center rounded-xl py-2 text-sm font-medium border data-[state=active]:bg-violet-600 data-[state=active]:text-white">Shipments</TabsTrigger>
              <TabsTrigger value="contacts" className="w-full justify-center rounded-xl py-2 text-sm font-medium border data-[state=active]:bg-violet-600 data-[state=active]:text-white">Contacts</TabsTrigger>
            </TabsList>
            <TabsContent value="kpi" className="mt-2 overflow-auto p-1 sm:p-2">
              {/* Prefer server KPIs if available; else compute from visible shipments */}
              {kpiServer ? (
                <>
                  <KpiGrid items={[
                    { label: 'Shipments (12m)', value: kpiServer.shipments_12m ?? '—' },
                    { label: 'Last activity', value: (kpiServer.last_activity?.value || '—') },
                    { label: 'Top route', value: (kpiServer.top_routes?.[0] ? `${kpiServer.top_routes[0].origin_country}→${kpiServer.top_routes[0].dest_country}` : '—') },
                    { label: 'Top carrier', value: (kpiServer.top_carriers?.[0]?.name || '—') },
                    { label: 'Total containers', value: kpiServer.containers_12m ?? '—' },
                    { label: 'TEUs', value: kpiServer.teus_12m ?? '—' },
                    { label: 'Total weight (kg)', value: kpiServer.gross_weight_kg_12m ?? '—' },
                    { label: 'Total value (USD)', value: kpiServer.value_usd_12m ?? '—' },
                  ]} />
                </>
              ) : kpiLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
              ) : (
                <KpiGrid items={computeKpis(shipments)} />
              )}
              <div className="mt-3 border rounded-xl p-3">
                <div className="text-sm font-medium">Profile</div>
                <div className="text-sm text-muted-foreground mt-1">HQ: {details?.hq_city || '—'}, {details?.hq_state || '—'}, {details?.hq_country || '—'}</div>
                <div className="text-sm text-muted-foreground">Website: {details?.website || '—'}</div>
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
              <ContactsGate
                position="center"
                companyName={company?.company_name || 'this company'}
                onUpgrade={() => { /* track('contacts_gate_upgrade_click') */ }}
                onLearnMore={() => { /* track('contacts_gate_learn_more_click') */ }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
