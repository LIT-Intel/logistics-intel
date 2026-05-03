import Link from "next/link";
import { LitLogoMark } from "../seo/LitLogoMark";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.logisticintel.com";

/**
 * Marketing-site top navigation. Server component — content is static
 * enough that we don't need the dropdown interactivity from the
 * design files (which used React state). Hover-driven menus are added
 * in a client-side <NavMenuClient/> wrapper later if mega-menus return.
 */
export function Nav() {
  return (
    <nav
      className="sticky top-0 z-50 border-b border-ink-100/60 backdrop-blur-md backdrop-saturate-150"
      style={{ background: "rgba(251,252,254,0.78)" }}
    >
      <div className="mx-auto flex h-[68px] max-w-container items-center gap-10 px-8">
        <Link href="/" className="flex items-center gap-2.5 text-ink-900">
          <LitLogoMark size={30} alive />
          <span className="font-display text-[18px] font-extrabold tracking-[-0.02em]">LIT</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <NavLink href="/pulse">Pulse</NavLink>
          <NavLink href="/use-cases">Solutions</NavLink>
          <NavLink href="/customers">Customers</NavLink>
          <NavLink href="/pricing">Pricing</NavLink>
          <NavLink href="/blog">Resources</NavLink>
          <NavLink href="/integrations">Integrations</NavLink>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <a
            href={`${APP_URL}/login`}
            className="font-display hidden h-9 items-center gap-1.5 rounded-md border border-ink-100 bg-white/70 px-3 text-[13px] font-semibold text-ink-700 backdrop-blur transition hover:bg-white sm:inline-flex"
          >
            Sign in
          </a>
          <Link
            href="/demo"
            className="font-display inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
            style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
          >
            Book a demo
          </Link>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-display rounded-md px-3 py-2 text-[14px] font-medium text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
    >
      {children}
    </Link>
  );
}
