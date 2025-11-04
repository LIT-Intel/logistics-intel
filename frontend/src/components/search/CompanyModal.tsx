import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { getCompanyShipmentsUnified, fetchCompanyShipments } from '@/lib/api';
import { getApiBase } from '@/lib/env';
import { X, Ship, Box, TrendingUp, MapPin, Globe, Database, Link as LinkIcon, Lock, BarChart as BarChartIcon, Clock, Loader2 } from 'lucide-react';

type Company = { company_id?: string | null; company_name?: string; domain?: string | null; website?: string | null };

type ModalProps = { company: Company | null; open: boolean; onClose: (open: boolean) => void };

const API_BASE = getApiBase();

const getShortId = (company?: { company_id?: string | null; company_code?: string | null }) => {
  if (!company) return null;
  if (company.company_code) return company.company_code;
  if (company.company_id) return `#${String(company.company_id).slice(0, 8)}`;
  return null;
};
const formatNumberDisplay = (value: any) => {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString();
};
const formatDateDisplay = (value: any) => {
  if (!value) return '—';
  const raw = typeof value === 'object' && value !== null && 'value' in value ? (value as any).value : value;
  if (!raw) return '—';
  const dt = new Date(String(raw));
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function CompanyModal({ company, open, onClose }: ModalProps) {
  const [chartRows, setChartRows] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);
  const [loadingTable, setLoadingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview'|'summary'|'shipments'|'contacts'>('overview');
  const [mode, setMode] = useState<'air'|'ocean'|''>('');
  const [origin, setOrigin] = useState<string>('');
  const [dest, setDest] = useState<string>('');
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [showGate, setShowGate] = useState(false);
  const [chartState, setChartState] = useState<'idle'|'loading'|'ready'|'empty'>('idle');

  const cid = company?.company_id || undefined;
  const cname = company?.company_name || undefined;

  useEffect(() => {
    if (!open) {
      setChartRows([]);
      setChartState('idle');
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !company || activeTab !== 'summary') return;
    const companyId = company.company_id;
    if (!companyId) {
      setChartRows([]);
      setChartState('empty');
      return;
    }
    setChartState('loading');
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/public/companyChart?company_id=${encodeURIComponent(String(companyId))}`);
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json().catch(() => null);
        const rows = Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data)
            ? data
            : [];
        if (cancelled) return;
        setChartRows(Array.isArray(rows) ? rows : []);
        setChartState(rows && rows.length ? 'ready' : 'empty');
      } catch {
        if (cancelled) return;
        setChartRows([]);
        setChartState('empty');
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeTab, company]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !company || activeTab !== 'shipments') return;
      setLoadingTable(true); setError(null);
      try {
        const data = await fetchCompanyShipments({ company: cname || '', mode: mode || undefined, origin: origin || undefined, dest: dest || undefined, startDate: dateStart || undefined, endDate: dateEnd || undefined, limit: 50, offset: (page - 1) * 50 });
        const rows = (data?.items || data?.rows || []) as any[];
        const total = Number(data?.total || rows.length || 0);
        if (!cancelled) { setTableRows(Array.isArray(rows) ? rows : []); setTotal(total); }
      } catch (e: any) {
        if (!cancelled) { setTableRows([]); setTotal(0); setError('Failed to load shipments'); }
      } finally {
        if (!cancelled) setLoadingTable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeTab, page, cid, cname, company, mode, origin, dest, dateStart, dateEnd]);

  const website = (company?.website || company?.domain || '')?.toString();

  const monthlyVolumes = useMemo(() => {
    const now = new Date();
    const months: { key: string; month: string; volume: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, month: d.toLocaleString(undefined, { month: 'short' }), volume: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const r of chartRows) {
      const raw = (r as any)?.month ?? (r as any)?.period ?? (r as any)?.date ?? (r as any)?.date_key ?? (r as any)?.date?.value ?? (r as any)?.shipment_date?.value ?? (r as any)?.shipped_on ?? null;
      if (!raw) continue;
      let dt: Date | null = null;
      if (typeof raw === 'string' && /^\d{4}-\d{2}$/.test(raw)) {
        dt = new Date(`${raw}-01`);
      } else {
        dt = new Date(String(raw));
      }
      if (!dt || Number.isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const volRaw = (r as any)?.shipments ?? (r as any)?.volume ?? (r as any)?.teu ?? (r as any)?.total ?? (r as any)?.count ?? (r as any)?.value ?? 0;
      const vol = Number(volRaw);
      if (!Number.isFinite(vol)) continue;
      if (byKey.has(key)) byKey.get(key)!.volume += vol;
    }
    return months;
  }, [chartRows]);

  const hasChartData = monthlyVolumes.some((m) => m.volume > 0);

  const shortId = getShortId(company);
  const shipmentsKpi = (company as any)?.kpis?.shipments_12m ?? (company as any)?.shipments_12m ?? null;
  const lastActivityRaw = (company as any)?.kpis?.last_activity ?? (company as any)?.last_activity ?? null;
  const shipmentsDisplay = formatNumberDisplay(shipmentsKpi);
  const lastActivityDisplay = formatDateDisplay(lastActivityRaw);

  const topRoute = useMemo(() => {
    const source = (company as any)?.kpis?.top_routes ?? (company as any)?.top_routes;
    const routes = Array.isArray(source) ? source : [];
    if (!routes.length) return '—';
    const route = routes[0] || {};
    const origin = route.origin_country || route.origin || route.origin_city || '—';
    const dest = route.dest_country || route.dest || route.dest_city || '—';
    return `${origin} → ${dest}`;
  }, [company]);

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
                  <div>ID: {shortId ?? (company?.company_id || '—')}</div>
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
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 text-indigo-700 px-3 py-1">
                      <Ship className="w-4 h-4" />
                      <span className="font-medium text-gray-900">Shipments</span>
                      <span className="font-semibold text-gray-900">{shipmentsDisplay}</span>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 text-slate-700 px-3 py-1">
                      <Clock className="w-4 h-4" />
                      <span className="font-medium text-gray-900">Last Activity</span>
                      <span className="font-semibold text-gray-900">{lastActivityDisplay}</span>
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Company Profile</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm"><Database className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Company ID</div><div className="font-semibold text-gray-800">{shortId ? `#${shortId}` : (company?.company_id || '—')}</div></div></div>
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm"><LinkIcon className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Website</div><div className="font-semibold text-gray-800 truncate max-w-[280px]">{website ? website.replace(/^https?:\/\//,'') : '—'}</div></div></div>
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm"><Ship className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Shipments (12m)</div><div className="font-semibold text-gray-800">{shipmentsDisplay}</div></div></div>
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm"><Clock className="w-5 h-5 text-gray-500" /><div><div className="text-xs font-semibold uppercase text-gray-500">Last Activity</div><div className="font-semibold text-gray-800">{lastActivityDisplay}</div></div></div>
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
                    <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><Ship className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{shipmentsDisplay}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Shipments (12m)</div></div>
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><Box className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{(company as any)?.total_teus != null ? Number((company as any).total_teus).toLocaleString() : '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Total TEUs (12m)</div></div>
                    <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><Clock className="w-6 h-6 mx-auto mb-2 text-gray-500" /><div className="text-lg font-bold">{lastActivityDisplay}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Last Activity</div></div>
                    <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><TrendingUp className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{(company as any)?.growth_rate != null ? `${Math.round(Number((company as any).growth_rate) * 100)}%` : '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Growth Rate (YoY)</div></div>
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><MapPin className="w-6 h-6 mx-auto mb-2 text-red-500"/><div className="text-lg font-bold">{topRoute}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Primary Route</div></div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><BarChartIcon className="w-5 h-5 mr-2" style={{ color: '#7F3DFF' }}/> 12-Month Shipment Volume (TEU Equivalent)</h3>
                    {chartState === 'loading' ? (
                      <div className="py-12 text-center text-sm text-gray-500"><Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" /> Loading chart…</div>
                    ) : chartState === 'ready' && hasChartData ? (
                      <>
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
                      </>
                    ) : (
                      <div className="py-12 text-center text-sm text-gray-500">No chart data yet.</div>
                    )}
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
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Mode</div>
                    <select className="border rounded px-3 py-2 text-sm" value={mode} onChange={(e)=> { setPage(1); setMode(e.target.value as any); }}>
                      <option value="">Any</option>
                      <option value="ocean">Ocean</option>
                      <option value="air">Air</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Origin</div>
                    <input className="border rounded px-3 py-2 text-sm" value={origin} onChange={(e)=> { setPage(1); setOrigin(e.target.value); }} placeholder="CN" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Destination</div>
                    <input className="border rounded px-3 py-2 text-sm" value={dest} onChange={(e)=> { setPage(1); setDest(e.target.value); }} placeholder="US" />
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
