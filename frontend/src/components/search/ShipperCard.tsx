import React from 'react';
import type { ImportYetiSearchRow } from '@/types/importyeti';

type Props = {
  row: ImportYetiSearchRow;
  onView: (row: ImportYetiSearchRow) => void;
  onSave: (row: ImportYetiSearchRow) => Promise<void> | void;
  saving?: boolean;
  saved?: boolean;
};

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat().format(Number(value));
}

export default function ShipperCard({ row, onView, onSave, saving = false, saved = false }: Props) {
  const addressDisplay = row.address?.trim() || 'Address unavailable';
  const totalShipments = formatNumber(row.total_shipments);
  const shipments12m = row.shipments_12m == null ? '—' : formatNumber(row.shipments_12m);

  return (
    <div className="group h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] uppercase tracking-wide text-slate-500">Verified shipper</div>
          <h3 className="truncate text-xl font-semibold text-slate-900" title={row.title}>
            {row.title}
          </h3>
        </div>
        {row.country && (
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {row.country}
          </span>
        )}
      </div>

      <div className="mt-2 truncate text-sm text-slate-600" title={row.address ?? undefined}>
        {addressDisplay}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
          <span className="font-semibold text-slate-800">Shipments</span>
          {totalShipments}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
          <span className="font-semibold text-slate-800">12m</span>
          {shipments12m}
        </span>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onView(row)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          View
        </button>
        <button
          type="button"
          onClick={() => onSave(row)}
          disabled={saving || saved}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save to Command Center'}
        </button>
      </div>
    </div>
  );
}
