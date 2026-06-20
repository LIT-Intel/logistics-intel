// CompanySearchTab — the Company Search tab inside Intelligence Explorer.
//
// Day-5 PRD pivot: this is the "name lookup" mode of the unified
// Explorer (Walmart / Tesla / Nike). Calls the EXISTING searchShippers()
// edge-function backbone (api.ts:2991) — we do not rebuild the backend.
//
// Polish pass (2026-06-20, user feedback after PR 2 deploy):
//   • Map is now ALWAYS visible — no "Search a company to begin"
//     empty card that hides the world view. Same initial impression
//     as the Pulse Explorer.
//   • After a search, the map fits its bounds to span every result
//     point — fixes the bug where 10 companies across CT/CO/KY all
//     bundled into one cluster at country-center zoom.
//   • Bubbles support hover-preview: hovering a marker shows a small
//     floating card with company name, location (with country flag),
//     shipment volume, and an Open button. Click for full nav.
//   • Results panel slides up from the bottom and is COLLAPSIBLE.
//     Collapse via the chevron in its header; re-open via the
//     pill button that appears bottom-right when collapsed.
//   • View toggle inside the panel: LIST (default — compact rows)
//     vs CARDS (grid). Card rendering preserved from prior PR.
//   • Country flag in every row / card.
//   • Mobile-first: the panel auto-collapses on small screens so the
//     map stays the primary surface; user opens it via the same pill.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Search as SearchIcon,
  MapPin,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List as ListIcon,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

import {
  searchShippers,
  saveCompanyToCommandCenter,
  getIyCompanyProfile,
} from '@/lib/api';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import ExploreMap from '@/features/pulse/explore/ExploreMapMaplibre';
import { normalizeCompanySearchResults } from '@/lib/explorer/normalizeCompanySearch';
import { countryFlag, compactLocation } from '@/lib/explorer/countryFlags';
import { useExplorer } from './ExplorerContext';

const PAGE_SIZE = 50;
const PLACEHOLDER = 'Search by company name, importer, shipper, or supplier';
const EXAMPLE_QUERIES = ['Walmart', 'Tesla', 'Nike', 'Home Depot', 'Target'];

// localStorage keys so view-mode + panel state persist across visits.
const LS_VIEW_KEY = 'lit.explorer.companySearch.view';
const LS_PANEL_KEY = 'lit.explorer.companySearch.panelOpen';

export default function CompanySearchTab() {
  const { setSelectedCompany } = useExplorer();
  const [sp, setSp] = useSearchParams();

  // Search input + results
  const [query, setQuery] = useState(() => (sp.get('q') ?? '').trim());
  const [submitted, setSubmitted] = useState(query);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [mapPoints, setMapPoints] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [unmappedCount, setUnmappedCount] = useState(0);
  const inputRef = useRef(null);

  // Bottom panel — collapsible. Default OPEN on desktop, CLOSED on
  // mobile so the map gets full screen until the user wants the list.
  const initialPanelOpen = useMemo(() => {
    if (typeof window === 'undefined') return true;
    const cached = window.localStorage?.getItem(LS_PANEL_KEY);
    if (cached === 'open') return true;
    if (cached === 'closed') return false;
    // First-visit default — open on screens wider than 768px.
    return window.matchMedia?.('(min-width: 768px)')?.matches ?? true;
  }, []);
  const [panelOpen, setPanelOpen] = useState(initialPanelOpen);

  // List vs Cards view inside the panel. Default LIST per user spec.
  const initialView = useMemo(() => {
    if (typeof window === 'undefined') return 'list';
    const cached = window.localStorage?.getItem(LS_VIEW_KEY);
    return cached === 'cards' ? 'cards' : 'list';
  }, []);
  const [view, setView] = useState(initialView);

  // Hover-preview state — set by ExploreMap onBubbleHover.
  const [hoverRow, setHoverRow] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  // Persist panel + view choices.
  useEffect(() => {
    try { window.localStorage?.setItem(LS_PANEL_KEY, panelOpen ? 'open' : 'closed'); } catch { /* ignore */ }
  }, [panelOpen]);
  useEffect(() => {
    try { window.localStorage?.setItem(LS_VIEW_KEY, view); } catch { /* ignore */ }
  }, [view]);

  // Run on mount when ?q= is present so the page lands "already
  // searched" instead of empty.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!query) return;
    autoRanRef.current = true;
    runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(async (rawQ) => {
    const q = (rawQ ?? query).trim();
    if (!q) return;
    setSearching(true);
    setError('');
    setSubmitted(q);
    setHoverRow(null);
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      next.set('q', q);
      return next;
    }, { replace: true });

    try {
      const resp = await searchShippers({ q, page: 1, pageSize: PAGE_SIZE });
      if (!resp?.ok || !Array.isArray(resp.results)) {
        throw new Error(resp?.message || 'Company search failed.');
      }
      const norm = normalizeCompanySearchResults(resp.results);
      setResults(norm.rows);
      setMapPoints(norm.mapPoints);
      setUnmappedCount(norm.unmappedCount);
      setAnalytics(norm.analytics);
      // Auto-open the panel after a result set lands — users explicitly
      // searched, they want to see the list. If they collapse it again
      // the choice sticks via localStorage.
      if (norm.rows.length > 0) setPanelOpen(true);
      if (norm.rows.length === 0) {
        setError(`No companies found matching "${q}". Try a different spelling or a parent brand.`);
      }
    } catch (err) {
      const msg =
        err?.code === 'LIMIT_EXCEEDED'
          ? (err.message || 'Search limit reached. Upgrade to continue.')
          : (err?.message || 'Company search failed.');
      setError(msg);
      setResults([]);
      setMapPoints([]);
      setUnmappedCount(0);
      setAnalytics(null);
    } finally {
      setSearching(false);
    }
  }, [query, setSp]);

  const onSubmit = useCallback((e) => {
    e?.preventDefault?.();
    runSearch();
  }, [runSearch]);

  const onSave = useCallback(async (row, e) => {
    e?.stopPropagation?.();
    try {
      const shipper = row.raw;
      await saveCompanyToCommandCenter({
        shipper,
        profile: null,
        stage: 'prospect',
        source: 'importyeti',
      });
      toast.success(`Saved ${row.company_name} to Command Center`);
    } catch (err) {
      toast.error(err?.message || 'Save failed');
    }
  }, []);

  const onOpenDetails = useCallback(async (row, e) => {
    e?.stopPropagation?.();
    try {
      await getIyCompanyProfile({ companyKey: row.source_company_key });
    } catch { /* non-fatal */ }
    const slug = encodeURIComponent(row.source_company_key || row.id);
    window.location.href = `/app/companies/${slug}`;
  }, []);

  const onRowClick = useCallback((row) => {
    setSelectedCompany({
      id: row.id,
      sourceCompanyKey: row.source_company_key,
      companyId: row.company_id,
      name: row.company_name,
      source: row.source,
      city: row.city,
      state: row.state,
      countryCode: row.country,
      raw: row.raw,
    });
    void onOpenDetails(row);
  }, [setSelectedCompany, onOpenDetails]);

  // Bubble hover — opens the floating preview card. The Map calls this
  // with screen coords so we don't have to query the map again.
  const onBubbleHover = useCallback((row, pos) => {
    setHoverRow(row);
    if (pos) setHoverPos({ x: pos.x, y: pos.y });
  }, []);
  const onBubbleLeave = useCallback(() => {
    setHoverRow(null);
  }, []);

  const mapRows = useMemo(() => mapPoints, [mapPoints]);

  const hasSearched = Boolean(submitted) && !searching;
  const hasResults = results.length > 0;

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-[#0F1828] to-[#1E293B] px-3 py-3 text-white sm:px-5 sm:py-4">
        <div className="flex items-center gap-2 text-[11.5px] text-cyan-200/80 sm:text-[12px]">
          <SearchIcon size={12} />
          <span className="font-semibold text-white sm:font-normal sm:text-cyan-200/80">
            <span className="sm:hidden">Company Search</span>
            <span className="hidden sm:inline">Intelligence Explorer</span>
          </span>
          <span className="hidden text-cyan-200/40 sm:inline">/</span>
          <span className="hidden font-semibold text-white sm:inline">Company Search</span>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 backdrop-blur sm:mt-2.5 sm:gap-2 sm:px-3"
        >
          <SearchIcon size={14} className="shrink-0 text-cyan-300/80" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER}
            className="font-body min-w-0 flex-1 border-0 bg-transparent py-1 text-[14px] text-white outline-none placeholder:text-slate-400"
            disabled={searching}
            maxLength={200}
            style={{ fontSize: '16px' }}
            enterKeyHint="search"
          />
          {query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X size={12} />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="font-display inline-flex shrink-0 items-center gap-1 rounded-md bg-cyan-500 px-2.5 py-1.5 text-[12px] font-semibold text-slate-900 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-1.5 sm:px-3"
          >
            {searching ? <Sparkles size={12} className="animate-pulse" /> : <ArrowRight size={12} />}
            <span className="hidden sm:inline">{searching ? 'Searching…' : 'Search'}</span>
            <span className="sm:hidden">{searching ? '…' : 'Go'}</span>
          </button>
        </form>

        {/* Analytics ribbon */}
        {analytics ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cyan-100/90 sm:mt-3 sm:gap-x-5 sm:text-[11.5px]">
            <Metric label="Matching" longLabel="Matching companies" value={analytics.matchingCompanies.toLocaleString()} />
            {analytics.totalShipments > 0
              ? <Metric label="Shipments" longLabel="Total shipments" value={analytics.totalShipments.toLocaleString()} />
              : null}
            <Metric
              label="Mapped"
              longLabel="Mapped locations"
              value={`${analytics.mappedLocations.toLocaleString()} / ${analytics.matchingCompanies.toLocaleString()}`}
            />
            {analytics.mostRecentShipment
              ? <Metric label="Most recent" longLabel="Most recent" value={formatDate(analytics.mostRecentShipment)} />
              : null}
          </div>
        ) : null}

        {/* Filter chips */}
        {submitted ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-3">
            <Chip label="Query" value={submitted} />
            <Chip label="Source" value="ImportYeti" />
            {analytics?.mappedLocations > 0
              ? <Chip label="Mapped" value={`${analytics.mappedLocations}`} />
              : null}
          </div>
        ) : null}
      </div>

      {/* ── Body: map always visible; collapsible results overlay ── */}
      <div className="relative flex flex-1 min-h-0 flex-col">
        {/* Map fills available space. When the panel is open it
            occupies the top portion; when collapsed the map gets the
            whole area. The map is ALWAYS mounted so the user sees the
            world from the moment the page lands. */}
        <div
          className={`relative transition-[height] duration-200 ${
            panelOpen && hasResults ? 'h-[55%] min-h-[260px] sm:h-[58%]' : 'flex-1 min-h-[280px]'
          }`}
        >
          <ExploreMap
            rows={mapRows}
            colorMode="industry"
            sizeMode="teu"
            selection={[]}
            onBubbleClick={onRowClick}
            onBubbleHover={onBubbleHover}
            onBubbleLeave={onBubbleLeave}
            fitBoundsToPoints={hasResults}
            mapMode="bubbles"
            mapStyle="alidade_smooth"
          />

          {/* Idle overlay — small floating hint card. The map renders
              underneath so the world is visible from second one. */}
          {!hasSearched && !searching ? (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center sm:inset-x-auto sm:left-1/2 sm:bottom-6 sm:-translate-x-1/2">
              <div className="pointer-events-auto w-full max-w-md rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-center shadow-lg backdrop-blur sm:px-6 sm:py-4">
                <div className="font-display inline-flex items-center gap-2 text-[13.5px] font-semibold text-slate-900 sm:text-[14px]">
                  <SearchIcon size={14} className="text-cyan-600" />
                  Search a company to begin
                </div>
                <p className="font-body mt-1 text-[11.5px] text-slate-500 sm:text-[12px]">
                  Type a brand or shipper name above. We&apos;ll plot every mappable match.
                </p>
                <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                  {EXAMPLE_QUERIES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => { setQuery(q); runSearch(q); }}
                      className="font-display rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Bubble hover preview — floats next to the bubble. Uses
              fixed positioning since onBubbleHover gives us viewport
              coords. Pointer-events: none on the wrapper means the
              card itself doesn't steal hover, but inner buttons do. */}
          {hoverRow ? (
            <BubblePopover row={hoverRow} pos={hoverPos} onOpen={(e) => onOpenDetails(hoverRow, e)} />
          ) : null}

          {/* Collapsed-state pill — appears in the lower-right when
              the panel is closed AND we have results. Click to expand. */}
          {!panelOpen && hasResults ? (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="font-display absolute bottom-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-lg hover:bg-slate-50"
            >
              <ChevronUp size={14} />
              Show {results.length} result{results.length === 1 ? '' : 's'}
            </button>
          ) : null}
        </div>

        {/* Results panel — slides up from bottom. Header always present,
            body only rendered when open. */}
        {hasResults ? (
          <div className={`flex flex-col border-t border-slate-200 bg-white transition-[height] duration-200 ${panelOpen ? 'h-[45%] min-h-[260px] sm:h-[42%]' : 'h-0'}`}>
            {panelOpen ? (
              <>
                <PanelHeader
                  total={results.length}
                  unmapped={unmappedCount}
                  view={view}
                  onViewChange={setView}
                  onCollapse={() => setPanelOpen(false)}
                />
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {view === 'list' ? (
                    <ListView
                      rows={results}
                      onRowClick={onRowClick}
                      onSave={onSave}
                      onOpen={onOpenDetails}
                    />
                  ) : (
                    <CardsView
                      rows={results}
                      onRowClick={onRowClick}
                      onSave={onSave}
                      onOpen={onOpenDetails}
                    />
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Error / empty-state banner — sits outside the panel, always
            visible above whatever's open. */}
        {error && !searching ? (
          <div className="border-t border-slate-200 bg-white px-4 py-3">
            <div className="font-body inline-flex items-center gap-2 text-[12.5px] text-slate-600">
              <Sparkles size={12} className="text-slate-400" />
              {error}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function Metric({ label, longLabel, value }) {
  return (
    <div className="inline-flex items-baseline gap-1 sm:gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-wider text-cyan-300/70 sm:text-[10px]">
        <span className="sm:hidden">{label}</span>
        <span className="hidden sm:inline">{longLabel ?? label}</span>
      </span>
      <span className="font-display text-[12px] font-semibold text-white sm:text-[12.5px]">{value}</span>
    </div>
  );
}

function Chip({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/[0.12] px-2 py-0.5 text-[10.5px] text-cyan-100 ring-1 ring-cyan-400/30">
      <span className="opacity-70">{label}:</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function PanelHeader({ total, unmapped, view, onViewChange, onCollapse }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
        <ListIcon size={14} className="text-slate-500" />
        <span className="font-display">Results</span>
        <span className="font-body text-slate-500">
          · {total.toLocaleString()} account{total === 1 ? '' : 's'}
          {unmapped > 0 ? ` · ${unmapped} unmapped` : ''}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {/* View toggle: list <-> cards */}
        <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
          <ViewToggleBtn
            active={view === 'list'}
            onClick={() => onViewChange('list')}
            icon={<ListIcon size={12} />}
            label="List"
          />
          <ViewToggleBtn
            active={view === 'cards'}
            onClick={() => onViewChange('cards')}
            icon={<LayoutGrid size={12} />}
            label="Cards"
          />
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse results"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}

function ViewToggleBtn({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`font-display inline-flex items-center gap-1 rounded px-2 py-1 text-[10.5px] font-semibold transition ${
        active
          ? 'bg-slate-900 text-white'
          : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ListView({ rows, onRowClick, onSave, onOpen }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <ListRow
          key={row.id}
          row={row}
          onClick={() => onRowClick(row)}
          onSave={(e) => onSave(row, e)}
          onOpen={(e) => onOpen(row, e)}
        />
      ))}
    </div>
  );
}

function ListRow({ row, onClick, onSave, onOpen }) {
  const loc = compactLocation(row.city, row.state, row.country);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-cyan-50/50 sm:px-4"
    >
      <CompanyAvatar name={row.company_name} domain={row.domain} size={28} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-display flex items-center gap-1.5 truncate text-[13px] font-semibold text-slate-900">
          {loc.flag ? <span className="text-[14px] leading-none" aria-hidden>{loc.flag}</span> : null}
          <span className="truncate">{row.company_name}</span>
          {row.mapStatus === 'approximate' ? (
            <span className="ml-1 shrink-0 rounded-sm bg-amber-100 px-1 text-[8.5px] uppercase text-amber-700">approx</span>
          ) : null}
          {row.mapStatus === 'unmapped' ? (
            <span className="ml-1 shrink-0 rounded-sm bg-slate-100 px-1 text-[8.5px] uppercase text-slate-500">no map</span>
          ) : null}
        </div>
        <div className="font-body mt-0.5 truncate text-[11px] text-slate-500">
          {loc.text || '—'}
        </div>
      </div>
      {/* Compact metric trio — hidden on the narrowest viewport */}
      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <ListMiniStat label="SHIPMENTS" value={row.shipments != null ? formatCompact(row.shipments) : '—'} />
        <ListMiniStat label="TEU 12M" value={row.teu != null ? formatCompact(row.teu) : '—'} />
        <ListMiniStat label="LAST" value={row.last_shipment ? formatDate(row.last_shipment) : '—'} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onSave}
          className="font-display rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="font-display rounded-md bg-slate-900 px-2 py-1 text-[10.5px] font-semibold text-white transition hover:bg-slate-700"
        >
          Open
        </button>
      </div>
    </button>
  );
}

function ListMiniStat({ label, value }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-[8.5px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-display text-[11.5px] font-semibold text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}

function CardsView({ rows, onRowClick, onSave, onOpen }) {
  return (
    <div className="p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
        {rows.map((row) => (
          <ResultCard
            key={row.id}
            row={row}
            onClick={() => onRowClick(row)}
            onSave={(e) => onSave(row, e)}
            onOpen={(e) => onOpen(row, e)}
          />
        ))}
      </div>
    </div>
  );
}

function ResultCard({ row, onClick, onSave, onOpen }) {
  const loc = compactLocation(row.city, row.state, row.country);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-px hover:border-cyan-400/40 hover:shadow-md sm:p-3"
    >
      <div className="flex items-start gap-2 sm:gap-2.5">
        <CompanyAvatar name={row.company_name} domain={row.domain} size={32} className="shrink-0 sm:!h-9 sm:!w-9" />
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-1.5 truncate text-[13px] font-semibold text-slate-900 sm:text-[13.5px]">
            {loc.flag ? <span className="text-[14px] leading-none" aria-hidden>{loc.flag}</span> : null}
            <span className="truncate">{row.company_name}</span>
          </div>
          {loc.text ? (
            <div className="font-body mt-px flex items-center gap-1 truncate text-[10.5px] text-slate-500 sm:text-[11px]">
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{loc.text}</span>
              {row.mapStatus === 'approximate' ? (
                <span className="ml-1 shrink-0 rounded-sm bg-amber-100 px-1 text-[9px] uppercase text-amber-700">approx</span>
              ) : null}
              {row.mapStatus === 'unmapped' ? (
                <span className="ml-1 shrink-0 rounded-sm bg-slate-100 px-1 text-[9px] uppercase text-slate-500">no coords</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-50 px-2 py-1.5">
        <MiniStat label="Shipments" value={row.shipments != null ? formatCompact(row.shipments) : '—'} />
        <MiniStat label="TEU 12M" value={row.teu != null ? formatCompact(row.teu) : '—'} />
        <MiniStat label="Last" value={row.last_shipment ? formatDate(row.last_shipment) : '—'} />
      </div>

      <div className="flex items-center justify-between gap-1.5 pt-0.5 sm:pt-1">
        <span className="font-mono truncate text-[9.5px] uppercase tracking-wider text-slate-400">
          {row.source_label}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onSave}
            className="font-display rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10.5px] font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700 sm:py-1"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="font-display rounded-md bg-slate-900 px-2 py-1.5 text-[10.5px] font-semibold text-white transition hover:bg-slate-700 sm:py-1"
          >
            Open
          </button>
        </div>
      </div>
    </button>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-mono truncate text-[8.5px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-display truncate text-[11.5px] font-semibold text-slate-900 sm:text-[12px]">{value}</span>
    </div>
  );
}

// Floating preview card next to the bubble. Positioned using viewport
// coords from onBubbleHover. We center horizontally on the bubble and
// place above it (so the bubble itself stays uncovered).
function BubblePopover({ row, pos, onOpen }) {
  const loc = compactLocation(row.city, row.state, row.country);
  return (
    <div
      // pointer-events-none on wrapper so the popover doesn't steal
      // hover; the inner clickable area re-enables them.
      className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-full"
      style={{ left: pos.x, top: pos.y - 8 }}
      role="tooltip"
    >
      <div className="pointer-events-auto w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl">
        <div className="flex items-start gap-2">
          <CompanyAvatar name={row.company_name} domain={row.domain} size={32} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-display flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-slate-900">
              {loc.flag ? <span className="text-[13px] leading-none" aria-hidden>{loc.flag}</span> : null}
              <span className="truncate">{row.company_name}</span>
            </div>
            {loc.text ? (
              <div className="font-body mt-0.5 truncate text-[10.5px] text-slate-500">{loc.text}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-slate-50 px-2 py-1.5">
          <MiniStat label="Shipments" value={row.shipments != null ? formatCompact(row.shipments) : '—'} />
          <MiniStat label="TEU" value={row.teu != null ? formatCompact(row.teu) : '—'} />
          <MiniStat label="Last" value={row.last_shipment ? formatDate(row.last_shipment) : '—'} />
        </div>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpen}
          className="font-display mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-700"
        >
          <ExternalLink size={11} />
          Open profile
        </button>
      </div>
      {/* Small caret pointing down to the bubble. */}
      <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-white" style={{ marginTop: -1 }} />
    </div>
  );
}

// ── Format helpers ───────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatCompact(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}
