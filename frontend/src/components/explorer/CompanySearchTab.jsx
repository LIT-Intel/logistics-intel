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
      <div className="border-b border-slate-200 bg-gradient-to-r from-[#0F1828] to-[#1E293B] px-5 py-4 text-white">
        <div className="flex items-center gap-2 text-[12px] text-cyan-200/80">
          <SearchIcon size={12} />
          <span>Intelligence Explorer</span>
          <span className="text-cyan-200/40">/</span>
          <span className="font-semibold text-white">Company Search</span>
        </div>

        <form onSubmit={onSubmit} className="mt-2.5 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur">
          <SearchIcon size={14} className="text-cyan-300/80" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER}
            className="font-body flex-1 border-0 bg-transparent py-1 text-[14px] text-white outline-none placeholder:text-slate-400"
            disabled={searching}
            maxLength={200}
          />
          {query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X size={12} />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="font-display inline-flex shrink-0 items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-1.5 text-[12px] font-semibold text-slate-900 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {searching ? <Sparkles size={12} className="animate-pulse" /> : <ArrowRight size={12} />}
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {/* ── Analytics ribbon ───────────────────────────────────── */}
        {analytics ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] text-cyan-100/90">
            <Metric label="Matching companies" value={analytics.matchingCompanies.toLocaleString()} />
            {analytics.totalShipments > 0
              ? <Metric label="Total shipments" value={analytics.totalShipments.toLocaleString()} />
              : null}
            <Metric label="Mapped locations" value={`${analytics.mappedLocations.toLocaleString()} / ${analytics.matchingCompanies.toLocaleString()}`} />
            {analytics.mostRecentShipment
              ? <Metric label="Most recent" value={formatDate(analytics.mostRecentShipment)} />
              : null}
          </div>
        ) : null}

        {/* ── Filter chips row (Company Search-specific) ─────────── */}
        {submitted ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
        {/* Map — half-height when results are present, full when idle */}
        <div className={`relative border-b border-slate-200 transition-[height] ${hasResults ? 'h-[42%]' : 'flex-1'}`}>
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
          <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-4">
            {unmappedCount > 0 ? (
              <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11.5px] text-amber-800">
                <MapPin size={12} />
                <span>
                  <strong>{unmappedCount}</strong>
                  {' '}of <strong>{results.length}</strong> results don&apos;t carry a city or state — they&apos;re below but not on the map.
                </span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

function Metric({ label, value }) {
  return (
    <div className="inline-flex items-baseline gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-300/70">{label}</span>
      <span className="font-display text-[12.5px] font-semibold text-white">{value}</span>
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
      className="group flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-cyan-400/40 hover:shadow-md"
    >
      <div className="flex items-start gap-2.5">
        <CompanyAvatar
          name={row.company_name}
          domain={row.domain}
          size={36}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-[13.5px] font-semibold text-slate-900">{row.company_name}</div>
          {location ? (
            <div className="font-body mt-px flex items-center gap-1 truncate text-[11px] text-slate-500">
              <MapPin size={10} />
              {location}
              {row.mapStatus === 'approximate' ? (
                <span className="ml-1 rounded-sm bg-amber-100 px-1 text-[9px] uppercase text-amber-700">approx</span>
              ) : null}
              {row.mapStatus === 'unmapped' ? (
                <span className="ml-1 rounded-sm bg-slate-100 px-1 text-[9px] uppercase text-slate-500">no coords</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-50 px-2 py-1.5">
        <MiniStat label="Shipments" value={row.shipments != null ? row.shipments.toLocaleString() : '—'} />
        <MiniStat label="TEU 12M" value={row.teu != null ? row.teu.toLocaleString() : '—'} />
        <MiniStat label="Last" value={row.last_shipment ? formatDate(row.last_shipment) : '—'} />
      </div>

      <div className="flex items-center justify-between gap-1.5 pt-1">
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-slate-400">
          {row.source_label}
        </span>
        <div className="flex items-center gap-1">
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
      </div>
    </button>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[8.5px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-display text-[12px] font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function EmptyMapState({ hasSearched, hasResults, examples, onPick }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#F8FAFC]">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
        <div className="font-display inline-flex items-center gap-2 text-[14px] font-semibold text-slate-900">
          <SearchIcon size={14} className="text-cyan-600" />
          {hasSearched ? 'No mappable results' : 'Search a company to begin'}
        </div>
        <p className="font-body mt-1.5 text-[12px] text-slate-500">
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
