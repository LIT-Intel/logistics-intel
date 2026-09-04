// Assign an EXISTING saved list to teammates (add or remove). Opened from the
// Library on any list you own. Pre-checks current assignees so it doubles as
// "who is this shared with"; saving diffs against the initial set and calls
// assignList / unassignList. Owner-only (RLS enforces it server-side too).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  listOrgMembers, assignList, unassignList, getListAssignees,
} from '@/features/pulse/pulseListsApi';

export default function AssignListModal({ open, list, onClose }) {
  const [members, setMembers] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [initial, setInitial] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !list?.id) return;
    setLoading(true);
    Promise.all([listOrgMembers(), getListAssignees(list.id)])
      .then(([m, a]) => {
        setMembers(m?.ok ? m.members : []);
        const cur = new Set((a?.ok ? a.rows : []).map((r) => r.user_id));
        setPicked(new Set(cur));
        setInitial(cur);
      })
      .catch(() => { setMembers([]); })
      .finally(() => setLoading(false));
  }, [open, list?.id]);

  if (!open || !list) return null;

  const toggle = (id) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const onSave = async () => {
    setSaving(true);
    try {
      const toAdd = [...picked].filter((id) => !initial.has(id));
      const toRemove = [...initial].filter((id) => !picked.has(id));
      if (toAdd.length) {
        const r = await assignList(list.id, toAdd);
        if (!r?.ok) throw new Error(r?.message || 'Assign failed');
      }
      for (const id of toRemove) {
        await unassignList(list.id, id);
      }
      const added = toAdd.length, removed = toRemove.length;
      toast.success(
        added && removed ? `Updated · +${added} / −${removed}`
          : added ? `Assigned to ${added} teammate${added === 1 ? '' : 's'}`
          : removed ? `Removed ${removed}`
          : 'No changes',
      );
      onClose?.(true);
    } catch (e) {
      toast.error(e?.message || 'Could not update assignments');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/40 backdrop-blur-sm p-4" onMouseDown={() => onClose?.(false)}>
      <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-display flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900">
              <Users size={16} className="text-blue-600" /> Assign list
            </h3>
            <p className="font-body mt-0.5 truncate text-[12px] text-slate-500">
              &ldquo;{list.name}&rdquo; — teammates you pick find it in their Library.
            </p>
          </div>
          <button type="button" onClick={() => onClose?.(false)} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-6 text-[12px] text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Loading teammates…
            </div>
          ) : members.length === 0 ? (
            <div className="px-2 py-6 text-center text-[12px] text-slate-500">
              No teammates in your organization to assign to.
            </div>
          ) : (
            <ul className="space-y-0.5">
              {members.map((m) => {
                const on = picked.has(m.user_id);
                return (
                  <li key={m.user_id}>
                    <button
                      type="button"
                      onClick={() => toggle(m.user_id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${on ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
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
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={() => onClose?.(false)} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm transition active:scale-[0.97] hover:bg-blue-700 disabled:opacity-60 motion-reduce:active:scale-100"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            Save assignments
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
