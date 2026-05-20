"use client";

import { useRef, useState } from "react";
import { Twitter, Linkedin, Mail, Link as LinkIcon, Check } from "lucide-react";
import { useScrollSpy } from "@/lib/hooks/useScrollSpy";
import { useReadingProgress } from "@/lib/hooks/useReadingProgress";

export type TocItem = {
  id: string;
  label: string;
};

/**
 * `ArticleSidenav` — sticky-top article TOC + share row + reading
 * progress bar. Active TOC link gets a 2px blue left border + pulsing
 * dot (animation respected by reduced-motion). Reading progress
 * cyan→blue gradient bar updates via a rAF-throttled scroll listener.
 *
 * `aria-current="location"` marks the active item; the whole sidenav
 * is `aria-live="polite"` so changes are announced without disrupting
 * keyboard nav.
 *
 * Clicking a TOC link smooth-scrolls (or jumps when reduced-motion).
 */
export function ArticleSidenav({
  items,
  shareUrl,
  shareTitle,
  articleRef,
}: {
  items: TocItem[];
  shareUrl: string;
  shareTitle: string;
  articleRef?: React.RefObject<HTMLElement>;
}) {
  const ids = items.map((i) => i.id);
  const active = useScrollSpy(ids);
  const progress = useReadingProgress(articleRef);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // no-op — older browsers fall back to selection. Keep silent.
    }
  }

  function onTocClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    history.replaceState(null, "", `#${id}`);
  }

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareTitle,
  )}&url=${encodeURIComponent(shareUrl)}`;
  const liUrl = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(
    shareUrl,
  )}&title=${encodeURIComponent(shareTitle)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(
    shareTitle,
  )}&body=${encodeURIComponent(shareUrl)}`;

  return (
    <aside className="article-sidenav" aria-live="polite">
      <div className="asn-eyebrow">In this article</div>
      <nav className="asn-toc" aria-label="Table of contents">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={item.id === active ? "is-active" : undefined}
            aria-current={item.id === active ? "location" : undefined}
            onClick={(e) => onTocClick(e, item.id)}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="asn-share" aria-label="Share this article">
        <a href={xUrl} target="_blank" rel="noopener noreferrer" aria-label="Share on X">
          <Twitter className="h-4 w-4" aria-hidden />
        </a>
        <a href={liUrl} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">
          <Linkedin className="h-4 w-4" aria-hidden />
        </a>
        <a href={mailUrl} aria-label="Share by email">
          <Mail className="h-4 w-4" aria-hidden />
        </a>
        <button
          type="button"
          onClick={copyLink}
          aria-label="Copy link"
          className={copied ? "copied" : undefined}
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <LinkIcon className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      <div
        className="asn-progress"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Reading progress"
      >
        <span style={{ width: `${progress}%` }} />
      </div>
    </aside>
  );
}
