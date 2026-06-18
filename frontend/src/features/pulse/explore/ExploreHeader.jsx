// V6-style top chrome — dark navy header with search + mode toggle, then
// a dense KPI strip below. Responsive: stacks the title above the search
// on small screens, hides text labels in the mode toggle below sm.

import { Search, Sparkles } from 'lucide-react';

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

// V6 Annual Revenue is stored in millions of USD. The KPI strip receives
// the sum of those values, so 8,190 (millions) renders as $8.19B.
function fmtCurrencyMillions(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n); // value is already in millions
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}T`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}B`;
  if (v >= 1) return `$${v.toFixed(1)}M`;
  return `$${v.toFixed(2)}M`;
}

function ModeToggle({ value, onChange }) {
  // LIT-branded names (not DSV's "Bubbles / Heat / Clusters").
  // - Map: standard pins with auto-cluster only at far-out zoom
  // - Heat: density gradient overlay (no pins)
  // - Region: aggregate counts by metro/state (pins always grouped)
  const modes = [
    { id: 'bubbles', label: 'Map', icon: '●' },
    { id: 'heat', label: 'Heat', icon: '◉' },
    { id: 'clusters', label: 'Region', icon: '◎' },
  ];
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-slate-700 shrink-0">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          title={m.label}
          aria-label={m.label}
          className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium transition flex items-center gap-1.5 ${
            value === m.id
              ? 'bg-slate-900 text-cyan-300'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span className="text-[10px]">{m.icon}</span>
          <span className="hidden sm:inline">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function ExploreHeader({
  query, onQuery, onSubmit,
  totals,
  mapMode, onMapMode,
}) {
  const totalAccounts = totals?.total ?? 0;
  const totalSales = totals?.totalAnnualSales ?? 0;
  const totalTeu = totals?.totalTeu ?? 0;

  return (
    <header className="bg-[#0F1828] text-slate-100 border-b border-slate-800/60 shadow-sm">
      {/* Top bar — wraps on small screens so the search input has room */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2 sm:py-2.5">
        <div className="flex items-center gap-2 font-display shrink-0">
          <Sparkles className="text-cyan-400" size={18} />
          <span className="font-semibold text-sm tracking-tight whitespace-nowrap">Pulse Explorer</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 uppercase tracking-wider">V2</span>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
          className="order-3 sm:order-2 w-full sm:flex-1 sm:max-w-2xl relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            value={query ?? ''}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search accounts..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </form>
        <div className="order-2 sm:order-3 ml-auto">
          <ModeToggle value={mapMode ?? 'bubbles'} onChange={onMapMode ?? (() => {})} />
        </div>
      </div>

      {/* KPI strip — wraps on mobile, lets values keep their size */}
      <div className="flex flex-wrap items-baseline gap-x-5 sm:gap-x-8 gap-y-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-950/30 border-t border-slate-800/40">
        <Kpi label="accounts" value={fmtNum(totalAccounts)} />
        <Kpi label="annual sales" value={fmtCurrencyMillions(totalSales)} />
        <Kpi label="TEU 12m" value={fmtNum(totalTeu)} />
      </div>
    </header>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg sm:text-xl font-semibold tabular-nums text-slate-100">{value}</span>
      <span className="text-[11px] text-slate-400 uppercase tracking-wide whitespace-nowrap">{label}</span>
    </div>
  );
}
