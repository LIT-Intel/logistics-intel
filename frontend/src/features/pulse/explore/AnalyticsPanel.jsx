// Analytics panel — breakdowns of the current filtered view.
// Reads useExploreInsights output + aggregates top forwarders / opp scores
// from raw rows.

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtMoneyM(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}B`;
  if (v >= 1) return `$${v.toFixed(1)}M`;
  return `$${(v * 1000).toFixed(0)}k`;
}

function Bar({ label, value, max, suffix }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-0.5">
        <span className="truncate text-slate-700">{label}</span>
        <span className="text-slate-500 tabular-nums shrink-0">{suffix ?? value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
        <div className="h-full bg-cyan-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AnalyticsPanel({ rows, insights }) {
  const forwarders = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const list = Array.isArray(r.top_forwarders) ? r.top_forwarders : [];
      for (const f of list) {
        if (!f?.name) continue;
        const k = String(f.name).trim();
        const teu = Number(f.teu ?? 0);
        const entry = m.get(k) ?? { name: k, teu: 0, accounts: 0 };
        entry.teu += Number.isFinite(teu) ? teu : 0;
        entry.accounts += 1;
        m.set(k, entry);
      }
    }
    return [...m.values()].sort((a, b) => b.teu - a.teu).slice(0, 5);
  }, [rows]);

  const oppDist = useMemo(() => {
    const buckets = { '0-19': 0, '20-39': 0, '40-59': 0, '60-79': 0, '80-100': 0 };
    for (const r of rows) {
      const s = r.opportunity_composite_score ?? 0;
      if (s < 20) buckets['0-19']++;
      else if (s < 40) buckets['20-39']++;
      else if (s < 60) buckets['40-59']++;
      else if (s < 80) buckets['60-79']++;
      else buckets['80-100']++;
    }
    return Object.entries(buckets);
  }, [rows]);

  if (!rows.length) {
    return (
      <div className="grid place-items-center h-full text-slate-400 text-sm p-6 text-center">
        <div>
          <BarChart3 size={24} className="mx-auto mb-2 text-slate-300" />
          Run a search first — analytics appear here once accounts load.
        </div>
      </div>
    );
  }

  const maxIndustryCount = insights?.topIndustries?.[0]?.count ?? 1;
  const maxCountryCount = insights?.topCountries?.[0]?.count ?? 1;
  const maxMetroCount = insights?.topMetros?.[0]?.count ?? 1;
  const maxForwarderTeu = forwarders[0]?.teu ?? 1;
  const maxOppCount = Math.max(...oppDist.map(([, n]) => n), 1);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <BarChart3 size={16} /> Analytics
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Live breakdown of the {rows.length.toLocaleString()} accounts in view.</p>
      </header>

      <div className="p-4 space-y-5">
        {/* Top KPIs */}
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded border border-slate-100 p-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Accounts</div>
            <div className="font-semibold text-slate-900 tabular-nums">{fmtNum(insights?.total)}</div>
          </div>
          <div className="rounded border border-slate-100 p-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Total TEU 12m</div>
            <div className="font-semibold text-slate-900 tabular-nums">{fmtNum(insights?.totalTeu)}</div>
          </div>
          <div className="rounded border border-slate-100 p-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Total Shipments</div>
            <div className="font-semibold text-slate-900 tabular-nums">{fmtNum(insights?.totalShipments)}</div>
          </div>
          <div className="rounded border border-slate-100 p-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg Opp Score</div>
            <div className="font-semibold text-slate-900 tabular-nums">{(insights?.avgOpp ?? 0).toFixed(0)}</div>
          </div>
        </section>

        <section>
          <div className="text-xs font-medium text-slate-700 mb-2">Top industries</div>
          <div className="space-y-2">
            {insights?.topIndustries?.slice(0, 5).map((it) => (
              <Bar key={it.label} label={it.label} value={it.count} max={maxIndustryCount} />
            ))}
          </div>
        </section>

        <section>
          <div className="text-xs font-medium text-slate-700 mb-2">Top countries</div>
          <div className="space-y-2">
            {insights?.topCountries?.slice(0, 5).map((it) => (
              <Bar key={it.label} label={it.label} value={it.count} max={maxCountryCount} />
            ))}
          </div>
        </section>

        <section>
          <div className="text-xs font-medium text-slate-700 mb-2">Top metros</div>
          <div className="space-y-2">
            {insights?.topMetros?.slice(0, 5).map((it) => (
              <Bar key={it.label} label={it.label} value={it.count} max={maxMetroCount} />
            ))}
          </div>
        </section>

        {forwarders.length > 0 && (
          <section>
            <div className="text-xs font-medium text-slate-700 mb-2">Top forwarders by TEU</div>
            <div className="space-y-2">
              {forwarders.map((f) => (
                <Bar key={f.name} label={f.name} value={f.teu} max={maxForwarderTeu} suffix={`${fmtNum(f.teu)} TEU`} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="text-xs font-medium text-slate-700 mb-2">Opportunity score distribution</div>
          <div className="space-y-2">
            {oppDist.map(([bucket, n]) => (
              <Bar key={bucket} label={bucket} value={n} max={maxOppCount} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
