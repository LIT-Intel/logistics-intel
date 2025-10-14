import React from 'react';
import type { Kpi } from './computeKpis';
import { litUI } from '@/lib/uiTokens';

export default function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {items.map((k, i) => (
        <div key={i} className={`p-3 text-center ${litUI.card}`}>
          <div className="text-[11px] uppercase tracking-wide text-neutral-600 flex items-center justify-center gap-1">
            {k.label}
            {k.approx && <span title="Based on current view" className="inline-block text-[10px] px-1 rounded bg-violet-50 text-violet-700">≈</span>}
          </div>
          <div className="mt-1 text-xl font-semibold" style={{ color: litUI.brandPrimary }}>{k.value}</div>
        </div>
      ))}
    </div>
  );
}
