import Link from "next/link";
import { LitLogoMark } from "@/components/seo/LitLogoMark";

/**
 * Stripped page shell for money pages (/freight-leads, /shipper-leads,
 * /partners, /customers, /solutions, etc).
 *
 * Per Claude-Design HANDOFF.md §2:
 *   - "Stripped nav (logo + Book demo + Start free — NO main nav links)"
 *   - "Stripped footer (logo + legal links only)"
 *
 * Money pages exist to convert. Every element pushes toward one CTA, so
 * we strip escape routes (Product / Solutions / Customers / Blog
 * dropdowns) and the resource-heavy footer that the marketing PageShell
 * carries.
 *
 * Use this instead of <PageShell> on any page rendering money-page
 * components (StickyCTABar / LeadMagnetHero / etc).
 */
export function MoneyPageShell({
  children,
  startHref = "#start",
}: {
  children: React.ReactNode;
  /** Anchor for the "Start free" pill — defaults to the hero form. */
  startHref?: string;
}) {
  return (
    <>
      <nav
        className="sticky top-0 z-40 border-b border-slate-200/60 backdrop-blur-md backdrop-saturate-150"
        style={{ background: "rgba(251,252,254,0.78)" }}
      >
        <div className="mx-auto flex h-[64px] max-w-container items-center gap-4 px-5 sm:px-8 md:h-[68px]">
          <Link
            href="/"
            aria-label="Logistic Intel home"
            className="flex shrink-0 items-center gap-2.5 text-slate-900"
          >
            <LitLogoMark size={30} alive />
            <span className="font-display text-[17px] font-bold tracking-[-0.02em] sm:text-[18px]">
              Logistic <span className="font-extrabold text-blue-700">Intel</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
            <Link
              href="/demo"
              className="font-display hidden h-9 items-center rounded-md border border-slate-200 bg-white/70 px-3.5 text-[13px] font-semibold text-slate-700 backdrop-blur transition hover:bg-white sm:inline-flex"
            >
              Book a demo
            </Link>
            <a
              href={startHref}
              className="font-display inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              Start free →
            </a>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="border-t border-slate-200 bg-slate-50 py-10">
        <div className="mx-auto flex max-w-container flex-col items-center gap-4 px-5 sm:flex-row sm:justify-between sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-slate-900">
            <LitLogoMark size={28} alive />
            <span className="font-display text-[15px] font-bold tracking-[-0.02em]">
              Logistic <span className="font-extrabold text-blue-700">Intel</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[12px] text-slate-500">
            <Link href="/legal/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/security" className="hover:text-slate-900">
              Security
            </Link>
            <Link href="/contact" className="hover:text-slate-900">
              Contact
            </Link>
          </nav>
          <p className="font-mono text-[11.5px] text-slate-400">
            © 2026 Logistic Intel, Inc.
          </p>
        </div>
      </footer>
    </>
  );
}
