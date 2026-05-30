"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Building2, Briefcase, Mail, Lock, ArrowRight } from "lucide-react";

/**
 * Desktop "Company" mega-menu — visual parity with ProductDropdown.
 * Two-column panel: company links on the left, a featured preview card
 * on the right (current spotlight = /customers). Hover-open + click-open
 * + outside-pointerdown-close + Esc-close, same a11y semantics as the
 * sibling ProductDropdown so keyboard, touch, and pointer users all get
 * a working menu.
 */
type CompanyLink = {
  label: string;
  description: string;
  href: string;
  icon: typeof Building2;
};

const COMPANY_LINKS: CompanyLink[] = [
  {
    label: "About us",
    description: "The team and the operator-grade thesis behind LIT",
    href: "/about",
    icon: Building2,
  },
  {
    label: "Careers",
    description: "Join the LIT team — open roles + culture",
    href: "/careers",
    icon: Briefcase,
  },
  {
    label: "Security",
    description: "How we handle your data, customers, and contacts",
    href: "/security",
    icon: Lock,
  },
  {
    label: "Contact",
    description: "Talk to sales, support, or partnerships",
    href: "/contact",
    icon: Mail,
  },
];

export function CompanyDropdown() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Outside pointerdown + Escape close the menu. pointerdown catches
  // touch + mouse cleanly so taps outside the menu close it on iPad.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [open]);

  // Hover open with grace period on leave (keeps the panel open while
  // the user moves their pointer from the trigger into the menu).
  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") {
          cancelClose();
          setOpen(true);
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") scheduleClose();
      }}
    >
      <button
        type="button"
        // Click ALWAYS opens — never toggles. The previous toggle-on-click
        // pattern caused the "opens then immediately closes" bug on
        // hover-capable devices: hover set open=true, click flipped it
        // back to false in the same tick.
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`font-display inline-flex items-center gap-1 rounded-md px-3 py-2 text-[14px] font-medium transition-colors ${
          open ? "bg-ink-50 text-ink-900" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"
        }`}
      >
        Company
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          // Centered under the trigger so the wide mega-menu breathes
          // past the edges of "Company". 820px is slightly narrower than
          // Product (880px) since Company has fewer links.
          className="absolute left-1/2 top-full z-50 mt-2 w-[820px] -translate-x-1/2 overflow-hidden rounded-2xl border border-ink-100/80 bg-white/95 p-6 shadow-2xl backdrop-blur-md"
        >
          <div className="grid grid-cols-[1.4fr_1fr] gap-8">
            {/* Left column: company links */}
            <div>
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-500">
                Company
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {COMPANY_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      role="menuitem"
                      className="group flex items-start gap-2.5 rounded-md px-2.5 py-2 transition hover:bg-ink-25"
                    >
                      <Icon
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue transition group-hover:text-brand-blue-700"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="font-display block text-[14px] font-semibold leading-tight text-ink-900">
                          {link.label}
                        </span>
                        <span className="font-body mt-1 line-clamp-2 block text-[12.5px] leading-relaxed text-ink-500">
                          {link.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right column: featured preview card */}
            <Link
              href="/customers"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="group block rounded-xl border border-brand-blue/15 bg-section-soft-blue p-5 transition hover:border-brand-blue/30"
            >
              <span className="mb-3 inline-flex items-center rounded-full bg-brand-blue/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-brand-blue">
                Featured
              </span>

              {/* Mini-visual: stack of three abstract story cards */}
              <svg
                viewBox="0 0 200 80"
                className="h-20 w-full"
                aria-hidden
              >
                <defs>
                  <linearGradient id="cardFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#dbeafe" stopOpacity="1" />
                    <stop offset="100%" stopColor="#eff6ff" stopOpacity="1" />
                  </linearGradient>
                </defs>
                {/* back card */}
                <rect
                  x="32"
                  y="10"
                  width="120"
                  height="44"
                  rx="6"
                  fill="url(#cardFill)"
                  stroke="#3b82f6"
                  strokeOpacity="0.2"
                  strokeWidth="1"
                />
                {/* middle card */}
                <rect
                  x="44"
                  y="20"
                  width="120"
                  height="44"
                  rx="6"
                  fill="#ffffff"
                  stroke="#3b82f6"
                  strokeOpacity="0.3"
                  strokeWidth="1"
                />
                {/* front card with content lines */}
                <rect
                  x="56"
                  y="30"
                  width="120"
                  height="44"
                  rx="6"
                  fill="#ffffff"
                  stroke="#3b82f6"
                  strokeOpacity="0.5"
                  strokeWidth="1.25"
                />
                <line x1="66" y1="42" x2="140" y2="42" stroke="#3b82f6" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
                <line x1="66" y1="50" x2="160" y2="50" stroke="#3b82f6" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round" />
                <line x1="66" y1="58" x2="120" y2="58" stroke="#3b82f6" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round" />
              </svg>

              <div className="font-display mt-3 text-[16px] font-semibold leading-tight text-ink-900">
                How freight teams ship
              </div>
              <p className="font-body mt-1 text-[13px] leading-relaxed text-ink-700">
                Customer stories from forwarders, NVOs, and brokers using LIT to find lanes,
                close shippers, and grow book of business.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand-blue transition group-hover:text-brand-blue-700">
                See customer stories
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
