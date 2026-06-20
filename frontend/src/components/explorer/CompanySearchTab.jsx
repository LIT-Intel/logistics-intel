// CompanySearchTab — the Company Search tab inside Intelligence Explorer.
//
// Day-5 PRD pivot: this is the "name lookup" mode of the unified
// Explorer (Walmart / Tesla / Nike). Calls the EXISTING searchShippers()
// edge-function backbone (api.ts:2991) — we do not rebuild the backend.
// We do upgrade the rendering:
//
//   • Same Pulse-style chrome (dark navy header + white body + cyan accents)
//   • Card grid for results (works well for the typical <=50-result lookup)
//   • Map plot for results that resolve to a city or state centroid
//   • Unmappable results stay in the grid below the map (PRD §6 rule)
//   • Quick Card (right rail) shows full company detail on row click
//   • Save to Command Center via the canonical saveCompanyToCommandCenter
//
// What it does NOT change:
//   - Does NOT route through pulse-explore-parse (PRD non-negotiable #4)
//   - Does NOT rename IyShipperHit (PRD non-negotiable #3)
//   - Does NOT replace src/lib/api.ts (PRD non-negotiable #2)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search as SearchIcon, MapPin, Sparkles, X } from 'lucide-react';
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
import { useExplorer } from './ExplorerContext';

const PAGE_SIZE = 50;
const PLACEHOLDER = 'Search by company name, importer, shipper, or supplier';

const EXAMPLE_QUERIES = ['Walmart', 'Tesla', 'Nike', 'Home Depot', 'Target'];

export default function CompanySearchTab() {
  const { setSelectedCompany } = useExplorer();
  const [sp, setSp] = useSearchParams();

  // Hydrate query from ?q= so deep-links from the Coach, marketing
  // surfaces, or saved-view URLs land in the search bar pre-filled.
  const [query, setQuery] = useState(() => (sp.get('q') ?? '').trim());
  const [submitted, setSubmitted] = useState(query);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);   // UnifiedExplorerRow[]
  const [mapPoints, setMapPoints] = useState([]); // UnifiedExplorerRow[]
  const [analytics, setAnalytics] = useState(null);
  const [unmappedCount, setUnmappedCount] = useState(0);
  const inputRef = useRef(null);

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
    // Sync ?q= so refreshing the page restores the same search.
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      next.set('q', q);
      return next;
    }, { replace: true });

    try {
      const resp = await searchShippers({ q, page: 1, pageSize: PAGE_SIZE });
      if (!resp?.ok || !Array.isArray(resp.results)) {
        // searchShippers throws a structured error on LIMIT_EXCEEDED
        // (with .code === 'LIMIT_EXCEEDED'). Surface the message.
        throw new Error(resp?.message || 'Company search failed.');
      }
      const norm = normalizeCompanySearchResults(resp.results);
      setResults(norm.rows);
      setMapPoints(norm.mapPoints);
      setUnmappedCount(norm.unmappedCount);
      setAnalytics(norm.analytics);
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

  const onRowClick = useCallback((row) => {
    // PR 2 ships the card-click path navigating directly to the full
    // company profile. The shared-shell QuickCard rail is a planned
    // polish-pass follow-up (alongside the mode-aware "Refresh latest
    // data" button the user reminded us about). Until then, the Open
    // button on each card and the row-click handler converge on the
    // same destination — the existing Company Profile page.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSelectedCompany]);

  const onSave = useCallback(async (row, e) => {
    e?.stopPropagation?.();
    try {
      const shipper = row.raw; // IyShipperHit
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
    // For PR 2 — navigate to the existing company profile page. The
    // QuickCard's "Open full profile" button does the same thing.
    try {
      // Pre-warm the profile cache so the destination page renders
      // populated immediately. Errors here are non-fatal (the dest
      // page will fetch on its own).
      await getIyCompanyProfile({ companyKey: row.source_company_key });
    } catch {/* non-fatal */}
    const slug = encodeURIComponent(row.source_company_key || row.id);
    window.location.href = `/app/companies/${slug}`;
  }, []);

  // Memoise the map row shape (ExploreMap expects { id, company_name,
  // industry, revenue, teu, latitude, longitude }). Our normalised
  // rows already match that shape — pass through unchanged.
  const mapRows = useMemo(() => mapPoints, [mapPoints]);

  const hasSearched = Boolean(submitted) && !searching;
  const hasResults = results.length > 0;

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* ── Header: dark navy band with title + search bar ───────── */}
      {/* Mobile-first padding: px-3 py-3 on phones, px-5 py-4 on >= sm. */}
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
            // 16px font-size on focus dodges iOS Safari's auto-zoom on
            // form fields below 16px. We render 14px visually but the
            // input's effective size is unchanged thanks to the wrapper.
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

        {/* ── Analytics ribbon ───────────────────────────────────── */}
        {/* Mobile: tighter gap-x, smaller text so 4 metrics still fit on
            two lines max. Hides the longest metric label on the
            narrowest screens; shows again from xs and up. */}
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

        {/* ── Filter chips row (Company Search-specific) ─────────── */}
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

      {/* ── Body: map (top) + results grid (bottom) ──────────────── */}
      <div className="flex flex-1 min-h-0 flex-col">
        {/* Map — half-height when results are present, full when idle.
            Mobile: 38% so the cards below are still scannable without
            scrolling. Desktop: 42% to leave room for 2-3 card rows
            visible without scroll. The min-h ensures the map is never
            so short it loses orientation. */}
        <div
          className={`relative border-b border-slate-200 transition-[height] ${
            hasResults ? 'h-[38%] min-h-[200px] sm:h-[42%]' : 'flex-1 min-h-[260px]'
          }`}
        >
          {mapRows.length > 0 ? (
            <ExploreMap
              rows={mapRows}
              colorMode="industry"
              sizeMode="teu"
              selection={[]}
              onBubbleClick={onRowClick}
              mapMode="bubbles"
              mapStyle="alidade_smooth"
            />
          ) : (
            <EmptyMapState
              hasSearched={hasSearched}
              hasResults={hasResults}
              examples={EXAMPLE_QUERIES}
              onPick={(q) => { setQuery(q); runSearch(q); }}
            />
          )}
        </div>

        {/* Results grid */}
        {hasResults ? (
          <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-3 sm:p-4">
            {unmappedCount > 0 ? (
              <div className="mb-2.5 inline-flex w-fit items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800 sm:mb-3 sm:text-[11.5px]">
                <MapPin size={12} className="shrink-0" />
                <span>
                  <strong>{unmappedCount}</strong>
                  {' '}of <strong>{results.length}</strong> results don&apos;t carry a city or state.
                </span>
              </div>
            ) : null}

            {/* Grid breakpoints: 1 col on phone (<640), 2 on tablet
                (sm-lg), 3 on desktop (xl+). Gap is tighter on mobile to
                fit more cards visible above the fold. */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
              {results.map((row) => (
                <ResultCard
                  key={row.id}
                  row={row}
                  onClick={() => onRowClick(row)}
                  onSave={(e) => onSave(row, e)}
                  onOpen={(e) => onOpenDetails(row, e)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Error / empty state */}
        {error && !searching ? (
          <div className="border-t border-slate-200 bg-white px-5 py-4">
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

function ResultCard({ row, onClick, onSave, onOpen }) {
  const location = [row.city, row.state, row.country].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-px hover:border-cyan-400/40 hover:shadow-md sm:p-3"
    >
      <div className="flex items-start gap-2 sm:gap-2.5">
        <CompanyAvatar
          name={row.company_name}
          domain={row.domain}
          size={32}
          className="shrink-0 sm:!h-9 sm:!w-9"
        />
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-[13px] font-semibold text-slate-900 sm:text-[13.5px]">{row.company_name}</div>
          {location ? (
            <div className="font-body mt-px flex items-center gap-1 truncate text-[10.5px] text-slate-500 sm:text-[11px]">
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{location}</span>
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
          {/* Touch targets: at least 28px tall on mobile to dodge the
              accidental-tap problem with sub-16px controls. */}
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

// Shorten 153,401 → "153K", 2,107,000 → "2.1M". Used by the card
// MiniStats so a high-volume number doesn't blow the column width
// on phones.
function formatCompact(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

function MiniStat({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-mono truncate text-[8.5px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-display truncate text-[11.5px] font-semibold text-slate-900 sm:text-[12px]">{value}</span>
    </div>
  );
}

function EmptyMapState({ hasSearched, hasResults, examples, onPick }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#F8FAFC] px-3 sm:px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-4 text-center shadow-sm sm:px-6 sm:py-5">
        <div className="font-display inline-flex items-center gap-2 text-[13.5px] font-semibold text-slate-900 sm:text-[14px]">
          <SearchIcon size={14} className="text-cyan-600" />
          {hasSearched ? 'No mappable results' : 'Search a company to begin'}
        </div>
        <p className="font-body mt-1.5 text-[11.5px] text-slate-500 sm:text-[12px]">
          {hasSearched
            ? 'Results without a city or state appear in the grid below.'
            : 'Type a brand or shipper name above. We\'ll plot every mappable match on the map.'}
        </p>
        {!hasSearched && examples.length ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {examples.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onPick(q)}
                className="font-display rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-100"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}
