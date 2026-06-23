// In-results filter bar — narrows the already-fetched account rows CLIENT-SIDE
// (instant, no re-query). The server search builds the candidate set; this lets
// the user refine within it by location / industry / size / status.

import { useMemo } from 'react';
import { Filter, X } from 'lucide-react';

const EMPTY = {};

// Pure filter applied to the in-memory rows. Exported so the parent can compute
// the displayed/selectable set from the same predicate.
export function applyResultsFilter(rows, f) {
  if (!f || Object.keys(f).length === 0) return rows;
  const q = (f.q || '').trim().toLowerCase();
  const teuMin = f.teuMin ? Number(f.teuMin) : null;
  const oppMin = f.oppMin ? Number(f.oppMin) : null;
  const lane = (f.lane || '').trim().toLowerCase();
  const fwd = (f.forwarder || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !(r.company_name || '').toLowerCase().includes(q)) return false;
    if (f.state && r.state !== f.state) return false;
    if (f.industry && r.industry !== f.industry) return false;
    if (teuMin != null && !(Number(r.teu) >= teuMin)) return false;
    if (oppMin != null && !(Number(r.opportunity_composite_score) >= oppMin)) return false;
    if (f.fresh && (r.freshness?.chip ?? 'directory') !== f.fresh) return false;
    // Trade lane / route — match the company's top_dimensions lane strings
    // ("Origin - Destination", e.g. "Shanghai - Los Angeles, California").
    // Substring match works for any port or city named in the lane.
    if (lane) {
      const dims = Array.isArray(r.top_dimensions) ? r.top_dimensions : [];
      if (!dims.some((d) => String(d?.lane ?? '').toLowerCase().includes(lane))) return false;
    }
    // Forwarder — match the company's top_forwarders names.
    if (fwd) {
      const tf = Array.isArray(r.top_forwarders) ? r.top_forwarders : [];
      if (!tf.some((x) => String(x?.name ?? x ?? '').toLowerCase().includes(fwd))) return false;
    }
    return true;
  });
}

export function hasResultsFilter(f) {
  return !!f && Object.values(f).some((v) => v != null && v !== '');
}

// Distinct, sorted, non-empty values for a row field — drives the dropdowns.
function facet(rows, key) {
  const counts = new Map();
  for (const r of rows) {
    const v = r[key];
    if (v == null || v === '') continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([v, n]) => ({ value: v, count: n }));
}

const selCls =
  'h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 ' +
  'focus:border-cyan-400 focus:outline-none max-w-[140px]';
const numCls =
  'h-7 w-[78px] rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 ' +
  'tabular-nums focus:border-cyan-400 focus:outline-none';

export default function ResultsFilterBar({ rows, filter, setFilter, shownCount }) {
  const states = useMemo(() => facet(rows, 'state'), [rows]);
  const industries = useMemo(() => facet(rows, 'industry'), [rows]);
  const set = (patch) => setFilter((prev) => ({ ...(prev || EMPTY), ...patch }));
  const active = hasResultsFilter(filter);
  const f = filter || EMPTY;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Filter size={12} /> Filter
      </span>

      <input
        type="text"
        value={f.q ?? ''}
        onChange={(e) => set({ q: e.target.value })}
        placeholder="Company name…"
        className="h-7 w-[150px] rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
      />

      <select value={f.state ?? ''} onChange={(e) => set({ state: e.target.value })} className={selCls} title="State">
        <option value="">All states</option>
        {states.map((s) => (
          <option key={s.value} value={s.value}>{s.value} ({s.count})</option>
        ))}
      </select>

      <select value={f.industry ?? ''} onChange={(e) => set({ industry: e.target.value })} className={selCls} title="Industry">
        <option value="">All industries</option>
        {industries.map((s) => (
          <option key={s.value} value={s.value}>{s.value} ({s.count})</option>
        ))}
      </select>

      <input
        type="number" min="0" value={f.teuMin ?? ''}
        onChange={(e) => set({ teuMin: e.target.value })}
        placeholder="Min TEU" className={numCls} title="Minimum TEU (12m)"
      />
      <input
        type="number" min="0" max="100" value={f.oppMin ?? ''}
        onChange={(e) => set({ oppMin: e.target.value })}
        placeholder="Min Opp" className={numCls} title="Minimum opportunity score"
      />

      <input
        type="text"
        value={f.lane ?? ''}
        onChange={(e) => set({ lane: e.target.value })}
        placeholder="Lane / port…"
        title="Trade lane — match any origin/destination port or city in the company's routes (e.g. Shanghai, Los Angeles)"
        className="h-7 w-[120px] rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
      />

      <input
        type="text"
        value={f.forwarder ?? ''}
        onChange={(e) => set({ forwarder: e.target.value })}
        placeholder="Forwarder…"
        title="Match a freight forwarder in the company's top forwarders"
        className="h-7 w-[110px] rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
      />

      <select value={f.fresh ?? ''} onChange={(e) => set({ fresh: e.target.value })} className={selCls} title="Status">
        <option value="">Any status</option>
        <option value="live">Live</option>
        <option value="saved">Saved</option>
        <option value="directory">Directory</option>
      </select>

      <span className="ml-auto text-[11px] tabular-nums text-slate-500">
        {shownCount.toLocaleString()} shown
      </span>
      {active && (
        <button
          type="button"
          onClick={() => setFilter({})}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={12} /> Clear
        </button>
      )}
    </div>
  );
}
