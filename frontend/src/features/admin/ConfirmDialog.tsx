// ConfirmDialog — single reusable confirmation modal for destructive
// admin actions. Every destructive action in the dashboard runs through
// this so the same confirm-and-audit contract is enforced everywhere.
//
// Pattern:
//   const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
//   setConfirm({
//     title: "Suspend user?", target: u.email,
//     action: "admin.user.suspend", severity: "warn",
//     requireType: u.email,  // optional — type to confirm
//     onConfirm: async () => { ... },
//   });
//   <ConfirmDialog open={confirm} onClose={() => setConfirm(null)} />

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { fontBody, fontDisplay, fontMono } from "./AdminShared";

export type Severity = "info" | "warn" | "danger";

export interface ConfirmRequest {
  title: string;
  body?: string;
  target: string;
  action: string;
  severity?: Severity;
  // When set, the user must type this string before the Confirm button
  // enables. Use the target name (e.g. workspace slug, "PAUSE ALL").
  requireType?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | unknown;
}

export function ConfirmDialog({
  open,
  onClose,
}: {
  open: ConfirmRequest | null;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      setBusy(false);
      setErr(null);
    }
  }, [open]);

  if (!open) return null;

  const severity: Severity = open.severity || "warn";
  const typeOk = !open.requireType || typed === open.requireType;
  const tone =
    severity === "danger"
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : severity === "warn"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-blue-50 border-blue-200 text-blue-700";
  const btnTone =
    severity === "danger"
      ? "bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700"
      : severity === "warn"
        ? "bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
        : "bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700";

  async function run() {
    if (!open || !typeOk || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await open.onConfirm();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Action failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-950/50" onClick={busy ? undefined : onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-[81] w-[min(540px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.4)]"
        role="dialog"
        aria-label="Confirm action"
      >
        <header className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${tone}`}>
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-current/30 bg-white/70">
              {severity === "danger" || severity === "warn" ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold tracking-[-0.01em]" style={{ fontFamily: fontDisplay }}>
                {open.title}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] opacity-80" style={{ fontFamily: fontMono }}>
                {open.action} · {open.target}
              </div>
            </div>
          </div>
          {!busy ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-current/60 hover:bg-white/40"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </header>

        <div className="px-5 py-4 text-[13px] leading-relaxed text-slate-700" style={{ fontFamily: fontBody }}>
          {open.body ? (
            <p className="mb-3">{open.body}</p>
          ) : null}
          <p className="text-[12px] text-slate-500">
            This action is logged to <span className="font-mono text-[11px] text-slate-700">lit_audit_log</span> with the
            current admin as the actor.
          </p>
          {open.requireType ? (
            <div className="mt-3">
              <label className="block text-[11.5px] font-semibold text-slate-700" style={{ fontFamily: fontDisplay }}>
                Type <span className="font-mono text-[12px] text-slate-900">{open.requireType}</span> to confirm
              </label>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
                autoFocus
                disabled={busy}
              />
            </div>
          ) : null}
          {err ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[12px] text-rose-700">
              {err}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            style={{ fontFamily: fontDisplay }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!typeOk || busy}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${btnTone}`}
            style={{ fontFamily: fontDisplay }}
          >
            {busy ? "Working…" : (open.confirmLabel || "Confirm")}
          </button>
        </footer>
      </div>
    </>
  );
}
