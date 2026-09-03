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

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import {
  AlertTriangle,
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
  RefreshCw,
  SlidersHorizontal,
  Building2,
  Ship,
  CircleDollarSign,
  Bookmark,
  BookmarkCheck,
  ArrowUpRight,
  Globe2,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams, useNavigate } from 'react-router-dom';

import {
  searchShippers,
  saveCompanyToCommandCenter,
  getIyCompanyProfile,
  fetchSearchMetadataOverlay,
} from '@/lib/api';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import useBreakpoint from '@/hooks/useBreakpoint';
import { AnimatePresence } from 'framer-motion';
import CompanyDetailPanel from './CompanyDetailPanel';
import { enrichCompanyLive } from '@/api/ai';
import { looksLikeCompanyName, parseExploreQuery, localExtractFilters, parsedToFilters, hasAnyFilter } from '@/api/pulse-explore-parse';
import { useExploreAccounts } from '@/features/pulse/explore/useExploreAccounts';
// Lazy-loaded so maplibre-gl (~800KB) ships in its own chunk instead of the
// first-load bundle for this default landing route.
const ExploreMap = lazy(() => import('@/features/pulse/explore/ExploreMapMaplibre'));
import { normalizeCompanySearchResults } from '@/lib/explorer/normalizeCompanySearch';
import { countryFlag, compactLocation } from '@/lib/explorer/countryFlags';
import { unlockCompany } from '@/api/entitlements';
import { useExplorer } from './ExplorerContext';

// Credits v2 (§7): once the unlock endpoint tells us metering is OFF we cache it
// module-side so opening companies stays instant (no per-open round-trip) while
// the credits_metering_enabled flag is dark. Flips itself the moment metering
// goes live (the endpoint stops returning metering_off).
let meteringKnownOff = false;

const PAGE_SIZE = 50;
const PLACEHOLDER = 'Search by company name, importer, shipper, or supplier';
const EXAMPLE_QUERIES = ['Walmart', 'Tesla', 'Nike', 'Home Depot', 'Target'];

// localStorage keys so view-mode + panel state persist across visits.
const LS_VIEW_KEY = 'lit.explorer.companySearch.view';
const LS_PANEL_KEY = 'lit.explorer.companySearch.panelOpen';

export default function CompanySearchTab() {
  const { setSelectedCompany } = useExplorer();
  const navigate = useNavigate();
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
  // True when the last result set was served from the free Supabase cache
  // (no live ImportYeti credit spent). Drives the "Refresh data" affordance.
  const [servedFromCache, setServedFromCache] = useState(false);
  // Non-null when the edge fn degraded to the saved local index (daily quota
  // exhausted / provider kill-switch / upstream error). Shape:
  // { reason: 'daily_quota'|'provider_disabled'|'upstream_error', quota }.
  // Drives the amber "showing saved index only" banner so a 0-row degraded
  // response never reads as an honest "no companies found".
  const [degraded, setDegraded] = useState(null);
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
  // Desktop (>=640px) shows the results list as a LEFT OVERLAY floating over a
  // full-bleed map (Google-Maps style). Mobile keeps the bottom drawer.
  const { isMobile } = useBreakpoint();
  // Inline detail panel — clicking a result opens this in place (Google-Maps
  // behavior) instead of navigating straight to the full profile page.
  const [detailRow, setDetailRow] = useState(null);
  // Search TYPE — 'companies' (name lookup) vs 'market' (Pulse universe browse
  // by location/industry). Auto-detected from the query, overridable via the
  // toggle. Both render in THIS same overlay/map/detail UI (the true merge).
  const [searchMode, setSearchMode] = useState('companies');
  const modeTouched = useRef(false); // stop auto-detect once the user toggles
  const [marketFilters, setMarketFilters] = useState({});

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

  // Auto-run whenever the URL ?q= differs from what we last handled — covers
  // initial mount (a ?q= deep link) AND in-app navigation to a NEW company
  // without a hard reload (e.g. the Explorer "Search for live data" button,
  // which navigates to ?tab=company&q=…). `query` is local state seeded once on
  // mount, so we watch the live URL param directly.
  const urlQ = (sp.get('q') ?? '').trim();
  const handledQRef = useRef('');
  useEffect(() => {
    if (!urlQ || handledQRef.current === urlQ) return;
    handledQRef.current = urlQ;
    setQuery(urlQ);
    runSearch(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  // `forceRefresh` skips the free Supabase cache and forces a fresh live pull
  // (which consumes a search credit). Default path is cache-first / credit-free.
  const runSearch = useCallback(async (rawQ, opts) => {
    const q = (rawQ ?? query).trim();
    if (!q) return;
    // Decide the search TYPE. Respect an explicit toggle; otherwise auto-detect:
    // a company name → 'companies'; a location/industry query ("companies in
    // georgia") → 'market'.
    const resolvedMode = opts?.mode ?? (modeTouched.current ? searchMode : (looksLikeCompanyName(q) ? 'companies' : 'market'));
    if (resolvedMode !== searchMode) setSearchMode(resolvedMode);

    if (resolvedMode === 'market') {
      // Browse the universe by location/industry in THIS UI (no bounce to old
      // Pulse). Parse the query → filters deterministically first, LLM fallback.
      handledQRef.current = q;
      setSubmitted(q);
      setDetailRow(null);
      setSp((prev) => {
        const next = new URLSearchParams(prev);
        next.set('q', q);
        return next;
      }, { replace: true });
      let mf = localExtractFilters(q);
      if (!hasAnyFilter(mf)) {
        try { mf = parsedToFilters(await parseExploreQuery(q)); } catch { /* keep local */ }
      }
      setMarketFilters(mf);
      return;
    }
    // Mark this q handled so the ?q= effect (which fires when runSearch writes
    // the param below) doesn't kick off a duplicate search.
    handledQRef.current = q;
    const forceRefresh = opts?.forceRefresh === true;
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
      const resp = await searchShippers({ q, page: 1, pageSize: PAGE_SIZE, forceRefresh });
      setServedFromCache(resp?.meta?.cache === true);
      setDegraded(
        resp?.degraded === true
          ? { reason: resp.degraded_reason || 'upstream_error', quota: resp.quota || null }
          : null,
      );
      if (!resp?.ok || !Array.isArray(resp.results)) {
        throw new Error(resp?.message || 'Company search failed.');
      }
      // Enrich with industry / vertical / revenue / opp score so the
      // results table can show the same column set as Pulse Explorer.
      // Non-blocking — if the overlay errors the search still renders
      // (those columns just show — instead of values).
      const keys = resp.results.map((h) => h.key).filter(Boolean);
      // Pass names too so the overlay can bridge V6 firmographics by canonical
      // company name (those rows have no source_company_key to match on).
      const nameByKey = {};
      for (const h of resp.results) {
        if (h.key) nameByKey[h.key] = h.title || h.name || null;
      }
      const metadata = await fetchSearchMetadataOverlay(keys, nameByKey).catch(() => ({}));
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
      setServedFromCache(false);
      setDegraded(null);
    } finally {
      setSearching(false);
    }
  }, [query, setSp, searchMode]);

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

    const proceed = () => {
      // Pre-warm the profile snapshot in the BACKGROUND. Never await it — it's a
      // 10-15s importyeti-proxy call, and awaiting it before navigating made the
      // click do nothing for many seconds (users hard-refreshed to recover).
      getIyCompanyProfile({ companyKey: row.source_company_key }).catch(() => {});
      // Auto-save on open — core behavior from the legacy Search page that the
      // Explorer rewrite (daf839c) dropped. Skip if already saved; never block
      // navigation (cap-reached / network errors are non-fatal here).
      if (!row.is_saved) {
        saveCompanyToCommandCenter({
          shipper: row.raw,
          profile: null,
          stage: 'prospect',
          source: 'importyeti',
        }).catch(() => { /* non-fatal: explicit Save button still available */ });
      }
      const slug = encodeURIComponent(row.source_company_key || row.id);
      // SPA navigation — instant, keeps the React app mounted. The previous
      // window.location.href did a full document reload, which read as a hang.
      navigate(`/app/companies/${slug}`);
    };

    // Credits v2 unlock gate (§7). While credits_metering_enabled is OFF this is
    // a no-op: the endpoint returns metering_off, we cache it, and every open is
    // instant. When metering is ON, unlocking a NEW company costs 1 credit at
    // the workspace level; re-opening an already-owned company is free. On an
    // insufficient balance we block the open and offer a top-up rather than
    // silently failing. unlockCompany() fails OPEN on any transient error.
    if (meteringKnownOff) { proceed(); return; }
    const res = await unlockCompany({
      source_company_key: row.source_company_key,
      company_id: row.company_id ?? null,
      company_name: row.company_name ?? null,
    });
    if (res.ok) {
      if (res.meteringOff) meteringKnownOff = true;
      proceed();
    } else {
      toast.error(res.message || 'Not enough credits to unlock this company.', {
        action: { label: 'Add credits', onClick: () => navigate('/app/billing/credits') },
      });
    }
  }, [navigate]);

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
    // Open the inline detail panel in place — the map keeps context. The full
    // profile is the deliberate "Open full profile" action inside the panel.
    setDetailRow(row);
  }, [setSelectedCompany]);

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

  // ── Market mode: browse the universe by location/industry (Pulse data) inside
  //    THIS overlay/map/detail. Rows are shape-compatible with company-search
  //    rows (company_name/domain/city/state/teu/industry); a light mapper
  //    reconciles the few differences (opportunity → opportunity_composite_score).
  const marketEnabled = searchMode === 'market' && hasAnyFilter(marketFilters);
  const { data: marketData, isLoading: marketLoading } = useExploreAccounts(marketFilters, null, {
    enabled: marketEnabled,
    limit: 500,
  });
  const marketRows = useMemo(() => (marketData?.rows ?? []).map((r) => ({
    ...r,
    id: r.id ?? r.company_id ?? r.source_company_key,
    company_name: r.company_name ?? r.name ?? 'Company',
    opportunity_composite_score: r.opportunity_composite_score ?? r.opportunity ?? null,
    source_company_key: r.source_company_key ?? r.company_key ?? null,
    is_saved: r.is_saved ?? false,
    raw: r,
  })), [marketData]);

  // The active result set + map rows, whichever mode is live.
  const displayResults = searchMode === 'market' ? marketRows : results;
  const displayMapRows = searchMode === 'market' ? marketRows : mapRows;

  // ── High-level filters (client-side, over the current result set). Narrow
  //    the LIST and the MAP together so the two never disagree. ──────────────
  const [filters, setFilters] = useState({ country: '', industry: '', savedOnly: false, minShipments: 0, minScore: 0 });
  const filterOptions = useMemo(() => {
    const countries = new Set();
    const industries = new Set();
    for (const r of displayResults) {
      if (r.country) countries.add(String(r.country));
      if (r.industry) industries.add(String(r.industry));
    }
    return { countries: [...countries].sort(), industries: [...industries].sort() };
  }, [displayResults]);
  const filteredResults = useMemo(() => displayResults.filter((r) => {
    if (filters.country && String(r.country || '') !== filters.country) return false;
    if (filters.industry && String(r.industry || '') !== filters.industry) return false;
    if (filters.savedOnly && !r.is_saved) return false;
    if (filters.minShipments > 0) {
      const s = Number(r.shipments ?? r.raw?.totalShipments ?? r.raw?.shipments ?? 0);
      if (!(s >= filters.minShipments)) return false;
    }
    if (filters.minScore > 0) {
      const sc = Number(r.opportunity_composite_score ?? 0);
      if (!(sc >= filters.minScore)) return false;
    }
    return true;
  }), [displayResults, filters]);
  const anyFilter = Boolean(filters.country || filters.industry || filters.savedOnly || filters.minShipments > 0 || filters.minScore > 0);
  const filteredIds = useMemo(() => new Set(filteredResults.map((r) => r.id)), [filteredResults]);
  const filteredMapRows = useMemo(
    () => (anyFilter ? displayMapRows.filter((m) => filteredIds.has(m.id)) : displayMapRows),
    [displayMapRows, filteredIds, anyFilter],
  );

  // Resolve missing domains for the result set (free Apollo org search) so the
  // LIST logos render — the owner's "website on search" ask. Bounded to the top
  // 10 domainless rows; a ref guards against re-tries so patching results can't
  // loop. (On-click panel enrichment is separate + fuller.)
  const domainTried = useRef(new Set());
  useEffect(() => {
    const targets = results.filter((r) => !r.domain && !domainTried.current.has(r.id)).slice(0, 10);
    if (!targets.length) return undefined;
    targets.forEach((r) => domainTried.current.add(r.id));
    let cancelled = false;
    (async () => {
      await Promise.all(targets.map(async (r) => {
        try {
          const res = await enrichCompanyLive({ name: r.company_name });
          const dom = res?.data?.website;
          if (!cancelled && dom) {
            setResults((prev) => prev.map((x) => (x.id === r.id ? { ...x, domain: dom } : x)));
          }
        } catch { /* ignore */ }
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const busy = searching || marketLoading;
  const hasSearched = Boolean(submitted) && !busy;
  const hasResults = displayResults.length > 0;

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

        {/* Search-type toggle — auto-set from the query (name → Companies;
            location/industry → Market), click to override. Both render in this
            same map + overlay + detail UI. */}
        <div className="mt-2 flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5 text-[11.5px]">
            {[['companies', 'Companies'], ['market', 'Market']].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => { modeTouched.current = true; setSearchMode(m); if (submitted) runSearch(submitted, { mode: m }); }}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${searchMode === m ? 'bg-cyan-500 text-slate-900' : 'text-slate-300 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hidden text-[10.5px] text-cyan-200/60 sm:inline">
            {searchMode === 'market' ? 'Browse companies by location / industry' : 'Find a company by name'}
          </span>
        </div>

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
            {/* Refresh affordance — forces a fresh live data pull. The default
                search path is served from our cache (no credit); this button
                lets the user explicitly re-fetch the latest. Shown once a
                search has run; highlighted subtly when the current results
                came from cache so the user knows fresher data is available. */}
            {hasSearched ? (
              <button
                type="button"
                onClick={() => runSearch(submitted, { forceRefresh: true })}
                disabled={searching}
                title="Pull the latest data for this search"
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 transition disabled:opacity-50 ${
                  servedFromCache
                    ? 'bg-amber-400/[0.14] text-amber-100 ring-amber-300/40 hover:bg-amber-400/25'
                    : 'bg-white/[0.06] text-cyan-100 ring-white/15 hover:bg-white/10'
                }`}
              >
                <RefreshCw size={11} className={searching ? 'animate-spin' : ''} />
                Refresh data
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Body: FULL-BLEED map with the results list overlaying the left
          edge (Google-Maps style) on desktop; bottom drawer on mobile. The
          map never resizes — the list floats over it. ── */}
      <div className="relative flex-1 min-h-0">
        {/* Map is ALWAYS full-bleed + always mounted. */}
        <div className="absolute inset-0">
          <Suspense fallback={<div className="absolute inset-0 bg-slate-100 animate-pulse" />}>
            <ExploreMap
              rows={filteredMapRows}
              colorMode="industry"
              sizeMode="teu"
              selection={[]}
              onBubbleClick={onRowClick}
              onBubbleHover={onBubbleHover}
              onBubbleLeave={onBubbleLeave}
              fitBoundsToPoints={hasResults}
              labeledMarkers
              mapMode="bubbles"
              mapStyle="alidade_satellite"
            />
          </Suspense>

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

          {/* Loading overlay — covers the map while a search runs (10–15s)
              so the user knows to wait. Animated spinner + bouncing dots +
              a friendly "cooking" message. */}
          {busy ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-900/10 backdrop-blur-[1px]">
              <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-7 py-6 text-center shadow-xl backdrop-blur">
                <div className="relative flex h-12 w-12 items-center justify-center">
                  <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-cyan-100 border-t-cyan-500" />
                  <Sparkles size={18} className="animate-pulse text-cyan-600" />
                </div>
                <div className="font-display text-[14px] font-bold text-slate-900">
                  Cooking up your query…
                </div>
                <p className="font-body max-w-[240px] text-[11.5px] leading-snug text-slate-500">
                  Pulling live shipment intelligence and plotting your matches.
                  This can take 10–15 seconds.
                </p>
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-500 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-500 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-500" />
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

          {/* Collapsed-state pill — MOBILE ONLY (desktop always shows the
              left overlay). Appears when the drawer is closed + we have
              results. Click to expand. */}
          {isMobile && !panelOpen && hasResults ? (
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
        {hasResults && (panelOpen || !isMobile) ? (
          <div className="absolute z-20 flex flex-col overflow-hidden border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl inset-x-0 bottom-0 h-[52%] min-h-[180px] rounded-t-2xl border-t sm:inset-y-3 sm:bottom-3 sm:left-3 sm:right-auto sm:h-auto sm:w-[400px] sm:rounded-2xl sm:border">
            <PanelHeader
              total={filteredResults.length}
              unmapped={unmappedCount}
              onCollapse={() => setPanelOpen(false)}
            />
            <ResultFilters
              filters={filters}
              options={filterOptions}
              onChange={setFilters}
              total={results.length}
              shown={filteredResults.length}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ListView
                rows={filteredResults}
                onRowClick={onRowClick}
                onSave={onSave}
                onOpen={onOpenDetails}
              />
            </div>
          </div>
        ) : null}

        {/* Inline company detail panel — overlays the list (same position,
            higher z) when a result/bubble is clicked. Back button returns to
            the list; "Open full profile" navigates to the full Command Center
            profile. */}
        <AnimatePresence>
          {detailRow ? (
            <CompanyDetailPanel
              row={detailRow}
              onClose={() => setDetailRow(null)}
              onOpenFull={onOpenDetails}
              onSave={onSave}
            />
          ) : null}
        </AnimatePresence>

        {/* Degraded-search banner — the edge fn fell back to the saved
            local index (quota / kill-switch / upstream outage), so these
            results are NOT live. Prominent amber so a 0-row degraded
            response never masquerades as "no such company exists". */}
        {degraded && !searching ? (
          <div className="absolute left-3 right-3 top-3 z-30 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg sm:left-[420px]">
            <div className="font-body flex items-start gap-2 text-[12.5px] font-medium text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <span className="flex-1">{degradedBannerMessage(degraded)}</span>
              {degraded.reason === 'daily_quota' ? (
                <button
                  type="button"
                  onClick={() => navigate('/app/billing')}
                  className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Upgrade for more searches
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Error / empty-state banner — sits outside the panel, always
            visible above whatever's open. */}
        {error && !searching ? (
          <div className="absolute left-3 right-3 top-3 z-30 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:left-[420px]">
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

// Copy for the amber degraded-search banner. NOTE: deliberately no vendor
// names ("ImportYeti") — same product rule as the filter chips above.
function degradedBannerMessage(degraded) {
  if (!degraded) return '';
  if (degraded.reason === 'daily_quota') {
    const cap = Number(degraded.quota?.cap);
    const used = Number(degraded.quota?.used);
    const counts =
      Number.isFinite(cap) && Number.isFinite(used) ? ` (${used}/${cap})` : '';
    return `Daily live-search limit reached${counts} — showing your saved index only. Live results resume tomorrow.`;
  }
  if (degraded.reason === 'provider_disabled') {
    return 'Live shipment data is temporarily disabled by an administrator — showing saved index only.';
  }
  return 'Live data provider unreachable — showing saved index only. Try again in a few minutes.';
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
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse results"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 sm:hidden"
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}

// High-level filter bar inside the results overlay. Compact facet controls
// (native selects fit the ~400px overlay) + a Clear + a shown/total count.
// Narrows the list AND the map together (see filteredResults/filteredMapRows).
function FacetSelect({ icon: Icon, value, onChange, active, tone = 'blue', title, children }) {
  const on = active
    ? (tone === 'amber' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-blue-300 bg-blue-50 text-blue-700')
    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300';
  return (
    <label title={title} className={`inline-flex h-7 items-center gap-1 rounded-lg border pl-2 pr-1 text-[11px] transition ${on}`}>
      <Icon size={11} className="shrink-0 opacity-80" />
      <select value={value} onChange={onChange} className="max-w-[112px] cursor-pointer bg-transparent py-1 font-semibold outline-none">
        {children}
      </select>
    </label>
  );
}

function ResultFilters({ filters, options, onChange, total, shown }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const any = filters.country || filters.industry || filters.savedOnly || filters.minShipments > 0 || filters.minScore > 0;
  return (
    <div className="border-b border-slate-100 bg-white/70 px-3 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          <Filter size={11} className="text-blue-500" /> Filters
        </span>
        {options.countries.length > 1 ? (
          <FacetSelect icon={Globe2} title="Country" active={Boolean(filters.country)} value={filters.country} onChange={(e) => set({ country: e.target.value })}>
            <option value="">Country</option>
            {options.countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </FacetSelect>
        ) : null}
        {options.industries.length > 1 ? (
          <FacetSelect icon={Building2} title="Industry" active={Boolean(filters.industry)} value={filters.industry} onChange={(e) => set({ industry: e.target.value })}>
            <option value="">Industry</option>
            {options.industries.map((c) => <option key={c} value={c}>{c}</option>)}
          </FacetSelect>
        ) : null}
        <FacetSelect icon={Ship} title="Shipment volume" active={filters.minShipments > 0} value={String(filters.minShipments)} onChange={(e) => set({ minShipments: Number(e.target.value) })}>
          <option value="0">Any volume</option>
          <option value="50">50+ shipments</option>
          <option value="200">200+ shipments</option>
          <option value="1000">1,000+ shipments</option>
        </FacetSelect>
        <FacetSelect icon={CircleDollarSign} tone="amber" title="Opportunity score" active={filters.minScore > 0} value={String(filters.minScore)} onChange={(e) => set({ minScore: Number(e.target.value) })}>
          <option value="0">Any score</option>
          <option value="40">Score 40+</option>
          <option value="60">Score 60+</option>
          <option value="80">Score 80+</option>
        </FacetSelect>
        <button
          type="button"
          onClick={() => set({ savedOnly: !filters.savedOnly })}
          className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition active:scale-[0.96] motion-reduce:active:scale-100 ${
            filters.savedOnly ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          {filters.savedOnly ? <BookmarkCheck size={11} className="text-emerald-500" /> : <Bookmark size={11} />} Saved
        </button>
        {any ? (
          <button
            type="button"
            onClick={() => onChange({ country: '', industry: '', savedOnly: false, minShipments: 0, minScore: 0 })}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-500 hover:text-rose-600"
          >
            <X size={11} /> Clear
          </button>
        ) : null}
      </div>
      {any ? (
        <div className="mt-1 text-[10.5px] font-medium text-slate-500">Showing {shown.toLocaleString()} of {total.toLocaleString()}</div>
      ) : null}
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

  const scoreN = row.opportunity_composite_score != null ? Math.round(row.opportunity_composite_score) : null;
  const scoreTone = scoreN == null ? ''
    : scoreN >= 80 ? 'bg-emerald-100 text-emerald-700'
    : scoreN >= 60 ? 'bg-blue-100 text-blue-700'
    : scoreN >= 40 ? 'bg-amber-100 text-amber-700'
    : 'bg-rose-100 text-rose-700';
  void oppScore;

  return (
    <div
      role="row"
      onClick={onClick}
      className="group cursor-pointer text-left transition hover:bg-blue-50/40"
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <CompanyAvatar name={row.company_name} domain={row.domain} size={36} className="shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display flex items-center gap-1.5 truncate text-[13.5px] font-bold text-slate-900">
                {loc.flag ? <span className="text-[13px] leading-none" aria-hidden>{loc.flag}</span> : null}
                <span className="truncate">{row.company_name}</span>
              </div>
              <div className="font-body mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                <MapPin size={10} className="shrink-0 text-slate-400" />
                <span className="truncate">{loc.text || '—'}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSave(e); }}
                title={row.is_saved ? 'Saved' : 'Save to Command Center'}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 active:scale-[0.96] motion-reduce:active:scale-100"
              >
                {row.is_saved ? <BookmarkCheck size={12} className="text-emerald-500" /> : <Bookmark size={12} />}
                <span className="hidden sm:inline">{row.is_saved ? 'Saved' : 'Save'}</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpen(e); }}
                title="Open full profile"
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.96] motion-reduce:active:scale-100"
              >
                Open <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
          {/* Metric chips — icon + meaningful color (Apple §16: color carries meaning). */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {row.industry ? <MetricChip icon={Building2} tone="blue">{row.industry}</MetricChip> : null}
            {row.teu != null && Number(row.teu) > 0 ? <MetricChip icon={Ship} tone="cyan">{formatCompact(row.teu)} TEU</MetricChip> : null}
            {annualSales !== '—' ? <MetricChip icon={CircleDollarSign} tone="emerald">{annualSales}</MetricChip> : null}
            {scoreN != null ? (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[10.5px] font-bold tabular-nums ${scoreTone}`}>
                {scoreN}<span className="text-[8px] font-semibold uppercase opacity-70">opp</span>
              </span>
            ) : null}
            {showProfileHint ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpen(e); }}
                className="font-body inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800"
              >
                details on profile <ExternalLink size={9} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Small icon + colored value pill for a result-row metric. Apple §16: color
// is used to carry meaning, not decoration.
function MetricChip({ icon: Icon, tone = 'slate', children }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`inline-flex max-w-[150px] items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${tones[tone] || tones.slate}`}>
      <Icon size={10} className="shrink-0" />
      <span className="truncate">{children}</span>
    </span>
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
            className="font-display rounded-md bg-blue-600 px-2 py-1.5 text-[10.5px] font-semibold text-white transition hover:bg-blue-700 active:scale-[0.96] motion-reduce:active:scale-100 sm:py-1"
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
          className="font-display mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700 active:scale-[0.97] motion-reduce:active:scale-100"
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
