import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Anchor, Boxes, Building2, FileText,
  Landmark, Plane, Ship, Train, Truck, Users2, Package,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { springs } from '@/lib/motion';
import CountryFlag from '@/components/explorer/CountryFlag';

/**
 * Mexico company profile — rendered ENTIRELY from cached pedimentos
 * (lit_mx_*_declarations via lit_mx_company_profile RPC). Zero ImportYeti
 * spend on view. Search-page visual language; every transport mode gets its
 * service icon (owner: MX data is more than ocean — show the service types).
 */

const MODE_META = {
  truck: { Icon: Truck, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', label: 'Truck' },
  carretero: { Icon: Truck, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', label: 'Truck' },
  sea: { Icon: Ship, tone: 'bg-cyan-50 text-cyan-700 ring-cyan-200', label: 'Sea' },
  maritimo: { Icon: Ship, tone: 'bg-cyan-50 text-cyan-700 ring-cyan-200', label: 'Sea' },
  ocean: { Icon: Ship, tone: 'bg-cyan-50 text-cyan-700 ring-cyan-200', label: 'Sea' },
  air: { Icon: Plane, tone: 'bg-violet-50 text-violet-700 ring-violet-200', label: 'Air' },
  aereo: { Icon: Plane, tone: 'bg-violet-50 text-violet-700 ring-violet-200', label: 'Air' },
  rail: { Icon: Train, tone: 'bg-amber-50 text-amber-700 ring-amber-200', label: 'Rail' },
  ferroviario: { Icon: Train, tone: 'bg-amber-50 text-amber-700 ring-amber-200', label: 'Rail' },
};
function modeMeta(v) {
  const k = String(v || '').trim().toLowerCase();
  return MODE_META[k] || { Icon: Package, tone: 'bg-slate-100 text-slate-600 ring-slate-200', label: v || 'Other' };
}
function ModeChip({ v, n }) {
  const { Icon, tone, label } = modeMeta(v);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${tone}`}>
      <Icon size={13} /> {label}{n != null ? <span className="font-mono text-[11px] opacity-70">{n}</span> : null}
    </span>
  );
}
function fmtUsd(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function Card({ icon, tone, title, count, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${tone}`}>{icon}</span>
        <h3 className="font-display text-[13.5px] font-bold tracking-tight text-slate-900">{title}</h3>
        {count != null ? <span className="font-mono ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">{count}</span> : null}
      </header>
      {children}
    </section>
  );
}

export default function MxCompanyProfile() {
  const params = useParams();
  const name = params.name ?? params.id; // mounted inside /app/companies/:id too
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const companyName = useMemo(() => { try { return decodeURIComponent(name || '').replace(/^mx:/, ''); } catch { return String(name || '').replace(/^mx:/, ''); } }, [name]);

  const { data, isLoading } = useQuery({
    queryKey: ['mx-company-profile', companyName],
    enabled: Boolean(companyName),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: d, error } = await supabase.rpc('lit_mx_company_profile', { p_name: companyName });
      if (error) return null;
      return d;
    },
  });

  const s = data?.summary || {};
  const empty = !isLoading && (!data || ((s.imports ?? 0) === 0 && (s.exports ?? 0) === 0));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:scale-[0.97] motion-reduce:active:scale-100"
      >
        <ArrowLeft size={14} /> Back to search
      </button>

      {isLoading ? (
        <div className="flex flex-col items-center gap-2.5 py-24">
          <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
          <p className="font-body text-[12px] text-slate-500">Loading Mexico trade profile…</p>
        </div>
      ) : empty ? (
        <div className="py-24 text-center">
          <p className="font-display text-[15px] font-bold text-slate-800">No cached declarations for {companyName}</p>
          <p className="font-body mt-1 text-[12.5px] text-slate-500">Open this company from the MX search first — that pulls and stores its customs declarations.</p>
        </div>
      ) : (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={springs.default}
          className="mt-3 space-y-3.5"
        >
          {/* Header */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-[#0F1828] to-[#1E293B] p-5 text-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <CountryFlag code="MX" size={18} />
              <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight">{companyName}</h1>
              {s.rfc ? <span className="font-mono rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">RFC {s.rfc}</span> : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-slate-300">
              <span className="inline-flex items-center gap-1.5"><ArrowDownToLine size={13} className="text-emerald-400" /> <b className="text-white">{s.imports ?? 0}</b> import declarations</span>
              <span className="inline-flex items-center gap-1.5"><ArrowUpFromLine size={13} className="text-cyan-400" /> <b className="text-white">{s.exports ?? 0}</b> export declarations</span>
              {s.first_activity ? <span>Active <b className="text-white">{String(s.first_activity).slice(0, 4)}–{String(s.last_activity).slice(0, 4)}</b></span> : null}
              {fmtUsd(s.total_value_usd) ? <span>Declared <b className="text-white">{fmtUsd(s.total_value_usd)}</b></span> : null}
            </div>
            {/* Service mix — icons per mode */}
            {data.modes?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.modes.map((m) => <ModeChip key={m.v} v={m.v} n={m.n} />)}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {data.counterparties?.length ? (
              <Card icon={<Users2 size={14} />} tone="bg-blue-50 text-blue-600" title="Trading partners" count={data.counterparties.length}>
                <ul className="divide-y divide-slate-100">
                  {data.counterparties.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 py-2">
                      <CountryFlag code={c.c} size={12} />
                      <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-900">{c.v}</span>
                      {fmtUsd(c.usd) ? <span className="font-body shrink-0 text-[10.5px] text-slate-400">{fmtUsd(c.usd)}</span> : null}
                      <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{c.n}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {data.products?.length ? (
              <Card icon={<Boxes size={14} />} tone="bg-violet-50 text-violet-600" title="Products (HS)" count={data.products.length}>
                <ul className="divide-y divide-slate-100">
                  {data.products.map((p, i) => (
                    <li key={i} className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-700">{p.v}</span>
                        <span className="font-body min-w-0 flex-1 truncate text-[12px] text-slate-700">{p.label || '—'}</span>
                        <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{p.n}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {data.gateways?.length ? (
              <Card icon={<Landmark size={14} />} tone="bg-amber-50 text-amber-600" title="Customs gateways" count={data.gateways.length}>
                <ul className="space-y-1.5">
                  {data.gateways.map((g, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Anchor size={12} className="shrink-0 text-amber-500" />
                      <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800">{g.v}</span>
                      <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{g.n}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {data.brokers?.length ? (
              <Card icon={<Building2 size={14} />} tone="bg-rose-50 text-rose-600" title="Customs brokers" count={data.brokers.length}>
                <ul className="space-y-1.5">
                  {data.brokers.map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800">{b.v}</span>
                      <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{b.n}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>

          {/* Declarations table — mode icon per row */}
          {data.declarations?.length ? (
            <Card icon={<FileText size={14} />} tone="bg-slate-100 text-slate-600" title="Recent declarations" count={data.declarations.length}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="py-1.5 pr-3">Date</th>
                      <th className="py-1.5 pr-3">Dir</th>
                      <th className="py-1.5 pr-3">Mode</th>
                      <th className="py-1.5 pr-3">Gateway</th>
                      <th className="py-1.5 pr-3">Counterparty</th>
                      <th className="py-1.5 pr-3">Product</th>
                      <th className="py-1.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.declarations.map((d, i) => {
                      const { Icon, tone } = modeMeta(d.transport_type);
                      return (
                        <tr key={i} className="text-slate-700">
                          <td className="font-mono whitespace-nowrap py-2 pr-3 text-[11px]">{d.d || '—'}</td>
                          <td className="py-2 pr-3">
                            {d.direction === 'import'
                              ? <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowDownToLine size={11} /> In</span>
                              : <span className="inline-flex items-center gap-1 text-cyan-700"><ArrowUpFromLine size={11} /> Out</span>}
                          </td>
                          <td className="py-2 pr-3"><span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ring-1 ${tone}`} title={d.transport_type || 'Unknown'}><Icon size={13} /></span></td>
                          <td className="max-w-[140px] truncate py-2 pr-3">{d.customs_office || '—'}</td>
                          <td className="max-w-[160px] truncate py-2 pr-3 font-medium text-slate-800">{d.counterparty || '—'}</td>
                          <td className="max-w-[220px] truncate py-2 pr-3">{d.product || '—'}</td>
                          <td className="whitespace-nowrap py-2 text-right font-mono text-[11px]">{fmtUsd(d.value_usd) || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <p className="font-body text-[10.5px] text-slate-400">
            Sourced from Mexican customs declarations (pedimentos) cached by LIT — viewing this profile costs no data credits.
          </p>
        </motion.div>
      )}
    </div>
  );
}
