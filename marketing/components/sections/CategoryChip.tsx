import Link from "next/link";

/**
 * Reusable square bracketed chip — used as the editorial category tag
 * across the new blog surface (list page filter row, card overlay,
 * featured hero, article header). The label renders literally as
 * `[label]` including the brackets. Default surface is LIT brand-blue
 * `#3B82F6` with white text and a 4px radius — square, monospace-feel,
 * pattern-matched on the ZoomInfo blog refresh.
 *
 * Variants:
 *  - `chip` (default) — solid filled tag for hero / card overlay use
 *  - `filter`         — interactive button shape for the filter row
 *  - `card-overlay`   — solid filled tag positioned over an image
 */
const LIT_BLUE = "#3B82F6";

type Variant = "chip" | "filter" | "card-overlay";

export function CategoryChip({
  label,
  href,
  variant = "chip",
  color = LIT_BLUE,
  active = false,
  onClick,
  count,
  ariaPressed,
  className,
}: {
  label: string;
  href?: string;
  variant?: Variant;
  color?: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
  ariaPressed?: boolean;
  className?: string;
}) {
  const base =
    "font-mono inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.06em] transition";
  const radius = "rounded-[4px]";

  // Default chip / card overlay — solid color, white text.
  if (variant === "chip" || variant === "card-overlay") {
    const overlayExtra =
      variant === "card-overlay" ? "shadow-[0_2px_6px_rgba(0,0,0,0.25)]" : "";
    const inner = (
      <span
        className={`${base} ${radius} ${overlayExtra} ${className || ""}`}
        style={{ background: color, color: "#fff" }}
      >
        [{label}]
      </span>
    );
    if (href) {
      return (
        <Link href={href} className="inline-flex">
          {inner}
        </Link>
      );
    }
    return inner;
  }

  // Filter button — active state fills with color, inactive is ghost.
  const filterActive =
    "border-transparent text-white shadow-[0_3px_10px_rgba(15,23,42,0.18)]";
  const filterInactive =
    "border-ink-100 bg-white text-ink-700 hover:border-ink-150 hover:bg-ink-25";
  const cls = `${base} ${radius} h-8 border ${
    active ? filterActive : filterInactive
  } ${className || ""}`;
  const style = active ? { background: color } : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed ?? active}
      className={cls}
      style={style}
    >
      <span>[{label}]</span>
      {typeof count === "number" && (
        <span
          className={
            "font-mono ml-1 rounded-[3px] px-1 text-[9.5px] font-bold leading-none " +
            (active ? "bg-white/20 text-white" : "bg-ink-50 text-ink-500")
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}
