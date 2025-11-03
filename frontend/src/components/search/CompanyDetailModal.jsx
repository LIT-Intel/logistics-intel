import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CompanyShipmentsPanel from '@/components/company/CompanyShipmentsPanel';

function formatNumber(value) {
  const num = typeof value === 'number' ? value : value == null ? null : Number(value);
  if (num == null || Number.isNaN(num)) return '?';
  return num.toLocaleString();
}

function formatDate(value) {
  if (!value) return '?';
  const raw = typeof value === 'object' && value !== null && 'value' in value ? value.value : value;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CompanyDetailModal({ company, isOpen, onClose }) {
  if (!company) return null;
  const companyId = company.company_id || company.id || '';
  const topRoutes = Array.isArray(company.top_routes) ? company.top_routes.slice(0, 5) : [];

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-slate-900">{company.company_name || 'Company Detail'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-4 md:col-span-1">
            <Stat label="Company ID" value={companyId || '?'} />
            <Stat label="Shipments (12m)" value={formatNumber(company.shipments_12m)} />
            <Stat label="Last Activity" value={formatDate(company.last_activity)} />

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Top Routes</h3>
              <div className="space-y-1 text-sm text-slate-600">
                {topRoutes.length ? topRoutes.map((route, idx) => (
                  <div key={`${route.origin_country || route.route || idx}-${idx}`}>
                    {(route.origin_country || '?')} ? {(route.dest_country || '?')}
                  </div>
                )) : <div>No route data.</div>}
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Recent Shipments</h3>
            <CompanyShipmentsPanel companyId={companyId} limit={50} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
