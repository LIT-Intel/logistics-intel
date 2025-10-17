import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Globe, Ship, TrendingUp, Box, Clock, Lock, MapPin, Database, Link as LinkIcon, BarChart as BarChartIcon } from 'lucide-react';
import { getCompanyShipments } from '@/lib/api';
import { hasFeature } from '@/lib/access';

export default function CompanyDetailModal({ company, isOpen, onClose, onSave, user, isSaved = false }) {
  const [allRows, setAllRows] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [showGate, setShowGate] = useState(false);

  const companyId = company?.company_id || company?.id || null;
  const name = company?.company_name || company?.name || 'Company';
  const website = company?.website || company?.domain || null;
  const hqText = [company?.hq_city, company?.hq_state].filter(Boolean).join(', ');
  const isWhitelisted = String(user?.email || '').toLowerCase() === 'vraymond@logisticintel.com' || String(user?.email || '').toLowerCase() === 'support@logisticintel.com';
  const canViewContacts = isWhitelisted || hasFeature('contacts');

  useEffect(() => {
    let abort = false;
    async function load() {
      if (!isOpen || !companyId) return;
      setLoading(true);
      setError('');
      try {
        // Load large set to power chart and top route
        const big = await getCompanyShipments({ company_id: String(companyId), limit: 1000, offset: 0 });
        const bigRows = Array.isArray(big?.rows) ? big.rows : [];
        if (!abort) setAllRows(bigRows);
        // Load first page for table
        const first = await getCompanyShipments({ company_id: String(companyId), limit: 50, offset: 0 });
        if (!abort) setTableRows(Array.isArray(first?.rows) ? first.rows : []);
      } catch (e) {
        if (!abort) {
          setAllRows([]);
          setTableRows([]);
          setError('Failed to load shipments.');
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => { abort = true; };
  }, [isOpen, companyId]);

  // Top route from allRows
  const topRoute = useMemo(() => {
    const counts = new Map();
    for (const r of allRows) {
      const o = r.origin_country || r.origin_city || r.origin_port || '—';
      const d = r.dest_country || r.dest_city || r.dest_port || '—';
      const key = `${o} → ${d}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = '—', max = 0;
    for (const [k, v] of counts) { if (v > max) { max = v; best = k; } }
    return best;
  }, [allRows]);

  // Monthly volumes (TEU if present else count)
  const monthlyVolumes = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, month: d.toLocaleString(undefined, { month: 'short' }), volume: 0 });
    }
    const byKey = new Map(months.map(m => [m.key, m]));
    for (const r of allRows) {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) continue;
      const dt = new Date(String(raw)); if (isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const vol = typeof r.teu === 'number' ? Number(r.teu) : 1;
      if (byKey.has(key)) byKey.get(key).volume += vol;
    }
    return months;
  }, [allRows]);

  // Filter and paginate table rows client-side by date
  const filteredRows = useMemo(() => {
    if (!dateStart && !dateEnd) return tableRows;
    const s = dateStart ? new Date(dateStart) : null;
    const e = dateEnd ? new Date(dateEnd) : null;
    return tableRows.filter((r) => {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) return false;
      const d = new Date(String(raw));
      if (s && d < s) return false;
      if (e && d > e) return false;
      return true;
    });
  }, [tableRows, dateStart, dateEnd]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * 50;
    return filteredRows.slice(start, start + 50);
  }, [filteredRows, page]);

  function KpiInfo({ icon: Icon, label, value, link = false }) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 bg-white shadow-sm">
        <Icon className="w-5 h-5 text-gray-500" />
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
          {link ? (
            <a href={value ? String(value) : '#'} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-800 truncate max-w-[280px] hover:underline">
              {value ? String(value).replace(/^https?:\/\//,'') : '—'}
            </a>
          ) : (
            <div className="font-semibold text-gray-800 truncate max-w-full">{value || '—'}</div>
          )}
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!onSave || saving || isSaved) return;
    setSaving(true);
    try { await onSave(company); } finally { setSaving(false); }
  }

  if (!isOpen || !company) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0 rounded-xl bg-white">
        <DialogHeader className="p-6 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold truncate" style={{ color: '#7F3DFF' }} title={name}>{name}</DialogTitle>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600">
                <div>ID: {String(companyId)}</div>
                {hqText && <div>HQ: {hqText}</div>}
                {website && (
                  <div className="flex items-center gap-1.5"><Globe className="w-4 h-4" />
                    <a href={`https://${String(website).replace(/^https?:\/\//,'')}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                      {String(website)}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving || isSaved} className="text-white" style={{ backgroundColor: '#7F3DFF' }}>{isSaved ? 'Saved' : (saving ? 'Saving…' : 'Save to Command Center')}</Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-full text-gray-500 hover:text-gray-900">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 border-b">
              <TabsList className="gap-2">
                <TabsTrigger value="overview" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Overview</TabsTrigger>
                <TabsTrigger value="summary" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Shipment Summary</TabsTrigger>
                <TabsTrigger value="shipments" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Shipments</TabsTrigger>
                <TabsTrigger value="contacts" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none" onClick={() => { if (!isSaved || !canViewContacts) setShowGate(true); }}>Contacts</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-auto">
              {/* Overview */}
              <TabsContent value="overview" className="p-6 space-y-6">
                <h3 className="text-xl font-bold text-gray-900">Company Profile</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <KpiInfo icon={Database} label="Company ID" value={companyId} />
                  <KpiInfo icon={LinkIcon} label="Website" value={website} link />
                  <KpiInfo icon={Ship} label="Total Shipments (12m)" value={(company?.shipments_12m ?? '—')} />
                  <KpiInfo icon={Box} label="Total TEUs (12m)" value={company?.total_teus != null ? Number(company.total_teus).toLocaleString() : '—'} />
                  <KpiInfo icon={MapPin} label="Top Trade Route" value={topRoute} />
                </div>
                <div className="border rounded-xl p-4 bg-[#EEE6FF]">
                  <h4 className="text-lg font-bold text-gray-800 mb-1 flex items-center"><BarChartIcon className="w-5 h-5 mr-2" style={{ color: '#7F3DFF' }}/> Sales Intelligence Available</h4>
                  <p className="text-sm text-gray-700">Access real-time contacts and AI-enriched insights about this company's supply chain strategy by saving them to your Command Center.</p>
                </div>
              </TabsContent>

              {/* Shipment Summary */}
              <TabsContent value="summary" className="p-6 space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><Ship className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{company?.shipments_12m ?? '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Total Shipments (12m)</div></div>
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><Box className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{company?.total_teus != null ? Number(company.total_teus).toLocaleString() : '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Total TEUs (12m)</div></div>
                  <div className="p-4 border border-gray-200 rounded-xl bg-white text-center"><TrendingUp className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{company?.growth_rate != null ? `${Math.round(Number(company.growth_rate) * 100)}%` : '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Growth Rate (YoY)</div></div>
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

              {/* Shipments */}
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
                  <div className="text-sm text-gray-600 sm:ml-auto">Page {page} · 50 per page {filteredRows.length ? `· ${filteredRows.length} filtered` : ''}</div>
                </div>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
                )}
                <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
                  {loading ? (
                    <div className="p-6 text-sm text-gray-500">Loading shipments…</div>
                  ) : pagedRows.length === 0 ? (
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
                        {pagedRows.map((r, i) => {
                          const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
                          const d = raw ? new Date(String(raw)).toLocaleDateString() : '—';
                          const mode = (r.mode || r.transport_mode || '—');
                          const origin = r.origin || r.origin_city || r.origin_country || r.origin_port || '—';
                          const dest = r.destination || r.dest_city || r.dest_country || r.dest_port || '—';
                          const carrier = r.carrier_name || r.carrier || '—';
                          const containers = r.container_count ?? '—';
                          const teu = r.teu ?? '—';
                          return (
                            <tr key={i} className="bg-white">
                              <td className="px-3 py-2 whitespace-nowrap">{d}</td>
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
                    <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={()=> setPage((p)=> Math.max(1, p-1))} disabled={page===1}>Prev</button>
                    <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={()=> setPage((p)=> p+1)} disabled={page*50 >= filteredRows.length}>Next</button>
                  </div>
                </div>
              </TabsContent>

              {/* Contacts */}
              <TabsContent value="contacts" className="p-6">
                <div className="text-sm text-gray-600">Contacts are gated.</div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Branded gating overlay */}
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
