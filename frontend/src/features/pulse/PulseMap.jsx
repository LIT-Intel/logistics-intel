// PulseMap — globe-backed visualization of the trade lanes implied by
// the user's parsed Pulse query. Reuses the existing GlobeCanvas
// component (orthographic projection, palette, flag pins) and turns
// parsed.origins → parsed.destinations into a GlobeLane array the
// canvas can render.
//
// Only mounts when the parser found a freight intent (direction OR
// origin/destination locations). Plain "find SaaS in Texas" queries
// don't waste vertical space on a globe.

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Globe, MapPin, Sparkles } from 'lucide-react';
import GlobeCanvas from '@/components/GlobeCanvas';
import { COUNTRY_COORDS, flagFromCode } from '@/lib/laneGlobe';

// US state centroids — enough precision to make a lane's destination
// land on the right region of the country. Sourced from public
// geographic centers; not navigation-grade but visually correct.
const US_STATE_CENTROIDS = {
  AL: [-86.79, 32.81], AK: [-152.40, 64.20], AZ: [-111.43, 34.17],
  AR: [-92.43, 34.97], CA: [-119.62, 37.18], CO: [-105.55, 38.99],
  CT: [-72.74, 41.62], DE: [-75.51, 38.99], FL: [-81.60, 27.77],
  GA: [-83.64, 32.99], HI: [-156.97, 20.79], ID: [-114.48, 44.24],
  IL: [-89.20, 40.12], IN: [-86.28, 39.89], IA: [-93.21, 42.07],
  KS: [-98.38, 38.49], KY: [-84.86, 37.65], LA: [-91.87, 31.07],
  ME: [-69.39, 45.37], MD: [-76.79, 39.04], MA: [-71.81, 42.26],
  MI: [-84.71, 44.34], MN: [-94.32, 46.28], MS: [-89.66, 32.74],
  MO: [-92.46, 38.36], MT: [-109.62, 47.05], NE: [-99.78, 41.53],
  NV: [-117.05, 38.50], NH: [-71.58, 43.45], NJ: [-74.52, 40.30],
  NM: [-106.26, 34.41], NY: [-75.53, 42.95], NC: [-79.81, 35.55],
  ND: [-100.32, 47.45], OH: [-82.79, 40.29], OK: [-97.49, 35.57],
  OR: [-122.07, 44.57], PA: [-77.21, 40.59], RI: [-71.51, 41.68],
  SC: [-80.95, 33.86], SD: [-100.23, 44.30], TN: [-86.69, 35.75],
  TX: [-99.34, 31.05], UT: [-111.86, 40.15], VT: [-72.71, 44.07],
  VA: [-78.17, 37.77], WA: [-121.51, 47.40], WV: [-80.62, 38.49],
  WI: [-89.62, 44.27], WY: [-107.30, 42.99],
};

// US metros (port cities) — when user says "import to Atlanta" we
// want the lane to land on Atlanta itself, not the GA state centroid.
const US_METRO_COORDS = {
  LAX: [-118.41, 33.94], LGB: [-118.16, 33.77], NYC: [-74.01, 40.71],
  ATL: [-84.43, 33.65], SAV: [-81.10, 32.08], HOU: [-95.28, 29.99],
  SEA: [-122.31, 47.45], MIA: [-80.29, 25.79], CHI: [-87.91, 41.97],
  DFW: [-97.04, 32.90], SFO: [-122.37, 37.62], BOS: [-71.01, 42.36],
};

// Resolve a parsed location entity to [lng, lat] coordinates.
function resolveCoords(loc) {
  if (!loc) return null;
  if (loc.kind === 'country') {
    return COUNTRY_COORDS[loc.name.toLowerCase()] || null;
  }
  if (loc.kind === 'us_state') {
    return US_STATE_CENTROIDS[loc.code] || null;
  }
  if (loc.kind === 'metro') {
    return US_METRO_COORDS[loc.code] || null;
  }
  return null;
}

function buildLanes(parsed) {
  if (!parsed?.hasAny) return [];
  const lanes = [];
  const origins = parsed.origins?.length
    ? parsed.origins
    // Fallback: if no from/to was parsed but we have generic country hits,
    // treat the first as origin
    : (parsed.countries || []).slice(0, 1);
  const destinations = parsed.destinations?.length
    ? parsed.destinations
    : [
        ...(parsed.states || []),
        ...(parsed.metros || []),
        ...(parsed.countries || []).slice(parsed.origins?.length ? 0 : 1, 3),
      ];

  for (const o of origins) {
    const oc = resolveCoords(o);
    if (!oc) continue;
    for (const d of destinations) {
      const dc = resolveCoords(d);
      if (!dc) continue;
      const fromLabel = o.name;
      const toLabel = d.name;
      lanes.push({
        id: `${fromLabel}→${toLabel}`,
        from: fromLabel,
        to: toLabel,
        coords: [oc, dc],
        fromMeta: {
          label: fromLabel,
          canonicalKey: fromLabel.toLowerCase(),
          countryName: o.kind === 'country' ? o.name : 'United States',
          countryCode: o.kind === 'country' ? o.code : 'US',
          flag: flagFromCode(o.kind === 'country' ? o.code : 'US'),
          coords: oc,
        },
        toMeta: {
          label: toLabel,
          canonicalKey: toLabel.toLowerCase(),
          countryName: d.kind === 'country' ? d.name : 'United States',
          countryCode: d.kind === 'country' ? d.code : 'US',
          flag: flagFromCode(d.kind === 'country' ? d.code : 'US'),
          coords: dc,
        },
      });
    }
  }
  return lanes;
}

export default function PulseMap({ parsed, results }) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedLaneId, setSelectedLaneId] = useState(null);

  const lanes = useMemo(() => buildLanes(parsed), [parsed]);
  const primary = lanes[0];

  // Only render when there's something to show
  if (!lanes.length) return null;

  const resultsInDb = (results || []).filter(
    (r) => r.provenance === 'database' || r.alsoLive,
  ).length;

  return (
    <section
      className="relative mt-3 overflow-hidden rounded-[14px] border"
      style={{
        background: 'linear-gradient(160deg, #0E2F66 0%, #102240 60%, #0F172A 100%)',
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 6px 22px rgba(15,23,42,0.20)',
      }}
    >
      {/* Cyan/amber halo to match Pulse Coach + trade theme */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.18), transparent 70%)' }}
      />

      {/* Header */}
      <div className="relative flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md border"
          style={{ background: 'rgba(0,240,255,0.12)', borderColor: 'rgba(0,240,255,0.35)' }}
        >
          <Globe className="h-3 w-3" style={{ color: '#00F0FF' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em]"
            style={{ color: '#00F0FF' }}
          >
            Trade lane visualization
          </div>
          <div className="font-body mt-0.5 truncate text-[11.5px] text-slate-200">
            {lanes.length === 1
              ? `${primary.fromMeta.flag} ${primary.from} → ${primary.toMeta.flag} ${primary.to}`
              : `${lanes.length} lanes — ${lanes
                  .slice(0, 3)
                  .map((l) => `${l.fromMeta.flag} ${l.from} → ${l.toMeta.flag} ${l.to}`)
                  .join(' · ')}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand globe' : 'Collapse globe'}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white/5 hover:text-slate-200"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Body */}
      {!collapsed ? (
        <div className="relative grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[auto_1fr]">
          <div className="flex justify-center">
            <GlobeCanvas
              lanes={lanes}
              selectedLane={selectedLaneId || lanes[0].id}
              size={300}
              theme="trade"
              showFlagPins
            />
          </div>

          <div className="flex flex-col gap-2">
            <div
              className="font-display text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ color: '#7DD3FC' }}
            >
              Lanes detected ({lanes.length})
            </div>
            <ul className="flex flex-col gap-1">
              {lanes.map((lane) => {
                const active = (selectedLaneId || lanes[0].id) === lane.id;
                return (
                  <li key={lane.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedLaneId(lane.id)}
                      className={[
                        'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition',
                        active
                          ? 'border-cyan-300/40'
                          : 'border-white/5 hover:border-white/15',
                      ].join(' ')}
                      style={{ background: active ? 'rgba(0,240,255,0.08)' : 'rgba(255,255,255,0.02)' }}
                    >
                      <span className="font-body text-[14px]">{lane.fromMeta.flag}</span>
                      <span className="font-body text-[11.5px] text-slate-200">{lane.from}</span>
                      <span className="font-mono text-[10px] text-slate-500">→</span>
                      <span className="font-body text-[14px]">{lane.toMeta.flag}</span>
                      <span className="font-body truncate text-[11.5px] text-slate-200">{lane.to}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Footnote — what the user can actually see */}
            <div className="mt-1 flex items-start gap-1.5 border-t border-white/5 pt-2 text-[10.5px] text-slate-400">
              <Sparkles className="mt-0.5 h-2.5 w-2.5 shrink-0" style={{ color: '#7DD3FC' }} />
              <span>
                {resultsInDb > 0
                  ? `${resultsInDb} of your saved companies match this lane.`
                  : 'Run the search to see which companies move freight on these lanes.'}
              </span>
            </div>

            {/* Flag legend */}
            {lanes.length === 1 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                <FlagPill meta={lanes[0].fromMeta} role="origin" />
                <FlagPill meta={lanes[0].toMeta} role="destination" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FlagPill({ meta, role }) {
  return (
    <span
      className="font-display inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.10)',
        color: '#E2E8F0',
      }}
    >
      <span className="text-[12px]">{meta.flag || <MapPin className="h-2.5 w-2.5" />}</span>
      <span className="text-slate-400">
        {role === 'origin' ? 'From' : 'To'}
      </span>
      <span className="font-semibold">{meta.label}</span>
    </span>
  );
}
