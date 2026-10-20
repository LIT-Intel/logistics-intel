import { explicitForwarder } from '@/lib/intelEvidence';

export default function IncumbentForwarderCard({ bols }: { bols: any[] }) {
  const counts = new Map<string, number>();
  for (const bol of bols) {
    const name = explicitForwarder(bol);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-semibold text-slate-900">Incumbent forwarders</h3>
    {counts.size ? <ul className="mt-3 space-y-2 text-xs">{[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count]) => <li key={name} className="flex justify-between gap-3"><span>{name}</span><span>{count} observed BOLs</span></li>)}</ul>
      : <p className="mt-2 text-xs leading-relaxed text-slate-500">No confirmed forwarder is available in the source data for this company.</p>}
    <p className="mt-3 text-[11px] text-slate-400">Source: explicit forwarder fields on available ImportYeti BOLs. Notify parties and suppliers do not confirm this role.</p>
  </section>;
}
