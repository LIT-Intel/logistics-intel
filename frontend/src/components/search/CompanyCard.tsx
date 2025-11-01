import React from 'react';
import type { SearchRow } from '@/lib/types';

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default function CompanyCard({
  row,
  onOpen,
  onSave,
}: {
  row: SearchRow;
  onOpen: (row: SearchRow) => void;
  onSave: (row: SearchRow) => void | Promise<void>;
}) {
  const top = row.top_routes?.[0];
  const topDest = top?.dest_country ?? '—';
  const topLane = top ? `${top.origin_country ?? '?'} → ${top.dest_country ?? '?'}` : '—';

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] text-slate-500">Company</div>
          <div className="truncate text-xl font-semibold tracking-tight text-slate-900">
            {row.company_name}
          </div>
          <div className="mt-1 text-xs text-slate-400 truncate" title={row.company_id || '—'}>
            ID: {row.company_id || '—'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onSave(row)}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 shadow-sm"
            title="Save to Command Center"
          >
            Save to Command Center
          </button>
          <button
            onClick={() => onOpen(row)}
            className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-900 border border-slate-200 hover:bg-slate-50"
            title="View details"
          >
            View Details
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Kpi label="Shipments (12m)" value={row.shipments_12m ?? 0} />
        <Kpi label="Last activity" value={row.last_activity?.value ?? '—'} />
        <Kpi label="Top destination" value={topDest} hint={topLane} />
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Contacts & Campaigns gated (Enrich). Save first to manage alerts & watchlist in Command Center.
      </div>
    </div>
  );
}
