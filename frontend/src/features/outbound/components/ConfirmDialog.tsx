import React from "react";
import { AlertTriangle } from "lucide-react";
import { fontDisplay, fontBody } from "../tokens";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.5)]"
        onClick={busy ? undefined : onCancel}
        aria-hidden
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
          <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3.5">
            {destructive ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                <AlertTriangle className="h-4 w-4" />
              </div>
            ) : null}
            <div>
              <div
                className="text-[14px] font-bold text-[#0F172A]"
                style={{ fontFamily: fontDisplay }}
              >
                {title}
              </div>
              <div
                className="mt-1 text-[12px] leading-relaxed text-slate-600"
                style={{ fontFamily: fontBody }}
              >
                {message}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 bg-[#FAFBFC] px-4 py-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              style={{ fontFamily: fontDisplay }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="rounded-md px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition disabled:opacity-50"
              style={{
                fontFamily: fontDisplay,
                background: destructive
                  ? "linear-gradient(180deg,#EF4444,#DC2626)"
                  : "linear-gradient(180deg,#3B82F6,#2563EB)",
              }}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}