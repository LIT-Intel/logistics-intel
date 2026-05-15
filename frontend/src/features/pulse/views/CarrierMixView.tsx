// frontend/src/features/pulse/views/CarrierMixView.tsx
import type { PulseLiveData } from '@/lib/pulse/pulseLiveTypes';

export function CarrierMixView({ data }: { data: PulseLiveData }) {
  const rows = [...data.carrierMix].sort((a, b) => b.container_count - a.container_count);
  const totalContainers = rows.reduce((acc, r) => acc + r.container_count, 0) || 1;
  const trackedContainers = rows.filter((r) => r.tracked).reduce((acc, r) => acc + r.container_count, 0);
  const coveragePct = Math.round((trackedContainers / totalContainers) * 100);
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
        {rows.map((r) => {
          const pct = Math.round((r.container_count / totalContainers) * 100);
          return (
            <div key={r.carrier} className="flex items-center gap-3 text-sm">
              <div className="w-32 truncate">{r.carrier}</div>
              <div className="flex-1 h-6 bg-slate-100 rounded relative overflow-hidden">
                <div
                  className={`h-full ${r.tracked ? 'bg-blue-500' : 'bg-slate-400'}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="absolute inset-0 flex items-center px-2 text-xs text-white font-semibold">
                  {r.container_count} containers · {pct}%
                </div>
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
