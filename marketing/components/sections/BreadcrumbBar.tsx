import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href?: string };

/**
 * Slim breadcrumb row used on programmatic + content detail pages. The
 * page that renders this is responsible for emitting BreadcrumbList
 * schema separately (so the JSON-LD can include itemListElement orders).
 */
export function BreadcrumbBar({ crumbs }: { crumbs: Crumb[] }) {
  if (!crumbs?.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="px-8 pt-6">
      <div className="mx-auto flex max-w-container flex-wrap items-center gap-1.5">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-200" />}
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  className="font-body text-[12.5px] text-ink-500 hover:text-brand-blue-700"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  className={`font-body text-[12.5px] ${isLast ? "text-ink-900 font-medium" : "text-ink-500"}`}
                >
                  {c.label}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
