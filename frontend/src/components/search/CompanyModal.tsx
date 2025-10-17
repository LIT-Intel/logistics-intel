import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Globe, Ship, TrendingUp, Box, Clock, Lock } from 'lucide-react';
import { getCompanyShipmentsUnified } from '@/lib/api';

type Company = {
  company_id?: string | null;
  company_name?: string;
  shipments_12m?: number | null;
  last_activity?: { value?: string } | string | null;
  total_teus?: number | null;
  growth_rate?: number | null;
  hq_city?: string | null;
  hq_state?: string | null;
  website?: string | null;
  domain?: string | null;
};
type ModalProps = { company: Company | null; open: boolean; onClose: (open: boolean) => void };

export default function CompanyModal({ company, open, onClose }: ModalProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'shipments' | 'contacts'>('profile');

  const cid = company?.company_id || undefined;
  const cname = company?.company_name || undefined;
  const website = (company?.website || company?.domain || '') as string;
  const hqText = [company?.hq_city, company?.hq_state].filter(Boolean).join(', ');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !company) return;
      setLoading(true); setError(null);
      try {
        const { rows } = await getCompanyShipmentsUnified({ company_id: cid, company_name: cid ? undefined : cname, limit: 500, offset: 0 });
        if (!cancelled) setRows(Array.isArray(rows) ? rows : []);
      } catch (e: any) {
        if (!cancelled) { setRows([]); setError('Failed to load shipments'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, cid, cname, company]);

  const monthlySeries = useMemo(() => {
    const months: Array<{ key: string; label: string; count: number; fill?: string }> = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), count: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const r of Array.isArray(rows) ? rows : []) {
      const raw = (r as any)?.date?.value || (r as any)?.shipment_date?.value || (r as any)?.shipped_on;
      if (!raw) continue;
      const dt = new Date(String(raw));
      if (isNaN(dt.getTime())) continue;
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (byKey.has(k)) byKey.get(k)!.count += 1;
    }
    return months.map((m, idx) => ({ ...m, fill: idx === months.length - 1 ? '#7F3DFF' : '#A97EFF' }));
  }, [rows]);

  function KpiTile({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
    return (
      <div className="p-4 text-center rounded-xl border border-gray-200 bg-white min-h-[128px] flex flex-col items-center justify-center overflow-hidden">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500 truncate w-full max-w-full">
          <Icon className="w-3.5 h-3.5" style={{ color: '#7F3DFF' }} />
          <span>{label}</span>
        </div>
        <div className="mt-1 text-3xl font-bold text-gray-900 truncate w-full max-w-full">{value}</div>
      </div>
    );
  }

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
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600">
                <div>ID: {company?.company_id || '—'}</div>
                {hqText && <div>HQ: {hqText}</div>}
                {website && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4" />
                    <a className="text-blue-600 hover:underline truncate" href={`https://${String(website).replace(/^https?:\/\//,'')}`} target="_blank" rel="noreferrer">{String(website)}</a>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="text-white" style={{ backgroundColor: '#7F3DFF' }}>Save to Command Center</Button>
              <Button variant="ghost" size="icon" onClick={() => onClose(false)} aria-label="Close" className="rounded-full text-gray-500 hover:text-gray-900">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="h-full flex flex-col">
            <div className="px-6 border-b">
              <TabsList className="gap-2">
                <TabsTrigger value="profile" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Profile</TabsTrigger>
                <TabsTrigger value="shipments" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Shipments ({rows.length})</TabsTrigger>
                <TabsTrigger value="contacts" disabled className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none"><Lock className="w-3 h-3 mr-1.5" />Contacts</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-auto">
              <TabsContent value="profile" className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <KpiTile icon={Ship} label="Shipments (12m)" value={(company?.shipments_12m ?? 0).toLocaleString()} />
                  <KpiTile icon={Clock} label="Last Activity" value={(() => { const v = company?.last_activity as any; const d = typeof v === 'string' ? v : v?.value; return d ? new Date(d).toLocaleDateString() : '—'; })()} />
                  <KpiTile icon={Box} label="Total TEUs" value={company?.total_teus != null ? Number(company.total_teus).toLocaleString() : '—'} />
                  <KpiTile icon={TrendingUp} label="Growth Rate" value={company?.growth_rate != null ? `${Math.round(Number(company.growth_rate) * 100)}%` : '—'} />
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="h-[150px]">
                    <div className="flex items-end gap-1 h-full">
                      {(() => {
                        const max = Math.max(1, ...monthlySeries.map((m) => m.count));
                        return monthlySeries.map((m) => (
                          <div key={m.key} className="flex-1 rounded-t" style={{ height: `${Math.max(4, Math.round((m.count / max) * 150))}px`, backgroundColor: m.fill }} title={`${m.label}: ${m.count}`} />
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="shipments" className="p-6">
                {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
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
              </TabsContent>
              <TabsContent value="contacts" className="p-6">
                <div className="rounded-2xl border p-6 bg-white text-sm text-gray-700">Save this company to Command Center and upgrade to Pro to unlock verified contacts.</div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
