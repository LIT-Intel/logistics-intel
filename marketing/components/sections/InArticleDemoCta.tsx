import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Single-button demo CTA dropped between paragraphs roughly one screen
 * into a blog article body. Hardcoded copy by design — consistency
 * across the entire content corpus over per-post flexibility. Light
 * surface, brand-blue button.
 */
export function InArticleDemoCta() {
  return (
    <div className="mx-auto my-10 max-w-[760px] px-5 sm:px-8">
      <div className="rounded-xl border border-ink-100 bg-ink-25 p-4 sm:p-5">
        <div className="font-display text-[22px] font-semibold leading-tight tracking-[-0.012em] text-ink-900">
          See LIT on your real lanes
        </div>
        <p className="font-body mt-2 text-[14.5px] leading-relaxed text-ink-500">
          Demo on your top 3 lanes — we&apos;ll show you the saved-company
          workflow against your actual book of business.
        </p>
        <div className="mt-4">
          <Link
            href="/demo"
            className="font-display inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold text-white shadow-[0_6px_16px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_22px_rgba(37,99,235,0.45)]"
            style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
          >
            Book a demo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
