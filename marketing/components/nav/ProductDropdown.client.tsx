"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Sparkles,
  Building2,
  Users,
  Globe2,
  Layers,
  Send,
  Search,
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
    label: "Platform overview",
    description: "Six pillars, one connected workspace",
    href: "/products",
    icon: Layers,
  },
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

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
