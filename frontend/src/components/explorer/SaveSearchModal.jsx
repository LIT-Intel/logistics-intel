// Save the CURRENT search (its query + filter recipe) to the Library as a
// saved list, and optionally assign it to specific teammates. The list stores
// the filter_recipe, so the Library renders the matching accounts live (a
// "smart list") — no per-row materialization needed. Assignees see it in their
// own Library on next load (RLS: pulse_list_assignments + pulse_lists_select).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlus, X, Check, Loader2, Users, Search as SearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { createPulseList, assignList, listOrgMembers } from '@/features/pulse/pulseListsApi';

export default function SaveSearchModal({ open, onClose, defaultName, queryText, filterRecipe }) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(defaultName || '');
    setPicked(new Set());
    setLoadingMembers(true);
    listOrgMembers()
      .then((res) => setMembers(res?.ok ? res.members : []))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [open, defaultName]);

  if (!open) return null;

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Give the list a name.'); return; }
    setSaving(true);
    try {
      const created = await createPulseList({
        name: trimmed,
        queryText: queryText || null,
        filterRecipe: filterRecipe || null,
      });
      if (!created?.ok || !created.list?.id) {
        toast.error(created?.message || 'Could not save the list.');
        return;
      }
      const ids = Array.from(picked);
      if (ids.length) {
        const res = await assignList(created.list.id, ids);
        if (!res?.ok) {
          toast.warning(`List saved, but assigning failed: ${res?.message || 'unknown error'}`);
        } else {
          toast.success(`Saved "${trimmed}" · assigned to ${ids.length} teammate${ids.length === 1 ? '' : 's'}`);
        }
      } else {
        toast.success(`Saved "${trimmed}" to your Library`);
      }
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'Could not save the list.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 backdrop-blur-sm p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-display flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900">
              <FolderPlus size={16} className="text-blue-600" /> Save search to Library
            </h3>
            <p className="font-body mt-0.5 text-[12px] text-slate-500">
              Saves this search as a live list. Assign it and teammates find it waiting in their Library.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Name */}
          <label className="font-display text-[11px] font-bold uppercase tracking-wide text-slate-400">List name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Manufacturers — Midwest"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />

          {/* Assignees */}
          <div className="mt-4 flex items-center justify-between">
            <label className="font-display inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <Users size={12} /> Assign to teammates
            </label>
            {picked.size > 0 ? (
              <span className="text-[11px] font-semibold text-blue-600">{picked.size} selected</span>
            ) : <span className="text-[11px] text-slate-400">optional</span>}
          </div>

          <div className="mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-slate-100">
            {loadingMembers ? (
              <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Loading teammates…
              </div>
            ) : members.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-slate-500">
                No teammates in your organization yet. The list saves to your own Library.
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {members.map((m) => {
                  const on = picked.has(m.user_id);
                  return (
                    <li key={m.user_id}>
                      <button
                        type="button"
                        onClick={() => toggle(m.user_id)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${on ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
                      >
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {on ? <Check size={11} strokeWidth={3} /> : null}
                        </span>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                          {(m.name || '?').slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-slate-800">{m.name}</span>
                          {m.email ? <span className="block truncate text-[11px] text-slate-400">{m.email}</span> : null}
                        </span>
                        {m.role && m.role !== 'member' ? (
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">{m.role}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm transition active:scale-[0.97] hover:bg-blue-700 disabled:opacity-60 motion-reduce:active:scale-100"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
            {picked.size > 0 ? `Save & assign` : 'Save to Library'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
