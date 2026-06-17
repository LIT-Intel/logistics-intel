// Insights panel — narrative-style summary of the current filter view.
// Computed locally from rows + insights data (no LLM call needed for v1)
// so it's instant and free. Reads like an analyst note.

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtMoneyM(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}B`;
  if (n >= 1) return `$${n.toFixed(1)}M`;
  return `$${(n * 1000).toFixed(0)}k`;
}

function Bullet({ children }) {
  return (
    <li className="text-sm text-slate-700 leading-snug pl-2 border-l-2 border-cyan-200">
      {children}
    </li>
  );
}

export default function InsightsPanel({ rows, insights }) {
  const summary = useMemo(() => {
    if (!rows.length) return null;
    const total = rows.length;
    const totalRev = rows.reduce((a, r) => {
      const v = Number(r.revenue);
      return Number.isFinite(v) ? a + v : a;
    }, 0);
    const totalTeu = insights?.totalTeu ?? 0;
    const directoryCount = rows.filter((r) => !r.data_sources?.includes('live')).length;
    const liveCount = total - directoryCount;
    const topIndustry = insights?.topIndustries?.[0];
    const topMetro = insights?.topMetros?.[0];
    const topCountry = insights?.topCountries?.[0];
    const scored = rows.filter((r) => (r.opportunity_composite_score ?? 0) > 40);
    const topScored = [...rows].sort((a, b) => (b.opportunity_composite_score ?? 0) - (a.opportunity_composite_score ?? 0))[0];
    const opportunityTypes = { consolidation: 0, vulnerable: 0, velocity: 0, defend: 0 };
    for (const r of rows) {
      if ((r.opportunity_consolidation_score ?? 0) >= 40) opportunityTypes.consolidation++;
      if ((r.opportunity_vulnerable_score ?? 0) >= 40) opportunityTypes.vulnerable++;
      if ((r.opportunity_velocity_score ?? 0) >= 40) opportunityTypes.velocity++;
      if ((r.opportunity_defend_score ?? 0) >= 40) opportunityTypes.defend++;
    }
    const topOppType = Object.entries(opportunityTypes).sort((a, b) => b[1] - a[1])[0];

    return {
      total, totalRev, totalTeu, directoryCount, liveCount,
      topIndustry, topMetro, topCountry,
      scored, topScored, topOppType,
    };
  }, [rows, insights]);

  if (!summary) {
    return (
      <div className="grid place-items-center h-full text-slate-400 text-sm p-6 text-center">
        <div>
          <Sparkles size={24} className="mx-auto mb-2 text-slate-300" />
          Run a search first — insights appear here once accounts load.
        </div>
      </div>
    );
  }

  const s = summary;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <Sparkles size={16} className="text-cyan-600" /> Insights
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Narrative breakdown of your current view.</p>
      </header>

      <div className="p-4 space-y-4">
        <p className="text-sm text-slate-700 leading-relaxed">
          You&apos;re looking at <strong>{s.total.toLocaleString()}</strong> accounts representing approximately{' '}
          <strong>{fmtMoneyM(s.totalRev)}</strong> in combined annual revenue and{' '}
          <strong>{fmtNum(s.totalTeu)} TEU</strong> in 12-month shipment volume.
        </p>

        <ul className="space-y-2">
          {s.topIndustry && (
            <Bullet>
              <strong>{s.topIndustry.label}</strong> dominates this view with{' '}
              <strong>{s.topIndustry.count.toLocaleString()}</strong> accounts
              ({Math.round(s.topIndustry.pct * 100)}% of total).
            </Bullet>
          )}
          {s.topMetro && (
            <Bullet>
              Heaviest concentration is in <strong>{s.topMetro.label}</strong> —
              {' '}<strong>{s.topMetro.count.toLocaleString()}</strong> accounts
              ({Math.round(s.topMetro.pct * 100)}% of total).
            </Bullet>
          )}
          {s.topCountry && (
            <Bullet>
              <strong>{Math.round(s.topCountry.pct * 100)}%</strong> of accounts are HQ&apos;d in{' '}
              <strong>{s.topCountry.label}</strong>.
            </Bullet>
          )}
          {s.liveCount > 0 && (
            <Bullet>
              <strong>{s.liveCount.toLocaleString()}</strong> account{s.liveCount === 1 ? ' is' : 's are'} in
              your CRM (Command Center){s.directoryCount > 0 ? ` — the other ${s.directoryCount.toLocaleString()} are directory rows that need to be searched for live data.` : '.'}
            </Bullet>
          )}
          {s.scored.length > 0 && (
            <Bullet>
              <strong>{s.scored.length.toLocaleString()}</strong> accounts have an opportunity score above 40.
              {s.topScored && (
                <> Highest scorer: <strong>{s.topScored.company_name}</strong> at <strong>{Math.round(s.topScored.opportunity_composite_score ?? 0)}/100</strong>.</>
              )}
            </Bullet>
          )}
          {s.topOppType?.[1] > 0 && (
            <Bullet>
              The most common opportunity signal here is{' '}
              <strong>{s.topOppType[0]}</strong> ({s.topOppType[1].toLocaleString()} accounts).
            </Bullet>
          )}
        </ul>

        <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500">
          Insights compute locally from your filter view. No LLM call.
          Future versions will add narrative comparisons across saved views.
        </div>
      </div>
    </div>
  );
}
