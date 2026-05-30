import Link from "next/link";
import { LitLogoMark } from "../seo/LitLogoMark";
import { Button } from "@/components/ui/Button";
import { APP_LOGIN_URL } from "@/lib/app-urls";
import { MobileMenu } from "./MobileMenu";
import { ProductDropdown } from "./ProductDropdown.client";
import { CompanyDropdown } from "./CompanyDropdown.client";
import { Calendar } from "lucide-react";

/**
 * Marketing-site top navigation. Server component — content is static
 * enough that we don't need the dropdown interactivity from the
 * design files (which used React state). The "Product" dropdown is
 * the one client island, lazy-loaded via `ProductDropdown.client`.
 */
export function Nav() {
  return (
    <nav
      className="sticky top-0 z-50 border-b border-ink-100/60 backdrop-blur-md backdrop-saturate-150"
      style={{ background: "rgba(251,252,254,0.78)" }}
    >
      <div className="mx-auto flex h-[64px] max-w-container items-center gap-4 px-5 sm:gap-10 sm:px-8 md:h-[68px]">
        <Link
          href="/"
          aria-label="Logistic Intel home"
          className="flex shrink-0 items-center gap-2.5 text-ink-900"
        >
          <LitLogoMark size={30} alive />
          <span className="font-display text-[17px] font-bold tracking-[-0.02em] sm:text-[18px]">
            Logistic <span className="font-extrabold text-brand-blue-700">Intel</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <ProductDropdown />
          <NavLink href="/solutions">Solutions</NavLink>
          <NavLink href="/customers">Customers</NavLink>
          <NavLink href="/blog">Blog</NavLink>
          <CompanyDropdown />
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
          {/* Desktop: ghost Sign-in + primary Book-a-demo */}
          <Button
            variant="secondary"
            size="sm"
            href={APP_LOGIN_URL}
            className="hidden md:inline-flex"
          >
            Sign in
          </Button>
          <Button
            variant="primary"
            size="sm"
            href="/demo"
            className="hidden md:inline-flex"
          >
            Book a demo
          </Button>

          {/* Mobile-only Sign in — compact, sits beside Demo */}
          <Button
            variant="secondary"
            size="sm"
            href={APP_LOGIN_URL}
            aria-label="Sign in"
            className="whitespace-nowrap px-2.5 text-[12.5px] md:hidden"
          >
            Sign in
          </Button>
          {/* Mobile-only primary CTA — one-tap /demo without opening the drawer */}
          <Button
            variant="primary"
            size="sm"
            href="/demo"
            aria-label="Book a demo"
            className="px-2.5 text-[12.5px] md:hidden"
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            Demo
          </Button>

          <MobileMenu />
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
