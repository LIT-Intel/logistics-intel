import React from 'react';

type CompanySummary = {
  company_id?: string | null;
  company_name: string;
  shipments_12m?: number | null;
  last_activity?: string | null;
  top_routes?: Array<{ origin_country?: string; dest_country?: string }>;
  top_carriers?: Array<{ carrier?: string } >;
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
}

export default function CompanyModal({
  company,
  onClose,
}: {
  company: CompanySummary | null;
  shipmentsUrl?: string;
  onClose: () => void;
}) {
  if (!company) return null;

  const primaryRoute = company.top_routes?.[0];
  const primaryCarrier = company.top_carriers?.[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 px-4 py-8">
      <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{company.company_name}</h2>
            <p className="text-xs text-slate-500">ID: {company.company_id || '—'}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-slate-700">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-500">Shipments (12m)</div>
              <div className="text-base font-semibold text-slate-900">{formatNumber(company.shipments_12m)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-500">Last Activity</div>
              <div className="text-base font-semibold text-slate-900">{formatDate(company.last_activity ?? null)}</div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-xs uppercase text-slate-500">Top Route</div>
            <div className="mt-1 font-semibold text-slate-900">
              {primaryRoute ? `${primaryRoute.origin_country ?? '—'} → ${primaryRoute.dest_country ?? '—'}` : '—'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-xs uppercase text-slate-500">Top Carrier</div>
            <div className="mt-1 font-semibold text-slate-900">{primaryCarrier?.carrier || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
