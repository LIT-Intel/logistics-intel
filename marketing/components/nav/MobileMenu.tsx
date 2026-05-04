"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight, Calendar } from "lucide-react";
import { APP_LOGIN_URL } from "@/lib/app-urls";

const NAV_LINKS = [
  { label: "Platform overview", href: "/products" },
  { label: "Pulse AI", href: "/pulse" },
  { label: "Company Intelligence", href: "/company-intelligence" },
  { label: "Contact Intelligence", href: "/contact-intelligence" },
  { label: "Command Center (CRM)", href: "/command-center" },
  { label: "Outbound Engine", href: "/outbound-engine" },
  { label: "Trade Intelligence", href: "/trade-intelligence" },
  { label: "Solutions", href: "/use-cases" },
  { label: "Customers", href: "/customers" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/blog" },
  { label: "Integrations", href: "/integrations" },
  { label: "Security", href: "/security" },
  { label: "Contact", href: "/contact" },
];

/**
 * Mobile menu — hamburger button + slide-in drawer. Visible only on
 * <md screens (tailwind md breakpoint = 768px). Locks body scroll
 * while open. Closes on route change OR overlay click.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-100 bg-white/80 text-ink-700 transition hover:bg-white md:hidden"
      >
        <Menu className="h-4.5 w-4.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          {/* Overlay */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
          />

          {/* Drawer
              `height: 100dvh` keeps the drawer stable when iOS Safari's
              address bar collapses. `min-h-0` on the scroll container is
              the standard flex-scroll fix — without it the nav links
              section collapses to 0 height and only header + footer show. */}
          <div
            className="absolute right-0 top-0 flex w-full max-w-[340px] flex-col overflow-hidden bg-white shadow-xl"
            style={{ height: "100dvh", minHeight: "100vh" }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-ink-100 px-5 py-4">
              <span className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink-900">
                Logistic <span className="font-extrabold text-brand-blue-700">Intel</span>
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-100 bg-white text-ink-700 transition hover:bg-ink-25"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <ul className="space-y-0.5">
                {NAV_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="font-display block rounded-md px-3 py-2.5 text-[15px] font-medium text-ink-900 transition hover:bg-ink-25"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="shrink-0 space-y-2 border-t border-ink-100 px-5 py-4">
              <a
                href={APP_LOGIN_URL}
                className="font-display flex h-11 items-center justify-center gap-2 rounded-md border border-ink-100 bg-white text-[14px] font-semibold text-ink-900 transition hover:bg-ink-25"
              >
                Sign in
              </a>
              <Link
                href="/demo"
                onClick={() => setOpen(false)}
                className="font-display flex h-11 items-center justify-center gap-2 rounded-md text-[14px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                <Calendar className="h-4 w-4" />
                Book a demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
