import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Anchor, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Boxes, Building2,
  CalendarClock, DollarSign, FileText, Landmark, LayoutDashboard, Plane,
  Scale, Ship, Tag, Train, Truck, Users2, Package,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { springs } from '@/lib/motion';
import CountryFlag from '@/components/explorer/CountryFlag';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import LitCategoryChip from '@/components/ui/LitCategoryChip';
import LitPill from '@/components/ui/LitPill';
import LitSectionCard from '@/components/ui/LitSectionCard';

/**
 * Mexico company profile — rendered ENTIRELY from cached pedimentos
 * (lit_mx_*_declarations via lit_mx_company_profile RPC). Zero ImportYeti
 * spend on view. Visual language mirrors CompanyProfileV2 / CDPHeader:
 * white header card + bracketed role badge, KPI tile row, blue-underline
 * tab bar, LitSectionCard sections. Every transport mode gets its service
 * icon (owner: MX data is more than ocean — show the service types).
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
function fmtWeight(kg) {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return null;
  const t = n / 1000;
  if (t >= 1000) return `${(t / 1000).toFixed(1)}K t`;
  if (t >= 1) return `${Math.round(t).toLocaleString()} t`;
  return `${Math.round(n).toLocaleString()} kg`;
}
function fmtDate(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return String(v).slice(0, 10) || null;
  return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Who pays the freight — the sales-intel signal on pedimentos. The party
 *  that controls freight is the one who picks the forwarder. */
function freightControlMeta(v) {
  const k = String(v || '').toLowerCase();
  if (/import|consign|destinat|comprador|buyer/.test(k)) {
    return { label: 'Mexico entity controls freight', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  }
  if (/export|shipper|remit|vendedor|seller|supplier|proveedor/.test(k)) {
    return { label: 'Counterparty controls freight', tone: 'bg-cyan-50 text-cyan-700 ring-cyan-200' };
  }
  return { label: v || 'Unknown', tone: 'bg-slate-100 text-slate-600 ring-slate-200' };
}

// KPI tile idiom — mirrors CDPHeader's CdpKpiChip tones (colored icon square
// + number + tiny uppercase label), rendered as V2-style white stat tiles.
const KPI_TONES = {
  blue: 'bg-blue-50 text-blue-600',
  cyan: 'bg-cyan-50 text-cyan-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-100 text-slate-500',
};
function KpiTile({ icon: Icon, tone = 'blue', value, label }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${KPI_TONES[tone] || KPI_TONES.blue}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="font-display truncate text-[18px] font-bold leading-none tracking-tight text-slate-900">
          {value}
        </div>
        <div className="font-mono mt-1 truncate text-[9.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
          {label}
        </div>
      </div>
    </div>
  );
}

// Section-card title node — CDPSupplyChain convention: small colored icon
// square beside the LitSectionCard title.
function cardTitle(icon, tone, text) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${tone}`}>{icon}</span>
      {text}
    </span>
  );
}
function CountBadge({ n }) {
  if (n == null) return null;
  return (
    <span className="font-mono rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">
      {n}
    </span>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'declarations', label: 'Declarations', Icon: FileText },
  { id: 'partners', label: 'Partners', Icon: Users2 },
  { id: 'gateways', label: 'Gateways & Brokers', Icon: Landmark },
];

export default function MxCompanyProfile() {
  const params = useParams();
  const name = params.name ?? params.id; // mounted inside /app/companies/:id too
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState('overview');
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

  const imports = Number(s.imports ?? 0);
  const exports = Number(s.exports ?? 0);
  const role = imports > 0 && exports > 0 ? 'Importer & Exporter' : exports > 0 ? 'Exporter' : 'Importer';
  const activeYears = s.first_activity
    ? `${String(s.first_activity).slice(0, 4)}–${String(s.last_activity || s.first_activity).slice(0, 4)}`
    : null;
  const topMode = data?.modes?.length ? modeMeta(data.modes[0].v) : null;

  const kpiTiles = [];
  if (imports > 0) kpiTiles.push({ icon: ArrowDownToLine, tone: 'emerald', value: imports.toLocaleString(), label: 'Import declarations' });
  if (exports > 0) kpiTiles.push({ icon: ArrowUpFromLine, tone: 'cyan', value: exports.toLocaleString(), label: 'Export declarations' });
  const declaredValue = fmtUsd(s.total_value_usd);
  if (declaredValue) kpiTiles.push({ icon: DollarSign, tone: 'blue', value: declaredValue, label: 'Declared value (USD)' });
  const totalWeight = fmtWeight(s.total_weight_kg);
  if (totalWeight) kpiTiles.push({ icon: Scale, tone: 'violet', value: totalWeight, label: 'Total weight' });
  if (topMode) kpiTiles.push({ icon: topMode.Icon, tone: 'amber', value: topMode.label, label: 'Top mode' });
  kpiTiles.push({ icon: CalendarClock, tone: 'rose', value: fmtDate(s.last_activity) || '—', label: 'Last activity' });

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-4">
      {/* Breadcrumb row — CDPHeader idiom: back affordance / current entity */}
      <div className="font-body flex min-w-0 items-center gap-1.5 text-[12px] text-slate-500">
        <button
          type="button"
          onClick={() => navigate('/app/search')}
          className="font-body inline-flex items-center gap-1 truncate text-[12px] text-slate-500 hover:text-slate-700 active:scale-[0.97] motion-reduce:active:scale-100"
        >
          <ArrowLeft className="h-3 w-3" />
          Search
        </button>
        <span className="text-slate-300">/</span>
        <span className="truncate font-semibold text-slate-900">{companyName}</span>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center gap-2.5 py-24">
          <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
          <p className="font-body text-[12px] text-slate-500">Loading Mexico trade profile…</p>
        </div>
      ) : empty ? (
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <FileText className="h-7 w-7 text-blue-600" />
          </div>
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
          {/* Identity header — white card, CDPHeader editorial framing:
              bracketed role badge above the font-display H1, chips below. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start gap-3 sm:gap-3.5">
              <div className="shrink-0">
                <CompanyAvatar name={companyName} size="lg" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2">
                  <LitCategoryChip label={role} />
                </div>
                <h1
                  className="font-display m-0 mb-2 truncate text-2xl font-semibold leading-[1.05] tracking-[-0.015em] text-slate-900 sm:text-3xl"
                  title={companyName}
                >
                  {companyName}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5">
                  <LitPill tone="slate" icon={<CountryFlag code="MX" size={11} />}>
                    Mexico
                  </LitPill>
                  {s.rfc ? (
                    <span className="font-mono inline-flex items-center whitespace-nowrap rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      RFC {s.rfc}
                    </span>
                  ) : null}
                  <LitPill tone="green" dot>
                    Mexico Customs Data
                  </LitPill>
                  {activeYears ? (
                    <LitPill tone="slate" icon={<CalendarClock className="h-2.5 w-2.5" />}>
                      Active {activeYears}
                    </LitPill>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* KPI tile row — V2 stat-tile idiom */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {kpiTiles.map((t) => (
              <KpiTile key={t.label} icon={t.icon} tone={t.tone} value={t.value} label={t.label} />
            ))}
          </div>

          {/* Tab bar — CompanyProfileV2 idiom: blue underline, font-display */}
          <div
            role="tablist"
            aria-label="Mexico profile sections"
            className="-mb-px flex min-w-0 snap-x items-center gap-0 overflow-x-auto border-b border-slate-200 overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t) => {
              const Icon = t.Icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={[
                    'font-display inline-flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[12.5px] font-semibold transition-colors sm:px-3.5 active:scale-[0.97] motion-reduce:active:scale-100',
                    active
                      ? 'border-blue-500 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab panels */}
          <motion.div
            key={tab}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.snappy}
            className="space-y-3.5"
          >
            {tab === 'overview' && (
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                {data.modes?.length ? (
                  <LitSectionCard
                    title={cardTitle(<Truck size={13} />, 'bg-emerald-50 text-emerald-600', 'Service mix')}
                    sub="Transport modes across cached declarations"
                    action={<CountBadge n={data.modes.length} />}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {data.modes.map((m) => <ModeChip key={m.v} v={m.v} n={m.n} />)}
                    </div>
                  </LitSectionCard>
                ) : null}
                {data.freight_control?.length ? (
                  <LitSectionCard
                    title={cardTitle(<DollarSign size={13} />, 'bg-blue-50 text-blue-600', 'Freight control')}
                    sub="Who pays the freight — the controlling party picks the forwarder"
                    action={<CountBadge n={data.freight_control.length} />}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {data.freight_control.map((f, i) => {
                        const meta = freightControlMeta(f.v);
                        return (
                          <span
                            key={i}
                            title={f.v || undefined}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${meta.tone}`}
                          >
                            {meta.label}
                            {f.n != null ? <span className="font-mono text-[11px] opacity-70">· {f.n}</span> : null}
                          </span>
                        );
                      })}
                    </div>
                  </LitSectionCard>
                ) : null}
                {data.incoterms?.length ? (
                  <LitSectionCard
                    title={cardTitle(<Tag size={13} />, 'bg-cyan-50 text-cyan-600', 'Incoterms')}
                    sub="Commercial terms on declared shipments"
                    action={<CountBadge n={data.incoterms.length} />}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {data.incoterms.map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200">
                          <span className="font-mono">{t.v}</span>
                          {t.n != null ? <span className="font-mono text-[11px] opacity-70">{t.n}</span> : null}
                        </span>
                      ))}
                    </div>
                  </LitSectionCard>
                ) : null}
                {data.products?.length ? (
                  <LitSectionCard
                    title={cardTitle(<Boxes size={13} />, 'bg-violet-50 text-violet-600', 'Products (HS)')}
                    sub="Top declared commodities"
                    action={<CountBadge n={data.products.length} />}
                    dense
                    padded
                  >
                    <ul className="divide-y divide-slate-100">
                      {data.products.map((p, i) => (
                        <li key={i} className="py-2 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-700">{p.v}</span>
                            <span className="font-body min-w-0 flex-1 truncate text-[12px] text-slate-700">{p.label || '—'}</span>
                            {fmtUsd(p.usd) ? <span className="font-body shrink-0 text-[10.5px] text-slate-400">{fmtUsd(p.usd)}</span> : null}
                            <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{p.n}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </LitSectionCard>
                ) : null}
              </div>
            )}

            {tab === 'declarations' && (
              data.declarations?.length ? (
                <LitSectionCard
                  title={cardTitle(<FileText size={13} />, 'bg-slate-100 text-slate-600', 'Recent declarations')}
                  sub="Latest cached pedimento lines"
                  action={<CountBadge n={data.declarations.length} />}
                >
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
                          <th className="py-1.5 pr-3">Incoterm</th>
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
                              <td className="max-w-[200px] truncate py-2 pr-3">{d.product || '—'}</td>
                              <td className="font-mono whitespace-nowrap py-2 pr-3 text-[11px]">{d.incoterm || '—'}</td>
                              <td className="font-mono whitespace-nowrap py-2 text-right text-[11px]">{fmtUsd(d.value_usd) || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </LitSectionCard>
              ) : (
                <p className="font-body py-10 text-center text-[12.5px] text-slate-500">No declaration lines cached for this company.</p>
              )
            )}

            {tab === 'partners' && (
              data.counterparties?.length ? (
                <LitSectionCard
                  title={cardTitle(<Users2 size={13} />, 'bg-blue-50 text-blue-600', 'Trading partners')}
                  sub="Counterparties on cached declarations"
                  action={<CountBadge n={data.counterparties.length} />}
                >
                  <ul className="divide-y divide-slate-100">
                    {data.counterparties.map((c, i) => (
                      <li key={i} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                        <CountryFlag code={c.c} size={12} />
                        <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-900">{c.v}</span>
                        {fmtUsd(c.usd) ? <span className="font-body shrink-0 text-[10.5px] text-slate-400">{fmtUsd(c.usd)}</span> : null}
                        <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{c.n}</span>
                      </li>
                    ))}
                  </ul>
                </LitSectionCard>
              ) : (
                <p className="font-body py-10 text-center text-[12.5px] text-slate-500">No counterparties cached for this company.</p>
              )
            )}

            {tab === 'gateways' && (
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                {data.gateways?.length ? (
                  <LitSectionCard
                    title={cardTitle(<Landmark size={13} />, 'bg-amber-50 text-amber-600', 'Customs gateways')}
                    sub="Ports of entry / exit on declarations"
                    action={<CountBadge n={data.gateways.length} />}
                  >
                    <ul className="space-y-1.5">
                      {data.gateways.map((g, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Anchor size={12} className="shrink-0 text-amber-500" />
                          <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800">{g.v}</span>
                          <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{g.n}</span>
                        </li>
                      ))}
                    </ul>
                  </LitSectionCard>
                ) : null}
                {data.brokers?.length ? (
                  <LitSectionCard
                    title={cardTitle(<Building2 size={13} />, 'bg-rose-50 text-rose-600', 'Customs brokers')}
                    sub="Agentes aduanales filing for this company"
                    action={<CountBadge n={data.brokers.length} />}
                  >
                    <ul className="space-y-1.5">
                      {data.brokers.map((b, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800">{b.v}</span>
                          <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{b.n}</span>
                        </li>
                      ))}
                    </ul>
                  </LitSectionCard>
                ) : null}
                {!data.gateways?.length && !data.brokers?.length ? (
                  <p className="font-body py-10 text-center text-[12.5px] text-slate-500 lg:col-span-2">No gateway or broker data cached for this company.</p>
                ) : null}
              </div>
            )}
          </motion.div>

          <p className="font-body text-[10.5px] text-slate-400">
            Sourced from Mexican customs declarations (pedimentos) cached by LIT — viewing this profile costs no data credits.
          </p>
        </motion.div>
      )}
    </div>
  );
}
