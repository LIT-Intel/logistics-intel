import React, { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import CompanyShipmentsPanel from '@/components/company/CompanyShipmentsPanel';

function formatNumber(value) {
  const num = typeof value === 'number' ? value : value == null ? null : Number(value);
  if (num == null || Number.isNaN(num)) return '?';
  return new Intl.NumberFormat().format(num);
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const source = (typeof value === 'object' && value !== null && 'value' in value) ? value.value : value;
  const text = String(source).trim();
  if (!text || text === '-' || text.toLowerCase() === 'none' || text.toLowerCase() === 'unknown') {
    return 'Unknown';
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString();
}

export default function CompanyDrawer({ company, open, onOpenChange }) {
  if (!open || !company) {
    return null;
  }

  const companyId = company?.company_id ? String(company.company_id) : '';

  const lastActivity = useMemo(() => {
    const raw = company?.last_activity;
    if (!raw) return '?';
    if (typeof raw === 'object' && raw !== null && 'value' in raw) return formatDate(raw.value);
    return formatDate(raw);
  }, [company]);

  const lanes = Array.isArray(company?.top_routes) ? company.top_routes.slice(0, 3) : [];
  const lanesContent = lanes.length ? lanes.map((lane, idx) => {
    const origin = cleanLabel(lane.origin_country || lane.origin || lane.origin_label);
    const dest = cleanLabel(lane.dest_country || lane.dest || lane.dest_label);
    const count = lane.cnt || lane.shipments || lane.count || 0;
    return (
      <span key={`${origin}-${dest}-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
        {origin} ? {dest} <span className="text-indigo-500">({formatNumber(count)})</span>
      </span>
    );
  }) : <span className="text-sm text-slate-500">No lane data yet.</span>;

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
            <Stat label="Growth" value="?" />
            <Stat label="Company ID" value={companyId || '?'} />
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
              <CompanyShipmentsPanel companyId={companyId} limit={50} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function cleanLabel(value) {
  if (value == null) return 'Unknown';
  const text = String(value).trim();
  if (!text) return 'Unknown';
  const lowered = text.toLowerCase();
  return lowered === 'none' || lowered === 'unknown' || text === '-' ? 'Unknown' : text;
}
