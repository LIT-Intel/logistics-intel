"use client";

import { useState } from "react";

/**
 * `NewsletterStrip` — centered dark CTA with email input + cyan
 * Subscribe button. Cyan is permitted here because the section is on a
 * dark surface. Posts to `/api/leads/resend` — the same endpoint the
 * lead-magnet pages already POST to. Subscribers come in tagged with
 * the `source` field so we can attribute conversions by surface.
 */
export function NewsletterStrip({
  eyebrow = "Stay in the loop",
  heading = "Get the LIT brief — every Friday.",
  lede = "Five minutes on what's moving in trade data, GTM tooling, and what we're shipping next. No spam, ever.",
  source = "blog-newsletter",
}: {
  eyebrow?: string;
  heading?: string;
  lede?: string;
  source?: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [email, setEmail] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/leads/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="newsletter-strip">
      <div className="relative z-10 mx-auto max-w-container px-5 sm:px-8">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-brand-cyan">
          {eyebrow}
        </div>
        <h2 className="mt-3">{heading}</h2>
        <p className="ns-lede mx-auto max-w-[520px]">{lede}</p>
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="ns-email" className="sr-only">
            Work email
          </label>
          <input
            id="ns-email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={status === "loading" || status === "done"}
          />
          <button type="submit" disabled={status === "loading" || status === "done"}>
            {status === "loading"
              ? "Subscribing…"
              : status === "done"
                ? "Subscribed ✓"
                : "Subscribe"}
          </button>
        </form>
        {status === "error" && (
          <div className="ns-status" role="alert">
            Something went wrong. Try again, or email us at hello@logisticintel.com.
          </div>
        )}
      </div>
    </section>
  );
}
