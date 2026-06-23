// Library panel — saved map views (lit_pulse_map_selections) + Pulse Lists.
// Quick-load any saved view back into the current Explore state.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, Loader2, MapPin, FolderOpen, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { listMapSelections } from '@/api/pulse-map-selections';
import { listPulseLists } from '@/features/pulse/pulseListsApi';

function fmtRel(ts) {
  if (!ts) return '';
  const t = new Date(ts).getTime();
  const ms = Date.now() - t;
  const h = ms / 36e5;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 14) return `${Math.round(d)}d ago`;
  if (d < 60) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

export default function LibraryPanel({ onLoadSelection }) {
  const navigate = useNavigate();
  const [selections, setSelections] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sel, ls] = await Promise.all([
        listMapSelections().catch(() => ({ selections: [] })),
        listPulseLists().catch(() => ({ rows: [] })),
      ]);
      setSelections(sel?.selections ?? []);
      // listPulseLists returns { ok, rows } — NOT a bare array. Reading it as
      // an array left the panel permanently empty ("doesn't recognize the
      // saved list") even when lists existed.
      setLists(Array.isArray(ls?.rows) ? ls.rows : Array.isArray(ls) ? ls : []);
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900 inline-flex items-center gap-2">
            <Library size={16} /> Library
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Saved map views + your Pulse Lists.</p>
        </div>
        <button
          type="button"
          onClick={load}
          aria-label="Refresh"
          className="text-slate-400 hover:text-slate-700"
        >
          <RefreshCw size={14} />
        </button>
      </header>

      {loading && (
        <div className="p-4 text-sm text-slate-500 inline-flex items-center gap-2">
          <Loader2 className="animate-spin" size={14} /> Loading…
        </div>
      )}
      {error && (
        <div className="m-4 text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>
      )}

      {!loading && !error && (
        <>
          <section className="border-b border-slate-100 px-4 py-3">
            <h4 className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">
              Saved map views ({selections.length})
            </h4>
            {selections.length === 0 ? (
              <div className="text-xs text-slate-400 italic">
                None yet — use the bookmark icon to save the current filters + zoom.
              </div>
            ) : (
              <ul className="space-y-2">
                {selections.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1.5 hover:border-cyan-300 hover:bg-cyan-50/30">
                    <button
                      type="button"
                      onClick={() => onLoadSelection?.(s)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="text-sm font-medium text-slate-900 truncate inline-flex items-center gap-1">
                        <MapPin size={11} className="text-cyan-600 shrink-0" />
                        {s.name}
                      </div>
                      <div className="text-[10px] text-slate-500">{fmtRel(s.updated_at)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="px-4 py-3">
            <h4 className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">
              Pulse Lists ({lists.length})
            </h4>
            {lists.length === 0 ? (
              <div className="text-xs text-slate-400 italic">
                You haven&apos;t created any Pulse Lists yet.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {lists.map((l) => {
                  const count = l.company_count ?? l.member_count;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/app/lists/${l.id}`)}
                        className="flex w-full items-center gap-2 rounded border border-slate-100 px-2 py-1.5 text-left hover:border-cyan-300 hover:bg-cyan-50/30"
                      >
                        <FolderOpen size={12} className="text-cyan-600 shrink-0" />
                        <span className="text-sm text-slate-800 truncate flex-1">{l.name}</span>
                        {count != null && (
                          <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{count}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
