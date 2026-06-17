// V6-style top chrome — dark navy header with search + mode toggle, then
// a dense KPI strip below. Matches the DSV Sales Explorer V6 reference
// shared in the spec's screenshots folder.

import { Search, Sparkles } from 'lucide-react';

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtCurrency(n) {
  if (n == null) return '—';
  return `$${fmtNum(n)}`;
}

function ModeToggle({ value, onChange }) {
  const modes = [
    { id: 'bubbles', label: 'Bubbles', icon: '●' },
    { id: 'heat', label: 'Heat', icon: '◉' },
    { id: 'clusters', label: 'Clusters', icon: '◎' },
  ];
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-slate-700">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`px-3 py-1.5 text-xs font-medium transition flex items-center gap-1.5 ${
            value === m.id
              ? 'bg-slate-900 text-cyan-300'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span className="text-[10px]">{m.icon}</span>{m.label}
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
  const totalGp = totals?.totalGpPotential ?? 0;

  return (
    <header className="bg-[#0F1828] text-slate-100 border-b border-slate-800/60 shadow-sm">
      {/* Top bar — title + search + mode toggle */}
      <div className="flex items-center gap-4 px-4 py-2.5">
        <div className="flex items-center gap-2 font-display">
          <Sparkles className="text-cyan-400" size={18} />
          <span className="font-semibold text-sm tracking-tight">Pulse Explorer</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 uppercase tracking-wider">V1</span>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
          className="flex-1 max-w-2xl relative"
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
        <ModeToggle value={mapMode ?? 'bubbles'} onChange={onMapMode ?? (() => {})} />
      </div>

      {/* KPI strip */}
      <div className="flex items-baseline gap-8 px-4 py-2.5 bg-slate-950/30 border-t border-slate-800/40">
        <Kpi label="accounts" value={fmtNum(totalAccounts)} />
        <Kpi label="annual sales" value={fmtCurrency(totalSales)} />
        <Kpi label="GP potential" value={fmtCurrency(totalGp)} />
      </div>
    </header>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xl font-semibold tabular-nums text-slate-100">{value}</span>
      <span className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}
