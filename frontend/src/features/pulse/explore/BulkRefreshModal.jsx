// Bulk refresh modal — calls importyeti-proxy `pulse_refresh` for each
// selected account, capped at 25 per run. Parallel 5 at a time.
// Quota errors short-circuit the loop.

import { useState } from 'react';
import { useImportYetiRefresh } from './useImportYetiRefresh';
import { X, RefreshCw } from 'lucide-react';

const MAX_BULK = 25;
const CONCURRENCY = 5;

export default function BulkRefreshModal({ open, onClose, rows }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState([]);
  const [quotaHit, setQuotaHit] = useState(null);
  const refresh = useImportYetiRefresh();
  if (!open) return null;

  const targets = (rows ?? []).slice(0, MAX_BULK);
  const skipped = (rows ?? []).length - targets.length;

  const run = async () => {
    setRunning(true);
    setDone(0);
    setFailed([]);
    setQuotaHit(null);
    const queue = [...targets];
    const stop = { hit: false };
    const worker = async () => {
      while (queue.length && !stop.hit) {
        const r = queue.shift();
        try {
          await refresh.mutateAsync({ companyId: r.id, force: false });
          setDone((n) => n + 1);
        } catch (e) {
          if (e?.message?.includes('Daily refresh limit')) {
            stop.hit = true;
            setQuotaHit(e.message);
          } else {
            setFailed((f) => [...f, { id: r.id, name: r.company_name, err: e?.message }]);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-[440px] rounded-lg bg-white shadow-2xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <RefreshCw size={16} className="text-cyan-600" />
              Bulk refresh from ImportYeti
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Refreshes <strong>{targets.length}</strong> account{targets.length !== 1 && 's'}.
              {skipped > 0 && (
                <> Skipping <strong>{skipped}</strong> (cap is {MAX_BULK}/run).</>
              )}
            </p>
          </div>
          {!running && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X size={18} />
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Each refresh counts against your daily ImportYeti quota. Cached results (under 24h) don&apos;t count.
        </p>

        {(running || done > 0 || failed.length > 0 || quotaHit) && (
          <div className="mt-4 p-3 rounded-md bg-slate-50 text-xs text-slate-700 space-y-1">
            <div>Done: <strong>{done}</strong> / {targets.length}</div>
            {failed.length > 0 && <div className="text-amber-700">Failed: <strong>{failed.length}</strong></div>}
            {quotaHit && <div className="text-red-700">{quotaHit}</div>}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={running}
            className="px-3 py-1.5 rounded text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {running ? 'Running…' : (done > 0 ? 'Close' : 'Cancel')}
          </button>
          {!running && done === 0 && (
            <button
              onClick={run}
              className="px-3 py-1.5 rounded bg-cyan-600 text-white text-sm hover:bg-cyan-700"
            >
              Refresh {targets.length}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
