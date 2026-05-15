// frontend/src/features/pulse/views/DrayageOpportunityView.tsx
import type { PulseDrayageEstimate, PulseTrackedShipment } from '@/lib/pulse/pulseLiveTypes';

export function DrayageOpportunityView({
  drayage, shipments,
}: { drayage: PulseDrayageEstimate[]; shipments: PulseTrackedShipment[] }) {
  const rows = [...drayage].sort((a, b) => b.est_cost_usd - a.est_cost_usd);
  const shipMap = new Map(shipments.map((s) => [s.bol_number, s]));
  const total = rows.reduce((acc, r) => acc + r.est_cost_usd, 0);
  const totalLow = rows.reduce((acc, r) => acc + r.est_cost_low_usd, 0);
  const totalHigh = rows.reduce((acc, r) => acc + r.est_cost_high_usd, 0);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div className="font-semibold text-slate-900">Total estimated drayage opportunity</div>
        <div className="text-2xl font-bold mt-1">${total.toLocaleString('en-US')}</div>
        <div className="text-xs text-slate-500 mt-1">
          Range: ${totalLow.toLocaleString('en-US')} – ${totalHigh.toLocaleString('en-US')} (±25%)
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">BOL</th>
              <th className="px-2 py-2 text-left">Final dest</th>
              <th className="px-2 py-2 text-right">Containers</th>
              <th className="px-2 py-2 text-right">Miles</th>
              <th className="px-2 py-2 text-right">Est. value</th>
              <th className="px-2 py-2 text-right">Range</th>
              <th className="px-2 py-2 text-left">Arrival</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = shipMap.get(r.bol_number);
              const arrival = s?.tracking_arrival_actual || s?.tracking_eta || s?.bol_date;
              return (
                <tr key={r.bol_number} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-mono text-xs">{r.bol_number}</td>
                  <td className="px-2 py-2">{[r.destination_city, r.destination_state].filter(Boolean).join(', ')}</td>
                  <td className="px-2 py-2 text-right">{s?.container_count ?? Math.ceil(r.containers_eq)}</td>
                  <td className="px-2 py-2 text-right">{Math.round(r.miles).toLocaleString('en-US')}</td>
                  <td className="px-2 py-2 text-right font-semibold">${r.est_cost_usd.toLocaleString('en-US')}</td>
                  <td className="px-2 py-2 text-right text-xs text-slate-500">${r.est_cost_low_usd.toLocaleString('en-US')}–${r.est_cost_high_usd.toLocaleString('en-US')}</td>
                  <td className="px-2 py-2">{arrival ? new Date(arrival).toLocaleDateString('en-US') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 italic">
        Estimated based on distance, container type, and port. Actual quoted rates vary ±25%.
      </p>
    </div>
  );
}
