// In-search Library — a slide-over (same slot as the results list) that shows
// the user's saved lists + lists ASSIGNED to them, and opens one IN PLACE:
// clicking a list re-runs its saved search on this same map+list surface. No
// navigating away to /app/lists. This is how an assignee opens "their" target
// accounts — they log into Search, hit the Library icon, click the assigned
// list, and it runs right here.

import { useEffect, useState } from 'react';
import {
  X, Loader2, Users, Bookmark, Search as SearchIcon, ArrowUpRight, FolderOpen, RefreshCw,
} from 'lucide-react';
import { listPulseLists } from '@/features/pulse/pulseListsApi';

function ListCard({ list, onOpen }) {
  const runnable = Boolean(list.query_text?.trim());
  return (
    <button
      type="button"
      onClick={() => onOpen(list)}
      className="group w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40 active:scale-[0.99] motion-reduce:active:scale-100"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display truncate text-[13px] font-bold text-slate-900">{list.name}</div>
          {list.query_text ? (
            <div className="font-body mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
              <SearchIcon size={10} className="shrink-0" /> <span className="truncate">{list.query_text}</span>
            </div>
          ) : (
            <div className="font-body mt-0.5 text-[11px] text-slate-400">Saved company list</div>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
          {runnable ? <><RefreshCw size={11} /> Run</> : <><ArrowUpRight size={11} /> Open</>}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          {(list.company_count ?? 0).toLocaleString()} compan{(list.company_count ?? 0) === 1 ? 'y' : 'ies'}
        </span>
        {list.is_shared ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
            <Users size={9} /> Team
          </span>
        ) : null}
        {!list.is_owner && list.owner ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700" title={list.owner.email || list.owner.name}>
            Assigned by {list.owner.name}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export default function SearchLibraryPanel({ open, onClose, onOpenList }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listPulseLists()
      .then((res) => setLists(res?.ok ? res.rows : []))
      .catch(() => setLists([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const assigned = lists.filter((l) => !l.is_owner);
  const mine = lists.filter((l) => l.is_owner);

  return (
    <div className="absolute z-30 flex flex-col overflow-hidden border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl inset-x-0 bottom-0 h-[64%] min-h-[240px] rounded-t-2xl border-t sm:inset-y-3 sm:bottom-3 sm:left-3 sm:right-auto sm:h-auto sm:w-[400px] sm:rounded-2xl sm:border">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="font-display inline-flex items-center gap-2 text-[13px] font-bold text-slate-900">
          <FolderOpen size={15} className="text-blue-600" /> Library
        </h3>
        <button type="button" onClick={onClose} aria-label="Close library" className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-slate-500">
            <Loader2 size={16} className="animate-spin text-blue-500" /> Loading your lists…
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-100">
              <Bookmark size={17} className="text-slate-400" />
            </div>
            <p className="font-display text-[13px] font-semibold text-slate-800">No saved lists yet</p>
            <p className="font-body max-w-[260px] text-[11.5px] leading-snug text-slate-500">
              Run a search and hit <span className="font-semibold text-slate-700">Save to Library</span> to keep it — and assign it to teammates.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {assigned.length > 0 ? (
              <section className="space-y-1.5">
                <h4 className="font-display px-1 text-[10px] font-bold uppercase tracking-wide text-violet-500">Assigned to you · {assigned.length}</h4>
                {assigned.map((l) => <ListCard key={l.id} list={l} onOpen={onOpenList} />)}
              </section>
            ) : null}
            <section className="space-y-1.5">
              <h4 className="font-display px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Your lists · {mine.length}</h4>
              {mine.length === 0 ? (
                <p className="px-1 text-[11.5px] text-slate-400">Nothing saved yet.</p>
              ) : (
                mine.map((l) => <ListCard key={l.id} list={l} onOpen={onOpenList} />)
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
