// PulseExploreTab — V6-styled Pulse Explorer page.
// Behavior: LAZY by default — empty state shown until the user submits a
// search OR picks a filter chip. Avoids the 78K-row default-load cost.

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Compass, Sparkles } from 'lucide-react';
import { useExploreState } from './useExploreState';
import { useExploreAccounts } from './useExploreAccounts';
import { useExploreInsights } from './useExploreInsights';
import ExploreHeader from './ExploreHeader';
import ExploreSidebar from './ExploreSidebar';
import FilterChipRow from './FilterChipRow';
import IndustryLegendOverlay from './IndustryLegendOverlay';
import ExploreMapTools from './ExploreMapTools';
import ExploreMap from './ExploreMapMaplibre';
import ExploreAccountTable from './ExploreAccountTable';
import SelectionActionBar from './SelectionActionBar';
import BulkRefreshModal from './BulkRefreshModal';
import SaveAsViewModal from './SaveAsViewModal';
import BulkSaveToListModal from './BulkSaveToListModal';
import { downloadCsv } from './exportCsv';
import { parseExploreQuery, parsedToFilters, hasAnyFilter } from '@/api/pulse-explore-parse';
import PulseQuickCard from '@/features/pulse/PulseQuickCard';

const PROMPTS = [
  'Vulnerable incumbents in the Southeast',
  'High-velocity manufacturers in California above 5000 TEU',
  'Consolidation candidates with stale data',
  'Food and beverage importers in Texas',
];

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
  const [parsing, setParsing] = useState(false);

  // Only fetch once the user has actually filtered or searched.
  const fetchEnabled = hasAnyFilter(state.filters);
  const { data, isLoading, error } = useExploreAccounts(state.filters, null, { enabled: fetchEnabled });
  const rows = data?.rows ?? [];
  useExploreInsights(rows);

  const headerTotals = useMemo(() => {
    if (!rows.length) return { total: 0, totalAnnualSales: 0, totalTeu: 0 };
    let totalAnnualSales = 0;
    let totalTeu = 0;
    for (const r of rows) {
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
    setFilters({ ...(state.filters ?? {}), industry: Array.from(cur) });
  }, [state.filters, setFilters]);

  const onSubmitSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setParsing(true);
    try {
      const { parsed } = await parseExploreQuery(q);
      const filters = parsedToFilters(parsed);
      if (hasAnyFilter(filters)) {
        setFilters(filters);
        if (parsed?.confidence != null) {
          toast.success(`Search parsed (${Math.round(parsed.confidence * 100)}% confidence)`);
        }
      } else {
        toast(`Couldn't extract filters from "${q}" — try wording like "vulnerable incumbents in the southeast"`);
      }
    } catch (err) {
      toast.error(err?.message ?? 'Search failed');
    } finally {
      setParsing(false);
    }
  }, [query, setFilters]);

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
        onSubmit={onSubmitSearch}
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
          {parsing && (
            <div className="absolute inset-0 grid place-items-center bg-white/60 text-slate-500 text-sm z-20">
              Parsing search…
            </div>
          )}
          {fetchEnabled && isLoading && !parsing && (
            <div className="absolute inset-0 grid place-items-center bg-white/60 text-slate-500 text-sm z-10">
              Loading accounts…
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
              mapMode={mapMode}
            />
            {fetchEnabled && legendOpen && (
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
            {!fetchEnabled && !parsing && (
              <div className="absolute inset-0 z-20 grid place-items-center pointer-events-none">
                <div className="bg-white/95 backdrop-blur rounded-xl shadow-xl border border-slate-200 px-5 py-4 max-w-md text-center pointer-events-auto">
                  <div className="inline-flex items-center gap-2 text-cyan-700 mb-1">
                    <Sparkles size={18} />
                    <span className="font-semibold">Search to begin</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Type a query above (or pick a filter chip) and we'll plot up to 78K accounts on the map.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                    {PROMPTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setQuery(p); /* trigger after state flush */ setTimeout(onSubmitSearch, 0); }}
                        className="text-[11px] rounded-full bg-cyan-50 hover:bg-cyan-100 ring-1 ring-cyan-200 text-cyan-800 px-2 py-1"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
            {fetchEnabled ? (
              <ExploreAccountTable
                rows={rows}
                selection={state.selection}
                onToggle={toggleSelection}
                onRowClick={setActiveRow}
              />
            ) : (
              <div className="flex-1 grid place-items-center text-slate-400 text-sm">
                <div className="flex items-center gap-2"><Compass size={16} /> Results appear here after you search</div>
              </div>
            )}
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
