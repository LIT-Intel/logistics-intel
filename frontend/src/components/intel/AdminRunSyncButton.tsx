// AdminRunSyncButton — shared affordance rendered in Premium Intel cards
// when a platform admin views a company with no synced data for the card's
// underlying source. Clicking POSTs to the `iy-powerquery-sync` edge fn,
// surfaces a status toast inline, and invalidates the parent card's query
// on success so the card hydrates without a page reload.
//
// Auth: edge fn re-checks `platform_admins` server-side. The button is a
// UX hint — security boundary is in supabase/functions/iy-powerquery-sync.
//
// Created 2026-06-16 for the "make admin affordance clickable" pass.
// Reuses TanStack Query's useMutation for state — no manual loading flags.

import React from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface AdminRunSyncButtonProps {
  /**
   * PowerQuery source key understood by iy-powerquery-sync. Examples:
   *   - "us-import-suppliers"  → hydrates lit_pq_supplier_aggregates
   *   - "mx-import"            → hydrates lit_mx_import_declarations
   *   - "us-export"            → hydrates lit_us_export_bols
   */
  source: string;
  companyName: string;
  /** Called after a successful sync — typically wraps queryClient.invalidateQueries. */
  onSyncComplete: () => void;
}

interface SyncSuccess {
  ok: true;
  rows_upserted?: number;
  rows_fetched?: number;
  credits_remaining?: number | null;
  aborted_reason?: string;
}

interface SyncFailure {
  ok: false;
  error?: string;
  message?: string;
}

type SyncResponse = SyncSuccess | SyncFailure;

export default function AdminRunSyncButton({
  source,
  companyName,
  onSyncComplete,
}: AdminRunSyncButtonProps) {
  const [doneMsg, setDoneMsg] = React.useState<string | null>(null);

  const mutation = useMutation<SyncSuccess, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("iy-powerquery-sync", {
        body: { source, company_name: companyName },
      });
      if (error) {
        // Supabase wraps non-2xx as FunctionsHttpError; the body is in error.context
        // when present, otherwise fall back to error.message. We try to surface
        // the edge fn's structured `error` code so the UI can branch on it.
        const ctxBody = (error as { context?: { body?: string } }).context?.body;
        let parsed: SyncFailure | null = null;
        if (typeof ctxBody === "string") {
          try { parsed = JSON.parse(ctxBody) as SyncFailure; } catch { /* ignore */ }
        }
        const code = parsed?.error || error.message || "unknown_error";
        throw new Error(code);
      }
      const resp = data as SyncResponse;
      if (resp && resp.ok === false) {
        throw new Error(resp.error || "sync_failed");
      }
      return resp as SyncSuccess;
    },
    onSuccess: (resp) => {
      const n = resp.rows_upserted ?? resp.rows_fetched ?? 0;
      setDoneMsg(`Synced ${n.toLocaleString()} rows`);
      onSyncComplete();
      window.setTimeout(() => setDoneMsg(null), 3000);
    },
  });

  const errMsg = mutation.error ? friendlyError(mutation.error.message) : null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className={[
          "font-display inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5",
          "text-[11px] font-semibold uppercase tracking-wide transition",
          mutation.isPending
            ? "border-slate-200 bg-slate-50 text-slate-400 cursor-wait"
            : "border-slate-200 bg-slate-100 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
        ].join(" ")}
      >
        {mutation.isPending ? (
          <>
            <SpinnerIcon />
            <span>Syncing… (30–60s)</span>
          </>
        ) : (
          <>
            <RefreshIcon />
            <span>Sync from ImportYeti →</span>
          </>
        )}
      </button>
      {doneMsg && (
        <span className="font-mono text-[10.5px] font-semibold text-emerald-700">
          ✓ {doneMsg}
        </span>
      )}
      {errMsg && !mutation.isPending && (
        <span className="font-mono text-center text-[10.5px] text-rose-600">
          {errMsg}
        </span>
      )}
    </div>
  );
}

function friendlyError(raw: string): string {
  if (raw.includes("powerquery_access_denied")) {
    return "❌ PowerQuery tier required — contact ImportYeti sales";
  }
  if (raw.includes("platform_admin_required")) {
    return "❌ Not authorized";
  }
  return `❌ Sync failed: ${raw}`;
}

function RefreshIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className="animate-spin">
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  );
}
