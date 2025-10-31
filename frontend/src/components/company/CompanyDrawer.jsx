import React, { useEffect, useMemo, useState } from 'react';
import { fetchCompanyLanes, fetchCompanyShipments } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function formatNumber(value: unknown) {
  const num = typeof value === 'number' ? value : value == null ? null : Number(value);
  if (num == null || Number.isNaN(num)) return '—';
  return new Intl.NumberFormat().format(num);
}

function formatDate(value: unknown) {
  if (!value) return 'Unknown';
  const source = (value as any)?.value ?? value;
  const text = String(source).trim();
  if (!text || text === '-' || text.toLowerCase() === 'none' || text.toLowerCase() === 'unknown') {
    return 'Unknown';
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString();
}

export default function CompanyDrawer({ company, open, onOpenChange }: { company: any | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!open || !company) {
    return null;
  }

  const companyId = company?.company_id ? String(company.company_id) : '';
  const [lanes, setLanes] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [loadingLanes, setLoadingLanes] = useState(false);
  const [loadingShipments, setLoadingShipments] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!open || !companyId) {
      setLanes([]);
      return;
    }
    setLoadingLanes(true);
    setLanes([]);
    fetchCompanyLanes({ company_id: companyId, limit: 3 })
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data?.items) ? data.items : []);
        setLanes(rows.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setLanes([]);
      })
      .finally(() => { if (!cancelled) setLoadingLanes(false); });
    return () => { cancelled = true; };
  }, [open, companyId]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !companyId) {
      setShipments([]);
      return;
    }
    setLoadingShipments(true);
    setShipments([]);
    fetchCompanyShipments(companyId, { limit: 50, offset: 0 })
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data?.items) ? data.items : []);
        setShipments(rows);
      })
      .catch(() => {
        if (!cancelled) setShipments([]);
      })
      .finally(() => { if (!cancelled) setLoadingShipments(false); });
    return () => { cancelled = true; };
  }, [open, companyId]);

  const lastActivity = useMemo(() => {
    const raw = company?.last_activity;
    if (!raw) return '—';
    if (typeof raw === 'object' && raw !== null && 'value' in raw) return formatDate(raw.value);
    return formatDate(raw);
  }, [company]);

  const lanesContent = lanes.length ? lanes.map((lane, idx) => {
    const origin = cleanLabel(lane.origin_country || lane.origin || lane.origin_label);
    const dest = cleanLabel(lane.dest_country || lane.dest || lane.dest_label);
    const count = lane.cnt || lane.shipments || lane.count || 0;
    return (
      <span key={`${origin}-${dest}-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
        {origin} → {dest} <span className="text-indigo-500">({formatNumber(count)})</span>
      </span>
    );
  }) : <span className="text-sm text-slate-500">{loadingLanes ? 'Loading lanes…' : 'No lane data yet.'}</span>;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="absolute right-0 top-0 h-full w-full overflow-auto bg-white shadow-2xl md:w-[680px]">
        <div className="border-b px-5 py-4">
          <div className="text-lg font-semibold text-slate-900 truncate">{company?.company_name || companyId || 'Company Detail'}</div>
          <div className="mt-1 text-xs text-slate-500">Last activity {lastActivity}</div>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Shipments (12m)" value={formatNumber(company?.shipments_12m)} />
            <Stat label="Total TEUs (12m)" value={formatNumber(company?.total_teus)} />
            <Stat label="Growth" value="—" />
            <Stat label="Company ID" value={companyId || '—'} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Top Routes</h3>
            <div className="flex flex-wrap gap-2">{lanesContent}</div>
          </div>

          <Tabs defaultValue="shipments" className="w-full">
            <TabsList>
              <TabsTrigger value="shipments">Shipments</TabsTrigger>
            </TabsList>
            <TabsContent value="shipments">
              <div className="overflow-auto rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Origin</th>
                      <th className="px-3 py-2 text-left">Destination</th>
                      <th className="px-3 py-2 text-left">Carrier</th>
                      <th className="px-3 py-2 text-right">TEU</th>
                      <th className="px-3 py-2 text-right">Value (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shipments.map((row, index) => (
                      <tr key={`${row.shipment_id || row.id || index}-${index}`} className="bg-white">
                        <td className="px-3 py-2 text-slate-700">{formatDate(row.shipped_on ?? row.date)}</td>
                        <td className="px-3 py-2 text-slate-600">{cleanLabel(row.origin_country || row.origin || row.origin_city)}</td>
                        <td className="px-3 py-2 text-slate-600">{cleanLabel(row.dest_country || row.destination || row.dest_city)}</td>
                        <td className="px-3 py-2 text-slate-600">{cleanCarrier(row.carrier)}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatNumber(row.teu)}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatNumber(row.value_usd)}</td>
                      </tr>
                    ))}
                    {!shipments.length && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                          {loadingShipments ? 'Loading shipments…' : 'No shipments found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function cleanLabel(value: unknown) {
  if (value == null) return 'Unknown';
  const text = String(value).trim();
  if (!text) return 'Unknown';
  const lowered = text.toLowerCase();
  return lowered === 'none' || lowered === 'unknown' || text === '-' ? 'Unknown' : text;
}

function cleanCarrier(value: unknown) {
  if (value == null) return 'Unknown';
  const text = String(value).trim();
  if (!text || text === '-' || text === '—') return 'Unknown';
  const lowered = text.toLowerCase();
  return lowered === 'none' || lowered === 'unknown' ? 'Unknown' : text;
}

