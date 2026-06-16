// Bulk version of AddToListPicker — saves N selected companies to a
// chosen Pulse List in one shot via bulkAddCompaniesToList. Inline list
// creation supported.

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, X, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  listPulseLists,
  createPulseList,
  bulkAddCompaniesToList,
} from '@/features/pulse/pulseListsApi';

export default function BulkSaveToListModal({ open, onClose, companyIds }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyListId, setBusyListId] = useState(null);
  const [doneListId, setDoneListId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    listPulseLists()
      .then((rows) => setLists(rows ?? []))
      .catch((e) => setError(e?.message ?? 'Failed to load lists'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const onAdd = async (listId) => {
    setBusyListId(listId);
    try {
      const r = await bulkAddCompaniesToList(listId, companyIds);
      setDoneListId(listId);
      toast.success(`Added ${r?.added ?? companyIds.length} to list`);
      setTimeout(() => onClose?.(), 800);
    } catch (e) {
      toast.error(e?.message ?? 'Add failed');
    } finally {
      setBusyListId(null);
    }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await createPulseList({ name: newName.trim() });
      await onAdd(created.id);
      setNewName('');
    } catch (e) {
      toast.error(e?.message ?? 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-[420px] rounded-lg bg-white shadow-2xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <FolderPlus size={16} className="text-cyan-600" />
              Save {companyIds?.length ?? 0} to list
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Pick an existing Pulse List or create a new one.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="mt-4 text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="animate-spin" size={14} /> Loading lists…
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
        )}

        {!loading && !error && (
          <ul className="mt-4 max-h-64 overflow-auto divide-y divide-slate-100">
            {lists.length === 0 && (
              <li className="text-xs text-slate-500 py-2">No lists yet — create one below.</li>
            )}
            {lists.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-800 truncate">{l.name}</span>
                <button
                  type="button"
                  onClick={() => onAdd(l.id)}
                  disabled={busyListId === l.id || doneListId === l.id}
                  className="px-2 py-1 text-xs rounded bg-cyan-50 text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
                >
                  {doneListId === l.id ? (
                    <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Added</span>
                  ) : busyListId === l.id ? (
                    <span className="inline-flex items-center gap-1"><Loader2 className="animate-spin" size={12} /> Adding…</span>
                  ) : 'Add'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onCreate} className="mt-4 flex gap-2 items-center border-t border-slate-100 pt-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New list name…"
            className="flex-1 px-2 py-1.5 rounded border border-slate-200 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Plus size={12} /> Create + add
          </button>
        </form>
      </div>
    </div>
  );
}
