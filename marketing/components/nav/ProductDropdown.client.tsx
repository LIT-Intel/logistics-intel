"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Sparkles,
  Building2,
  Users,
  Globe2,
  Send,
  Search,
  BarChart3,
  TrendingUp,
} from "lucide-react";

/**
 * Desktop-only "Product" dropdown that consolidates the seven product
 * routes under one nav item. Mobile users see the same items grouped in
 * the drawer (see MobileMenu.tsx). Click-toggle + hover-open + outside-
 * click-close + Esc-close so it works for keyboard, touch, and pointer.
 */
const PRODUCT_LINKS: {
  label: string;
  description: string;
  href: string;
  icon: typeof Sparkles;
}[] = [
  {
    label: "Pulse AI",
    description: "Natural-language intelligence + briefs",
    href: "/pulse",
    icon: Sparkles,
  },
  {
    label: "Company Intelligence",
    description: "Live trade picture on every account",
    href: "/company-intelligence",
    icon: Building2,
  },
  {
    label: "Contact Intelligence",
    description: "The right buyers — title-, dept-, lane-filtered",
    href: "/contact-intelligence",
    icon: Users,
  },
  {
    label: "Trade Intelligence",
    description: "Live origin × destination signals",
    href: "/trade-intelligence",
    icon: Globe2,
  },
  {
    label: "Rate Benchmark",
    description: "Live FBX12 rates inside every account",
    href: "/rate-benchmark",
    icon: BarChart3,
  },
  {
    label: "Revenue Opportunity",
    description: "Sized freight wallet across six service lines",
    href: "/revenue-opportunity",
    icon: TrendingUp,
  },
  {
    label: "Command Center (CRM)",
    description: "CRM with shipment context built in",
    href: "/command-center",
    icon: Search,
  },
  {
    label: "Outbound Engine",
    description: "Multichannel sequences seeded by signal",
    href: "/outbound-engine",
    icon: Send,
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
          className="absolute left-0 top-full z-50 mt-1.5 w-[440px] overflow-hidden rounded-xl border border-ink-100 bg-white p-2 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.22)]"
        >
          {PRODUCT_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                role="menuitem"
                className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition hover:bg-ink-25"
              >
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-brand-blue-700 transition group-hover:scale-105"
                  style={{
                    background: "linear-gradient(180deg, #eff6ff, #dbeafe)",
                    boxShadow: "inset 0 0 0 1px rgba(59,130,246,0.15)",
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="font-display block text-[13.5px] font-semibold text-ink-900">
                    {link.label}
                  </span>
                  <span className="font-body mt-0.5 block text-[12px] leading-snug text-ink-500">
                    {link.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
