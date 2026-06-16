// PulseExploreTab — V6-styled Pulse Explorer page.
// Layout:
//   - ExploreHeader (top): dark navy bar with title + search + mode toggle, KPI strip below
//   - ExploreSidebar (left, 48px): filter/bookmark/layers/analytics/etc icon strip
//   - FilterChipRow: V6-style cyan-tinted active filter pills
//   - Center: map (top half) + virtualized account table (bottom half)
//   - IndustryLegendOverlay: floating card on map showing industry counts
//   - ExploreMapTools: floating bottom-left map tool buttons (select/draw/lasso)
//   - Right rail: PulseQuickCard when a bubble is clicked

import { useState, useCallback, useMemo } from 'react';
import { useExploreState } from './useExploreState';
import { useExploreAccounts } from './useExploreAccounts';
import { useExploreInsights } from './useExploreInsights';
import ExploreHeader from './ExploreHeader';
import ExploreSidebar from './ExploreSidebar';
import FilterChipRow from './FilterChipRow';
import IndustryLegendOverlay from './IndustryLegendOverlay';
import ExploreMapTools from './ExploreMapTools';
import ExploreMap from './ExploreMap';
import ExploreAccountTable from './ExploreAccountTable';
import PulseQuickCard from '@/features/pulse/PulseQuickCard';

export default function PulseExploreTab() {
  const { state, setFilters, setColor, setSize, setSelection } = useExploreState();
  const [query, setQuery] = useState('');
  const [activeRow, setActiveRow] = useState(null);
  const [sidebarTool, setSidebarTool] = useState('filter');
  const [mapTool, setMapTool] = useState('select');
  const [mapMode, setMapMode] = useState('bubbles');
  const [legendOpen, setLegendOpen] = useState(true);
  const { data, isLoading, error } = useExploreAccounts(state.filters, null);
  const rows = data?.rows ?? [];
  const insights = useExploreInsights(rows);

  // KPI totals (sum across current filtered view).
  const headerTotals = useMemo(() => {
    if (!rows.length) return { total: 0, totalAnnualSales: 0, totalGpPotential: 0 };
    let totalAnnualSales = 0;
    let totalGpPotential = 0;
    for (const r of rows) {
      // V6 ingest writes `revenue` as text — parse to number where possible.
      const rev = typeof r.revenue === 'string' ? parseFloat(r.revenue) : (r.revenue ?? 0);
      if (Number.isFinite(rev)) totalAnnualSales += rev * 1_000_000_000; // V6 revenue is in billions (e.g. "385.6" = $385.6B)
      const gp = r.gp_potential ?? 0;
      if (Number.isFinite(gp)) totalGpPotential += gp;
    }
    return { total: rows.length, totalAnnualSales, totalGpPotential };
  }, [rows]);

  const toggleSelection = useCallback((id) => {
    const cur = new Set(state.selection ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setSelection(Array.from(cur));
  }, [state.selection, setSelection]);

  const handleIndustryClick = useCallback((industry) => {
    const cur = new Set(state.filters?.industry ?? []);
    if (cur.has(industry)) cur.delete(industry); else cur.add(industry);
    setFilters({ ...state.filters, industry: Array.from(cur) });
  }, [state.filters, setFilters]);

  const activeIndustry = state.filters?.industry?.[0];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <ExploreHeader
        query={query}
        onQuery={setQuery}
        onSubmit={() => { /* NL parse wires in Phase 3B */ }}
        totals={headerTotals}
        mapMode={mapMode}
        onMapMode={setMapMode}
      />
      <FilterChipRow filters={state.filters} onChange={setFilters} />
      <div className="flex flex-1 min-h-0">
        <ExploreSidebar active={sidebarTool} onSelect={setSidebarTool} />
        <div className="flex-1 min-w-0 min-h-0 relative flex flex-col">
          {isLoading && (
            <div className="absolute inset-0 grid place-items-center bg-white/60 text-slate-500 text-sm z-10">
              Loading…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 grid place-items-center text-red-600 text-sm z-10">
              Failed to load: {String(error.message)}
            </div>
          )}
          <div className="h-1/2 border-b border-slate-200 relative">
            <ExploreMap
              rows={rows}
              colorMode={state.color}
              sizeMode={state.size}
              selection={state.selection}
              onBubbleClick={setActiveRow}
            />
            {legendOpen && (
              <IndustryLegendOverlay
                rows={rows}
                activeIndustry={activeIndustry}
                onIndustryClick={handleIndustryClick}
                onClose={() => setLegendOpen(false)}
              />
            )}
            <ExploreMapTools active={mapTool} onSelect={(t) => {
              setMapTool(t);
              if (t === 'legend') setLegendOpen((v) => !v);
            }} />
          </div>
          <div className="h-1/2 flex flex-col">
            <ExploreAccountTable
              rows={rows}
              selection={state.selection}
              onToggle={toggleSelection}
              onRowClick={setActiveRow}
            />
          </div>
        </div>
        {activeRow && (
          <div className="w-[420px] shrink-0 border-l border-slate-200 bg-white overflow-auto">
            <PulseQuickCard
              row={activeRow}
              onClose={() => setActiveRow(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
