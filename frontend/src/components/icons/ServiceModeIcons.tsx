// ServiceModeIcons — custom SVG icon set for LIT's coverage modes.
//
// Why custom (not lucide):
//   These icons differentiate LIT's coverage from competitors who only
//   show generic shipment rows. Stock icon sets (lucide / heroicons) don't
//   distinguish cargo aircraft from passenger jets, can't tell drayage from
//   a long-haul tractor, and have no boxcar at all. A bespoke set lets
//   each chip carry honest information about the leg type the user is
//   looking at — the kind of detail freight forwarders notice immediately
//   and that ocean-only providers (S&P Panjiva, ImportYeti UI) just don't
//   render.
//
// Authoring conventions:
//   - viewBox 0 0 24 24 always; sizing handled by wrapper width/height
//   - 1.5px nominal stroke at 24px (scales linearly when shrunk to 16/12)
//   - stroke="currentColor" + fill="none" so the parent <ServiceModeChip>
//     can paint via Tailwind text-color (info/warning/success palette)
//   - strokeLinecap / strokeLinejoin = "round" to feel hand-drawn, not CAD
//   - No gradients, no glows — semantic flat outlines
//
// Mapping (mode → icon → semantic palette anchor):
//   ocean   → OceanIcon            → info-blue   (LIT brand water-blue)
//   air     → AirCargoIcon         → indigo      (cargo plane, not jet)
//   truck   → TransborderTruckIcon → warning-amber (US-MX/CA road freight)
//   rail    → TransborderRailIcon  → neutral-slate (boxcar silhouette)
//   drayage → DrayageIcon          → success-emerald (short-haul + chassis)
//   broker  → CustomsBrokerIcon    → info-blue outline (clipboard + stamp)
//   domestic → DomesticTransportIcon → neutral-slate (US inland leg: intermodal
//             boxcar with a small port gantry crane loading it — communicates
//             the port-to-inland handoff, distinct from Drayage's tractor +
//             chassis and TransborderTruck's cross-border line-haul)

import React from "react";

export type ServiceModeIconSize = 12 | 14 | 16 | 18 | 24;

interface IconProps {
  size?: ServiceModeIconSize;
  className?: string;
  title?: string;
}

function svgProps(size: ServiceModeIconSize, className?: string, title?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    role: title ? ("img" as const) : ("presentation" as const),
    "aria-label": title,
    "aria-hidden": title ? undefined : true,
  };
}

/** Ocean — container ship silhouette with a single hint of a wave under the hull. */
export function OceanIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg {...svgProps(size, className, title)}>
      {/* hull */}
      <path d="M3.5 16.5 L5 13 H19 L20.5 16.5 Z" />
      {/* container stack */}
      <rect x="7" y="9" width="4.2" height="4" rx="0.4" />
      <rect x="12" y="9" width="4.2" height="4" rx="0.4" />
      {/* bridge */}
      <path d="M14.6 9 V6.5 H17 V9" />
      {/* waterline */}
      <path d="M2.5 19 Q5 17.5 8 19 T14 19 T20.5 19" />
    </svg>
  );
}

/** Air — cargo plane (square fuselage, lifted wing, blunt tail) — explicitly NOT a passenger jet. */
export function AirCargoIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg {...svgProps(size, className, title)}>
      {/* fuselage — boxy cargo body, not tapered like a passenger jet */}
      <path d="M3 11.5 H18 L21 13 L18 14.5 H3 Z" />
      {/* high wing — cargo planes carry the wing on top */}
      <path d="M9 11.5 L11 7.5 H13 L13.5 11.5" />
      {/* tall T-tail */}
      <path d="M5 11.5 L4 8 H5.5 L6.5 11.5" />
      {/* cargo door / ramp hint */}
      <path d="M16 12.5 H18.5" strokeOpacity="0.6" />
    </svg>
  );
}

/** Transborder Truck — class-8 semi tractor + 53' trailer. */
export function TransborderTruckIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg {...svgProps(size, className, title)}>
      {/* trailer */}
      <rect x="2.5" y="7" width="12" height="9" rx="0.6" />
      {/* tractor cab */}
      <path d="M14.5 9 H18.5 L21 12.5 V16 H14.5 Z" />
      {/* windshield hint */}
      <path d="M16 10.5 H19.2 L20.2 12.5 H16 Z" strokeOpacity="0.7" />
      {/* wheels */}
      <circle cx="6" cy="17.5" r="1.4" />
      <circle cx="11" cy="17.5" r="1.4" />
      <circle cx="17.5" cy="17.5" r="1.4" />
    </svg>
  );
}

/** Transborder Rail — boxcar (no locomotive — just the freight unit). */
export function TransborderRailIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg {...svgProps(size, className, title)}>
      {/* boxcar body */}
      <rect x="2.5" y="6.5" width="19" height="9" rx="0.6" />
      {/* sliding door */}
      <path d="M10 6.5 V15.5 M14 6.5 V15.5" strokeOpacity="0.8" />
      {/* trucks (bogies) */}
      <circle cx="6" cy="17.5" r="1.2" />
      <circle cx="9" cy="17.5" r="1.2" />
      <circle cx="15" cy="17.5" r="1.2" />
      <circle cx="18" cy="17.5" r="1.2" />
      {/* rail under wheels */}
      <path d="M2 19 H22" strokeOpacity="0.6" />
    </svg>
  );
}

/** Drayage — short tractor + chassis + intermodal container, distinct from line-haul truck. */
export function DrayageIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg {...svgProps(size, className, title)}>
      {/* container on chassis */}
      <rect x="6" y="6" width="13" height="7" rx="0.4" />
      {/* corrugation hint */}
      <path d="M9 7 V12 M12 7 V12 M15 7 V12" strokeOpacity="0.45" />
      {/* chassis rail */}
      <path d="M5 13.5 H20" />
      {/* short day-cab tractor */}
      <path d="M2.5 10.5 H5.5 V13.5 H2.5 Z" />
      {/* wheels — note the short wheelbase for port drayage */}
      <circle cx="4" cy="15.5" r="1.2" />
      <circle cx="9" cy="15.5" r="1.2" />
      <circle cx="17" cy="15.5" r="1.2" />
    </svg>
  );
}

/** Customs Broker — clipboard with a stamped seal in the corner. */
export function CustomsBrokerIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg {...svgProps(size, className, title)}>
      {/* clipboard body */}
      <rect x="5" y="4.5" width="11" height="15" rx="1" />
      {/* clip */}
      <path d="M9 3.5 H12 V5.5 H9 Z" />
      {/* paper lines */}
      <path d="M7.5 9 H13.5 M7.5 11.5 H13.5 M7.5 14 H11" strokeOpacity="0.55" />
      {/* stamp seal */}
      <circle cx="17" cy="16" r="3" />
      <path d="M15.5 16 L16.5 17 L18.5 14.8" />
    </svg>
  );
}

/** Domestic Transportation — US inland leg. Intermodal boxcar being loaded by
 *  a small port gantry crane. Reads as "the leg that begins at the port and
 *  travels inland across the US" — visually distinct from Drayage (short-haul
 *  tractor + chassis) and TransborderTruck (cross-border line-haul). */
export function DomesticTransportIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg {...svgProps(size, className, title)}>
      {/* gantry crane legs + beam (left half of the icon) */}
      <path d="M2.5 5 V13.5" />
      <path d="M6.5 5 V8" />
      <path d="M2 5 H7" />
      {/* lifting cable + small spreader */}
      <path d="M4.5 5 V7" strokeOpacity="0.7" />
      <path d="M3.6 7 H5.4" />
      {/* intermodal boxcar (right of the crane) */}
      <rect x="8" y="9" width="13" height="6.5" rx="0.5" />
      {/* corrugation / panel hint */}
      <path d="M11 9.4 V15 M14 9.4 V15 M17 9.4 V15" strokeOpacity="0.45" />
      {/* rail trucks (bogies) */}
      <circle cx="10.5" cy="17" r="1.1" />
      <circle cx="13" cy="17" r="1.1" />
      <circle cx="16.5" cy="17" r="1.1" />
      <circle cx="19" cy="17" r="1.1" />
      {/* rail line under the boxcar */}
      <path d="M8 18.5 H21.5" strokeOpacity="0.55" />
    </svg>
  );
}

/** Internal lookup — used by ServiceModeChip so the surface API stays string-based. */
export const SERVICE_MODE_ICON_MAP = {
  ocean: OceanIcon,
  air: AirCargoIcon,
  truck: TransborderTruckIcon,
  rail: TransborderRailIcon,
  drayage: DrayageIcon,
  broker: CustomsBrokerIcon,
  domestic: DomesticTransportIcon,
} as const;

export type ServiceMode = keyof typeof SERVICE_MODE_ICON_MAP;
