import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-md border border-slate-100 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function TopList({ title, items }) {
  if (!items?.length) return null;
  return (
    <section>
      <div className="text-xs font-medium text-slate-700 mb-2">{title}</div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between text-xs text-slate-600">
            <span className="truncate">{it.label}</span>
            <span className="ml-2 text-slate-400">{(it.pct * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function TopInsightsRail({ insights }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start h-10 w-6 border-r border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50"
        aria-label="Open insights"
      >
        <ChevronRight size={16} />
      </button>
    );
  }
  if (!insights) {
    return (
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white p-4 text-sm text-slate-500">
        No data in current view.
      </aside>
    );
  }
  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-sm">Top Insights</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close insights">
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className="px-4 py-3 space-y-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <section>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Kpi label="Accounts" value={fmtNum(insights.total)} />
            <Kpi label="Avg Opp" value={insights.avgOpp.toFixed(0)} />
            <Kpi label="TEU 12m" value={fmtNum(insights.totalTeu)} />
            <Kpi label="Shipments 12m" value={fmtNum(insights.totalShipments)} />
          </div>
        </section>
        <TopList title="Top industries" items={insights.topIndustries} />
        <TopList title="Top countries" items={insights.topCountries} />
        <TopList title="Top metros" items={insights.topMetros} />
      </div>
    </aside>
  );
}
