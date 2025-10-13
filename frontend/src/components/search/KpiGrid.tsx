import React from 'react';
import type { Kpi } from './computeKpis';

export default function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((k, i) => (
        <div key={i} className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-3 text-center">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 flex items-center justify-center gap-1">
            {k.label}
            {k.approx && <span title="Based on current view" className="inline-block text-[10px] px-1 rounded bg-neutral-100 text-neutral-600">≈</span>}
          </div>
          <div className="mt-1 text-xl font-semibold text-neutral-900">{k.value}</div>
        </div>
      ))}
    </div>
  );
}
