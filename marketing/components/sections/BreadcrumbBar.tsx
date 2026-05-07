import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { buildBreadcrumbList } from "@/lib/jsonLd";

type Crumb = { label: string; href?: string };

/**
 * Slim breadcrumb row used on programmatic + content detail pages. Emits
 * BreadcrumbList JSON-LD inline so callers don't have to remember to add
 * structured data separately — single source of truth for the crumb list.
 */
export function BreadcrumbBar({ crumbs }: { crumbs: Crumb[] }) {
  if (!crumbs?.length) return null;
  return (
    <>
      <nav aria-label="Breadcrumb" className="px-5 sm:px-8 pt-6">
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildBreadcrumbList(crumbs)),
        }}
      />
    </>
  );
}
