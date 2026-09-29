/**
 * SampleDataBanner — slim, dismissible info banner that explains the seeded
 * onboarding examples (see src/api/sampleData.ts). Mounted atop each surface
 * that can show is_sample rows (Saved companies, Pipeline, Campaigns) so every
 * surface explains itself.
 *
 * Two actions:
 *   - "Clear examples" → clearSampleData() then onCleared() (invalidate +
 *     sonner toast). Permanent; never re-seeds.
 *   - dismiss "×"      → hides for the session (localStorage), does NOT delete.
 *
 * Render this only when the current view actually has ≥1 is_sample row — the
 * caller owns that guard via the `show` prop. Mobile-first: full-width, wraps.
 */
import { useState, type CSSProperties } from "react";
import { Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { clearSampleData } from "@/api/sampleData";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const EASE = "cubic-bezier(0.16,1,0.3,1)";

/** Cyan "Example" pill — shown next to is_sample company / deal / campaign names. */
export const SAMPLE_CHIP_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  flex: "none",
  font: "10px 'JetBrains Mono',monospace",
  color: "#0e7490",
  background: "rgba(0,240,255,0.10)",
  border: "1px solid rgba(0,200,212,0.35)",
  borderRadius: 4,
  padding: "1px 5px",
  lineHeight: 1.4,
  letterSpacing: "0.02em",
};

export function SampleChip({ style }: { style?: CSSProperties }) {
  return (
    <span style={{ ...SAMPLE_CHIP_STYLE, ...style }} aria-label="Example data">
      Example
    </span>
  );
}

const DISMISS_KEY = "lit-sample-banner-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export interface SampleDataBannerProps {
  /** Only render when the current view actually has ≥1 is_sample row. */
  show: boolean;
  /** Noun for the copy: "companies" | "deals" | "campaigns" — cosmetic only. */
  noun?: string;
  /** Called after a successful clear so the caller can invalidate its queries. */
  onCleared?: () => void;
}

export default function SampleDataBanner({ show, noun = "Command Center", onCleared }: SampleDataBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);
  const [clearing, setClearing] = useState(false);

  if (!show || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — session-only dismiss still works via state */
    }
    setDismissed(true);
  };

  const clear = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await clearSampleData();
      onCleared?.();
      toast.success("Examples cleared");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not clear examples");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      role="status"
      style={{
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 12,
        background: "rgba(0,240,255,0.06)",
        border: "1px solid rgba(0,200,212,0.30)",
      }}
    >
      <Info size={16} style={{ color: "#0891b2", flex: "none" }} />
      <span style={{ flex: "1 1 240px", minWidth: 0, font: `500 13px ${F_BODY}`, color: "#0e5566" }}>
        These are examples showing how {noun} works.
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
        <button
          type="button"
          onClick={clear}
          disabled={clearing}
          className="cc-focus"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 30,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid rgba(0,200,212,0.45)",
            background: "#FFFFFF",
            font: `600 12px ${F_DISPLAY}`,
            color: "#0e7490",
            cursor: clearing ? "default" : "pointer",
            opacity: clearing ? 0.6 : 1,
            whiteSpace: "nowrap",
            transition: `transform 160ms ${EASE},background 200ms`,
          }}
        >
          {clearing ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> : null}
          Clear examples
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          title="Hide for now (does not delete)"
          onClick={dismiss}
          className="cc-focus"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            display: "grid",
            placeItems: "center",
            color: "#64748b",
            cursor: "pointer",
          }}
        >
          <X size={15} />
        </button>
      </span>
    </div>
  );
}
