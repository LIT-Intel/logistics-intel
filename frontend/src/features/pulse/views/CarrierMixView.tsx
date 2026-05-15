// frontend/src/features/pulse/views/CarrierMixView.tsx
import { useEffect, useState } from 'react';
import type { PulseLiveData } from '@/lib/pulse/pulseLiveTypes';

const PALETTE = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f43f5e', '#6366f1',
];
const MUTED = '#94a3b8'; // slate-400 for tiny shares

export function CarrierMixView({ data }: { data: PulseLiveData }) {
  const rows = [...data.carrierMix].sort((a, b) => b.container_count - a.container_count);
  const totalContainers = rows.reduce((acc, r) => acc + r.container_count, 0) || 1;
  const trackedContainers = rows
    .filter((r) => r.tracked)
    .reduce((acc, r) => acc + r.container_count, 0);
  const coveragePct = Math.round((trackedContainers / totalContainers) * 100);

  // Animate widths from 0 → final value on mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div className="font-semibold text-slate-900">Live tracking coverage</div>
        <div className="text-2xl font-bold mt-1">{coveragePct}%</div>
        <div className="text-xs text-slate-500 mt-1">
          {trackedContainers} of {totalContainers} containers on supported carriers (Maersk, Hapag-Lloyd).
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const pctRaw = (r.container_count / totalContainers) * 100;
          const pct = Math.round(pctRaw);
          const isThin = pctRaw < 12;
          const color = pctRaw < 5 ? MUTED : PALETTE[i % PALETTE.length];
          const widthPct = mounted ? pct : 0;
          const label = `${r.container_count} containers · ${pct}%`;
          return (
            <div key={r.carrier} className="flex items-center gap-3 text-sm">
              <div className="w-32 truncate text-slate-700">{r.carrier}</div>
              <div className="relative flex-1 h-6 overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: color,
                    transition: 'width 0.5s ease-out',
                    transitionDelay: `${i * 80}ms`,
                  }}
                />
                {!isThin && (
                  <div className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-white">
                    {label}
                  </div>
                )}
                {isThin && (
                  <div
                    className="absolute inset-y-0 flex items-center text-xs font-semibold text-slate-700"
                    style={{
                      left: `calc(${widthPct}% + 6px)`,
                      transition: 'left 0.5s ease-out',
                      transitionDelay: `${i * 80}ms`,
                    }}
                  >
                    {label}
                  </div>
                )}
              </div>
              <div className="w-24 text-xs text-slate-500">
                {r.tracked ? 'Live tracking' : 'No live tracking'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
