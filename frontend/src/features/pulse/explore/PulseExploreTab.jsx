// PulseExploreTab — V6-styled Pulse Explorer page.
// Layout:
//   - ExploreHeader (top): dark navy bar with title + search + mode toggle, KPI strip below
//   - FilterChipRow: V6-style cyan-tinted active filter pills
//   - ExploreSidebar (left, 48px): filter/bookmark/layers/analytics/etc icon strip
//   - Center: map (top half) + virtualized account table (bottom half)
//   - IndustryLegendOverlay: floating card on map showing industry counts
//   - ExploreMapTools: floating bottom-left map tool buttons (select/draw/lasso)
//   - SelectionActionBar: appears above table when selection > 0
//   - Right rail: PulseQuickCard when a bubble is clicked

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
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
import SelectionActionBar from './SelectionActionBar';
import BulkRefreshModal from './BulkRefreshModal';
import SaveAsViewModal from './SaveAsViewModal';
import BulkSaveToListModal from './BulkSaveToListModal';
import { downloadCsv } from './exportCsv';
import PulseQuickCard from '@/features/pulse/PulseQuickCard';

export default function PulseExploreTab() {
  const { state, setFilters, setColor, setSize, setSelection } = useExploreState();
  const [query, setQuery] = useState('');
  const [activeRow, setActiveRow] = useState(null);
  const [sidebarTool, setSidebarTool] = useState('filter');
  const [mapTool, setMapTool] = useState('select');
  const [mapMode, setMapMode] = useState('bubbles');
  const [legendOpen, setLegendOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [saveListOpen, setSaveListOpen] = useState(false);
  const { data, isLoading, error } = useExploreAccounts(state.filters, null);
  const rows = data?.rows ?? [];
  useExploreInsights(rows);

  const headerTotals = useMemo(() => {
    if (!rows.length) return { total: 0, totalAnnualSales: 0, totalTeu: 0 };
    let totalAnnualSales = 0;
    let totalTeu = 0;
    for (const r of rows) {
      // V6 stores Estimated Annual Revenue as raw value (likely millions);
      // sum without unit multiplication. KPI displays the running total.
      const rev = typeof r.revenue === 'string' ? parseFloat(r.revenue) : (r.revenue ?? 0);
      if (Number.isFinite(rev)) totalAnnualSales += rev;
      const teu = typeof r.teu === 'number' ? r.teu : (r.teu ? Number(r.teu) : 0);
      if (Number.isFinite(teu)) totalTeu += teu;
    }
    return { total: rows.length, totalAnnualSales, totalTeu };
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
  const selectedRows = useMemo(
    () => rows.filter((r) => new Set(state.selection ?? []).has(r.id)),
    [rows, state.selection],
  );

  const onExport = useCallback(() => {
    const subset = selectedRows.length > 0 ? selectedRows : rows;
    if (!subset.length) {
      toast.error('Nothing to export');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(subset, `pulse-explorer-${today}.csv`);
    toast.success(`Exported ${subset.length} accounts`);
  }, [selectedRows, rows]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <ExploreHeader
        query={query}
        onQuery={setQuery}
        onSubmit={() => { /* NL parse wires in Phase 3B follow-up */ }}
        totals={headerTotals}
        mapMode={mapMode}
        onMapMode={setMapMode}
      />
      <FilterChipRow filters={state.filters} onChange={setFilters} />
      <div className="flex flex-1 min-h-0">
        <ExploreSidebar active={sidebarTool} onSelect={(t) => {
          setSidebarTool(t);
          if (t === 'bookmark') setViewOpen(true);
        }} />
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
            <ExploreMapTools
              active={mapTool}
              onSelect={(t) => {
                setMapTool(t);
                if (t === 'legend') setLegendOpen((v) => !v);
              }}
            />
          </div>
          <div className="h-1/2 flex flex-col">
            <SelectionActionBar
              selectionCount={(state.selection ?? []).length}
              totalCount={rows.length}
              onClear={() => setSelection([])}
              onExport={onExport}
              onSaveToList={() => setSaveListOpen(true)}
              onSaveAsView={() => setViewOpen(true)}
              onBulkRefresh={() => setBulkOpen(true)}
              onAddToCampaign={() => toast('Add to campaign — coming in next polish pass')}
            />
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
            <PulseQuickCard row={activeRow} onClose={() => setActiveRow(null)} />
          </div>
        )}
      </div>
      <BulkRefreshModal open={bulkOpen} onClose={() => setBulkOpen(false)} rows={selectedRows} />
      <SaveAsViewModal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        state={state}
        mapCenter={[39.5, -98.35]}
        mapZoom={4}
      />
      <BulkSaveToListModal
        open={saveListOpen}
        onClose={() => setSaveListOpen(false)}
        companyIds={state.selection ?? []}
      />
    </div>
  );
}
