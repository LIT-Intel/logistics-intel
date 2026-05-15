import { ServiceModeIcon } from '@/components/pulse/ServiceModeIcon';
import type { PulseTrackedShipment } from '@/lib/pulse/pulseLiveTypes';

export function ArrivalScheduleView({ shipments }: { shipments: PulseTrackedShipment[] }) {
  const rows = [...shipments].sort((a, b) => {
    const ax = a.tracking_eta || a.tracking_arrival_actual || a.bol_date || '';
    const bx = b.tracking_eta || b.tracking_arrival_actual || b.bol_date || '';
    return ax.localeCompare(bx);
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-2 text-left">Service</th>
            <th className="px-2 py-2 text-left">BOL</th>
            <th className="px-2 py-2 text-left">Carrier</th>
            <th className="px-2 py-2 text-left">POD</th>
            <th className="px-2 py-2 text-left">Final dest</th>
            <th className="px-2 py-2 text-right">Containers</th>
            <th className="px-2 py-2 text-left">ETA / Arrived</th>
            <th className="px-2 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.bol_number} className="border-t border-slate-100">
              <td className="px-2 py-2"><ServiceModeIcon shipment={{ mode: undefined, lcl: s.lcl }} /></td>
              <td className="px-2 py-2 font-mono text-xs">{s.bol_number}</td>
              <td className="px-2 py-2">{s.carrier || '—'}</td>
              <td className="px-2 py-2">{s.destination_port || '—'}</td>
              <td className="px-2 py-2">{[s.dest_city, s.dest_state].filter(Boolean).join(', ') || '—'}</td>
              <td className="px-2 py-2 text-right">{s.container_count ?? '—'}</td>
              <td className="px-2 py-2">{formatEta(s)}</td>
              <td className="px-2 py-2"><StatusPill status={s.tracking_status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="py-8 text-center text-slate-500 text-sm">No shipments yet.</div>}
    </div>
  );
}

function formatEta(s: PulseTrackedShipment): string {
  if (s.tracking_arrival_actual) return `Arrived ${new Date(s.tracking_arrival_actual).toLocaleDateString('en-US')}`;
  if (s.tracking_eta) return `ETA ${new Date(s.tracking_eta).toLocaleDateString('en-US')}`;
  return '—';
}

function StatusPill({ status }: { status: PulseTrackedShipment['tracking_status'] }) {
  const map: Record<string, { color: string; label: string }> = {
    tracked: { color: 'bg-blue-50 text-blue-700', label: 'Live' },
    unsupported: { color: 'bg-slate-100 text-slate-500', label: 'No live tracking' },
    no_match: { color: 'bg-amber-50 text-amber-700', label: 'No match' },
    error: { color: 'bg-rose-50 text-rose-700', label: 'Error' },
    pending: { color: 'bg-slate-50 text-slate-500', label: 'Pending' },
  };
  const v = status ? map[status] : { color: 'bg-slate-50 text-slate-500', label: '—' };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs ${v.color}`}>{v.label}</span>;
}
