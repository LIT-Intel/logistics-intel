// SaveAsViewModal — persists the current Pulse Explorer view (filters +
// selection IDs + map state) as a "Map Selection" via pulse-map-selection-save.
// Distinct from "Save to Pulse List" which saves the COMPANIES; this saves
// only the filter + zoom state.

import { useState } from 'react';
import { saveMapSelection } from '@/api/pulse-map-selections';
import { toast } from 'sonner';
import { X, Bookmark } from 'lucide-react';

export default function SaveAsViewModal({ open, onClose, state, mapCenter, mapZoom }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveMapSelection({
        name: name.trim(),
        filters: state.filters ?? {},
        selection_ids: state.selection ?? [],
        map_state: {
          center: mapCenter ?? [39.5, -98.35],
          zoom: mapZoom ?? 4,
          color_mode: state.color,
          size_mode: state.size,
        },
      });
      toast.success(`Saved view "${name.trim()}"`);
      setName('');
      onClose?.();
    } catch (err) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <form onSubmit={submit} className="w-[420px] rounded-lg bg-white shadow-2xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Bookmark size={16} className="text-cyan-600" />
              Save map view
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Saves filters + selection + map zoom — <strong>not the companies themselves</strong>. Reload it any time from the sidebar.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Southeast manufacturers above 5k TEU"
          autoFocus
          className="mt-4 w-full px-3 py-2 rounded border border-slate-200 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-3 py-1.5 rounded bg-cyan-600 text-white text-sm hover:bg-cyan-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save view'}
          </button>
        </div>
      </form>
    </div>
  );
}
