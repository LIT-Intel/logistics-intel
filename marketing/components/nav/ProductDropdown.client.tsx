"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Sparkles,
  Search,
  LayoutGrid,
  Send,
  Users,
  Plug,
  ArrowRight,
} from "lucide-react";

/**
 * Desktop "Product" mega-menu. Two-column layout: six product-category
 * links on the left, a featured preview card on the right (current
 * spotlight = the /freight-leads industry hub). Hover-open + click-open
 * + outside-pointerdown-close + Esc-close, same a11y semantics as the
 * sibling CompanyDropdown so keyboard, touch, and pointer users all get
 * a working menu.
 */
type ProductLink = {
  label: string;
  description: string;
  href: string;
  icon: typeof Sparkles;
};

const PRODUCT_LINKS: ProductLink[] = [
  {
    label: "Search & Discovery",
    description: "Find shipper accounts by lane, HS code, or origin",
    href: "/company-intelligence",
    icon: Search,
  },
  {
    label: "Pulse AI",
    description: "Account briefs and signals, generated in seconds",
    href: "/pulse",
    icon: Sparkles,
  },
  {
    label: "Command Center CRM",
    description: "Freight-aware pipeline, stages, tasks, notes",
    href: "/command-center",
    icon: LayoutGrid,
  },
  {
    label: "Outbound Sequences",
    description: "Email + LinkedIn + call cadences, multi-channel",
    href: "/outbound-engine",
    icon: Send,
  },
  {
    label: "Verified Contacts",
    description: "Buyer-side decision makers attached to every importer",
    href: "/contact-intelligence",
    icon: Users,
  },
  {
    label: "Integrations",
    description: "HubSpot, Salesforce, Slack, Snowflake, and more",
    href: "/integrations",
    icon: Plug,
  },
];

export function ProductDropdown() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside pointerdown + Escape. pointerdown (not mousedown)
  // catches both touch + mouse cleanly so the dropdown closes when a
  // user taps anywhere outside on iPad / iPhone.
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

  // Hover open with a small grace period on leave so the user can move
  // their pointer from the trigger button into the dropdown panel
  // without the menu collapsing on the gap.
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
        // Only open on hover for fine pointers (mouse, trackpad). On
        // touch devices `pointerType` is "touch" and we want the click
        // handler below to be the single source of open/close instead
        // of fighting with synthetic hover events.
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
        // Click ALWAYS opens — never toggles. The only ways to close
        // are: click outside, press Escape, click a menu item, or
        // (mouse only) move the pointer off the wrapper. Toggling on
        // click was the source of the "opens then immediately closes"
        // bug on hover-capable devices: hover would set open=true,
        // then click would flip it back to false in the same tick.
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`font-display inline-flex items-center gap-1 rounded-md px-3 py-2 text-[14px] font-medium transition-colors ${
          open ? "bg-ink-50 text-ink-900" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"
        }`}
      >
        Product
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          // Centered under the trigger via -translate-x to anchor at the
          // button while letting the wide mega-menu breathe past the
          // edges of "Product". 880px hits the spec target band.
          className="absolute left-1/2 top-full z-50 mt-2 w-[880px] -translate-x-1/2 overflow-hidden rounded-2xl border border-ink-100/80 bg-white/95 p-6 shadow-2xl backdrop-blur-md"
        >
          <div className="grid grid-cols-[1.4fr_1fr] gap-8">
            {/* Left column: product links */}
            <div>
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-500">
                Product
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {PRODUCT_LINKS.map((link) => {
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
              href="/freight-leads"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="group block rounded-xl border border-brand-blue/15 bg-section-soft-blue p-5 transition hover:border-brand-blue/30"
            >
              <span className="mb-3 inline-flex items-center rounded-full bg-brand-blue/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-brand-blue">
                Featured
              </span>

              {/* Mini-visual: 2 connected lane nodes (origin → destination) */}
              <svg
                viewBox="0 0 200 40"
                className="h-10 w-full"
                aria-hidden
              >
                <defs>
                  <linearGradient id="lanePath" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                    <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.25" />
                  </linearGradient>
                </defs>
                {/* dashed lane line */}
                <line
                  x1="20"
                  y1="20"
                  x2="180"
                  y2="20"
                  stroke="url(#lanePath)"
                  strokeWidth="2"
                  strokeDasharray="3 5"
                />
                {/* mid waypoint */}
                <circle cx="100" cy="20" r="2.5" fill="#3b82f6" opacity="0.5" />
                {/* origin node */}
                <circle cx="20" cy="20" r="6" fill="#fff" stroke="#3b82f6" strokeWidth="2" />
                <circle cx="20" cy="20" r="2.5" fill="#3b82f6" />
                {/* destination node */}
                <circle cx="180" cy="20" r="6" fill="#fff" stroke="#1d4ed8" strokeWidth="2" />
                <circle cx="180" cy="20" r="2.5" fill="#1d4ed8" />
              </svg>

              <div className="font-display mt-3 text-[16px] font-semibold leading-tight text-ink-900">
                Freight leads by industry
              </div>
              <p className="font-body mt-1 text-[13px] leading-relaxed text-ink-700">
                Six verticals with HS-code priors, key lanes, and outreach plays. Start with
                automotive, apparel, or electronics.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand-blue transition group-hover:text-brand-blue-700">
                Browse industries
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
