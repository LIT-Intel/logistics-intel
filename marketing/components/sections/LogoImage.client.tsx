"use client";

import { useState } from "react";

/**
 * Client-side <img> with an onError fallback. Extracted from LogoTile so
 * that LogoTile can remain a server component (used in static prerender
 * paths like /companies/[slug] where adding "use client" to LogoTile
 * itself triggers a Next.js prerender bug — see issue from 2026-05-18).
 */

export function LogoImage({
  primarySrc,
  fallbackSrc,
  alt,
  px,
}: {
  primarySrc: string;
  fallbackSrc: string;
  alt: string;
  px: number;
}) {
  const [src, setSrc] = useState(primarySrc);
  const [usedFallback, setUsedFallback] = useState(false);

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      width={px}
      height={px}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-[80%] w-[80%] object-contain"
      onError={() => {
        if (!usedFallback && primarySrc !== fallbackSrc) {
          setUsedFallback(true);
          setSrc(fallbackSrc);
        }
      }}
    />
  );
}
