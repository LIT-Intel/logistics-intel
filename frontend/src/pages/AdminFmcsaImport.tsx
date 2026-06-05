// frontend/src/pages/AdminFmcsaImport.tsx
//
// /app/admin/fmcsa-import — Trigger + monitor the FMCSA outbound pipeline.
//
// Two-button flow per spec §6 safety launch:
//   1. "Run dry-run" → calls bulk-import-fmcsa with { dryRun: true }
//      → shows funnel breakdown + 20-row sample. Admin reviews.
//   2. "Run stage 2 pilot (50)" → bulk-import-fmcsa { dryRun: false, limit: 50 }
//      → first real send. Watch metrics for 5 days.
//   3. "Run stage 3 full" → bulk-import-fmcsa { dryRun: false, limit: 1000 }
//      → gated until pilot passes.
//
// Run history table shows last 10 runs with status + hot/cold/skipped counts.

import { useEffect, useState } from "react";
import { Users, Play, RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  dry_run: boolean;
  mode: string;
  status: string;
  hot_count: number;
  cold_count: number;
  funnel: any;
  skipped: any;
  errors: any;
};

export default function AdminFmcsaImport() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<null | "dry" | "pilot" | "full">(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("lit_fmcsa_import_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setRuns((data || []) as Run[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function trigger(kind: "dry" | "pilot" | "full") {
    setTriggering(kind);
    setErr(null);
    setLastResult(null);
    try {
      const body = kind === "dry"
        ? { dryRun: true }
        : { dryRun: false, limit: kind === "pilot" ? 50 : 1000 };
      const { data, error } = await supabase.functions.invoke("bulk-import-fmcsa", {
        method: "POST",
        body,
      });
      if (error) throw error;
      setLastResult(data);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setErr(e?.message || "Trigger failed");
    } finally {
      setTriggering(null);
    }
  }

  const lastDryRun = runs.find((r) => r.dry_run && r.status === "dry_run_complete");
  const lastPilot = runs.find((r) => !r.dry_run && r.hot_count > 0 && r.hot_count <= 50 && r.status === "succeeded");

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600">
            <Users className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Phase 4 outbound pipeline</span>
          </div>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-slate-900">FMCSA Import</h1>
          <p className="mt-1.5 max-w-[640px] text-[14px] leading-relaxed text-slate-500">
            Three-stage launch: dry-run → 50-contact pilot → full batch. Each stage requires the previous to complete cleanly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden /> Refresh
        </button>
      </div>

      {/* Three-stage trigger grid */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StageCard
          stage="1"
          title="Dry run"
          desc="Download FMCSA, filter, show sample. No Attio writes, no sends."
          enabled
          status={lastDryRun ? "done" : "pending"}
          onClick={() => trigger("dry")}
          loading={triggering === "dry"}
        />
        <StageCard
          stage="2"
          title="Pilot 50"
          desc="Send first 50 Hot contacts. Watch metrics for 5 days."
          enabled={!!lastDryRun}
          status={lastPilot ? "done" : lastDryRun ? "ready" : "blocked"}
          onClick={() => trigger("pilot")}
          loading={triggering === "pilot"}
        />
        <StageCard
          stage="3"
          title="Full batch"
          desc="Remaining ~150 Hot + ~800 Cold. Permanent."
          enabled={!!lastPilot}
          status={lastPilot ? "ready" : "blocked"}
          onClick={() => trigger("full")}
          loading={triggering === "full"}
        />
      </div>

      {err && (
        <div className="mt-6 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{err}</span>
        </div>
      )}

      {lastResult && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Last trigger result</div>
          <pre className="mt-2 max-h-[400px] overflow-auto rounded bg-slate-50 p-3 text-[11.5px] font-mono text-slate-700">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Run history</div>
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-[13px] text-slate-500">
            No runs yet. Start with the dry run.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50/70 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-left">Mode</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Hot</th>
                  <th className="px-4 py-3 text-right">Cold</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-[12px] text-slate-700">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-[12px]">{r.dry_run ? "Dry" : "Real"} · {r.mode}</td>
                    <td className="px-4 py-3 text-[12px]">{r.status}</td>
                    <td className="px-4 py-3 text-right font-mono text-[12px]">{r.hot_count}</td>
                    <td className="px-4 py-3 text-right font-mono text-[12px]">{r.cold_count}</td>
                    <td className="px-4 py-3 text-[11.5px] text-slate-500">
                      {r.errors ? <span className="text-rose-600">{JSON.stringify(r.errors).slice(0, 80)}</span> : r.skipped ? <span>skipped: {JSON.stringify(r.skipped).slice(0, 80)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StageCard({
  stage, title, desc, enabled, status, onClick, loading,
}: {
  stage: string; title: string; desc: string; enabled: boolean;
  status: "blocked" | "pending" | "ready" | "done";
  onClick: () => void; loading: boolean;
}) {
  const statusTone = {
    blocked: { bg: "bg-slate-50", text: "text-slate-400", label: "Blocked" },
    pending: { bg: "bg-blue-50", text: "text-blue-700", label: "Ready" },
    ready: { bg: "bg-amber-50", text: "text-amber-700", label: "Ready to run" },
    done: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Complete" },
  }[status];

  return (
    <div className={`rounded-2xl border bg-white p-5 ${enabled ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold text-slate-400">STAGE {stage}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] ${statusTone.bg} ${statusTone.text}`}>
          {status === "done" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {statusTone.label}
        </span>
      </div>
      <h2 className="mt-3 text-[18px] font-semibold text-slate-900">{title}</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{desc}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={!enabled || loading || status === "done"}
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
      >
        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        {loading ? "Running…" : "Trigger"}
      </button>
    </div>
  );
}
