import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Anchor, Boxes, DollarSign, FileText, Landmark, Map as MapIcon,
  Stamp, Tag, Truck,
} from 'lucide-react';
import { springs } from '@/lib/motion';
import CountryFlag from '@/components/explorer/CountryFlag';
import LitSectionCard from '@/components/ui/LitSectionCard';
import LaneMap from '@/components/LaneMap';
import { resolveEndpoint } from '@/lib/laneGlobe';
import {
  MX_MODE_ARC_COLORS,
  MX_MODE_ICONS,
  MX_MODE_TONES,
  mxFmtUsd,
  mxGatewayCoords,
  mxModeKey,
  mxStateCoords,
  normalizeMxCompanyName,
  shortGatewayLabel,
  useMxCompanyProfile,
} from '@/api/mxProfile';

/**
 * MxTradePanel — the Mexico pedimento SUPPLY-CHAIN body, rendered inside
 * CompanyProfileV2's Supply Chain tab for MX identities. The former inner
 * tab strip is GONE (owner 2026-09): Declarations moved to the page's
 * Pulse LIVE tab (MxDeclarationsTable), Partners + Brokers to Trade Graph
 * (MxPartnersPanel). This panel now owns only: the lane map hero (same
 * dark/satellite presentation as CDPSupplyChain's hero, with a ranked
 * Top-Lanes glass panel), Service mix, Freight control, Incoterms,
 * Regimes, Gateways and Products.
 *
 * Reads ENTIRELY from cached pedimentos via the lit_mx_company_profile RPC
 * (name-prefix ILIKE match) — zero external spend on view.
 */

function ModeChip({ v, n }) {
  const mode = mxModeKey(v);
  const Icon = MX_MODE_ICONS[mode];
  const label = mode === 'other' ? (v || 'Other') : MX_MODE_ARC_COLORS[mode].label;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${MX_MODE_TONES[mode]}`}>
      <Icon size={13} /> {label}{n != null ? <span className="font-mono text-[11px] opacity-70">{n}</span> : null}
    </span>
  );
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

// Mexico country centroid ([lat, lng]) — HQ proxy for domestic arcs and
// anchor fallback when a customs office isn't in the coordinate table.
const MX_CENTROID = [23.6, -102.6];

/** Glass-panel styling — same material as CDPSupplyChain's floating map cards. */
const GLASS_PANEL =
  'rounded-xl border border-white/60 bg-white/85 shadow-[0_8px_30px_rgba(2,6,23,0.14)] backdrop-blur-md';

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

/** One ranked lane row — "CN → Manzanillo · Sea · 20" with flag + mode icon. */
function LaneRankRow({ lane, selected, onSelect }) {
  const Icon = MX_MODE_ICONS[lane.mode];
  return (
    <button
      type="button"
      onClick={() => onSelect(lane.id)}
      aria-pressed={selected}
      className={[
        'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors active:scale-[0.985] motion-reduce:active:scale-100',
        selected ? 'bg-blue-50/80' : 'hover:bg-slate-50/80',
      ].join(' ')}
    >
      <span
        className="h-5 w-1 shrink-0 rounded-full"
        style={{ background: MX_MODE_ARC_COLORS[lane.mode].base }}
        aria-hidden
      />
      <CountryFlag code={lane.originCode} size={12} />
      <span className="font-display min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">
        {lane.originLabel} → {lane.gatewayLabel}
      </span>
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${MX_MODE_TONES[lane.mode]}`}
        title={MX_MODE_ARC_COLORS[lane.mode].label}
      >
        <Icon size={11} />
      </span>
      <span className="font-mono shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
        {lane.shipments}
      </span>
    </button>
  );
}

export default function MxTradePanel({ companyName }) {
  const reduce = useReducedMotion();
  // The RPC matches by name-prefix ILIKE — normalization (decode + strip
  // 'mx:' decoration) lives in the shared adapter so this panel and the
  // page header hit the SAME query-cache entry (one RPC per company).
  const name = useMemo(() => normalizeMxCompanyName(companyName), [companyName]);

  const { data, isLoading } = useMxCompanyProfile(name);

  const s = data?.summary || {};
  const empty = !isLoading && (!data || ((s.imports ?? 0) === 0 && (s.exports ?? 0) === 0));

  // Desktop keeps the ranked panel docked over the map — pad fitBounds so
  // arcs stay clear of it (same idea as CDPSupplyChain's hero).
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ── Live lane map model ────────────────────────────────────────────────
  // Lanes are built from the DECLARATION lines grouped by
  // (origin, gateway, mode) so every row draws — including the country-less
  // domestic/truck rows the old counterparty-country model dropped.
  // Origin anchor fallback chain:
  //   counterparty country centroid → MX state centroid (v3
  //   counterparty_state via the counterparties[] join) → the company HQ
  //   proxy (MX centroid) with a short domestic arc into the gateway.
  // Arc color = transport mode (truck emerald / sea cyan / air violet /
  // rail amber), matching the Service-mix chips.
  const [selectedLane, setSelectedLane] = useState(null);
  const mapModel = useMemo(() => {
    if (!data) return { lanes: [], laneColors: {}, modesUsed: [] };

    // Counterparty name → {country, state} from the aggregate rollup (the
    // declaration rows themselves don't carry country/state).
    const cpGeo = new Map();
    for (const cp of data.counterparties || []) {
      const key = String(cp?.v || '').trim().toLowerCase();
      if (!key) continue;
      cpGeo.set(key, { c: cp?.c || null, state: cp?.state || null });
    }

    const topGatewayRaw = data.gateways?.[0]?.v || null;
    const groups = new Map();
    for (const d of data.declarations || []) {
      const mode = mxModeKey(d?.transport_type);
      const gwRaw = d?.customs_office || topGatewayRaw;
      const gwLabel = shortGatewayLabel(gwRaw) || 'Mexico';
      const gwLatLng = mxGatewayCoords(gwRaw) || MX_CENTROID;
      const geo = cpGeo.get(String(d?.counterparty || '').trim().toLowerCase()) || {};

      // Origin anchor — country centroid → MX state centroid → HQ proxy.
      let origin = null;
      if (geo.c && geo.c !== 'MX') {
        const ep = resolveEndpoint(geo.c);
        if (ep) {
          origin = {
            key: `c:${ep.canonicalKey}`,
            label: ep.countryCode || ep.countryName,
            name: ep.countryName,
            code: ep.countryCode,
            flag: ep.flag,
            lngLat: [ep.coords[0], ep.coords[1]],
          };
        }
      }
      if (!origin) {
        const st = mxStateCoords(geo.state);
        if (st) {
          origin = {
            key: `s:${String(geo.state).trim().toLowerCase()}`,
            label: shortGatewayLabel(geo.state) || 'MX',
            name: `${shortGatewayLabel(geo.state)}, Mexico`,
            code: 'MX',
            flag: '🇲🇽',
            lngLat: [st[1], st[0]],
          };
        }
      }
      if (!origin) {
        // Domestic / unresolved partner — short arc from the company HQ
        // proxy into the gateway itself, so truck rows still render.
        const nearCentroid =
          Math.abs(gwLatLng[0] - MX_CENTROID[0]) < 1 &&
          Math.abs(gwLatLng[1] - MX_CENTROID[1]) < 1;
        origin = {
          key: 'mx-domestic',
          label: 'MX',
          name: 'Mexico — domestic',
          code: 'MX',
          flag: '🇲🇽',
          lngLat: nearCentroid
            ? [MX_CENTROID[1] + 2.4, MX_CENTROID[0] - 2.0]
            : [MX_CENTROID[1], MX_CENTROID[0]],
        };
      }

      const gwKey = gwLabel.toLowerCase();
      const key = `${origin.key}|${gwKey}|${mode}`;
      const entry = groups.get(key) || {
        origin,
        gwLabel,
        gwLatLng,
        mode,
        n: 0,
        names: new Set(),
      };
      entry.n += 1;
      if (d?.counterparty) entry.names.add(d.counterparty);
      groups.set(key, entry);
    }

    const lanes = [];
    const laneColors = {};
    const modesUsed = new Set();
    // De-overlap: multiple modes on the same origin→gateway pair get a
    // small latitude nudge so no arc hides another.
    const pairSeen = new Map();
    for (const g of groups.values()) {
      const pairKey = `${g.origin.key}|${g.gwLabel.toLowerCase()}`;
      const nth = pairSeen.get(pairKey) || 0;
      pairSeen.set(pairKey, nth + 1);
      const color = MX_MODE_ARC_COLORS[g.mode] || MX_MODE_ARC_COLORS.other;
      const id = `mx-${g.origin.key}-${g.gwLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${g.mode}`;
      const names = [...g.names];
      lanes.push({
        id,
        mode: g.mode,
        originLabel: g.origin.label,
        originCode: g.origin.code || 'MX',
        gatewayLabel: g.gwLabel,
        from: g.origin.name || g.origin.label,
        to: `${g.gwLabel}, MX`,
        coords: [
          [g.origin.lngLat[0], g.origin.lngLat[1] + nth * 0.85],
          [g.gwLatLng[1], g.gwLatLng[0]],
        ],
        shipments: g.n,
        fromMeta: {
          label: names.length
            ? `${names[0]}${names.length > 1 ? ` +${names.length - 1} more` : ''}`
            : g.origin.name || g.origin.label,
          canonicalKey: g.origin.key,
          countryName: g.origin.name || g.origin.label,
          countryCode: g.origin.code || 'MX',
          flag: g.origin.flag,
          coords: [g.origin.lngLat[0], g.origin.lngLat[1] + nth * 0.85],
        },
        toMeta: {
          label: `${g.gwLabel} — customs gateway`,
          canonicalKey: `mx-gw-${g.gwLabel.toLowerCase()}`,
          countryName: 'Mexico',
          countryCode: 'MX',
          flag: '🇲🇽',
          coords: [g.gwLatLng[1], g.gwLatLng[0]],
        },
      });
      laneColors[id] = { base: color.base, selected: color.selected, glow: color.glow };
      modesUsed.add(g.mode);
    }
    lanes.sort((a, b) => (b.shipments || 0) - (a.shipments || 0));
    return { lanes, laneColors, modesUsed: [...modesUsed] };
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

  const modeLegend = (
    <div className="flex flex-wrap items-center gap-3">
      {mapModel.modesUsed.map((m) => (
        <span
          key={m}
          className="font-mono inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-600"
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
  );

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={springs.default}
      className="space-y-3.5"
    >
      {/* ── Lane map hero — CDPSupplyChain presentation (dark satellite
          basemap, animated flow arcs, docked ranked-lanes glass panel,
          bottom-left legend). ─────────────────────────────────────────── */}
      {mapModel.lanes.length ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="relative h-[380px] w-full sm:h-[440px]">
            <LaneMap
              lanes={mapModel.lanes}
              selectedLane={selectedLane}
              onSelectLane={(id) =>
                setSelectedLane((cur) => (cur === id ? null : id))
              }
              height="fill"
              variant="dark"
              volumeScale
              zoomControlPosition="bottomleft"
              fitPadding={
                isDesktop
                  ? { top: 32, right: 324, bottom: 48, left: 32 }
                  : { top: 24, right: 24, bottom: 24, left: 24 }
              }
              laneColors={mapModel.laneColors}
              unselectedStyle="ghost"
              flow
            />

            {/* Desktop: ranked Top-Lanes glass panel docked top-right. */}
            <div
              className={[
                'absolute right-4 top-4 z-[700] hidden max-h-[calc(100%-32px)] w-[292px] flex-col overflow-hidden md:flex',
                GLASS_PANEL,
              ].join(' ')}
            >
              <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 px-3.5 pb-2 pt-2.5">
                <span className="font-display truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Top lanes · origin → gateway
                </span>
                <span className="font-mono ml-auto shrink-0 text-[10px] font-semibold text-slate-400">
                  {mapModel.lanes.length}
                </span>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-slate-100/80 overflow-y-auto">
                {mapModel.lanes.map((l) => (
                  <LaneRankRow
                    key={l.id}
                    lane={l}
                    selected={selectedLane === l.id}
                    onSelect={(id) =>
                      setSelectedLane((cur) => (cur === id ? null : id))
                    }
                  />
                ))}
              </div>
            </div>

            {/* Mode legend — bottom-left glass strip, present modes only. */}
            <div className="pointer-events-none absolute bottom-4 left-14 z-[700] hidden md:block">
              <div className={['pointer-events-auto px-3 py-1.5', GLASS_PANEL].join(' ')}>
                {modeLegend}
              </div>
            </div>
          </div>

          {/* Mobile: ranked lanes + legend BELOW the map. */}
          <div className="border-t border-slate-100 md:hidden">
            <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-3">
              <span className="font-display text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Top lanes · origin → gateway
              </span>
              <span className="font-mono ml-auto text-[10px] font-semibold text-slate-400">
                {mapModel.lanes.length}
              </span>
            </div>
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
              {mapModel.lanes.map((l) => (
                <LaneRankRow
                  key={l.id}
                  lane={l}
                  selected={selectedLane === l.id}
                  onSelect={(id) =>
                    setSelectedLane((cur) => (cur === id ? null : id))
                  }
                />
              ))}
            </div>
            <div className="border-t border-slate-100 px-3.5 py-2">{modeLegend}</div>
          </div>
        </div>
      ) : null}

      {/* ── Overview cards — service mix / freight control / terms / regimes /
          gateways / products. ─────────────────────────────────────────── */}
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
        {data.regimes?.length ? (
          <LitSectionCard
            title={cardTitle(<Stamp size={13} />, 'bg-indigo-50 text-indigo-600', 'Customs regimes')}
            sub="Regímenes aduaneros on declarations"
            action={<CountBadge n={data.regimes.length} />}
          >
            <div className="flex flex-wrap gap-1.5">
              {data.regimes.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[12px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                  {r.v}
                  {r.n != null ? <span className="font-mono text-[11px] opacity-70">{r.n}</span> : null}
                </span>
              ))}
            </div>
          </LitSectionCard>
        ) : null}
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
                    {mxFmtUsd(p.usd) ? <span className="font-body shrink-0 text-[10.5px] text-slate-400">{mxFmtUsd(p.usd)}</span> : null}
                    <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{p.n}</span>
                  </div>
                </li>
              ))}
            </ul>
          </LitSectionCard>
        ) : null}
      </div>

      <p className="font-body text-[10.5px] text-slate-400">
        Sourced from Mexican customs declarations (pedimentos) cached by LIT — viewing this profile costs no data credits.
      </p>
    </motion.div>
  );
}
