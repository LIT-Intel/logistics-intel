import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { getCompanyShipmentsUnified } from '@/lib/api';
import { X, Ship, Box, TrendingUp, MapPin, Globe, Database, Link as LinkIcon, Lock, BarChart as BarChartIcon } from 'lucide-react';

type Company = { company_id?: string | null; company_name?: string; domain?: string | null; website?: string | null };

type ModalProps = { company: Company | null; open: boolean; onClose: (open: boolean) => void };

export default function CompanyModal({ company, open, onClose }: ModalProps) {
  const [chartRows, setChartRows] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);
  const [loadingTable, setLoadingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview'|'summary'|'shipments'|'contacts'>('overview');
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [showGate, setShowGate] = useState(false);

  const cid = company?.company_id || undefined;
  const cname = company?.company_name || undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !company) return;
      try {
        const { rows } = await getCompanyShipmentsUnified({ company_id: cid, company_name: cid ? undefined : cname, limit: 1000, offset: 0 });
        if (!cancelled) setChartRows(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setChartRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, cid, cname, company]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !company || activeTab !== 'shipments') return;
      setLoadingTable(true); setError(null);
      try {
        const { rows, total } = await getCompanyShipmentsUnified({ company_id: cid, company_name: cid ? undefined : cname, limit: 50, offset: (page - 1) * 50 });
        if (!cancelled) { setTableRows(Array.isArray(rows) ? rows : []); setTotal(Number(total || 0)); }
      } catch (e: any) {
        if (!cancelled) { setTableRows([]); setTotal(0); setError('Failed to load shipments'); }
      } finally {
        if (!cancelled) setLoadingTable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeTab, page, cid, cname, company]);

  const website = (company?.website || company?.domain || '')?.toString();

  const monthlyVolumes = useMemo(() => {
    const now = new Date();
    const months: { key: string; month: string; volume: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      months.push({ key, month: d.toLocaleString(undefined, { month: 'short' }), volume: 0 });
    }
    const byKey = new Map(months.map(m => [m.key, m]));
    for (const r of chartRows) {
      const raw = (r as any)?.date?.value || (r as any)?.shipment_date?.value || (r as any)?.shipped_on || null;
      if (!raw) continue;
      const dt = new Date(String(raw)); if (isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      const vol = typeof (r as any)?.teu === 'number' ? Number((r as any).teu) : 1;
      if (byKey.has(key)) byKey.get(key)!.volume += vol;
    }
    return months;
  }, [chartRows]);

  const topRoute = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of chartRows) {
      const o = (r as any)?.origin_country || (r as any)?.origin_city || (r as any)?.origin_port || '—';
      const d = (r as any)?.dest_country || (r as any)?.dest_city || (r as any)?.dest_port || '—';
      const key = `${o} → ${d}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = '—', max = 0; for (const [k, v] of counts) { if (v > max) { max = v; best = k; } }
    return best;
  }, [chartRows]);

  const displayedRows = useMemo(() => {
    if (!dateStart && !dateEnd) return tableRows;
    const s = dateStart ? new Date(dateStart) : null;
    const e = dateEnd ? new Date(dateEnd) : null;
    return tableRows.filter((r) => {
      const raw = (r as any)?.date?.value || (r as any)?.shipment_date?.value || (r as any)?.shipped_on || null;
      if (!raw) return false;
      const dt = new Date(String(raw));
      if (s && dt < s) return false;
      if (e && dt > e) return false;
      return true;
    });
  }, [tableRows, dateStart, dateEnd]);

  if (!open || !company) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0 rounded-xl bg-white">
        <DialogHeader className="p-6 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold truncate" style={{ color: '#7F3DFF' }} title={company?.company_name || 'Company'}>
                {company?.company_name || 'Company'}
              </DialogTitle>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <div>ID: {company?.company_id || '—'}</div>
                {website && (
                  <div className="flex items-center gap-1.5"><Globe className="w-4 h-4" /><a className="text-blue-600 hover:underline" href={`https://${website.replace(/^https?:\/\//,'')}`} target="_blank" rel="noreferrer">{website.replace(/^https?:\/\//,'')}</a></div>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onClose(false)} aria-label="Close" className="rounded-full text-gray-500 hover:text-gray-900">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={(v:any)=>setActiveTab(v)} className="h-full flex flex-col">
            <div className="px-6 border-b">
              <TabsList className="gap-2">
                <TabsTrigger value="overview" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Overview</TabsTrigger>
                <TabsTrigger value="summary" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Shipment Summary</TabsTrigger>
                <TabsTrigger value="shipments" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Shipments</TabsTrigger>
                <TabsTrigger value="contacts" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none" onClick={()=> setShowGate(true)}>Contacts</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-auto">
              <TabsContent value="overview" className="p-6 space-y-6">
                <h3 className="text-xl font-bold text-gray-900">Company Profile</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm"><Database className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Company ID</div><div className="font-semibold text-gray-800">{company?.company_id || '—'}</div></div></div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm"><LinkIcon className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Website</div><div className="font-semibold text-gray-800 truncate max-w-[280px]">{website ? website.replace(/^https?:\/\//,'') : '—'}</div></div></div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm"><Ship className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Total Shipments (12m)</div><div className="font-semibold text-gray-800">{(company as any)?.shipments_12m ?? '—'}</div></div></div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm"><Box className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Total TEUs (12m)</div><div className="font-semibold text-gray-800">{(company as any)?.total_teus != null ? Number((company as any).total_teus).toLocaleString() : '—'}</div></div></div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm sm:col-span-2"><MapPin className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Top Trade Route</div><div className="font-semibold text-gray-800">{topRoute}</div></div></div>
                </div>
                <div className="border rounded-xl p-4" style={{ backgroundColor: '#EEE6FF' }}>
                  <h4 className="text-lg font-bold text-gray-800 mb-1 flex items-center"><BarChartIcon className="w-5 h-5 mr-2" style={{ color: '#7F3DFF' }}/> Sales Intelligence Available</h4>
                  <p className="text-sm text-gray-700">Access real-time contacts and AI-enriched insights about this company's supply chain strategy by saving them to your Command Center.</p>
                </div>
              </TabsContent>

              <TabsContent value="summary" className="p-6 space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><Ship className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{(company as any)?.shipments_12m ?? '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Total Shipments (12m)</div></div>
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><Box className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{(company as any)?.total_teus != null ? Number((company as any).total_teus).toLocaleString() : '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Total TEUs (12m)</div></div>
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><TrendingUp className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{(company as any)?.growth_rate != null ? `${Math.round(Number((company as any).growth_rate) * 100)}%` : '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Growth Rate (YoY)</div></div>
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><MapPin className="w-6 h-6 mx-auto mb-2 text-red-500"/><div className="text-lg font-bold">{topRoute}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Primary Route</div></div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><BarChartIcon className="w-5 h-5 mr-2" style={{ color: '#7F3DFF' }}/> 12-Month Shipment Volume (TEU Equivalent)</h3>
                  <div className="relative" style={{ height: '150px' }}>
                    <div className="absolute inset-x-0 h-0 border-t border-dashed border-gray-200 top-0" />
                    <div className="absolute inset-x-0 h-0 border-t border-dashed border-gray-200 top-1/2 -translate-y-1/2" />
                    <div className="absolute inset-x-0 h-0 border-t border-dashed border-gray-200 bottom-0" />
                    <div className="h-full flex items-end justify-around gap-2 px-1">
                      {(() => {
                        const max = Math.max(1, ...monthlyVolumes.map(v => v.volume));
                        return monthlyVolumes.map((v, idx) => {
                          const barH = Math.max(5, Math.round((v.volume / max) * 150));
                          const color = idx === monthlyVolumes.length - 1 ? '#7F3DFF' : '#A97EFF';
                          return (
                            <div key={v.key} className="group relative flex-1 flex flex-col items-center justify-end" style={{ minWidth: '20px' }}>
                              <div className="absolute -top-7 rounded bg-gray-900 text-white text-[11px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">{v.volume.toLocaleString()}</div>
                              <div className="w-full rounded-t-sm transition-all duration-300 hover:opacity-90 shadow-[inset_0_0_6px_rgba(255,255,255,0.3),0_6px_12px_rgba(0,0,0,0.15)]" style={{ height: `${barH}px`, background: `linear-gradient(180deg, ${color} 0%, ${color} 60%, #5f2fd1 100%)` }} />
                              <div className="text-[11px] text-gray-500 mt-1">{v.month}</div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <p className="text-xs text-center text-gray-400 mt-4">Data represents estimated monthly shipment volume over the last 12 months.</p>
                </div>
              </TabsContent>

              <TabsContent value="shipments" className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Start date</div>
                    <input type="date" className="border rounded px-3 py-2 text-sm" value={dateStart} onChange={(e)=> { setPage(1); setDateStart(e.target.value); }} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">End date</div>
                    <input type="date" className="border rounded px-3 py-2 text-sm" value={dateEnd} onChange={(e)=> { setPage(1); setDateEnd(e.target.value); }} />
                  </div>
                  <div className="text-sm text-gray-600 sm:ml-auto">Page {page} · 50 per page {total ? `· ${total} total` : ''}</div>
                </div>
                {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
                <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
                  {loadingTable ? (
                    <div className="p-6 text-sm text-gray-500">Loading shipments…</div>
                  ) : displayedRows.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500">No shipment data available.</div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Date</th>
                          <th className="px-3 py-2 text-left font-medium">Mode</th>
                          <th className="px-3 py-2 text-left font-medium">Origin</th>
                          <th className="px-3 py-2 text-left font-medium">Destination</th>
                          <th className="px-3 py-2 text-left font-medium">Carrier</th>
                          <th className="px-3 py-2 text-right font-medium">Containers</th>
                          <th className="px-3 py-2 text-right font-medium">TEUs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayedRows.map((r, i) => {
                          const d = (r as any)?.date?.value || (r as any)?.shipment_date?.value || (r as any)?.shipped_on || null;
                          const mode = (r as any)?.mode || (r as any)?.transport_mode || '—';
                          const origin = (r as any)?.origin_city || (r as any)?.origin_country || (r as any)?.origin_port || '—';
                          const dest = (r as any)?.dest_city || (r as any)?.dest_country || (r as any)?.dest_port || '—';
                          const carrier = (r as any)?.carrier || '—';
                          const containers = (r as any)?.container_count ?? '—';
                          const teu = (r as any)?.teu ?? '—';
                          return (
                            <tr key={i} className="bg-white">
                              <td className="px-3 py-2 whitespace-nowrap">{d ? new Date(String(d)).toLocaleDateString() : '—'}</td>
                              <td className="px-3 py-2 capitalize">{String(mode).toLowerCase()}</td>
                              <td className="px-3 py-2">{origin}</td>
                              <td className="px-3 py-2">{dest}</td>
                              <td className="px-3 py-2">{carrier}</td>
                              <td className="px-3 py-2 text-right">{typeof containers === 'number' ? containers.toLocaleString() : containers}</td>
                              <td className="px-3 py-2 text-right">{typeof teu === 'number' ? teu.toLocaleString() : teu}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div />
                  <div className="space-x-2">
                    <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage((p)=> Math.max(1, p-1))} disabled={page===1}>Prev</button>
                    <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage((p)=> p+1)} disabled={page*50 >= total}>Next</button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contacts" className="p-6">
                <div className="text-sm text-gray-600">Contacts are gated.</div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {showGate && (
          <div className="fixed inset-0 bg-gray-900/75 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={()=> setShowGate(false)}>
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={(e)=> e.stopPropagation()}>
              <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#EEE6FF' }}>
                <Lock className="w-8 h-8" style={{ color: '#7F3DFF' }} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Command Center Access</h3>
              <p className="text-gray-600 mb-4 text-sm">Saving companies and unlocking features like detailed contacts and AI enrichment requires a paid subscription.</p>
              <div className="flex gap-2 justify-end">
                <button className="px-3 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100" onClick={()=> setShowGate(false)}>Not now</button>
                <button className="px-3 py-2 text-sm rounded-lg text-white" style={{ backgroundColor: '#7F3DFF' }} onClick={()=> setShowGate(false)}>Upgrade Now</button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
