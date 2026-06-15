"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLeadMagnetForm } from "./useLeadMagnetForm";
import { track } from "@/lib/events";
import styles from "./lead-magnet.module.css";

const STORAGE_KEY = "lit-exit-shown";
const MOBILE_DELAY_MS = 30_000;
const MOBILE_SCROLL_THRESHOLD = 0.5;

/**
 * Exit-intent modal. Desktop: triggers when the cursor leaves the top of
 * the viewport. Mobile: after 30s, if the user has scrolled past 50% of
 * the page. Fires once per session. Offer is a free PDF of the top 100
 * active shippers in the visitor's lane.
 */
export function ExitIntentModal() {
  const [open, setOpen] = useState(false);
  const { onSubmit, submitting } = useLeadMagnetForm({
    source: "exit-intent",
    offer: "top-100-shippers-pdf",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const trigger = () => {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      sessionStorage.setItem(STORAGE_KEY, "1");
      setOpen(true);
      try {
        track("exit_intent_shown", { offer: "top-100-shippers-pdf" });
      } catch {
        /* analytics is best-effort */
      }
    };

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const cleanups: Array<() => void> = [];

    if (isMobile) {
      const t = window.setTimeout(() => {
        const scrolled =
          (window.scrollY + window.innerHeight) /
          Math.max(document.documentElement.scrollHeight, 1);
        if (scrolled >= MOBILE_SCROLL_THRESHOLD) trigger();
      }, MOBILE_DELAY_MS);
      cleanups.push(() => window.clearTimeout(t));
    } else {
      const onMouseLeave = (e: MouseEvent) => {
        // Only fire when the cursor exits via the top edge.
        if (e.clientY <= 0) trigger();
      };
      document.addEventListener("mouseleave", onMouseLeave);
      cleanups.push(() => document.removeEventListener("mouseleave", onMouseLeave));
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`${styles.exitScrim} fixed inset-0 z-[100] flex items-center justify-center p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lit-exit-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className={`${styles.exitDialog} relative w-full max-w-md rounded-2xl p-6 sm:p-8`}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
          Free PDF · Q2 2026
        </p>
        <h2 id="lit-exit-title" className="font-display mt-2 text-2xl font-bold text-white sm:text-3xl">
          Top 100 active U.S. shippers, ranked.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          A freight sales target list built from trailing 12-month customs filings.
          100 shippers, 71,262 BOLs, 26 states. Built for freight forwarders, brokers, and 3PLs.
        </p>

        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="source" value="exit-intent" />
          <input type="hidden" name="offer" value="top-100-shippers-pdf" />
          <label htmlFor="lit-exit-email" className="sr-only">
            Work email
          </label>
          <input
            id="lit-exit-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="h-11 min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-brand-cyan focus:outline-none focus:ring-1 focus:ring-brand-cyan"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-cyan px-5 text-sm font-semibold text-dark-0 transition hover:bg-brand-cyan-dim disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send the PDF"}
          </button>
        </form>

        <p className="mt-3 text-[11px] text-white/45">
          No credit card. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
