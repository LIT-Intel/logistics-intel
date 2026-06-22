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
  fetchSearchMetadataOverlay,
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

  // Hover-preview state — set by ExploreMap onBubbleHover. A grace
  // timer bridges the gap between leaving the bubble and entering the
  // popover card so the user can actually mouse onto the card to click
  // "Open profile" without it disappearing under them. Pattern:
  //   bubble mouseenter  → clear timer, show card
  //   bubble mouseleave  → start 180ms timer
  //   card   mouseenter  → clear timer (card sticks)
  //   card   mouseleave  → start 120ms timer
  //   timer fires        → setHoverRow(null)
  // The X button + Escape key also force-close the card so the user
  // is never trapped if a marker re-render orphans the mouseleave.
  const [hoverRow, setHoverRow] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const hoverHideTimerRef = useRef(null);
  const clearHoverTimer = useCallback(() => {
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
  }, []);
  const scheduleHide = useCallback((delay = 180) => {
    clearHoverTimer();
    hoverHideTimerRef.current = setTimeout(() => {
      setHoverRow(null);
      hoverHideTimerRef.current = null;
    }, delay);
  }, [clearHoverTimer]);
  const dismissHover = useCallback(() => {
    clearHoverTimer();
    setHoverRow(null);
  }, [clearHoverTimer]);

  // Escape key always dismisses the popover. Belt + suspenders for the
  // rare case where a MapLibre marker re-render orphans the mouseleave
  // listener (mostly fitBounds-driven re-renders on single-result
  // searches like "Walmart").
  useEffect(() => {
    if (!hoverRow) return;
    const onKey = (e) => { if (e.key === 'Escape') dismissHover(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hoverRow, dismissHover]);

  // Clear any pending timer on unmount so we don't setState after unmount.
  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

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
      // Enrich with industry / vertical / revenue / opp score so the
      // results table can show the same column set as Pulse Explorer.
      // Non-blocking — if the overlay errors the search still renders
      // (those columns just show — instead of values).
      const keys = resp.results.map((h) => h.key).filter(Boolean);
      const metadata = await fetchSearchMetadataOverlay(keys).catch(() => ({}));
      const norm = normalizeCompanySearchResults(resp.results, metadata);
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
    // Auto-save on open — core behavior from the legacy Search page that the
    // Explorer rewrite (daf839c) dropped. Opening a company adds it to Command
    // Center so it shows up under Saved Companies. Skip if already saved (the
    // is_saved overlay flag) to avoid burning a save credit, and never block
    // navigation on it (cap-reached / network errors are non-fatal here).
    if (!row.is_saved) {
      saveCompanyToCommandCenter({
        shipper: row.raw,
        profile: null,
        stage: 'prospect',
        source: 'importyeti',
      }).catch(() => { /* non-fatal: explicit Save button still available */ });
    }
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
    clearHoverTimer();
    setHoverRow(row);
    if (pos) setHoverPos({ x: pos.x, y: pos.y });
  }, [clearHoverTimer]);
  const onBubbleLeave = useCallback(() => {
    // Don't hide immediately — give the cursor 180ms to land on the
    // popover card. The card's own onMouseEnter cancels this timer.
    scheduleHide(180);
  }, [scheduleHide]);

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

        {/* Filter chips. NOTE: deliberately no vendor names in the UI
            (per product direction — users should never see "ImportYeti"
            or any other data-provider name). Query + Mapped is enough
            context; the row table also no longer prints provenance. */}
        {submitted ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-3">
            <Chip label="Query" value={submitted} />
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
            panelOpen && hasResults ? 'h-[55%] min-h-[160px] sm:h-[58%]' : 'flex-1 min-h-[200px]'
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

          {/* Bubble hover preview — floats next to the bubble. The
              hover-bridge timer (clearHoverTimer / scheduleHide) keeps
              the card alive while the cursor is over it; moving away
              starts a 120ms close timer; X button + Escape force-close. */}
          {hoverRow ? (
            <BubblePopover
              row={hoverRow}
              pos={hoverPos}
              onOpen={(e) => { dismissHover(); onOpenDetails(hoverRow, e); }}
              onClose={dismissHover}
              onCardEnter={clearHoverTimer}
              onCardLeave={() => scheduleHide(120)}
            />
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
          <div className={`flex flex-col min-h-0 border-t border-slate-200 bg-white transition-[height] duration-200 ${panelOpen ? 'h-[45%] min-h-[140px] sm:h-[42%]' : 'h-0'}`}>
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

// Column widths shared between the header row and every data row so
// values line up vertically (the previous flex layout had each row's
// columns size to its own content, producing the staggered look the
// user flagged). Matches the Pulse Explorer's results-table column
// set: Account | Industry | Vertical | Origin → Destination | TEU 12M
// | Annual Sales | Opp Score | Actions.
//
// On phones we collapse to a denser layout: Account stays full-width
// and the right-hand metric block scrolls horizontally if it overflows.
const LIST_GRID_COLS =
  'minmax(200px,2.4fr) minmax(120px,1.3fr) minmax(110px,1.2fr) minmax(150px,1.5fr) 80px 100px 70px 130px';

function ListView({ rows, onRowClick, onSave, onOpen }) {
  return (
    <div>
      {/* Header row — sticks to the top of the scroll area so column
          labels stay visible while the user scrolls a long result set. */}
      <div
        className="sticky top-0 z-10 hidden border-b border-slate-200 bg-slate-50/95 px-3 py-1.5 backdrop-blur lg:grid lg:px-4"
        style={{ gridTemplateColumns: LIST_GRID_COLS, columnGap: '0.75rem' }}
      >
        <HeaderCell>Account</HeaderCell>
        <HeaderCell>Industry</HeaderCell>
        <HeaderCell>Vertical</HeaderCell>
        <HeaderCell>Origin → Destination</HeaderCell>
        <HeaderCell align="right">TEU 12M</HeaderCell>
        <HeaderCell align="right">Annual Sales</HeaderCell>
        <HeaderCell align="right">Opp Score</HeaderCell>
        <HeaderCell align="right">Actions</HeaderCell>
      </div>

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
    </div>
  );
}

function HeaderCell({ children, align = 'left' }) {
  return (
    <div
      className={`font-mono text-[9.5px] uppercase tracking-wider text-slate-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </div>
  );
}

function ListRow({ row, onClick, onSave, onOpen }) {
  const loc = compactLocation(row.city, row.state, row.country);
  const annualSales = row.revenue != null && Number.isFinite(row.revenue)
    ? formatMoney(row.revenue)
    : '—';
  const oppScore = row.opportunity_composite_score != null
    ? Math.round(row.opportunity_composite_score).toString()
    : '—';
  // Polish 4: when every enrichment column is empty we show an inline
  // "Full details on profile" hint so the user knows the data exists
  // on the deeper Company Profile page — common case for rows the user
  // has never opened. Saved companies that still lack data don't get
  // the hint (their data genuinely isn't there).
  const enrichmentMissing =
    !row.industry && !row.vertical && row.revenue == null &&
    row.teu == null && row.opportunity_composite_score == null;
  const showProfileHint = enrichmentMissing && !row.is_saved;

  return (
    <div
      role="row"
      onClick={onClick}
      className="group cursor-pointer text-left transition hover:bg-cyan-50/50"
    >
      {/* Desktop / tablet — the aligned grid. */}
      <div
        className="hidden items-center px-3 py-2 lg:grid lg:px-4"
        style={{ gridTemplateColumns: LIST_GRID_COLS, columnGap: '0.75rem' }}
      >
        {/* Account = avatar + name + location */}
        <div className="flex min-w-0 items-center gap-2.5">
          <CompanyAvatar name={row.company_name} domain={row.domain} size={28} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-display flex items-center gap-1.5 truncate text-[13px] font-semibold text-slate-900">
              {loc.flag ? <span className="text-[14px] leading-none" aria-hidden>{loc.flag}</span> : null}
              <span className="truncate">{row.company_name}</span>
            </div>
            <div className="font-body mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-slate-500">
              <span className="truncate">{loc.text || '—'}</span>
              {row.is_saved ? (
                <span className="shrink-0 rounded-sm bg-emerald-100 px-1 text-[8.5px] uppercase text-emerald-700">saved</span>
              ) : null}
              {row.mapStatus === 'approximate' ? (
                <span className="shrink-0 rounded-sm bg-amber-100 px-1 text-[8.5px] uppercase text-amber-700">approx</span>
              ) : null}
              {row.mapStatus === 'unmapped' ? (
                <span className="shrink-0 rounded-sm bg-slate-100 px-1 text-[8.5px] uppercase text-slate-500">no map</span>
              ) : null}
            </div>
            {showProfileHint ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpen(e); }}
                className="font-body mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-cyan-700 hover:text-cyan-900"
              >
                Open profile for full details
                <ExternalLink size={9} />
              </button>
            ) : null}
          </div>
        </div>

        <Cell text={row.industry} />
        <Cell text={row.vertical} />
        <Cell text={row.top_lane ?? row.top_origin_country} muted />
        <NumberCell value={row.teu != null ? formatCompact(row.teu) : '—'} />
        <NumberCell value={annualSales} />
        <ScoreCell value={oppScore} />

        <div className="flex shrink-0 items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSave(e); }}
            className="font-display rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(e); }}
            className="font-display rounded-md bg-slate-900 px-2 py-1 text-[10.5px] font-semibold text-white transition hover:bg-slate-700"
          >
            Open
          </button>
        </div>
      </div>

      {/* Mobile — denser two-row card. */}
      <div className="flex flex-col gap-1.5 px-3 py-2 lg:hidden">
        <div className="flex items-start gap-2">
          <CompanyAvatar name={row.company_name} domain={row.domain} size={28} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-display flex items-center gap-1.5 truncate text-[13px] font-semibold text-slate-900">
              {loc.flag ? <span className="text-[14px] leading-none" aria-hidden>{loc.flag}</span> : null}
              <span className="truncate">{row.company_name}</span>
            </div>
            <div className="font-body mt-0.5 truncate text-[10.5px] text-slate-500">{loc.text || '—'}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSave(e); }}
              className="font-display rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10.5px] font-semibold text-slate-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen(e); }}
              className="font-display rounded-md bg-slate-900 px-2 py-1.5 text-[10.5px] font-semibold text-white"
            >
              Open
            </button>
          </div>
        </div>
        <div className="ml-9 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px]">
          <MobileStat label="Industry" value={row.industry ?? '—'} />
          <MobileStat label="Vertical" value={row.vertical ?? '—'} />
          <MobileStat label="TEU 12M" value={row.teu != null ? formatCompact(row.teu) : '—'} />
          <MobileStat label="Annual Sales" value={annualSales} />
          <MobileStat label="Opp Score" value={oppScore} />
        </div>
      </div>
    </div>
  );
}

function Cell({ text, muted = false }) {
  const value = text && String(text).trim() ? String(text).trim() : '—';
  const isEmpty = value === '—';
  return (
    <div className={`font-body truncate text-[12px] ${isEmpty || muted ? 'text-slate-400' : 'text-slate-700'}`}>
      {value}
    </div>
  );
}

function NumberCell({ value }) {
  return (
    <div className="font-display truncate text-right text-[12px] font-semibold text-slate-900 tabular-nums">
      {value}
    </div>
  );
}

function ScoreCell({ value }) {
  if (value === '—') {
    return <div className="text-right text-[12px] text-slate-400">—</div>;
  }
  const n = Number(value);
  const colorClass = Number.isFinite(n)
    ? n >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : n >= 60 ? 'text-blue-700 bg-blue-50 border-blue-200'
      : n >= 40 ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-rose-700 bg-rose-50 border-rose-200'
    : 'text-slate-700 bg-slate-50 border-slate-200';
  return (
    <div className="flex justify-end">
      <span className={`font-display tabular-nums rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold ${colorClass}`}>
        {value}
      </span>
    </div>
  );
}

function MobileStat({ label, value }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1">
      <span className="font-mono shrink-0 text-[8.5px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-display truncate text-[11px] font-semibold text-slate-800">{value}</span>
    </div>
  );
}

// Money formatter — $1.2M / $46.99M / $1.5B for any positive number.
function formatMoney(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2).replace(/\.0+$/, '')}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.0+$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
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

      <div className="flex items-center justify-end gap-1.5 pt-0.5 sm:pt-1">
        {/* Source provenance row removed per product direction — we
            never name our upstream data providers in the UI. */}
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
// place above it. The wrapper itself accepts pointer events so the
// onMouseEnter/Leave handlers (driven by the hover-bridge timer in the
// parent) keep the card alive while the user moves onto it. The X
// button is a force-close belt to dismiss the popover even when a
// MapLibre marker re-render orphans the original mouseleave listener.
function BubblePopover({ row, pos, onOpen, onClose, onCardEnter, onCardLeave }) {
  const loc = compactLocation(row.city, row.state, row.country);
  return (
    <div
      className="fixed z-30 -translate-x-1/2 -translate-y-full"
      style={{ left: pos.x, top: pos.y - 8 }}
      role="tooltip"
      onMouseEnter={onCardEnter}
      onMouseLeave={onCardLeave}
    >
      <div className="relative w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl">
        {/* Explicit close — covers the case where a marker re-render
            (e.g. fitBounds after a single-result search) destroys the
            original DOM element so its mouseleave never fires. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose?.(); }}
          aria-label="Close preview"
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={11} />
        </button>

        <div className="flex items-start gap-2 pr-5">
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
