// AddToListPicker — small popover wired into the Quick Card's
// "Add to list" action. Lists the current user's Pulse Saved Lists,
// supports inline list creation, and writes a single membership row
// when the user picks one. Shows a friendly TABLES_PENDING state if
// the migration hasn't been applied yet.

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Database, Loader2, Plus, Search, X } from 'lucide-react';
import {
  listPulseLists,
  createPulseList,
  addCompanyToList,
} from '@/features/pulse/pulseListsApi';

export default function AddToListPicker({
  open,
  onClose,
  companyId,         // lit_companies.id (UUID) of the company to add
  companyName,
  contextQuery,      // current Pulse search query — auto-populates new lists
  onSaved,           // callback fired after a successful add
}) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tablesPending, setTablesPending] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyListId, setBusyListId] = useState(null);
  const [doneListId, setDoneListId] = useState(null);
  const newNameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTablesPending(false);
    setDoneListId(null);
    listPulseLists().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        if (res.code === 'TABLES_PENDING') {
          setTablesPending(true);
        } else {
          setError(res.message || 'Failed to load lists.');
        }
        setLists([]);
      } else {
        setLists(res.rows);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (creating && newNameRef.current) newNameRef.current.focus();
  }, [creating]);

  if (!open) return null;

  const filtered = filter.trim()
    ? lists.filter((l) => l.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : lists;

  async function handlePick(list) {
    if (!companyId) {
      setError('Save the company first so it has a database id.');
      return;
    }
    setBusyListId(list.id);
    setError(null);
    const res = await addCompanyToList(list.id, companyId);
    setBusyListId(null);
    if (!res.ok) {
      setError(res.message || 'Failed to add to list.');
      return;
    }
    setDoneListId(list.id);
    onSaved?.(list);
    // Brief success affordance, then close
    setTimeout(() => onClose?.(), 800);
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusyListId('__create__');
    setError(null);
    const created = await createPulseList({
      name: trimmed,
      queryText: contextQuery || null,
    });
    if (!created.ok) {
      setBusyListId(null);
      setError(created.message || 'Failed to create list.');
      return;
    }
    // Auto-add the current company to the new list
    if (companyId) {
      const add = await addCompanyToList(created.list.id, companyId);
      if (!add.ok) {
        setBusyListId(null);
        setError(add.message || 'List created, but adding company failed.');
        return;
      }
    }
    setBusyListId(null);
    setDoneListId(created.list.id);
    setLists((prev) => [{ ...created.list, company_count: companyId ? 1 : 0 }, ...prev]);
    onSaved?.(created.list);
    setTimeout(() => onClose?.(), 800);
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed inset-0 z-[60] bg-slate-950/30"
      />

      {/* Popover — centered over the rail, small */}
      <div className="fixed left-1/2 top-1/2 z-[61] w-[360px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.25)]">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Database className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[13px] font-bold text-slate-900">
              Add to a Saved List
            </div>
            <div className="font-body truncate text-[11px] text-slate-500">
              {companyName ? `Adding ${companyName}` : 'Pick a list'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* Filter / create row */}
        {!tablesPending ? (
          <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a list…"
                className="font-body w-full rounded-md border border-slate-200 bg-[#FAFBFC] py-1.5 pl-7 pr-2 text-[12px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white"
              />
            </div>
            <button
              type="button"
              onClick={() => { setCreating(true); setNewName(filter || ''); }}
              className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>
        ) : null}

        {/* Inline create form */}
        {creating ? (
          <div className="border-b border-slate-100 bg-blue-50/30 px-3.5 py-2.5">
            <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              New list name
            </div>
            <div className="flex gap-1.5">
              <input
                ref={newNameRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder="e.g. Vietnam → GA · Auto parts"
                className="font-body flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || busyListId === '__create__'}
                className="font-display inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)] disabled:opacity-50"
              >
                {busyListId === '__create__' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="font-display rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
            {contextQuery ? (
              <div className="font-body mt-1.5 text-[10px] text-slate-500">
                The list will remember the search "{contextQuery.slice(0, 60)}{contextQuery.length > 60 ? '…' : ''}".
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Body */}
        <div className="max-h-[320px] overflow-y-auto">
          {tablesPending ? (
            <div className="flex flex-col items-center gap-2 p-5 text-center">
              <Database className="h-5 w-5 text-amber-500" />
              <div className="font-display text-[12px] font-semibold text-slate-700">
                Saved Lists isn't set up yet
              </div>
              <div className="font-body max-w-[260px] text-[11px] text-slate-500">
                Apply migration{' '}
                <span className="font-mono text-[10.5px] text-slate-700">
                  20260502120000_pulse_saved_lists.sql
                </span>{' '}
                in Supabase to enable named lists. The Pulse Library still works without it.
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 p-5 text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-body text-[12px]">Loading your lists…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-5 text-center">
              <Database className="h-5 w-5 text-slate-300" />
              <div className="font-display text-[12px] font-semibold text-slate-700">
                {lists.length === 0 ? 'No lists yet' : 'No matches'}
              </div>
              <div className="font-body max-w-[260px] text-[11px] text-slate-500">
                {lists.length === 0
                  ? 'Create your first list to organize Pulse discoveries.'
                  : 'Try a different search or create a new list.'}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(list)}
                    disabled={busyListId === list.id}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-blue-50/40 disabled:opacity-60"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                      <Database className="h-3 w-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display truncate text-[12.5px] font-semibold text-slate-900">
                        {list.name}
                      </div>
                      <div className="font-body truncate text-[10.5px] text-slate-500">
                        {list.company_count ?? 0} compan{(list.company_count ?? 0) === 1 ? 'y' : 'ies'}
                        {list.query_text ? ` · "${list.query_text.slice(0, 40)}${list.query_text.length > 40 ? '…' : ''}"` : ''}
                      </div>
                    </div>
                    {busyListId === list.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    ) : doneListId === list.id ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Error footer */}
        {error ? (
          <div className="border-t border-rose-100 bg-rose-50 px-3.5 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </>
  );
}
