/**
 * Inline reminder rendered near the Launch button. Explains the
 * 50/day-per-mailbox cap and links to Google's Email Sender Guidelines
 * so users understand why the cap exists. Required UX surface for
 * Google's Gmail API verification re-review.
 */
import { Info, ExternalLink } from "lucide-react";

const SENDER_GUIDELINES_URL = "https://support.google.com/mail/answer/81126";

export function SenderGuidelinesNote() {
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
