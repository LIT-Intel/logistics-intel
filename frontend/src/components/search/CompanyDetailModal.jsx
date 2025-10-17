import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Globe, Ship, TrendingUp, Box, Clock, Lock } from 'lucide-react';
import { getCompanyShipments } from '@/lib/api';
import { hasFeature } from '@/lib/access';

export default function CompanyDetailModal({ company, isOpen, onClose, onSave, user, isSaved = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);

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
        const res = await getCompanyShipments({ company_id: String(companyId), limit: 500, offset: 0 });
        if (!abort) setRows(Array.isArray(res?.rows) ? res.rows : []);
      } catch (e) {
        if (!abort) {
          setRows([]);
          setError('Failed to load shipments.');
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => { abort = true; };
  }, [isOpen, companyId]);

  const monthlySeries = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), count: 0 });
    }
    const byKey = new Map(months.map(m => [m.key, m]));
    for (const r of Array.isArray(rows) ? rows : []) {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) continue;
      const dt = new Date(String(raw));
      if (isNaN(dt.getTime())) continue;
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (byKey.has(k)) byKey.get(k).count += 1;
    }
    return months.map((m, idx) => ({ ...m, fill: idx === months.length - 1 ? '#7F3DFF' : '#A97EFF' }));
  }, [rows]);

  function KpiTile({ icon: Icon, label, value }) {
    return (
      <div className="p-4 text-center rounded-xl border border-gray-200 bg-white min-h-[128px] flex flex-col items-center justify-center overflow-hidden">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500 truncate w-full max-w-full">
          <Icon className="w-3.5 h-3.5 text-[#7F3DFF]" />
          <span>{label}</span>
        </div>
        <div className="mt-1 text-3xl font-bold text-gray-900 truncate w-full max-w-full">{value}</div>
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
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0 rounded-xl md:inset-auto inset-0 bg-white">
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
                <TabsTrigger value="profile" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Profile</TabsTrigger>
                <TabsTrigger value="shipments" className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">Shipments ({rows.length})</TabsTrigger>
                <TabsTrigger value="contacts" disabled={!isSaved || !canViewContacts} className="data-[state=active]:text-[#7F3DFF] data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] border-b-2 border-transparent rounded-none">{(!isSaved || !canViewContacts) && <Lock className="w-3 h-3 mr-1.5" />}Contacts</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-auto">
              <TabsContent value="profile" className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <KpiTile icon={Ship} label="Shipments (12m)" value={Number(company?.shipments_12m ?? 0).toLocaleString()} />
                  <KpiTile icon={Clock} label="Last Activity" value={company?.last_seen ? new Date(company.last_seen).toLocaleDateString() : '—'} />
                  <KpiTile icon={Box} label="Total TEUs" value={company?.total_teus != null ? Number(company.total_teus).toLocaleString() : '—'} />
                  <KpiTile icon={TrendingUp} label="Growth Rate" value={company?.growth_rate != null ? `${Math.round(Number(company.growth_rate) * 100)}%` : '—'} />
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="h-[150px]">
                    <div className="flex items-end gap-1 h-full">
                      {(() => {
                        const max = Math.max(1, ...monthlySeries.map(m => m.count));
                        return monthlySeries.map((m) => (
                          <div key={m.key} className="flex-1 rounded-t" style={{ height: `${Math.max(4, Math.round((m.count / max) * 150))}px`, backgroundColor: m.fill }} title={`${m.label}: ${m.count}`} />
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="shipments" className="p-6">
                {error && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
                )}
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
                {isSaved && canViewContacts ? (
                  <div className="text-sm text-gray-600">Contacts will appear here.</div>
                ) : (
                  <div className="rounded-2xl border p-6 bg-white">
                    <div className="text-sm text-gray-700">Save this company to Command Center and upgrade to Pro to unlock verified contacts.</div>
                    <div className="mt-3"><Button size="sm" variant="outline" onClick={handleSave} disabled={saving || isSaved}>{isSaved ? 'Saved' : (saving ? 'Saving…' : 'Save & Enrich')}</Button></div>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
