import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Anchor, ArrowDownToLine, ArrowUpFromLine, Boxes, Building2,
  DollarSign, FileText, Landmark, LayoutDashboard, Map as MapIcon, Plane,
  Ship, Tag, Train, Truck, Users2, Package,
} from 'lucide-react';
import { springs } from '@/lib/motion';
import CountryFlag from '@/components/explorer/CountryFlag';
import LitSectionCard from '@/components/ui/LitSectionCard';
import LaneMap from '@/components/LaneMap';
import { resolveEndpoint } from '@/lib/laneGlobe';
import {
  MX_MODE_ARC_COLORS,
  mxGatewayCoords,
  mxModeKey,
  normalizeMxCompanyName,
  shortGatewayLabel,
  useMxCompanyProfile,
} from '@/api/mxProfile';

/**
 * MxTradePanel — the Mexico pedimento intelligence body, rendered INSIDE
 * CompanyProfileV2's Supply Chain tab for MX identities. No page chrome
 * here (no breadcrumb, no identity header card) — CDPHeader owns identity
 * and actions. Content extracted from pages/MxCompanyProfile.jsx (the
 * rejected parallel page, kept unreferenced for reference).
 *
 * Reads ENTIRELY from cached pedimentos via the lit_mx_company_profile RPC
 * (name-prefix ILIKE match) — zero external spend on view.
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

// Universal safe search link — counterparty names deep-link into the main
// Search surface so a partner on a pedimento is one press from a profile.
function searchHref(name) {
  return `/app/search?q=${encodeURIComponent(String(name || '').trim())}`;
}

// Mexico country centroid ([lat, lng]) — anchor fallback when the top
// customs gateway isn't in the compact coordinate table.
const MX_CENTROID = [23.6, -102.6];

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

export default function MxTradePanel({ companyName }) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState('overview');
  // The RPC matches by name-prefix ILIKE — normalization (decode + strip
  // 'mx:' decoration) lives in the shared adapter so this panel and the
  // page header hit the SAME query-cache entry (one RPC per company).
  const name = useMemo(() => normalizeMxCompanyName(companyName), [companyName]);

  const { data, isLoading } = useMxCompanyProfile(name);

  const s = data?.summary || {};
  const empty = !isLoading && (!data || ((s.imports ?? 0) === 0 && (s.exports ?? 0) === 0));

  // ── Live lane map model ────────────────────────────────────────────────
  // One arc per counterparty COUNTRY (aggregating same-country partners so
  // five US suppliers don't stack five identical curves) → the company's
  // top customs gateway (or the MX centroid when the office isn't in the
  // coordinate table). Arc color = dominant transport mode, matching the
  // Service-mix chips: truck emerald / sea cyan / air violet / rail amber.
  const [selectedLane, setSelectedLane] = useState(null);
  const mapModel = useMemo(() => {
    if (!data) return { lanes: [], laneColors: {}, modesUsed: [], anchorLabel: null };
    const gwRaw = data.gateways?.[0]?.v || null;
    const anchor = mxGatewayCoords(gwRaw) || MX_CENTROID; // [lat, lng]
    const anchorLabel = shortGatewayLabel(gwRaw);
    const anchorLngLat = [anchor[1], anchor[0]]; // GlobeLane order: [lng, lat]

    // Dominant mode per counterparty, tallied from the declaration lines.
    const cpMode = new Map();
    for (const d of data.declarations || []) {
      const key = String(d?.counterparty || '').trim().toLowerCase();
      if (!key) continue;
      const mode = mxModeKey(d?.transport_type);
      const tally = cpMode.get(key) || {};
      tally[mode] = (tally[mode] || 0) + 1;
      cpMode.set(key, tally);
    }
    const overallMode = mxModeKey(data.modes?.[0]?.v);

    const byCountry = new Map();
    for (const cp of data.counterparties || []) {
      const ep = resolveEndpoint(cp?.c || null) || resolveEndpoint(cp?.v || null);
      if (!ep || ep.countryCode === 'MX') continue; // domestic — no arc to draw
      const entry = byCountry.get(ep.canonicalKey) || { ep, n: 0, names: [], modeTally: {} };
      entry.n += Number(cp?.n) || 0;
      if (cp?.v) entry.names.push(cp.v);
      const tally = cpMode.get(String(cp?.v || '').trim().toLowerCase());
      if (tally) {
        for (const [m, c] of Object.entries(tally)) {
          entry.modeTally[m] = (entry.modeTally[m] || 0) + c;
        }
      }
      byCountry.set(ep.canonicalKey, entry);
    }

    const lanes = [];
    const laneColors = {};
    const modesUsed = new Set();
    for (const { ep, n, names, modeTally } of byCountry.values()) {
      const mode =
        Object.entries(modeTally).sort((a, b) => b[1] - a[1])[0]?.[0] || overallMode;
      const color = MX_MODE_ARC_COLORS[mode] || MX_MODE_ARC_COLORS.other;
      const id = `mx-${ep.canonicalKey}`;
      lanes.push({
        id,
        from: ep.countryName,
        to: anchorLabel ? `${anchorLabel}, MX` : 'Mexico',
        coords: [[ep.coords[0], ep.coords[1]], anchorLngLat],
        shipments: n,
        fromMeta: {
          label: names.length
            ? `${names[0]}${names.length > 1 ? ` +${names.length - 1} more` : ''}`
            : ep.countryName,
          canonicalKey: ep.canonicalKey,
          countryName: ep.countryName,
          countryCode: ep.countryCode,
          flag: ep.flag,
          coords: ep.coords,
        },
        toMeta: {
          label: anchorLabel ? `${anchorLabel} — customs gateway` : 'Mexico',
          canonicalKey: 'mexico',
          countryName: 'Mexico',
          countryCode: 'MX',
          flag: '🇲🇽',
          coords: anchorLngLat,
        },
      });
      laneColors[id] = { base: color.base, selected: color.selected, glow: color.glow };
      modesUsed.add(mode);
    }
    lanes.sort((a, b) => (b.shipments || 0) - (a.shipments || 0));
    return { lanes, laneColors, modesUsed: [...modesUsed], anchorLabel };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
        <p className="font-body text-[12px] text-slate-500">Loading Mexico trade profile…</p>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
          <FileText className="h-7 w-7 text-blue-600" />
        </div>
        <p className="font-display text-[15px] font-bold text-slate-800">No cached declarations for {name}</p>
        <p className="font-body mt-1 text-[12.5px] text-slate-500">Open this company from the MX search first — that pulls and stores its customs declarations.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={springs.default}
      className="space-y-3.5"
    >
      {/* KPI strip removed 2026-09 — the page HEADER owns the MX KPIs now
          (same shared RPC via useMxCompanyProfile), so a second strip here
          was pure duplication. */}

      {/* Inner tab strip — CompanyProfileV2 idiom: blue underline, font-display */}
      <div
        role="tablist"
        aria-label="Mexico trade sections"
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
          <>
          {mapModel.lanes.length ? (
            <LitSectionCard
              title={cardTitle(<MapIcon size={13} />, 'bg-blue-50 text-blue-600', 'Live trade lanes')}
              sub={
                mapModel.anchorLabel
                  ? `Counterparty origins → ${mapModel.anchorLabel} customs gateway`
                  : 'Counterparty origins → Mexico'
              }
              action={<CountBadge n={mapModel.lanes.length} />}
            >
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <LaneMap
                  lanes={mapModel.lanes}
                  selectedLane={selectedLane}
                  onSelectLane={(id) =>
                    setSelectedLane((cur) => (cur === id ? null : id))
                  }
                  height={300}
                  variant="light"
                  volumeScale
                  laneColors={mapModel.laneColors}
                  unselectedStyle="ghost"
                  flow
                />
              </div>
              {/* Mode legend — same tones as the Service-mix chips. */}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {mapModel.modesUsed.map((m) => (
                  <span
                    key={m}
                    className="font-mono inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-500"
                  >
                    <span
                      className="h-1.5 w-4 rounded-full"
                      style={{ background: (MX_MODE_ARC_COLORS[m] || MX_MODE_ARC_COLORS.other).base }}
                      aria-hidden
                    />
                    {(MX_MODE_ARC_COLORS[m] || MX_MODE_ARC_COLORS.other).label}
                  </span>
                ))}
              </div>
            </LitSectionCard>
          ) : null}
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
          </>
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
                          <td className="max-w-[160px] truncate py-2 pr-3 font-medium text-slate-800">
                            {d.counterparty ? (
                              <Link
                                to={searchHref(d.counterparty)}
                                title={`Search ${d.counterparty} in LIT`}
                                className="transition-colors hover:text-blue-700 hover:underline"
                              >
                                {d.counterparty}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
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
                    <Link
                      to={searchHref(c.v)}
                      title={`Search ${c.v} in LIT`}
                      className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-900 transition-colors hover:text-blue-700 hover:underline active:scale-[0.99] motion-reduce:active:scale-100"
                    >
                      {c.v}
                    </Link>
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
  );
}
