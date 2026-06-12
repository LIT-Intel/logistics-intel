/**
 * Inline reminder rendered near the Launch button. Explains the
 * 50/day-per-mailbox cap and links to Google's Email Sender Guidelines
 * so users understand why the cap exists. Required UX surface for
 * Google's Gmail API verification re-review.
 *
 * Two render modes:
 *   - Default chip: long-form text. Used inside the activity drawer
 *     or any wide context where the explanation fits.
 *   - Popover (DR Move 1): a small ⓘ icon button that toggles a
 *     bubble. Used next to the Launch CTA in the campaign builder top
 *     bar so we don't push the action row past the viewport.
 */
import { useEffect, useRef, useState } from "react";
import { Info, ExternalLink } from "lucide-react";

const SENDER_GUIDELINES_URL = "https://support.google.com/mail/answer/81126";

interface SenderGuidelinesNoteProps {
  /** When `variant="popover"`, render as an icon button that toggles a
   *  bubble on click. Default `"chip"` renders the original inline
   *  layout for full-width contexts. */
  variant?: "chip" | "popover";
}

export function SenderGuidelinesNote({
  variant = "chip",
}: SenderGuidelinesNoteProps = {}) {
  if (variant === "popover") return <SenderGuidelinesPopover />;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[10.5px] text-slate-600">
      <Info className="h-3 w-3 text-slate-400" />
      <span>
        Sends capped at 50/day per mailbox to protect deliverability.{" "}
        <a
          href={SENDER_GUIDELINES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-semibold underline hover:text-slate-800"
        >
          Sender guidelines
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </span>
    </div>
  );
}

function SenderGuidelinesPopover() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + Esc to dismiss. The bubble is absolutely
  // positioned, so we can't rely on a backdrop.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Sender guidelines"
        title="Sender guidelines — sends capped at 50/day per mailbox"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
      >
        <Info className="h-3 w-3" />
      </button>
      {open ? (
        <div
          role="dialog"
          className="absolute right-0 top-full z-40 mt-1.5 w-[260px] rounded-md border border-slate-200 bg-white p-2.5 text-[11px] leading-relaxed text-slate-700 shadow-lg"
        >
          Sends are capped at 50/day per mailbox to protect deliverability.{" "}
          <a
            href={SENDER_GUIDELINES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-semibold text-blue-600 underline hover:text-blue-800"
          >
            Sender guidelines
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      ) : null}
    </div>
  );
}
