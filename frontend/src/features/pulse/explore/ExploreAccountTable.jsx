// V6-style virtualized account table - dense rows, sortable header, Top
// Dimensions column showing the lane chips + a forwarder chip, right-aligned
// numeric columns (TEU Vol., Annual Sales, GP Potential).

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { List } from 'react-virtualized';
import { CheckSquare, Square, ChevronRight } from 'lucide-react';
import 'react-virtualized/styles.css';

const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 36;

// V6 "Estimated Annual Revenue" is stored as a numeric value in millions of
// USD (e.g. "59.64" = $59.64M). We display in that unit to match what users
// see in the V6 source and on company profile pages.
function fmtMoneyM(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}T`; // 1M millions = 1T
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}B`;          // 1k millions = 1B
  if (v >= 1) return `$${v.toFixed(2)}M`;
  if (v >= 0.001) return `$${(v * 1000).toFixed(0)}k`;
  return `$${v.toLocaleString()}`;
}

function fmtInt(n) {
  if (n == null) return '-';
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
  const short = text.length > 18 ? `${text.slice(0, 16)}...` : text;
  return (
    <span className="inline-flex max-w-[170px] items-center gap-1 rounded bg-emerald-50 ring-1 ring-emerald-200 px-1.5 py-0.5 text-[10px] text-emerald-700" title={text}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{short}
    </span>
  );
}

function ForwarderChip({ name }) {
  if (!name) return null;
  const short = name.length > 14 ? `${name.slice(0, 12)}...` : name;
  return (
    <span className="inline-flex max-w-[150px] items-center gap-1 rounded bg-blue-50 ring-1 ring-blue-200 px-1.5 py-0.5 text-[10px] text-blue-700" title={name}>
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
    <div className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden py-1">
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
  { id: 'company', width: 250, label: 'Account', justify: 'left' },
  { id: 'location', width: 190, label: 'Location', justify: 'left' },
  { id: 'industry', width: 170, label: 'Industry', justify: 'left' },
  { id: 'vertical', width: 190, label: 'Vertical', justify: 'left' },
  { id: 'dims', width: 240, label: 'Origin -> Destination', justify: 'left' },
  { id: 'teu', width: 90, label: 'TEU 12m', justify: 'right' },
  { id: 'sales', width: 110, label: 'Annual Sales (US)', justify: 'right' },
  { id: 'opp', width: 90, label: 'Opp Score', justify: 'right' },
  { id: 'fresh', width: 80, label: 'Status', justify: 'center' },
];

function gridTemplate(widths) {
  // Build grid-template-columns from COLUMNS - fixed widths or flex.
  return COLUMNS.map((c) => {
    if (c.id === 'dims') return '370px';
    return c.width ? `${c.width}px` : `${c.flex}fr`;
  }).join(' ');
}

const TABLE_MIN_WIDTH = COLUMNS.reduce((sum, c) => sum + (c.id === 'dims' ? 370 : c.width || 120), 0);

export default function ExploreAccountTable({ rows, selection, onToggle, onRowClick }) {
  const selSet = useMemo(() => new Set(selection ?? []), [selection]);
  const gridCols = useMemo(() => gridTemplate(), []);
  // Body sizing - measure the scroll container directly with a ResizeObserver
  // and hand the virtualized List an explicit pixel height/width. This replaces
  // react-virtualized's AutoSizer, which measured the container ONCE at first
  // paint - before this table's flex-derived height resolved - captured ~1
  // row (ROW_HEIGHT), and never reliably re-measured, leaving a single row in a
  // tall empty panel on short/laptop/mobile viewports. ResizeObserver fires on
  // mount, after the flex/viewport settles, during the drawer open/close
  // transition, and on any window resize, so the row count is always correct at
  // every screen size. (Falls back to a window-resize listener on the rare
  // engine without ResizeObserver.)
  const viewportRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const height = Math.round(rect.height);
      setBodyHeight((prev) => (prev === height ? prev : height));
    };
    measure(); // synchronous first measure so rows paint immediately
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const renderRow = ({ index, key, style }) => {
    const row = rows[index];
    const checked = selSet.has(row.id);
    return (
      <div
        key={key}
        style={{ ...style, width: TABLE_MIN_WIDTH, display: 'grid', gridTemplateColumns: gridCols }}
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
          <span className="font-medium leading-tight text-slate-900 break-words" title={row.company_name}>
            {row.company_name}
          </span>
          <ChevronRight size={12} className="text-slate-300 shrink-0" />
        </div>
        <div className="flex items-center px-2 text-slate-600">
          {[row.city, row.state].filter(Boolean).join(', ') || '-'}
        </div>
        <div className="flex items-center px-2 text-slate-700 truncate">{row.industry ?? '-'}</div>
        <div className="flex items-center px-2 text-slate-700 truncate">{row.vertical ?? '-'}</div>
        <div className="flex items-center px-2 overflow-hidden">
          <TopDimensions row={row} />
        </div>
        <div className="flex items-center justify-end px-2 tabular-nums text-slate-700">
          {fmtInt(row.teu)}
        </div>
        <div
          className="flex items-center justify-end px-2 tabular-nums text-slate-700"
          title="Estimated annual revenue for the US entity (V6). TEU reflects all US-bound shipments; the two can diverge for subsidiaries of global parents."
        >
          {fmtMoneyM(row.revenue != null ? Number(row.revenue) : null)}
        </div>
        <div className="flex items-center justify-end px-2 tabular-nums font-medium text-slate-900">
          {row.opportunity_composite_score?.toFixed(0) ?? '-'}
        </div>
        <div className="flex items-center justify-center">
          <FreshnessChip chip={row.freshness?.chip} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-x-auto bg-white">
      <div className="flex h-full min-w-max flex-col" style={{ width: TABLE_MIN_WIDTH }}>
      {/* Header and body share the same horizontal scroll container. */}
      <div className="flex-none border-b border-slate-200 bg-slate-50">
        <div
          style={{ width: TABLE_MIN_WIDTH, display: 'grid', gridTemplateColumns: gridCols, height: HEADER_HEIGHT }}
          className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide"
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
      {/* Body uses virtual vertical scrolling; the parent owns horizontal scrolling. */}
      </div>
      <div ref={viewportRef} className="flex-1 min-h-0">
        {bodyHeight > 0 && (
          <List
            height={bodyHeight}
            width={TABLE_MIN_WIDTH}
            rowCount={rows.length}
            rowHeight={ROW_HEIGHT}
            rowRenderer={renderRow}
          />
        )}
      </div>
      </div>
    </div>
  );
}
￿ 