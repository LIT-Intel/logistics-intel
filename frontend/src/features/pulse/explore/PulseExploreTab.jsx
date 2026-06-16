// PulseExploreTab — Pulse Explorer page assembly.
// Wires together: toolbar + chips + left rail insights + map + table.
// The right-rail QuickCard reuses the existing PulseQuickCard component.

import { useState, useCallback } from 'react';
import { useExploreState } from './useExploreState';
import { useExploreAccounts } from './useExploreAccounts';
import { useExploreInsights } from './useExploreInsights';
import ExploreToolbar from './ExploreToolbar';
import TopInsightsRail from './TopInsightsRail';
import ExploreMap from './ExploreMap';
import ExploreAccountTable from './ExploreAccountTable';
import PulseQuickCard from '@/features/pulse/PulseQuickCard';

export default function PulseExploreTab() {
  const { state, setFilters, setColor, setSize, setSelection } = useExploreState();
  const [query, setQuery] = useState('');
  const [activeRow, setActiveRow] = useState(null);
  const { data, isLoading, error } = useExploreAccounts(state.filters, null);
  const rows = data?.rows ?? [];
  const insights = useExploreInsights(rows);

  const toggleSelection = useCallback((id) => {
    const cur = new Set(state.selection ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setSelection(Array.from(cur));
  }, [state.selection, setSelection]);

  const selectionActions = {
    onExport: () => { /* Phase 3 */ },
    onSaveToList: () => { /* Phase 3 */ },
    onSaveAsView: () => { /* Phase 3 */ },
    onBulkRefresh: () => { /* Phase 3 */ },
    onAddToCampaign: () => { /* Phase 3 */ },
  };

  return (
    <div className="flex flex-col h-full">
      <ExploreToolbar
        query={query} onQuery={setQuery}
        onSubmit={() => { /* NL parse wires in Phase 3 */ }}
        filters={state.filters} onFiltersChange={setFilters}
        color={state.color} onColor={setColor}
        size={state.size} onSize={setSize}
        selectionCount={(state.selection ?? []).length}
        selectionActions={selectionActions}
      />
      <div className="flex flex-1 min-h-0">
        <TopInsightsRail insights={insights} />
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
          <div className="h-1/2 border-b border-slate-200">
            <ExploreMap
              rows={rows}
              colorMode={state.color}
              sizeMode={state.size}
              selection={state.selection}
              onBubbleClick={setActiveRow}
            />
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
          <div className="w-[420px] shrink-0 border-l border-slate-200 bg-white">
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
