import React from 'react';
import type { SearchRow } from '@/lib/types';

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 shadow-sm">
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
  saving = false,
  saved = false,
}: {
  row: SearchRow;
  onOpen: (row: SearchRow) => void;
  onSave: (row: SearchRow) => void | Promise<void>;
  saving?: boolean;
  saved?: boolean;
}) {
  const shipmentsDisplay =
    row.shipments_12m != null && Number.isFinite(Number(row.shipments_12m))
      ? Number(row.shipments_12m).toLocaleString()
      : '—';

  const lastActivityRaw =
    typeof row.last_activity === 'object' && row.last_activity !== null && 'value' in row.last_activity
      ? (row.last_activity as any).value
      : row.last_activity;

  let lastActivityDisplay = '—';
  if (lastActivityRaw) {
    const parsed = new Date(String(lastActivityRaw));
    if (!Number.isNaN(parsed.getTime())) {
      lastActivityDisplay = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }).format(parsed);
    } else {
      lastActivityDisplay = String(lastActivityRaw);
    }
  }

  const topCarrierEntry = Array.isArray(row.top_carriers) ? row.top_carriers[0] : null;
  const topCarrierDisplay = (() => {
    if (!topCarrierEntry) return '—';
    if (typeof topCarrierEntry === 'string') return topCarrierEntry || '—';
    if (typeof topCarrierEntry === 'object' && topCarrierEntry !== null) {
      const value =
        (topCarrierEntry as any).carrier ??
        (topCarrierEntry as any).name ??
        (topCarrierEntry as any).value ??
        (topCarrierEntry as any).label ??
        (topCarrierEntry as any).carrier_name ??
        null;
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '—';
  })();

  const topRoute = row.top_routes?.[0];
  const topRouteDisplay = topRoute
    ? `${topRoute.origin_country ?? '—'} → ${topRoute.dest_country ?? '—'}`
    : '—';

  return (
    <div className="group rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
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
            disabled={saving || saved}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            title="Save to Command Center"
          >
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save to Command Center'}
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
        <Kpi label="Shipments (12m)" value={shipmentsDisplay} />
        <Kpi label="Last activity" value={lastActivityDisplay} />
        <Kpi label="Top carrier" value={topCarrierDisplay} />
      </div>

      <div className="mt-4 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Top route:</span> {topRouteDisplay}
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Contacts & Campaigns gated (Enrich). Save first to manage alerts & watchlist in Command Center.
      </div>
    </div>
  );
}
