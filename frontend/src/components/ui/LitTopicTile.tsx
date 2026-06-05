import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * App-side port of marketing/components/sections/TopicTile.
 *
 * Large text-only tile — title left, arrow right, ghost border + white
 * surface + hover lift. Used in the app for Lists overview cards and
 * Saved Companies grid view.
 *
 * Two layouts:
 *  - default: title only
 *  - with `subtitle` / `meta`: stacks a smaller line under the title
 *    (useful when "Top trade lane" or "Last activity" info adds value)
 */

export type LitTopicTileProps = {
  title: string;
  href: string;
  subtitle?: string;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export default function LitTopicTile({
  title,
  href,
  subtitle,
  meta,
  icon,
  className,
}: LitTopicTileProps) {
  return (
    <Link
      to={href}
      className={cn(
        "group flex min-h-[120px] items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_5px_15px_rgba(37,99,235,0.12)]",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {icon && (
          <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600">
            {icon}
          </div>
        )}
        <div className="font-display truncate text-[20px] font-semibold leading-tight tracking-[-0.012em] text-slate-900 group-hover:text-blue-700">
          {title}
        </div>
        {subtitle && (
          <div className="font-body mt-1 truncate text-[13px] text-slate-500">
            {subtitle}
          </div>
        )}
        {meta && <div className="font-mono mt-2 text-[10.5px] text-slate-400">{meta}</div>}
      </div>
      <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-blue-500" />
    </Link>
  );
}
