import React, { forwardRef, useEffect, useMemo, useState } from "react";

/**
 * LogoIcon
 *
 * Variants:
 *  • "landing"        → full wordmark for white headers
 *  • "iconBluegrad"   → default blue-gradient icon (for white headers / sidebar)
 *  • "sidebarActive"  → active icon (highlighted)
 *
 * Props:
 *  • variant   : "landing" | "iconBluegrad" | "sidebarActive" (default: "iconBluegrad")
 *  • size      : number → pixels (icons: height & width; landing: HEIGHT only)
 *  • height    : number → alias for size
 *  • active    : boolean → force active artwork (route-based highlight)
 *  • autoswap  : boolean → swap to active artwork on hover/focus (default true for icons)
 *  • className, alt, ...imgProps
 */

export const LOGO_ASSETS = {
  landing:
    "https://zupuxlrtixhfnbuhxhum.supabase.co/storage/v1/object/public/branding/logistic-intel-logo-on-white-bluegrad-strong%20%281%29.svg",
  iconBluegrad:
    "https://zupuxlrtixhfnbuhxhum.supabase.co/storage/v1/object/public/branding/lit-icon-on-white-bluegrad-active.svg",
  sidebarActive:
    "https://zupuxlrtixhfnbuhxhum.supabase.co/storage/v1/object/public/branding/lit-sidebar-icon-active.svg",
};

function baseSrcFor(variant) {
  return LOGO_ASSETS[variant] || LOGO_ASSETS.iconBluegrad;
}
function activeSrcFor(variant) {
  // For icons, active = sidebarActive. Landing has no “active” art → keep same.
  if (variant === "landing") return LOGO_ASSETS.landing;
  return LOGO_ASSETS.sidebarActive;
}

const LogoIcon = forwardRef(function LogoIcon(
  {
    variant = "iconBluegrad",
    size,       // for icons
    height,     // alias for size
    active = false,
    autoswap,   // default decided below
    className = "",
    alt,
    ...imgProps
  },
  ref
) {
  const isLanding = variant === "landing";
  const swapOnHover = autoswap ?? !isLanding; // default: only autoswap for icons

  // Dimensions: landing uses height only; icons are square
  const pixelHeight = useMemo(() => {
    if (Number.isFinite(height)) return height;
    if (Number.isFinite(size)) return size;
    return isLanding ? 40 : 28; // requested: dashboard icon 80px
  }, [height, size, isLanding]);

  const baseSrc = baseSrcFor(variant);
  const activeSrc = activeSrcFor(variant);

  const [src, setSrc] = useState(active ? activeSrc : baseSrc);
  useEffect(() => {
    setSrc(active ? activeSrc : baseSrc);
  }, [active, baseSrc, activeSrc]);

  const style = isLanding
    ? { height: pixelHeight, width: "auto" }
    : { height: pixelHeight, width: pixelHeight };

  const resolvedAlt =
    alt || (isLanding ? "Logistic Intel (wordmark)" : "LIT logo");

  const onError = (e) => {
    if (src !== LOGO_ASSETS.iconBluegrad) {
      e.currentTarget.src = LOGO_ASSETS.iconBluegrad;
    }
  };

  return (
    <img
      ref={ref}
      src={src}
      alt={resolvedAlt}
      className={className}
      style={style}
      decoding="async"
      loading="eager"
      onError={onError}
      onMouseEnter={swapOnHover ? () => setSrc(activeSrc) : undefined}
      onFocus={swapOnHover ? () => setSrc(activeSrc) : undefined}
      onMouseLeave={swapOnHover ? () => setSrc(active ? activeSrc : baseSrc) : undefined}
      onBlur={swapOnHover ? () => setSrc(active ? activeSrc : baseSrc) : undefined}
      {...imgProps}
    />
  );
});

export default LogoIcon;
