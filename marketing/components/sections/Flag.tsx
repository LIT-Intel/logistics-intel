import { cn } from "@/lib/utils";

/**
 * Country flag — uses flagcdn.com SVG. Renders a small subtle border so
 * white-bodied flags (e.g. Japan) don't disappear on white surfaces.
 *
 * Pass `iso` as a 2-letter ISO 3166-1 alpha-2 code (uppercase or lowercase).
 * Falls back to a neutral globe glyph if the code isn't recognized.
 */
const FLAG_BASE = "https://flagcdn.com";

const SIZES: Record<string, string> = {
  xs: "h-3.5 w-5",
  sm: "h-4 w-6",
  md: "h-5 w-7",
  lg: "h-6 w-9",
  xl: "h-8 w-12",
};

export function Flag({
  iso,
  size = "sm",
  className,
  title,
}: {
  iso?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  title?: string;
}) {
  const code = (iso || "").trim().toLowerCase();
  if (!code || code.length !== 2) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex items-center justify-center rounded-[3px] bg-ink-100 text-ink-200",
          SIZES[size],
          className,
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-2/3 w-2/3" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`${FLAG_BASE}/${code}.svg`}
      alt={title || code.toUpperCase()}
      className={cn(
        "inline-block shrink-0 rounded-[3px] object-cover ring-1 ring-ink-100/80 shadow-[0_0_0_0.5px_rgba(15,23,42,0.04)]",
        SIZES[size],
        className,
      )}
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * Pair of origin → destination flags with an arrow between. Used on lane
 * cards and breadcrumbs.
 */
export function LaneFlags({
  originIso,
  destIso,
  size = "sm",
  className,
}: {
  originIso?: string | null;
  destIso?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Flag iso={originIso} size={size} />
      <span aria-hidden className="text-ink-200 text-[12px]">→</span>
      <Flag iso={destIso} size={size} />
    </span>
  );
}
