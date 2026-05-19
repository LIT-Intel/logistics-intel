import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * Large text-only tile used by `ExploreMoreTopics`. Ghost border, white
 * surface, hover lift — title on the left, arrow on the right.
 */
export function TopicTile({
  title,
  href,
}: {
  title: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[120px] items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-white px-6 py-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_5px_15px_rgba(22,35,184,0.12)]"
    >
      <div className="font-display text-[20px] font-semibold leading-tight tracking-[-0.012em] text-ink-900 group-hover:text-brand-blue-700">
        {title}
      </div>
      <ArrowUpRight className="h-5 w-5 shrink-0 text-ink-200 transition group-hover:text-brand-blue" />
    </Link>
  );
}
