import { Globe2, Map as MapIcon } from "lucide-react";
import type { LaneViewMode } from "@/hooks/useLaneViewMode";

/**
 * Segmented control for switching between 3D globe and 2D map views.
 * Matches the existing in-app pill-button style (border, semi-bold, tight
 * tracking) so it reads as a peer to filter chips on Pulse/Search.
 *
 * Mobile: collapses to icon-only buttons below the configurable breakpoint
 * (default `sm` — 640px). Set `iconOnly` for surfaces where the header is
 * always tight (sidebar / right rail).
 */
type Props = {
  mode: LaneViewMode;
  onChange: (next: LaneViewMode) => void;
  /** Force icon-only rendering regardless of viewport. */
  iconOnly?: boolean;
  /** Visual size — "sm" matches the existing in-card mode buttons. */
  size?: "sm" | "md";
  className?: string;
};

export default function LaneViewToggle({
  mode,
  onChange,
  iconOnly = false,
  size = "sm",
  className = "",
}: Props) {
  const isGlobe = mode === "globe";
  const isMap = mode === "map";

  const dims = size === "md"
    ? "px-2.5 py-1 text-[11px]"
    : "px-2 py-0.5 text-[10px]";
  const iconSize = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";

  // Reused button class — keeps the active/inactive treatment identical to
  // WorkspaceLanesGlobe's mode buttons so users feel one consistent control.
  const btn = (active: boolean) =>
    [
      "font-display inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-semibold transition-colors",
      dims,
      active
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-slate-200 bg-white text-slate-500 hover:text-slate-700",
    ].join(" ");

  return (
    <div
      className={["inline-flex items-center gap-1", className].join(" ")}
      role="group"
      aria-label="Trade lane view"
    >
      <button
        type="button"
        onClick={() => onChange("globe")}
        className={btn(isGlobe)}
        aria-pressed={isGlobe}
        aria-label="Globe view"
        title="Globe view"
      >
        <Globe2 className={iconSize} aria-hidden />
        {!iconOnly && <span className="hidden sm:inline">Globe</span>}
      </button>
      <button
        type="button"
        onClick={() => onChange("map")}
        className={btn(isMap)}
        aria-pressed={isMap}
        aria-label="Map view"
        title="Map view"
      >
        <MapIcon className={iconSize} aria-hidden />
        {!iconOnly && <span className="hidden sm:inline">Map</span>}
      </button>
    </div>
  );
}
