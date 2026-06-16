// Virtualized account table — mirrors the map's filtered + selected state.

import { AutoSizer, List } from 'react-virtualized';
import { CheckSquare, Square } from 'lucide-react';
import 'react-virtualized/styles.css';

const ROW_HEIGHT = 44;

function FreshnessChip({ chip }) {
  const map = {
    live: ['bg-emerald-50 text-emerald-700', 'Live'],
    saved: ['bg-amber-50 text-amber-700', 'Saved'],
    directory: ['bg-slate-100 text-slate-600', 'Directory'],
  };
  const [klass, label] = map[chip] ?? map.directory;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${klass}`}>{label}</span>;
}

export default function ExploreAccountTable({ rows, selection, onToggle, onRowClick }) {
  const selSet = new Set(selection ?? []);

  const renderRow = ({ index, key, style }) => {
    const row = rows[index];
    const checked = selSet.has(row.id);
    return (
      <div
        key={key}
        style={style}
        className="flex items-center gap-3 border-b border-slate-100 px-3 hover:bg-slate-50 cursor-pointer"
        onClick={() => onRowClick?.(row)}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle?.(row.id); }}
          className="text-slate-500"
          aria-label={checked ? 'Deselect' : 'Select'}
        >
          {checked ? <CheckSquare size={14} className="text-cyan-600" /> : <Square size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{row.company_name}</div>
          <div className="text-xs text-slate-500 truncate">
            {[row.city, row.state, row.country].filter(Boolean).join(', ')} · {row.industry ?? '—'}
          </div>
        </div>
        <div className="text-xs tabular-nums text-slate-600">{(row.teu ?? 0).toLocaleString()} TEU</div>
        <div className="text-xs tabular-nums text-slate-600">
          {(row.opportunity_composite_score ?? 0).toFixed(0)} Opp
        </div>
        <FreshnessChip chip={row.freshness?.chip} />
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0">
      <AutoSizer>
        {({ height, width }) => (
          <List
            height={height}
            width={width}
            rowCount={rows.length}
            rowHeight={ROW_HEIGHT}
            rowRenderer={renderRow}
          />
        )}
      </AutoSizer>
    </div>
  );
}
