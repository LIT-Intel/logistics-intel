"use client";

import { useState } from "react";
import { Twitter, Linkedin, Link2, Check, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Article social-share row. Renders X (Twitter), LinkedIn, Email, and
 * Copy-Link buttons. Copy-link uses navigator.clipboard with a 1.6s
 * "Copied" affordance. Each share opens in a new tab via target="_blank"
 * + rel="noopener noreferrer".
 *
 * Use `variant="row"` (default) for the inline placement at top/bottom
 * of an article, `variant="rail"` for the optional left-rail sticky
 * placement on long reads.
 */
export function SocialShare({
  url,
  title,
  variant = "row",
  className,
}: {
  /** Full canonical URL of the article. */
  url: string;
  title: string;
  variant?: "row" | "rail";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const targets: { href: string; label: string; Icon: typeof Twitter }[] = [
    {
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      Icon: Twitter,
    },
    {
      label: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      Icon: Linkedin,
    },
    {
      label: "Share via email",
      href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`,
      Icon: Mail,
    },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* no-op — clipboard API blocked in some browsers/iframes */
    }
  }

  const isRail = variant === "rail";
  const containerClass = isRail
    ? "flex flex-col gap-2"
    : "flex flex-wrap items-center gap-2";
  const buttonClass = isRail
    ? "inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-sm transition hover:border-brand-blue/40 hover:text-brand-blue-700 hover:shadow-md"
    : "inline-flex h-9 items-center gap-1.5 rounded-md border border-ink-100 bg-white px-3 text-[12.5px] font-semibold text-ink-700 transition hover:border-brand-blue/40 hover:text-brand-blue-700 hover:shadow-sm";

  return (
    <div className={cn(containerClass, className)}>
      {!isRail && (
        <span className="font-display mr-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-200">
          Share
        </span>
      )}
      {targets.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={buttonClass}
        >
          <Icon className={isRail ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
          {!isRail && <span>{label.replace("Share on ", "").replace("Share via ", "")}</span>}
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        aria-label="Copy link"
        className={buttonClass}
      >
        {copied ? (
          <Check className={isRail ? "h-4 w-4 text-emerald-600" : "h-3.5 w-3.5 text-emerald-600"} />
        ) : (
          <Link2 className={isRail ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
        )}
        {!isRail && <span>{copied ? "Copied" : "Copy link"}</span>}
      </button>
    </div>
  );
}
