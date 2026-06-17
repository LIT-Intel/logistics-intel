// Mobile card-list view for the Pulse Explorer accounts.
// Replaces the virtualized table when viewport < md. Each row renders
// as a stacked card with company / location / lane chip / KPIs / opp
// score / freshness chip — the same info as the table, just laid out
// for thumbs.

import { useMemo } from 'react';
import { CheckSquare, Square, ChevronRight } from 'lucide-react';

function fmtMoneyM(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}B`;
  if (v >= 1) return `$${v.toFixed(2)}M`;
  return `$${(v * 1000).toFixed(0)}k`;
}

function fmtInt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

function FreshnessChip({ chip }) {
  const map = {
    live: ['bg-emerald-100 text-emerald-700 ring-emerald-200', 'Live'],
    saved: ['bg-amber-100 text-amber-700 ring-amber-200', 'Saved'],
    directory: ['bg-slate-100 text-slate-500 ring-slate-200', 'Directory'],
  };
  const [klass, label] = map[chip] ?? map.directory;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${klass}`}>{label}</span>;
}

function laneText(row) {
  const lanes = Array.isArray(row.top_dimensions) ? row.top_dimensions : [];
  const first = lanes[0];
  if (!first) return null;
  return typeof first === 'string' ? first : (first?.lane ?? first?.route ?? null);
}

export default function ExploreAccountCards({ rows, selection, onToggle, onRowClick }) {
  const selSet = useMemo(() => new Set(selection ?? []), [selection]);

  if (!rows?.length) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center text-slate-400 text-sm">
        No accounts to show
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <ul className="divide-y divide-slate-200">
        {rows.map((row) => {
          const checked = selSet.has(row.id);
          const lane = laneText(row);
          return (
            <li
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className="bg-white px-3 py-2.5 flex items-start gap-2 active:bg-cyan-50/50"
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle?.(row.id); }}
                className="mt-0.5 text-slate-500"
                aria-label={checked ? 'Deselect' : 'Select'}
              >
                {checked ? <CheckSquare size={16} className="text-cyan-600" /> : <Square size={16} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-slate-900 truncate">{row.company_name}</span>
                  <FreshnessChip chip={row.freshness?.chip} />
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {[row.city, row.state, row.country].filter(Boolean).join(' · ') || '—'}
                  {row.industry ? <> · {row.industry}</> : null}
                </div>
                {lane && (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-emerald-50 ring-1 ring-emerald-200 px-1.5 py-0.5 text-[10px] text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{lane}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-slate-600">
                  <span><strong className="text-slate-900">{fmtInt(row.teu)}</strong> TEU</span>
                  <span><strong className="text-slate-900">{fmtMoneyM(row.revenue != null ? Number(row.revenue) : null)}</strong> sales</span>
                  <span><strong className="text-slate-900">{row.opportunity_composite_score?.toFixed(0) ?? '—'}</strong> opp</span>
                </div>
              </div>
              <ChevronRight size={14} className="text-slate-300 shrink-0 mt-1" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
