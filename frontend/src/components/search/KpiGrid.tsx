import React from 'react';
import type { Kpi } from './computeKpis';
import { litUI } from '@/lib/uiTokens';

export default function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((k, i) => (
        <div key={i} className="p-3 text-center rounded-xl border border-gray-200 bg-white min-h-[100px] flex flex-col items-center justify-center overflow-hidden">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 truncate w-full max-w-full">{k.label}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 truncate w-full max-w-full">{k.value}</div>
        </div>
      ))}
    </div>
  );
}
