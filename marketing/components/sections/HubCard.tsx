import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Canonical hub card — used by /tools, /lanes, /ports, /hs, /glossary,
 * /vs, /resources, /features, /solutions, /alternatives, /best.
 * Identical chrome (radius, border, shadow, hover lift) across every hub
 * so the site reads as one product, not eleven independent SEO templates.
 */
export function HubCard({
  href,
  children,
  className,
  variant = "default",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "compact";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-2xl border border-ink-100 bg-white shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg",
        variant === "compact" ? "p-5" : "p-6 sm:p-7",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * 1 / 2 / 3-column responsive grid that all hubs share. Standard 16px gap
 * on mobile, 24px on tablet+ — same vertical rhythm everywhere.
 */
export function HubCardGrid({
  children,
  className,
  cols = 3,
}: {
  children: React.ReactNode;
  className?: string;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:gap-6",
        cols === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Empty-state card for hubs whose Sanity dataset is still seeding. Same
 * visual weight as the grid that will replace it, so layout doesn't jump
 * once content lands.
 */
export function HubEmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-6 py-14 text-center sm:px-8 sm:py-20">
      <div className="font-display text-[18px] font-semibold text-ink-900">{title}</div>
      <p className="font-body mx-auto mt-2 max-w-[520px] text-[14px] leading-relaxed text-ink-500">
        {children}
      </p>
    </div>
  );
}
