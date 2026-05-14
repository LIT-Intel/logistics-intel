// Company profile signals strip. Renders inline above the tab bar
// showing real signals scoped to this company. Hidden entirely when
// the company has no active signals — no fake empty state.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X, ArrowRight } from "lucide-react";
import {
  listSignals,
  markSignalSeen,
  dismissSignal,
  actOnSignal,
  type SignalRow,
  type SignalSeverity,
} from "@/lib/signals";

const SEV_DOT: Record<SignalSeverity, string> = {
  low: "bg-slate-300",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

export default function CompanySignalsStrip({
  companyId,
  sourceCompanyKey,
}: {
  companyId?: string;
  sourceCompanyKey?: string;
}) {
  const [rows, setRows] = useState<SignalRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!companyId && !sourceCompanyKey) {
      setRows([]);
      return;
    }
    (async () => {
      const data = await listSignals({
        companyId,
        sourceCompanyKey,
        limit: 6,
        statuses: ["new", "seen"],
      });
      if (cancelled) return;
      setRows(data);
      for (const r of data) {
        if (r.status === "new") void markSignalSeen(r.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, sourceCompanyKey]);

  const visible = (rows ?? []).filter((r) => !hidden.has(r.id));
  if (!rows || visible.length === 0) return null;

  return (
    <div className="px-6 py-2 bg-cyan-50/40 border-b border-cyan-100">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 mr-1">
          <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
            Signals
          </span>
        </div>
        {visible.map((s) => (
          <SignalPill
            key={s.id}
            signal={s}
            onDismiss={async () => {
              setHidden((prev) => new Set(prev).add(s.id));
              await dismissSignal(s.id);
            }}
            onAct={async () => {
              setHidden((prev) => new Set(prev).add(s.id));
              await actOnSignal(s.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SignalPill({
  signal,
  onDismiss,
  onAct,
}: {
  signal: SignalRow;
  onDismiss: () => void;
  onAct: () => void;
}) {
  const dot = SEV_DOT[signal.severity] ?? SEV_DOT.medium;
  const content = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-slate-200 shadow-sm text-xs text-slate-700 hover:border-cyan-300">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="font-medium">{signal.title}</span>
      {signal.cta_url ? <ArrowRight className="w-3 h-3 text-slate-400" /> : null}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1">
      {signal.cta_url ? (
        <Link to={signal.cta_url} onClick={onAct}>
          {content}
        </Link>
      ) : (
        content
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss signal"
        className="text-slate-300 hover:text-slate-500"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
