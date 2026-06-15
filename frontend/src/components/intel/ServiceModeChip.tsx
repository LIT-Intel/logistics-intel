// ServiceModeChip — semantic chip surface for LIT's service-mode coverage.
//
// Sits next to the generic `<Chip>` primitive in components/ui/Chip.tsx but
// carries a single, opinionated responsibility: render a service mode
// (ocean / air / truck / rail / drayage / broker) with the correct icon
// and the brand-aligned semantic palette. The mapping intentionally tracks
// the palette in components/ui/Chip.tsx so the chip family reads coherent
// across CRM surfaces (campaigns, intel, contacts).
//
// Palette anchoring rationale (each anchor maps to one Tailwind family):
//   ocean   → info-blue   (LIT brand blue #3B82F6 — water/marine semantics)
//   air     → indigo      (close to brand blue but distinct for layered legends)
//   truck   → warning-amber (road freight visual convention; pairs with rail)
//   rail    → neutral-slate (boxcar = neutral metal; balances against truck)
//   drayage → success-emerald (port-area movement; signals "executed leg")
//   broker  → info-blue outline (paperwork/documentation, lighter weight)
//   domestic → neutral-slate filled (US inland leg — port-to-destination via
//             truck/intermodal/rail. Neither hot nor critical; a steady
//             "visibility on the last 1,000 miles" signal. Picks slate so it
//             reads alongside rail without competing with the cross-border
//             amber of TransborderTruck.)
//
// Press-spring micro-interaction (transform scale 0.97 on :active) gives
// the chip a tactile feel without animating layout. 100ms color transition
// on hover matches the dashboard interaction language.

import React from "react";
import { SERVICE_MODE_ICON_MAP, type ServiceMode } from "@/components/icons/ServiceModeIcons";

export type ServiceModeChipSize = "xs" | "sm";

interface ServiceModeChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  mode: ServiceMode;
  size?: ServiceModeChipSize;
  /** Override the default label (e.g. "Ocean FCL"). When omitted, mode is title-cased. */
  label?: string;
  /** Outline tone uses white background + colored border; brand uses tinted bg. */
  tone?: "brand" | "outline";
  /** Hide the text label, render icon-only (still uses aria-label for a11y). */
  iconOnly?: boolean;
}

interface PaletteEntry {
  brand: string;
  outline: string;
}

// Explicit Tailwind class strings — kept literal so the production content
// scanner picks them up. Do not template-string these.
const PALETTE: Record<ServiceMode, PaletteEntry> = {
  ocean: {
    brand:
      "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100/80",
    outline:
      "bg-white text-blue-700 border-blue-300 hover:bg-blue-50/60",
  },
  air: {
    brand:
      "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100/80",
    outline:
      "bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50/60",
  },
  truck: {
    brand:
      "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/80",
    outline:
      "bg-white text-amber-800 border-amber-300 hover:bg-amber-50/60",
  },
  rail: {
    brand:
      "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80",
    outline:
      "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
  },
  drayage: {
    brand:
      "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/80",
    outline:
      "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50/60",
  },
  broker: {
    brand:
      "bg-blue-50/70 text-blue-700 border-blue-200 hover:bg-blue-100/70",
    outline:
      "bg-white text-blue-700 border-blue-300 hover:bg-blue-50/60",
  },
  domestic: {
    brand:
      "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200/80",
    outline:
      "bg-white text-slate-800 border-slate-400 hover:bg-slate-50",
  },
};

const SIZE_CLASS: Record<ServiceModeChipSize, string> = {
  xs: "px-1.5 py-[2px] text-[10px] leading-[14px] gap-1",
  sm: "px-2 py-0.5 text-[12px] leading-[18px] gap-1.5",
};

const ICON_PX: Record<ServiceModeChipSize, 12 | 16> = {
  xs: 12,
  sm: 16,
};

const LABELS: Record<ServiceMode, string> = {
  ocean: "Ocean",
  air: "Air",
  truck: "Truck",
  rail: "Rail",
  drayage: "Drayage",
  broker: "Broker",
  domestic: "Domestic",
};

export function ServiceModeChip({
  mode,
  size = "xs",
  label,
  tone = "brand",
  iconOnly = false,
  className = "",
  ...rest
}: ServiceModeChipProps) {
  const Icon = SERVICE_MODE_ICON_MAP[mode];
  const palette = PALETTE[mode][tone];
  const sizeClass = SIZE_CLASS[size];
  const text = label ?? LABELS[mode];

  // Tabular-numeric font-feature kept off here (labels are alphabetic);
  // antialias + tracking-[0.02em] gives the chip a settled feel at xs.
  const base =
    "inline-flex items-center rounded-full border font-semibold tracking-[0.02em] antialiased select-none transition-colors duration-100 ease-out active:scale-[0.97]";

  return (
    <span
      className={`${base} ${palette} ${sizeClass} ${className}`.trim()}
      style={{
        WebkitFontSmoothing: "antialiased",
        boxShadow: tone === "outline" ? "0 1px 2px rgba(0,0,0,0.03)" : undefined,
        transitionProperty: "background-color, border-color, color, transform",
      }}
      title={iconOnly ? text : undefined}
      aria-label={iconOnly ? text : undefined}
      {...rest}
    >
      <Icon size={ICON_PX[size]} title={iconOnly ? text : undefined} />
      {!iconOnly && <span>{text}</span>}
    </span>
  );
}

export default ServiceModeChip;
