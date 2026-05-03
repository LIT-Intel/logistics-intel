// Pulse Library — collapsible saved-companies surface scoped to Pulse.
//
// Mounted at the bottom of the Pulse page, collapsed by default so it
// never competes with the active search. When the user expands it they
// see every company they've previously saved from Pulse, with grid /
// list view modes, free-text search, and structured filters by
// country / state / city. Click a card → opens the same Quick Card
// the search results use.

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  Filter,
  Grid3x3,
  Inbox,
  Layers,
  LayoutList,
  Loader2,
  Lock,
  RefreshCw,
  Search as SearchIcon,
  Share2,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import { extractDomain } from '@/lib/logo';
import {
  getPulseSavedCompanies,
  filterLibrary,
  uniqueValues,
} from '@/features/pulse/pulseLibraryApi';
import {
  listPulseLists,
  getListCompanies,
  getLastRefreshAt,
  shareList,
} from '@/features/pulse/pulseListsApi';
import { refreshList } from '@/features/pulse/refreshList';

export default function PulseLibrary({ onSelect, refreshKey = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('all'); // 'all' | 'lists'
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [view, setView] = useState('grid');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Saved Lists tab state
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsTablesPending, setListsTablesPending] = useState(false);
  const [activeList, setActiveList] = useState(null); // selected list id
  const [listRows, setListRows] = useState([]);
  const [listRowsLoading, setListRowsLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { rows: data } = await getPulseSavedCompanies();
      setRows(data);
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadLists() {
    setListsLoading(true);
    setListsTablesPending(false);
    const res = await listPulseLists();
    if (!res.ok && res.code === 'TABLES_PENDING') {
      setListsTablesPending(true);
      setLists([]);
    } else {
      setLists(res.rows || []);
    }
    setListsLoading(false);
  }

  async function loadListRows(listId) {
    setListRowsLoading(true);
    const res = await getListCompanies(listId);
    setListRows(res.ok ? res.rows : []);
    setListRowsLoading(false);
  }

  // Lazy-load the first time the user expands the library, then refresh
  // any time refreshKey changes (e.g. after a new save).
  useEffect(() => {
    if (!expanded) return;
    if (tab === 'all' && !hasLoadedOnce) load();
    if (tab === 'lists' && !lists.length && !listsTablesPending) loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, tab]);

  useEffect(() => {
    if (hasLoadedOnce) load();
    if (lists.length || listsTablesPending) loadLists();
    if (activeList) loadListRows(activeList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    if (activeList) loadListRows(activeList);
  }, [activeList]);

  const countries = useMemo(() => uniqueValues(rows, 'country'), [rows]);
  const states = useMemo(() => uniqueValues(rows, 'state'), [rows]);
  const cities = useMemo(() => uniqueValues(rows, 'city'), [rows]);

  const filtered = useMemo(
    () => filterLibrary(rows, { query, country, state, city }),
    [rows, query, country, state, city],
  );

  const hasActiveFilter = Boolean(query || country || state || city);

  return (
    <section className="mt-6 rounded-[14px] border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-t-[14px] px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          <Database className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-2 text-[13px] font-bold text-slate-900">
            Pulse Library
            <span className="font-mono inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {hasLoadedOnce ? rows.length : '—'}
            </span>
          </div>
          <div className="font-body mt-0.5 text-[11px] text-slate-500">
            Companies you've saved from Pulse — kept separate from Command Center.
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded ? (
        <div className="border-t border-slate-100">
          {/* Tab strip */}
          <div className="flex items-center gap-1 border-b border-slate-100 px-3 pt-2">
            <TabBtn active={tab === 'all'} onClick={() => setTab('all')} icon={Database} label="All saves" count={hasLoadedOnce ? rows.length : null} />
            <TabBtn active={tab === 'lists'} onClick={() => setTab('lists')} icon={Layers} label="Lists" count={lists.length || null} />
          </div>

          {tab === 'lists' ? (
            <ListsTab
              lists={lists}
              loading={listsLoading}
              tablesPending={listsTablesPending}
              activeList={activeList}
              onSelectList={setActiveList}
              onCloseList={() => setActiveList(null)}
              listRows={listRows}
              listRowsLoading={listRowsLoading}
              onSelectCompany={onSelect}
              onRefresh={loadLists}
              onListUpdated={(listId) => {
                // Refetch the list-companies (so new rows appear) AND
                // the lists overview (so the count + updated_at bump)
                loadListRows(listId);
                loadLists();
              }}
            />
          ) : (
          <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your saved companies"
                className="font-body w-full rounded-md border border-slate-200 bg-[#FAFBFC] py-1.5 pl-7 pr-2 text-[12px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={[
                'font-display inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition',
                showFilters || hasActiveFilter
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              <Filter className="h-3 w-3" />
              Filters
              {hasActiveFilter ? (
                <span className="font-mono ml-0.5 rounded-full bg-blue-600 px-1.5 text-[9px] text-white">
                  {[country, state, city, query].filter(Boolean).length}
                </span>
              ) : null}
            </button>

            <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="Grid view"
                className={[
                  'flex h-7 w-7 items-center justify-center transition',
                  view === 'grid' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50',
                ].join(' ')}
              >
                <Grid3x3 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label="List view"
                className={[
                  'flex h-7 w-7 items-center justify-center border-l border-slate-200 transition',
                  view === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50',
                ].join(' ')}
              >
                <LayoutList className="h-3 w-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              aria-label="Refresh library"
              className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={['h-3 w-3', loading ? 'animate-spin' : ''].join(' ')} />
              Refresh
            </button>
          </div>

          {showFilters ? (
            <div className="grid grid-cols-1 gap-2 border-b border-slate-100 bg-[#FAFBFC] px-4 py-2.5 sm:grid-cols-3">
              <FilterSelect
                label="Country"
                value={country}
                onChange={setCountry}
                options={countries}
                onClear={() => setCountry('')}
              />
              <FilterSelect
                label="State / region"
                value={state}
                onChange={setState}
                options={states}
                onClear={() => setState('')}
              />
              <FilterSelect
                label="City"
                value={city}
                onChange={setCity}
                options={cities}
                onClear={() => setCity('')}
              />
            </div>
          ) : null}

          {/* Body */}
          <div className="px-4 py-4">
            {loading ? (
              <LibrarySkeleton view={view} />
            ) : filtered.length === 0 ? (
              <EmptyLibrary hasRows={rows.length > 0} hasActiveFilter={hasActiveFilter} />
            ) : view === 'grid' ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((c) => (
                  <LibraryCard key={c.id || c.saved_id} company={c} onClick={() => onSelect?.(c)} />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full">
                  <thead className="border-b border-slate-200 bg-[#FAFBFC]">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-3 py-2">Company</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <LibraryRow key={c.id || c.saved_id} company={c} onClick={() => onSelect?.(c)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ─── Tabs / Lists tab ─── */

function TabBtn({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'font-display -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[11.5px] font-semibold transition',
        active
          ? 'border-blue-500 text-blue-700'
          : 'border-transparent text-slate-500 hover:text-slate-700',
      ].join(' ')}
    >
      <Icon className="h-3 w-3" />
      {label}
      {count != null ? (
        <span className="font-mono rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-500">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function ListsTab({
  lists,
  loading,
  tablesPending,
  activeList,
  onSelectList,
  onCloseList,
  listRows,
  listRowsLoading,
  onSelectCompany,
  onRefresh,
  onListUpdated,
}) {
  if (tablesPending) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Layers className="h-5 w-5 text-amber-500" />
        <div className="font-display text-[12.5px] font-semibold text-slate-700">
          Saved Lists isn't set up yet
        </div>
        <div className="font-body max-w-[420px] text-[11px] text-slate-500">
          Apply migration{' '}
          <span className="font-mono text-[10.5px] text-slate-700">
            20260502120000_pulse_saved_lists.sql
          </span>{' '}
          in Supabase to enable named lists. The "All saves" tab still works without it.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-8 text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="font-body text-[12px]">Loading your lists…</span>
      </div>
    );
  }

  if (!lists.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Layers className="h-5 w-5 text-blue-400" />
        <div className="font-display text-[12.5px] font-semibold text-slate-700">
          No Saved Lists yet
        </div>
        <div className="font-body max-w-[420px] text-[11px] text-slate-500">
          Run a Pulse search, click <strong>Add to list</strong> on any Quick Card, then
          choose <em>New</em> to create your first list. Lists let you save curated
          discoveries by theme — Vietnam → GA auto-parts importers, fast-growing SaaS in
          Texas, etc.
        </div>
      </div>
    );
  }

  if (activeList) {
    const list = lists.find((l) => l.id === activeList);
    return (
      <ListDetailView
        list={list}
        listRows={listRows}
        listRowsLoading={listRowsLoading}
        onCloseList={onCloseList}
        onSelectCompany={onSelectCompany}
        onListUpdated={onListUpdated}
      />
    );
  }

  // Lists overview grid
  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-body text-[11.5px] text-slate-500">
          {lists.length} list{lists.length === 1 ? '' : 's'}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => {
          const isShared = Boolean(list.is_shared);
          const isOwner = list.is_owner ?? true;
          return (
            <button
              key={list.id}
              type="button"
              onClick={() => onSelectList(list.id)}
              className="group flex flex-col gap-2 rounded-[12px] border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <Layers className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display flex items-center gap-1.5 truncate text-[13px] font-bold text-slate-900">
                    <span className="truncate">{list.name}</span>
                    {isShared && isOwner ? (
                      <Users className="h-2.5 w-2.5 shrink-0 text-blue-600" />
                    ) : null}
                  </div>
                  {list.query_text ? (
                    <div className="font-body line-clamp-2 text-[10.5px] text-slate-500">
                      "{list.query_text}"
                    </div>
                  ) : (
                    <div className="font-body text-[10.5px] italic text-slate-400">
                      No source query
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                <span className="font-mono inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  {list.company_count ?? 0} compan{(list.company_count ?? 0) === 1 ? 'y' : 'ies'}
                  {!isOwner && list.owner ? (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="font-display inline-flex items-center gap-0.5 text-[9.5px] font-semibold text-slate-500">
                        <Share2 className="h-2 w-2" />
                        {list.owner.name}
                      </span>
                    </>
                  ) : null}
                </span>
                <span className="font-display text-[10px] font-semibold text-blue-600 group-hover:text-blue-700">
                  Open →
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── List detail view (with Refresh / Inbox affordance) ─── */

function ListDetailView({ list, listRows, listRowsLoading, onCloseList, onSelectCompany, onListUpdated }) {
  const { orgId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState(null);
  // companies just added by the most recent refresh — used to paint a
  // NEW badge on the cards for the rest of the session
  const [newIds, setNewIds] = useState(new Set());
  const [progress, setProgress] = useState(null);
  // Last refresh timestamp lives in localStorage (no schema change).
  const [lastRefreshAt, setLastRefreshAt] = useState(() =>
    list?.id ? getLastRefreshAt(list.id) : null,
  );
  const [sharingPending, setSharingPending] = useState(false);
  const [shareError, setShareError] = useState(null);

  const isOwner = list?.is_owner ?? true;
  const isShared = Boolean(list?.is_shared);

  async function handleToggleShare() {
    if (!list || !isOwner) return;
    if (!isShared && !orgId) {
      setShareError(
        'You need to be a member of an organization to share this list. Open Settings → Workspace to join one.',
      );
      return;
    }
    setSharingPending(true);
    setShareError(null);
    const res = await shareList(list.id, !isShared, orgId);
    setSharingPending(false);
    if (!res.ok) {
      setShareError(res.message || 'Failed to update sharing.');
      return;
    }
    onListUpdated?.(list.id);
  }

  async function handleRefresh() {
    if (!list || refreshing) return;
    setRefreshing(true);
    setRefreshStatus(null);
    setProgress('Reading list members…');

    const res = await refreshList({
      list,
      onProgress: (msg) => setProgress(msg),
    });

    setRefreshing(false);
    setProgress(null);

    if (!res.ok) {
      setRefreshStatus({ tone: 'error', message: res.message || 'Refresh failed.' });
      return;
    }

    setLastRefreshAt(Date.now());

    if (res.newAdded > 0) {
      setNewIds(new Set(res.newCompanyIds));
      setRefreshStatus({
        tone: 'success',
        message: `Added ${res.newAdded} new compan${res.newAdded === 1 ? 'y' : 'ies'} to this list${res.limitHit ? ' (some skipped — plan limit hit)' : ''}.`,
      });
      onListUpdated?.(list.id);
    } else if (res.limitHit) {
      setRefreshStatus({
        tone: 'warn',
        message: 'Could not add new companies — plan limit reached. Upgrade at /app/billing.',
      });
    } else {
      setRefreshStatus({
        tone: 'idle',
        message: `No new matches. ${res.totalRun} total result${res.totalRun === 1 ? '' : 's'} were already in your list.`,
      });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-[#FAFBFC] px-4 py-2.5">
        <button
          type="button"
          onClick={onCloseList}
          className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← All lists
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-1.5 truncate text-[12.5px] font-bold text-slate-900">
            <span className="truncate">{list?.name || 'List'}</span>
            {isShared ? (
              <span
                title="Shared with your team"
                className="font-display inline-flex items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-blue-700"
              >
                <Users className="h-2 w-2" />
                Shared
              </span>
            ) : null}
            {!isOwner && list?.owner ? (
              <span
                title={`Shared by ${list.owner.email || list.owner.name}`}
                className="font-display inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-600"
              >
                <Share2 className="h-2 w-2" />
                {list.owner.name}
              </span>
            ) : null}
          </div>
          {list?.query_text ? (
            <div className="font-body truncate text-[10.5px] text-slate-500">
              "{list.query_text}"
            </div>
          ) : null}
        </div>
        <span className="font-mono rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          {listRows.length} compan{listRows.length === 1 ? 'y' : 'ies'}
        </span>
        {lastRefreshAt ? (
          <span className="font-body text-[10px] text-slate-400">
            Refreshed {formatRelativeAgo(lastRefreshAt)}
          </span>
        ) : null}

        {/* Share toggle — owner only */}
        {isOwner ? (
          <button
            type="button"
            onClick={handleToggleShare}
            disabled={sharingPending}
            title={isShared ? 'Stop sharing with your team' : 'Share with your team'}
            className={[
              'font-display inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50',
              isShared
                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {sharingPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isShared ? (
              <Users className="h-3 w-3" />
            ) : (
              <Share2 className="h-3 w-3" />
            )}
            {isShared ? 'Shared' : 'Share'}
          </button>
        ) : (
          <span
            title="Read-only — owned by another team member"
            className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-500"
          >
            <Lock className="h-2.5 w-2.5" />
            Read only
          </span>
        )}

        {/* Refresh — owner only */}
        {isOwner ? (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || !list?.query_text}
            title={!list?.query_text ? 'No source query — refresh requires the original prompt.' : 'Re-run the source query and add new matches'}
            className="font-display inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Inbox className="h-3 w-3" />
            )}
            {refreshing ? (progress || 'Refreshing…') : 'Refresh inbox'}
          </button>
        ) : null}
      </div>

      {/* Share error */}
      {shareError ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11.5px] text-amber-800">
          {shareError}
        </div>
      ) : null}

      {/* Status strip — shows after a refresh attempt */}
      {refreshStatus ? (
        <div
          className={[
            'flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-[11.5px]',
            refreshStatus.tone === 'success' ? 'bg-green-50 text-green-700'
              : refreshStatus.tone === 'error' ? 'bg-rose-50 text-rose-700'
              : refreshStatus.tone === 'warn' ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-50 text-slate-600',
          ].join(' ')}
        >
          {refreshStatus.tone === 'success' ? <Sparkles className="h-3 w-3" /> : null}
          <span className="font-body">{refreshStatus.message}</span>
        </div>
      ) : null}

      <div className="px-4 py-4">
        {listRowsLoading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="font-body text-[12px]">Loading list…</span>
          </div>
        ) : listRows.length === 0 ? (
          <div className="font-body py-4 text-center text-[12px] text-slate-500">
            This list is empty. {list?.query_text ? 'Try Refresh inbox to populate it from the source query.' : ''}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listRows.map((c) => (
              <LibraryCard
                key={c.id}
                company={c}
                isNew={newIds.has(c.id)}
                onClick={() => onSelectCompany?.(c)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelativeAgo(ts) {
  if (!ts) return '';
  const ageMs = Date.now() - ts;
  if (ageMs < 60_000) return 'just now';
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  return `${Math.floor(ageMs / 86_400_000)}d ago`;
}

/* ─── Sub-components ─── */

function LibraryCard({ company, onClick, isNew }) {
  const domain = extractDomain(company.domain || company.website);
  const location = [company.city, company.state, company.country].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex flex-col gap-2 rounded-[12px] border bg-white p-3 text-left transition',
        isNew
          ? 'border-cyan-300 shadow-[0_4px_14px_rgba(34,211,238,0.18)]'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <CompanyAvatar
          name={company.name}
          domain={domain || null}
          size="sm"
          className="!h-9 !w-9 !rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-1.5 text-[13px] font-bold leading-tight text-slate-900">
            <span className="truncate">{company.name}</span>
            {isNew ? (
              <span
                className="font-display inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                style={{
                  background: 'linear-gradient(135deg,#0F172A,#1E293B)',
                  color: '#00F0FF',
                  border: '1px solid rgba(0,240,255,0.35)',
                }}
              >
                <Zap className="h-2 w-2" />
                New
              </span>
            ) : null}
          </div>
          <div className="font-body mt-0.5 truncate text-[10.5px] text-slate-500">
            {domain || 'No domain'}
            {location ? ` · ${location}` : ''}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {company.stage || 'prospect'}
        </span>
        <span className="font-display text-[10px] font-semibold text-blue-600 group-hover:text-blue-700">
          Open →
        </span>
      </div>
    </button>
  );
}

function LibraryRow({ company, onClick }) {
  const domain = extractDomain(company.domain || company.website);
  const location = [company.city, company.state, company.country].filter(Boolean).join(', ');
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-slate-100 last:border-b-0 transition hover:bg-blue-50/40"
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <CompanyAvatar
            name={company.name}
            domain={domain || null}
            size="sm"
            className="!h-7 !w-7 !rounded-md"
          />
          <div className="min-w-0">
            <div className="font-display truncate text-[12px] font-semibold text-slate-900">
              {company.name}
            </div>
            <div className="font-body truncate text-[10.5px] text-slate-500">
              {domain || '—'}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-[11px] text-slate-700">{location || '—'}</td>
      <td className="px-3 py-2">
        <span className="font-display inline-flex rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          {company.stage || 'prospect'}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-[10.5px] text-slate-500">
        {company.last_viewed_at ? formatDate(company.last_viewed_at) : '—'}
      </td>
    </tr>
  );
}

function FilterSelect({ label, value, onChange, options, onClear }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="font-display w-[80px] shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </label>
      <div className="relative flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-body w-full appearance-none rounded-md border border-slate-200 bg-white py-1 pl-2 pr-6 text-[11.5px] text-slate-900 outline-none focus:border-blue-300"
        >
          <option value="">All</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyLibrary({ hasRows, hasActiveFilter }) {
  if (hasActiveFilter && hasRows) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Filter className="h-5 w-5 text-slate-300" />
        <div className="font-display text-[12px] font-semibold text-slate-700">
          No companies match these filters
        </div>
        <div className="font-body text-[11px] text-slate-500">
          Clear a filter or search term to see more.
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Sparkles className="h-5 w-5 text-blue-400" />
      <div className="font-display text-[12px] font-semibold text-slate-700">
        Your Pulse Library is empty
      </div>
      <div className="font-body max-w-[320px] text-[11px] text-slate-500">
        Run a search above and click <strong>Add to list</strong> on the Quick Card to start
        building a discovery list — kept separate from Command Center.
      </div>
    </div>
  );
}

function LibrarySkeleton({ view }) {
  if (view === 'list') {
    return (
      <div className="overflow-hidden rounded-md border border-slate-200">
        <div className="border-b border-slate-100 bg-[#FAFBFC] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Loading library…
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
            <div className="h-7 w-7 animate-pulse rounded-md bg-slate-100" />
            <div className="flex-1 space-y-1">
              <div className="h-2 w-1/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[12px] border border-slate-200 bg-white p-3"
        >
          <div className="flex items-start gap-2.5">
            <div className="h-9 w-9 animate-pulse rounded-md bg-slate-100" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}
