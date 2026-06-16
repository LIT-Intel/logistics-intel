// ServiceModeFilterChips — top-of-tab filter strip for the Supply Chain tab.
//
// Renders all 7 service modes + an "All" reset pill. Click toggles the active
// mode in SupplyChainFilterContext; clicking the active mode again clears it.
// Active chip gets a colored ring + faint scale-up; inactive chips render
// grayscale with reduced opacity so the active mode reads at a glance.

import React from "react";
import { SERVICE_MODE_ICON_MAP, type ServiceMode } from "@/components/icons/ServiceModeIcons";
import { useSupplyChainFilter } from "./SupplyChainFilterContext";

const MODES: ServiceMode[] = ["ocean", "air", "truck", "rail", "drayage", "broker", "domestic"];

const LABELS: Record<ServiceMode, string> = {
  ocean: "Ocean",
  air: "Air",
  truck: "Truck",
  rail: "Rail",
  drayage: "Drayage",
  broker: "Broker",
  domestic: "Domestic",
};

// Brand-palette ring colors per mode (single accent class each so the Tailwind
// scanner keeps them in the build).
const RING: Record<ServiceMode, string> = {
  ocean: "ring-blue-500",
  air: "ring-indigo-500",
  truck: "ring-amber-500",
  rail: "ring-slate-500",
  drayage: "ring-emerald-500",
  broker: "ring-blue-400",
  domestic: "ring-slate-600",
};

const TEXT: Record<ServiceMode, string> = {
  ocean: "text-blue-700",
  air: "text-indigo-700",
  truck: "text-amber-800",
  rail: "text-slate-700",
  drayage: "text-emerald-700",
  broker: "text-blue-700",
  domestic: "text-slate-800",
};

export default function ServiceModeFilterChips() {
  const { activeMode, setActiveMode } = useSupplyChainFilter();

  return (
    <div
      role="toolbar"
      aria-label="Filter Supply Chain by service mode"
      className={[
        // <sm: horizontal scroll w/ right-edge fade so all 8 chips stay
        //      reachable on phones without wrapping into a 3-row stack.
        // ≥sm: original flex-wrap behaviour.
        "relative -mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 scroll-smooth",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0",
      ].join(" ")}
      style={{
        // 12px right-edge fade mask on mobile only — clipped on ≥sm via
        // the sm:overflow-visible class so wrap behaviour stays clean.
        WebkitMaskImage:
          "linear-gradient(to right, #000 0, #000 calc(100% - 12px), transparent 100%)",
        maskImage:
          "linear-gradient(to right, #000 0, #000 calc(100% - 12px), transparent 100%)",
      }}
    >
      <span className="font-display mr-1 shrink-0 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
        Filter by mode
      </span>
      <AllPill
        active={activeMode === null}
        onClick={() => setActiveMode(null)}
      />
      {MODES.map((m) => {
        const Icon = SERVICE_MODE_ICON_MAP[m];
        const isActive = activeMode === m;
        const dim = activeMode !== null && !isActive;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={isActive}
            onClick={() => setActiveMode(isActive ? null : m)}
            className={[
              "font-display inline-flex shrink-0 items-center gap-1 rounded-full border bg-white px-2 py-1 text-[10.5px] font-semibold tabular-nums min-h-[36px] min-w-[64px] justify-center",
              "transition-all duration-[120ms] ease-out hover:shadow-sm active:scale-[0.97]",
              isActive
                ? `border-transparent ring-2 ring-offset-2 ring-offset-white scale-105 shadow-sm ${RING[m]} ${TEXT[m]}`
                : dim
                  ? "border-slate-200 text-slate-400 grayscale opacity-60 hover:opacity-100 hover:grayscale-0 hover:text-slate-700"
                  : `border-slate-200 ${TEXT[m]} hover:border-slate-300`,
            ].join(" ")}
          >
            <Icon size={12} />
            <span>{LABELS[m]}</span>
          </button>
        );
      })}
    </div>
  );
}

function AllPill({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "font-display inline-flex shrink-0 items-center justify-center rounded-full border px-2.5 py-1 text-[10.5px] font-semibold min-h-[36px] min-w-[64px]",
        "transition-all duration-[120ms] ease-out hover:shadow-sm active:scale-[0.97]",
        active
          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
      ].join(" ")}
    >
      All
    </button>
  );
}
