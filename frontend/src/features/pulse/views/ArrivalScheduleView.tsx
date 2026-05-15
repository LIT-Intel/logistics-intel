import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { ServiceModeIcon } from '@/components/pulse/ServiceModeIcon';
import type { PulseTrackedShipment } from '@/lib/pulse/pulseLiveTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

export function ArrivalScheduleView({ shipments }: { shipments: PulseTrackedShipment[] }) {
  const now = new Date();
  const startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endMs = startMs + 30 * DAY_MS;

  const upcoming = shipments
    .filter((s) => {
      const eta = s.estimated_arrival_date;
      if (!eta) return false;
      const t = new Date(eta).getTime();
      return Number.isFinite(t) && t >= startMs && t <= endMs;
    })
    .sort((a, b) => {
      const at = new Date(a.estimated_arrival_date as string).getTime();
      const bt = new Date(b.estimated_arrival_date as string).getTime();
      return at - bt;
    });

  if (upcoming.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-10 text-center">
        <div className="text-sm font-semibold text-slate-700">
          No shipments arriving in the next 30 days.
        </div>
        <div className="mt-1 text-xs text-slate-500">
          As ImportYeti data refreshes weekly, this view will surface BOLs still in transit.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr className="border-b border-slate-100">
            <th className="px-2 py-2 text-left">Service</th>
            <th className="px-2 py-2 text-left">BOL #</th>
            <th className="px-2 py-2 text-left">Carrier</th>
            <th className="px-2 py-2 text-left">Origin → POD</th>
            <th className="px-2 py-2 text-left">Final destination</th>
            <th className="px-2 py-2 text-left">Estimated arrival</th>
            <th className="px-2 py-2 text-right">Containers</th>
          </tr>
        </thead>
        <tbody>
          {upcoming.map((s) => (
            <tr key={s.bol_number} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
              <td className="px-2 py-2"><ServiceModeIcon shipment={{ mode: undefined, lcl: s.lcl }} /></td>
              <td className="px-2 py-2"><CopyBol value={s.bol_number} /></td>
              <td className="px-2 py-2 text-slate-700">{s.carrier || '—'}</td>
              <td className="px-2 py-2 text-slate-700">
                {[s.origin_port, s.destination_port].filter(Boolean).join(' → ') || '—'}
              </td>
              <td className="px-2 py-2 text-slate-700">{formatFinalDest(s) || '—'}</td>
              <td className="px-2 py-2">
                <EtaWithRange shipment={s} />
              </td>
              <td className="px-2 py-2 text-right text-slate-700">{s.container_count ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatFinalDest(s: PulseTrackedShipment): string | null {
  if (s.dest_city && s.dest_state && s.dest_zip) return `${s.dest_city}, ${s.dest_state} ${s.dest_zip}`;
  if (s.dest_city && s.dest_state) return `${s.dest_city}, ${s.dest_state}`;
  if (s.dest_city) return s.dest_city;
  return null;
}

function EtaWithRange({ shipment }: { shipment: PulseTrackedShipment }) {
  const date = shipment.estimated_arrival_date;
  if (!date) return <span className="text-slate-400">—</span>;
  const main = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const lo = shipment.estimated_arrival_low ? new Date(shipment.estimated_arrival_low) : null;
  const hi = shipment.estimated_arrival_high ? new Date(shipment.estimated_arrival_high) : null;
  let rangeLabel: string | null = null;
  if (lo && hi) {
    const center = new Date(date).getTime();
    const days = Math.max(
      Math.round((center - lo.getTime()) / DAY_MS),
      Math.round((hi.getTime() - center) / DAY_MS),
    );
    if (days > 0) rangeLabel = `±${days}d`;
  }
  return (
    <span className="font-mono text-xs text-slate-700">
      {main}
      {rangeLabel && <span className="ml-1 text-[10px] text-slate-400">{rangeLabel}</span>}
    </span>
  );
}

function CopyBol({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs font-semibold text-slate-800">{value}</span>
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* ignore */
          }
        }}
        title={copied ? 'Copied!' : 'Copy BOL #'}
        className="inline-flex h-4 w-4 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        {copied ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5" />}
      </button>
    </span>
  );
}
