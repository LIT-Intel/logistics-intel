// PulseExploreTab — V6-styled Pulse Explorer page.
// Behavior: LAZY — empty state until search/filter; map is the primary
// surface (full height by default); results drawer is collapsible from
// the bottom so the user can re-claim map space at any time.

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Compass, Sparkles, ChevronDown, ChevronUp, Table2, Lasso, BoxSelect } from 'lucide-react';
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
import { useEntitlements } from '@/hooks/useEntitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import { PulseExploreLimitError } from '@/api/pulse-explore';
import ExploreAccountCards from './ExploreAccountCards';
import { Filter, Bookmark, Layers as LayersIcon, BarChart3, Sparkles as SparklesIcon, Library as LibraryIcon } from 'lucide-react';
import SelectionActionBar from './SelectionActionBar';
import BulkRefreshModal from './BulkRefreshModal';
import SaveAsViewModal from './SaveAsViewModal';
import BulkSaveToListModal from './BulkSaveToListModal';
import { downloadCsv } from './exportCsv';
import { parseExploreQuery, parsedToFilters, hasAnyFilter, looksLikeCompanyName } from '@/api/pulse-explore-parse';
import { lookupCoords } from './coordLookup';
import ExploreQuickCard from './ExploreQuickCard';
import AnalyticsPanel from './AnalyticsPanel';
import InsightsPanel from './InsightsPanel';
import LibraryPanel from './LibraryPanel';
import LayersPanel from './LayersPanel';
import { X as XIcon } from 'lucide-react';

const PROMPTS = [
  'Vulnerable incumbents in the Southeast',
  'High-velocity manufacturers in California above 5000 TEU',
  'Consolidation candidates with stale data',
  'Food and beverage importers in Texas',
];

export default function PulseExploreTab() {
  const { state, setFilters, setColor, setSize, setSelection } = useExploreState();
  const { entitlements, isPlatformAdmin } = useEntitlements();
  const upgradeModal = useUpgradeModal();
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
  const [resultsOpen, setResultsOpen] = useState(false); // bottom drawer collapsed by default
  const [mapBbox, setMapBbox] = useState(null); // [w,s,e,n] from MapLibre
  const [lassoActive, setLassoActive] = useState(false);
  const [toolPanel, setToolPanel] = useState(null); // 'analytics' | 'insights' | 'library' | 'layers' | null
  const [mapStyle, setMapStyle] = useState('alidade_smooth');
  const mapRef = useRef(null);

  const fetchEnabled = hasAnyFilter(state.filters);
  const { data, isLoading, error } = useExploreAccounts(state.filters, null, { enabled: fetchEnabled });
  const rows = data?.rows ?? [];
  const insights = useExploreInsights(rows);

  // Trial-preview gating. When pulse-explore returns 403 LIMIT_EXCEEDED
  // (trial user hit the 5-search cap), surface the canonical upgrade
  // modal instead of the generic error banner.
  useEffect(() => {
    if (error instanceof PulseExploreLimitError && error.limit) {
      upgradeModal.show(error.limit);
    }
  }, [error, upgradeModal]);

  // Per-feature client-side gates. Server-side gating is the security
  // boundary; these gates give a friendly upgrade prompt before the
  // user clicks instead of a 403 after.
  const planCode = entitlements?.plan ?? 'free_trial';
  const pdfAllowed = isPlatformAdmin
    || entitlements?.limits?.export_pdf === null
    || (entitlements?.limits?.export_pdf ?? 0) > 0;
  const coachAllowed = isPlatformAdmin
    || entitlements?.limits?.pulse_ai === null
    || (entitlements?.limits?.pulse_ai ?? 0) > 0;

  const requireCoach = useCallback(() => {
    if (coachAllowed) return true;
    upgradeModal.show({
      ok: false, code: 'LIMIT_EXCEEDED', feature: 'pulse_ai',
      used: 0, limit: 0, plan: planCode,
      reset_at: null, upgrade_url: '/app/billing',
      message: 'Pulse Coach is included on paid plans.',
    });
    return false;
  }, [coachAllowed, upgradeModal, planCode]);

  const requirePdf = useCallback(() => {
    if (pdfAllowed) return true;
    upgradeModal.show({
      ok: false, code: 'LIMIT_EXCEEDED', feature: 'export_pdf',
      used: 0, limit: 0, plan: planCode,
      reset_at: null, upgrade_url: '/app/billing',
      message: 'PDF reports are included on paid plans.',
    });
    return false;
  }, [pdfAllowed, upgradeModal, planCode]);

  // Sidebar tool dispatch — opens the corresponding panel or fires an action.
  const onSidebarSelect = useCallback((t) => {
    setSidebarTool(t);
    if (t === 'bookmark') { setViewOpen(true); return; }
    if (t === 'filter') {
      // Filter is implicit — chips already render at the top. Close any panel.
      setToolPanel(null); return;
    }
    setToolPanel((cur) => cur === t ? null : t);
  }, []);

  // Loads a saved map view (filters + map state).
  const onLoadSelection = useCallback((sel) => {
    if (!sel) return;
    setFilters(sel.filters ?? {});
    if (sel.map_state?.color_mode) setColor(sel.map_state.color_mode);
    if (sel.map_state?.size_mode) setSize(sel.map_state.size_mode);
    toast.success(`Loaded view "${sel.name}"`);
    setToolPanel(null);
  }, [setFilters, setColor, setSize]);

  // Auto-open the results drawer once data arrives (but never close
  // automatically — let the user collapse it manually).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (fetchEnabled && rows.length > 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setResultsOpen(true);
    }
    if (!fetchEnabled) autoOpenedRef.current = false;
  }, [fetchEnabled, rows.length]);

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

  // Parameterized so prompt-chip clicks pass the query DIRECTLY — the
  // previous setQuery + setTimeout pattern captured a stale query via
  // closure and parsed an empty string.
  const doSearch = useCallback(async (q) => {
    const text = (q ?? '').trim();
    if (!text) return;
    setParsing(true);
    try {
      const result = await parseExploreQuery(text);
      // eslint-disable-next-line no-console
      console.log('[pulse-explore-parse]', result);
      const filters = parsedToFilters(result?.parsed);
      if (hasAnyFilter(filters)) {
        setFilters(filters);
        const conf = result?.parsed?.confidence;
        toast.success(
          typeof conf === 'number'
            ? `Search parsed (${Math.round(conf * 100)}% confidence)`
            : 'Search parsed'
        );
      } else if (looksLikeCompanyName(text)) {
        // LLM didn't pick anything but the query looks like a brand —
        // treat as a literal company-name lookup.
        setFilters({ name: text });
        toast.success(`Searching companies matching "${text}"`);
      } else {
        toast(`Couldn't extract filters from "${text}" — try wording like "vulnerable incumbents in the southeast"`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pulse-explore-parse] failed', err);
      toast.error(err?.message ?? 'Search failed');
    } finally {
      setParsing(false);
    }
  }, [setFilters]);

  const onSubmitSearch = useCallback(() => doSearch(query), [doSearch, query]);

  const onSelectAllInView = useCallback(() => {
    // Read the LIVE viewport from the map ref — relying on the cached
    // `mapBbox` state was racy: clicking the button before the bbox
    // effect re-fires would silently match nothing. The ref-based
    // getter falls back to the cached state if the ref isn't ready.
    const liveBbox = mapRef.current?.getCurrentBbox?.() ?? mapBbox;
    // eslint-disable-next-line no-console
    console.log('[pulse-explore] select-in-view click', { liveBbox, rows: rows.length });
    if (!liveBbox) {
      toast('Map not ready yet — pan or zoom once, then try again');
      return;
    }
    if (!rows.length) {
      toast('No accounts loaded yet');
      return;
    }
    const [w, s, e, n] = liveBbox;
    const ids = [];
    for (const r of rows) {
      const c = lookupCoords({ latitude: r.latitude, longitude: r.longitude, city: r.city, state: r.state, country: r.country });
      if (!c) continue;
      if (c.lng >= w && c.lng <= e && c.lat >= s && c.lat <= n) ids.push(r.id);
    }
    if (!ids.length) {
      toast('No plottable accounts in current view — try zooming out');
      return;
    }
    const merged = Array.from(new Set([...(state.selection ?? []), ...ids]));
    setSelection(merged);
    setResultsOpen(true); // expand drawer so user SEES the selection
    toast.success(`Selected ${ids.length.toLocaleString()} accounts in view`);
  }, [mapBbox, rows, state.selection, setSelection]);

  const onLassoSelect = useCallback((ids) => {
    // eslint-disable-next-line no-console
    console.log('[pulse-explore] lasso emit', { ids: ids?.length ?? 0 });
    setLassoActive(false);
    if (!ids?.length) {
      toast('Lasso caught nothing — try a wider drag');
      return;
    }
    const merged = Array.from(new Set([...(state.selection ?? []), ...ids]));
    setSelection(merged);
    setResultsOpen(true);
    toast.success(`Lassoed ${ids.length.toLocaleString()} accounts`);
  }, [state.selection, setSelection]);

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

      {/* Mobile-only horizontal tool bar — the desktop vertical sidebar
          is `hidden sm:block`, leaving mobile users without access to
          filters/analytics/insights/layers. This bar covers that gap. */}
      <MobileToolBar
        active={toolPanel ?? sidebarTool}
        onSelect={onSidebarSelect}
      />

      <div className="flex flex-1 min-h-0">
        <div className="hidden sm:block">
          <ExploreSidebar active={toolPanel ?? sidebarTool} onSelect={onSidebarSelect} />
        </div>

        {/* Tool panel — desktop renders as a 320px side rail; mobile
            renders as an 85vh bottom sheet with scrim. Both share the
            same content (renderToolPanel). */}
        {toolPanel && (
          <>
            <div className="hidden md:flex flex-col w-[320px] shrink-0 border-r border-slate-200 bg-white">
              <div className="flex items-center justify-end px-2 py-1 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => setToolPanel(null)}
                  aria-label="Close panel"
                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                >
                  <XIcon size={14} />
                </button>
              </div>
              {renderToolPanel({
                toolPanel,
                rows,
                insights,
                filters: state.filters,
                onLoadSelection,
                mapStyle,
                setMapStyle,
                requireCoach,
                requirePdf,
              })}
            </div>

            {/* Mobile bottom sheet */}
            <div className="md:hidden fixed inset-0 z-50 flex items-end">
              <button
                type="button"
                aria-label="Close panel"
                onClick={() => setToolPanel(null)}
                className="absolute inset-0 bg-slate-950/40"
              />
              <div className="relative w-full bg-white rounded-t-2xl shadow-2xl flex flex-col" style={{ height: '85vh' }}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto absolute left-0 right-0 top-1.5" />
                  <span className="text-xs font-semibold text-slate-700 capitalize ml-1">{toolPanel}</span>
                  <button
                    type="button"
                    onClick={() => setToolPanel(null)}
                    aria-label="Close panel"
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
                {renderToolPanel({
                  toolPanel,
                  rows,
                  insights,
                  filters: state.filters,
                  onLoadSelection,
                  mapStyle,
                  setMapStyle,
                })}
              </div>
            </div>
          </>
        )}
        <div className="flex-1 min-w-0 min-h-0 relative flex flex-col">
          {parsing && (
            <div className="absolute inset-x-0 top-0 z-30 bg-cyan-50 text-cyan-800 text-xs py-1.5 text-center border-b border-cyan-200">
              Parsing search…
            </div>
          )}
          {error && (
            <div className="absolute inset-x-0 top-0 z-30 bg-red-50 text-red-700 text-xs py-1.5 text-center border-b border-red-200">
              Failed to load: {String(error.message)}
            </div>
          )}

          {/* Map — fills available vertical space; collapses when the
              results drawer is open. */}
          <div
            className={`relative border-b border-slate-200 transition-[height] duration-200 ${
              resultsOpen ? 'h-3/5' : 'flex-1'
            }`}
          >
            <ExploreMap
              ref={mapRef}
              rows={rows}
              colorMode={state.color}
              sizeMode={state.size}
              selection={state.selection}
              onBubbleClick={setActiveRow}
              mapMode={mapMode}
              onBboxChange={setMapBbox}
              lassoActive={lassoActive}
              onLassoSelect={onLassoSelect}
              mapStyle={mapStyle}
            />
            {/* Right-side floating selection buttons — labels hide on xs */}
            {fetchEnabled && (
              <div className="absolute right-2 top-2 sm:right-3 sm:top-3 z-20 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={onSelectAllInView}
                  title="Select all accounts in current map view"
                  aria-label="Select all in view"
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/95 backdrop-blur shadow ring-1 ring-slate-200 text-slate-700 hover:text-cyan-700 px-2 sm:px-2.5 py-1.5 text-xs font-medium"
                >
                  <BoxSelect size={13} />
                  <span className="hidden sm:inline">Select in view</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLassoActive((v) => !v)}
                  title={lassoActive ? 'Cancel lasso' : 'Drag a rectangle to lasso-select accounts'}
                  aria-label="Lasso select"
                  className={`inline-flex items-center gap-1.5 rounded-md backdrop-blur shadow ring-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium ${
                    lassoActive
                      ? 'bg-cyan-500 text-white ring-cyan-600'
                      : 'bg-white/95 ring-slate-200 text-slate-700 hover:text-cyan-700'
                  }`}
                >
                  <Lasso size={13} />
                  <span className="hidden sm:inline">{lassoActive ? 'Drag a rectangle…' : 'Lasso'}</span>
                </button>
              </div>
            )}
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

            {/* Empty-state CTA card — pinned bottom-center, doesn't cover
                the map labels. Clicking a prompt chip kicks off a real
                search via doSearch(text). */}
            {!fetchEnabled && !parsing && (
              <div className="absolute left-1/2 bottom-6 -translate-x-1/2 z-20 max-w-md pointer-events-none">
                <div className="bg-white/95 backdrop-blur rounded-xl shadow-xl border border-slate-200 px-5 py-4 text-center pointer-events-auto">
                  <div className="inline-flex items-center gap-2 text-cyan-700 mb-1">
                    <Sparkles size={18} />
                    <span className="font-semibold">Search to begin</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Type a query above (or pick a chip) — we&apos;ll plot up to 78K accounts on the map.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                    {PROMPTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setQuery(p); doSearch(p); }}
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

          {/* Results drawer — header bar always visible (so user knows
              they can pop it open); body only renders when expanded. */}
          <div className="flex flex-col" style={{ height: resultsOpen ? '40%' : 'auto' }}>
            <button
              type="button"
              onClick={() => setResultsOpen((v) => !v)}
              className="flex items-center justify-between gap-2 border-y border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              <span className="inline-flex items-center gap-1.5">
                <Table2 size={13} className="text-slate-500" />
                Results
                {fetchEnabled && (
                  <span className="text-slate-500 font-normal">
                    {isLoading ? '· loading…' : `· ${rows.length.toLocaleString()} accounts`}
                  </span>
                )}
              </span>
              {resultsOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            {resultsOpen && (
              <>
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
                  <>
                    <div className="hidden md:flex flex-col flex-1 min-h-0">
                      <ExploreAccountTable
                        rows={rows}
                        selection={state.selection}
                        onToggle={toggleSelection}
                        onRowClick={setActiveRow}
                      />
                    </div>
                    <div className="md:hidden flex flex-col flex-1 min-h-0">
                      <ExploreAccountCards
                        rows={rows}
                        selection={state.selection}
                        onToggle={toggleSelection}
                        onRowClick={setActiveRow}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 grid place-items-center text-slate-400 text-sm">
                    <div className="flex items-center gap-2"><Compass size={16} /> Results appear here after you search</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {activeRow && (
          <>
            {/* Mobile scrim — taps outside the panel close it */}
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setActiveRow(null)}
              className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
            />
            <div className="fixed lg:relative right-0 top-0 z-50 lg:z-0 h-full lg:h-auto w-[92vw] max-w-[380px] lg:w-[380px] shrink-0 border-l border-slate-200 bg-white shadow-2xl lg:shadow-none">
              <ExploreQuickCard
                row={activeRow}
                onClose={() => setActiveRow(null)}
                onSaveToList={(r) => {
                  if (!state.selection?.includes(r.id)) setSelection([...(state.selection ?? []), r.id]);
                  setSaveListOpen(true);
                }}
              />
            </div>
          </>
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

// Shared panel-content renderer so the desktop side rail and the mobile
// bottom sheet stay in lockstep.
function renderToolPanel({ toolPanel, rows, insights, filters, onLoadSelection, mapStyle, setMapStyle, requireCoach, requirePdf }) {
  if (toolPanel === 'analytics') return <AnalyticsPanel rows={rows} insights={insights} />;
  if (toolPanel === 'insights') return <InsightsPanel rows={rows} insights={insights} filters={filters} requireCoach={requireCoach} requirePdf={requirePdf} />;
  if (toolPanel === 'library') return <LibraryPanel onLoadSelection={onLoadSelection} />;
  if (toolPanel === 'layers') return <LayersPanel mapStyle={mapStyle} onStyleChange={setMapStyle} />;
  return null;
}

const MOBILE_TOOLS = [
  { id: 'filter', icon: Filter, label: 'Filters' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics' },
  { id: 'insights', icon: SparklesIcon, label: 'Coach' },
  { id: 'library', icon: LibraryIcon, label: 'Library' },
  { id: 'layers', icon: LayersIcon, label: 'Layers' },
  { id: 'bookmark', icon: Bookmark, label: 'Save view' },
];

function MobileToolBar({ active, onSelect }) {
  return (
    <div className="sm:hidden flex items-center gap-1 overflow-x-auto bg-[#0F1828] border-b border-slate-800/60 px-2 py-1.5 scrollbar-hide">
      {MOBILE_TOOLS.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect?.(t.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium ${
              isActive
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Icon size={13} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
