/**
 * LogoTile — v2 company tile: real logo via the lib/logo.ts candidate cascade
 * (logo.dev → Google favicons → Unavatar), falling back to the design's dark
 * monogram (#0F172A / cyan initials) only when every provider misses.
 * Shared by the Dashboard and Command Center surfaces.
 */
import { useEffect, useMemo, useState } from "react";
import { getLogoCandidates } from "@/lib/logo";

const F_DISPLAY = "'Space Grotesk',sans-serif";

interface Props {
  name: string;
  /** domain or website URL — anything lib/logo.ts extractDomain accepts */
  domain?: string | null;
  size?: number;
  radius?: number;
  /** initials font-size override (defaults to ~size/3) */
  fontSize?: number;
  /** dark variant renders the monogram tile on dark surfaces (drawer) */
  dark?: boolean;
  style?: React.CSSProperties;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "—";

export default function LogoTile({ name, domain, size = 32, radius = 9, fontSize, dark, style }: Props) {
  const candidates = useMemo(() => getLogoCandidates(domain ?? null), [domain]);
  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(candidates.length === 0);

  useEffect(() => {
    setAttempt(0);
    setExhausted(candidates.length === 0);
  }, [candidates]);

  const base: React.CSSProperties = {
    width: size,
    height: size,
    flex: "none",
    borderRadius: radius,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    ...style,
  };

  if (exhausted) {
    return (
      <span
        style={{
          ...base,
          background: dark ? "#1e293b" : "#0F172A",
          color: "#00F0FF",
          boxShadow: dark ? "inset 0 0 0 1px #334155" : "inset 0 0 0 1px #1e293b",
          font: `700 ${fontSize ?? Math.max(9, Math.round(size / 3))}px ${F_DISPLAY}`,
        }}
      >
        {initialsOf(name)}
      </span>
    );
  }

  const url = candidates[attempt];
  return (
    <span
      style={{
        ...base,
        background: "#FFFFFF",
        boxShadow: dark ? "inset 0 0 0 1px #334155" : "inset 0 0 0 1px #E5E7EB",
      }}
    >
      <img
        key={url}
        src={url}
        alt={`${name} logo`}
        loading="lazy"
        decoding="async"
        // logo.dev Referer allow-list — keep the origin on the request
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: "100%", height: "100%", objectFit: "contain", padding: 3, boxSizing: "border-box" }}
        onError={() => {
          if (attempt + 1 < candidates.length) setAttempt(attempt + 1);
          else setExhausted(true);
        }}
      />
    </span>
  );
}
