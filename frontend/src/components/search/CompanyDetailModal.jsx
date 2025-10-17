import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Ship, Clock, Box, TrendingUp, X, Globe } from 'lucide-react';
import { postSearchCompanies, getCompanyShipments } from '@/lib/api';

const BRAND = '#7F3DFF';

export default function CompanyDetailModal({ company, isOpen, onClose, onSave, user, isSaved = false }) {
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const companyId = company?.company_id || company?.id || null;
  const name = company?.company_name || company?.name || 'Company';

  useEffect(() => {
    let abort = false;
    async function load() {
      if (!isOpen || !companyId) return;
      setLoading(true);
      setError('');
      try {
        // Overview (hq, website, kpis)
        const ov = await postSearchCompanies({ company_id: String(companyId), limit: 1, offset: 0 });
        const ovRaw = Array.isArray(ov?.items) && ov.items.length ? ov.items[0] : (Array.isArray(ov?.rows) && ov.rows.length ? ov.rows[0] : null);
        if (!abort) setOverview(ovRaw || null);
        // Shipments
        const res = await getCompanyShipments({ company_id: String(companyId), limit: 500, offset: 0 });
        if (!abort) setRows(Array.isArray(res?.rows) ? res.rows : []);
      } catch (e) {
        if (!abort) {
          setRows([]);
          setError('Failed to load company data.');
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => { abort = true; };
  }, [isOpen, companyId]);

  const shipments12m = useMemo(() => Number(overview?.shipments_12m ?? overview?.shipments ?? company?.shipments_12m ?? 0), [overview, company]);
  const lastActivity = useMemo(() => {
    const v = (overview?.last_activity && overview?.last_activity?.value) || overview?.lastShipmentDate || null;
    return v;
  }, [overview]);
  const totalTeus = useMemo(() => overview?.total_teus ?? null, [overview]);
  const growthRate = useMemo(() => overview?.growth_rate ?? null, [overview]);
  const website = useMemo(() => overview?.website || overview?.domain || null, [overview]);
  const hqCity = useMemo(() => overview?.hq_city || null, [overview]);
  const hqState = useMemo(() => overview?.hq_state || null, [overview]);

  const monthlySeries = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), count: 0 });
    }
    const buckets = new Map(months.map((m) => [m.key, m]));
    for (const r of Array.isArray(rows) ? rows : []) {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) continue;
      const dt = new Date(String(raw));
      if (isNaN(dt.getTime())) continue;
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (buckets.has(k)) buckets.get(k).count += 1;
    }
    return months.map((m, i, arr) => ({ ...m, fill: i === arr.length - 1 ? BRAND : '#A97EFF' }));
  }, [rows]);

  function KpiTile({ icon: Icon, label, value }) {
    return (
      <div className="p-4 text-center rounded-xl border border-gray-200 bg-white min-h-[128px] flex flex-col items-center justify-center overflow-hidden">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500 truncate w-full max-w-full">
          <Icon className="w-3.5 h-3.5" style={{ color: BRAND }} />
          <span>{label}</span>
        </div>
        <div className="mt-1 text-3xl font-bold text-gray-900 truncate w-full max-w-full">{value}</div>
      </div>
    );
  }

  if (!isOpen || !company) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0 md:rounded-2xl rounded-none md:inset-auto inset-0">
        <DialogHeader className="p-6 border-b">
          <div className="flex justify-between items-start gap-4">
            <div>
              <DialogTitle className="text-2xl font-bold" style={{ color: BRAND }}>{name}</DialogTitle>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <div className="flex items-center gap-1.5"><span className="w-4 h-4 inline-block rounded-full bg-gray-200" /><span>ID: {String(companyId)}</span></div>
                {(hqCity || hqState) && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 inline-block rounded-full bg-gray-200" />
                    <span>HQ: {[hqCity, hqState].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {website && (
                  <div className="flex items-center gap-1.5"><Globe className="w-4 h-4" /><a className="text-blue-600 hover:underline" href={`https://${String(website).replace(/^https?:\/\//,'')}`} target="_blank" rel="noopener noreferrer">{String(website)}</a></div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {onSave && (
                <Button size="sm" onClick={() => onSave(company)} className="flex items-center gap-2 text-white" style={{ backgroundColor: BRAND }}>
                  Save to Command Center
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-full text-gray-500 hover:text-gray-900">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-grow overflow-hidden">
          <Tabs defaultValue="profile" className="h-full flex flex-col">
            <div className="px-6 border-b">
              <TabsList>
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="shipments">Shipments ({rows.length})</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-grow overflow-auto">
              <TabsContent value="profile" className="p-6">
                {/* KPI grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <KpiTile icon={Ship} label="Shipments (12m)" value={Number(shipments12m || 0).toLocaleString()} />
                  <KpiTile icon={Clock} label="Last Activity" value={lastActivity ? new Date(lastActivity).toLocaleDateString() : '—'} />
                  <KpiTile icon={Box} label="Total TEUs" value={totalTeus != null ? Number(totalTeus).toLocaleString() : '—'} />
                  <KpiTile icon={TrendingUp} label="Growth Rate" value={growthRate != null ? `${Math.round(Number(growthRate) * 100)}%` : '—'} />
                </div>

                {/* 12-month shipments bar chart */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="h-[150px] w-full flex items-end gap-1">
                    {monthlySeries.map((m, idx) => {
                      const counts = monthlySeries.map(x => x.count);
                      const max = Math.max(1, ...counts);
                      const h = Math.max(4, Math.round((m.count / max) * 140));
                      return <div key={m.key} className="flex-1 rounded-t" style={{ height: `${h}px`, backgroundColor: m.fill }} title={`${m.label}: ${m.count}`} />
                    })}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="shipments" className="p-6">
                <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
                  {loading ? (
                    <div className="p-6 text-sm text-gray-500">Loading shipments…</div>
                  ) : rows.length === 0 ? (
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
                        {rows.map((r, i) => {
                          const d = r.shipped_on || r.date || r.snapshot_date || r.shipment_date || null;
                          const mode = r.mode || r.transport_mode || '—';
                          const origin = r.origin || r.origin_city || r.origin_country || r.origin_port || '—';
                          const dest = r.destination || r.dest_city || r.dest_country || r.dest_port || '—';
                          const carrier = r.carrier_name || r.carrier || '—';
                          const containers = r.container_count ?? '—';
                          const teu = r.teu ?? '—';
                          return (
                            <tr key={i} className="bg-white">
                              <td className="px-3 py-2 whitespace-nowrap">{d ? new Date(d).toLocaleDateString() : '—'}</td>
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
              </TabsContent>
              <TabsContent value="contacts" className="p-6">
                <div className="rounded-2xl border p-6 bg-white">
                  <div className="text-sm text-gray-700">Save this company to Command Center and upgrade to Pro to unlock verified contacts.</div>
                  {onSave && (
                    <div className="mt-3"><Button size="sm" className="text-white" style={{ backgroundColor: BRAND }} onClick={() => onSave(company)}>Save & Enrich</Button></div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
