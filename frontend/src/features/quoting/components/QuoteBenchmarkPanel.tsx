/**
 * QuoteBenchmarkPanel — rate benchmark side panel.
 *
 * Phase 1: there is no live market-rate source wired, so this ALWAYS renders the
 * honest "Benchmark unavailable" empty state. Never fabricate a benchmark range.
 * A real provider hook lands in a later phase.
 */
import { Gauge, Info } from "lucide-react";

export default function QuoteBenchmarkPanel({ lane }: { lane?: string | null }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-amber-50 text-amber-700">
          <Gauge className="h-3.5 w-3.5" />
        </span>
        <h3 className="font-display text-[13px] font-semibold text-slate-900">Rate Benchmark</h3>
      </div>
      <div className="p-4">
        <div className="flex items-start gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 p-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
          <div>
            <div className="text-[12.5px] font-semibold text-amber-900">Benchmark unavailable</div>
            <div className="mt-0.5 text-[11.5px] leading-relaxed text-amber-700">
              No live market source connected
              {lane ? ` for ${lane}` : ""}. A reference range will appear here once a benchmark
              provider is enabled.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
