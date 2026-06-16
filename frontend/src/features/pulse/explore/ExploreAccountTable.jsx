// V6-style virtualized account table — dense rows, sortable header, Top
// Dimensions column showing the lane chips + a forwarder chip, right-aligned
// numeric columns (TEU Vol., Annual Sales, GP Potential).

import { useMemo } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import { CheckSquare, Square, ChevronRight } from 'lucide-react';
import 'react-virtualized/styles.css';

const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 32;

function fmtMoney(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(1)}T`;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toLocaleString()}`;
}

function fmtInt(n) {
  if (n == null) return '—';
  return n.toLocaleString();
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

function LaneChip({ lane }) {
  const text = typeof lane === 'string' ? lane : lane?.lane ?? lane?.route ?? '';
  if (!text) return null;
  const short = text.length > 18 ? `${text.slice(0, 16)}…` : text;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 ring-1 ring-emerald-200 px-1.5 py-0.5 text-[10px] text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{short}
    </span>
  );
}

function ForwarderChip({ name }) {
  if (!name) return null;
  const short = name.length > 14 ? `${name.slice(0, 12)}…` : name;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-blue-50 ring-1 ring-blue-200 px-1.5 py-0.5 text-[10px] text-blue-700">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{short}
    </span>
  );
}

function TopDimensions({ row }) {
  const lanes = Array.isArray(row.top_dimensions) ? row.top_dimensions.slice(0, 2) : [];
  const forwarders = Array.isArray(row.top_forwarders) ? row.top_forwarders.slice(0, 1) : [];
  const extras = (Array.isArray(row.top_dimensions) ? row.top_dimensions.length - lanes.length : 0)
    + (Array.isArray(row.top_forwarders) ? row.top_forwarders.length - forwarders.length : 0);
  return (
    <div className="flex items-center gap-1 overflow-hidden">
      {lanes.map((l, i) => <LaneChip key={`l${i}`} lane={l} />)}
      {forwarders.map((f, i) => <ForwarderChip key={`f${i}`} name={f.name} />)}
      {extras > 0 && (
        <span className="text-[10px] text-slate-400">+{extras}</span>
      )}
    </div>
  );
}

const COLUMNS = [
  { id: 'select', width: 36, label: '', justify: 'center' },
  { id: 'company', flex: 1.4, label: 'Account', justify: 'left' },
  { id: 'location', flex: 1.2, label: 'Location', justify: 'left' },
  { id: 'industry', flex: 1, label: 'Industry', justify: 'left' },
  { id: 'vertical', flex: 1, label: 'Vertical', justify: 'left' },
  { id: 'dims', width: 220, label: 'Top Dimensions', justify: 'left' },
  { id: 'teu', width: 90, label: 'TEU Vol.', justify: 'right' },
  { id: 'sales', width: 100, label: 'Annual Sales', justify: 'right' },
  { id: 'opp', width: 90, label: 'Opp Score', justify: 'right' },
  { id: 'fresh', width: 80, label: 'Status', justify: 'center' },
];

function gridTemplate(widths) {
  // Build grid-template-columns from COLUMNS — fixed widths or flex.
  return COLUMNS.map((c) => c.width ? `${c.width}px` : `${c.flex}fr`).join(' ');
}

export default function ExploreAccountTable({ rows, selection, onToggle, onRowClick }) {
  const selSet = useMemo(() => new Set(selection ?? []), [selection]);
  const gridCols = useMemo(() => gridTemplate(), []);

  const renderRow = ({ index, key, style }) => {
    const row = rows[index];
    const checked = selSet.has(row.id);
    return (
      <div
        key={key}
        style={{ ...style, display: 'grid', gridTemplateColumns: gridCols }}
        className="border-b border-slate-100 hover:bg-cyan-50/30 cursor-pointer text-sm"
        onClick={() => onRowClick?.(row)}
      >
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle?.(row.id); }}
            className="text-slate-500"
            aria-label={checked ? 'Deselect' : 'Select'}
          >
            {checked ? <CheckSquare size={14} className="text-cyan-600" /> : <Square size={14} />}
          </button>
        </div>
        <div className="flex items-center px-2 gap-1.5 min-w-0">
          <span className="font-medium text-slate-900 truncate">{row.company_name}</span>
          <ChevronRight size={12} className="text-slate-300 shrink-0" />
        </div>
        <div className="flex items-center px-2 text-slate-600 truncate">
          {[row.city, row.state].filter(Boolean).join(', ') || '—'}
        </div>
        <div className="flex items-center px-2 text-slate-700 truncate">{row.industry ?? '—'}</div>
        <div className="flex items-center px-2 text-slate-700 truncate">{row.vertical ?? '—'}</div>
        <div className="flex items-center px-2 overflow-hidden">
          <TopDimensions row={row} />
        </div>
        <div className="flex items-center justify-end px-2 tabular-nums text-slate-700">
          {fmtInt(row.teu)}
        </div>
        <div className="flex items-center justify-end px-2 tabular-nums text-slate-700">
          {fmtMoney(row.value_usd != null ? row.value_usd : (row.revenue != null ? Number(row.revenue) : null))}
        </div>
        <div className="flex items-center justify-end px-2 tabular-nums font-medium text-slate-900">
          {row.opportunity_composite_score?.toFixed(0) ?? '—'}
        </div>
        <div className="flex items-center justify-center">
          <FreshnessChip chip={row.freshness?.chip} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      {/* Header */}
      <div
        style={{ display: 'grid', gridTemplateColumns: gridCols, height: HEADER_HEIGHT }}
        className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wide"
      >
        {COLUMNS.map((c) => (
          <div
            key={c.id}
            className={`flex items-center px-2 ${c.justify === 'right' ? 'justify-end' : c.justify === 'center' ? 'justify-center' : ''}`}
          >
            {c.label}
          </div>
        ))}
      </div>
      {/* Body */}
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
    </div>
  );
}
