/**
 * Lost-reason modal (spec §Lost-reason modal). Required radio; `Mark lost`
 * disabled until a reason is picked. Caller performs the write (markLost)
 * so the modal stays presentational + submit callback.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crm2Style, F_BODY, F_DISPLAY } from "./ui";

export const LOST_REASONS = [
  "Price",
  "Stayed with incumbent",
  "No capacity on lane",
  "Timing",
  "Went dark",
] as const;

export interface LostReasonModalProps {
  companyName: string;
  onCancel: () => void;
  /** Performs the real write (markLost + refetch). Resolves on success. */
  onConfirm: (reason: string) => Promise<void>;
}

export default function LostReasonModal({ companyName, onCancel, onConfirm }: LostReasonModalProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const confirm = async () => {
    if (!picked || saving) return;
    setSaving(true);
    try {
      await onConfirm(picked);
      toast(`${companyName} marked lost · ${picked}. Harvey will re-check in 90 days.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark the deal lost.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onCancel}
      className="crm2-scrim"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(2,6,23,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <Crm2Style />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Why was ${companyName} lost?`}
        className="crm2-modal"
        style={{
          width: 420,
          maxWidth: "100%",
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 30px 60px rgba(2,6,23,0.35)",
        }}
      >
        <div style={{ font: `700 20px ${F_DISPLAY}`, color: "#0F172A" }}>Why was {companyName} lost?</div>
        <div style={{ marginTop: 6, font: `400 13px ${F_BODY}`, color: "#64748b" }}>
          Required. Feeds Reports and the 90-day re-check.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {LOST_REASONS.map((r) => {
            const on = picked === r;
            return (
              <button
                key={r}
                type="button"
                className="crm2-press crm2-focus"
                onClick={() => setPicked(r)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  border: `1px solid ${on ? "#e11d48" : "#E5E7EB"}`,
                  background: on ? "rgba(244,63,94,0.06)" : "#FFFFFF",
                  font: `600 13px ${F_BODY}`,
                  color: "#0F172A",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    flex: "none",
                    border: `2px solid ${on ? "#e11d48" : "#CBD5E1"}`,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "#e11d48" : "transparent" }} />
                </span>
                {r}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            className="crm2-press crm2-focus"
            onClick={onCancel}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid #E5E7EB",
              background: "#FFFFFF",
              color: "#0F172A",
              font: `600 13px ${F_DISPLAY}`,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="crm2-press crm2-focus"
            disabled={!picked || saving}
            onClick={confirm}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 10,
              border: "none",
              background: picked ? "#e11d48" : "#fda4af",
              color: "#FFFFFF",
              font: `600 13px ${F_DISPLAY}`,
              cursor: picked ? "pointer" : "default",
            }}
          >
            {saving ? "Saving…" : "Mark lost"}
          </button>
        </div>
      </div>
    </div>
  );
}
