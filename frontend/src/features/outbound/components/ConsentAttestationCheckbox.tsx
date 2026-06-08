import { ExternalLink } from "lucide-react";

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
}

const SENDER_GUIDELINES_URL = "https://support.google.com/mail/answer/81126";

export function ConsentAttestationCheckbox({ checked, onChange }: Props) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-900">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-600"
      />
      <span>
        I confirm these recipients have consented to receive commercial email
        from my organization (e.g., opted in via form, existing business
        relationship, or written consent).{" "}
        <a
          href={SENDER_GUIDELINES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-semibold underline hover:text-amber-700"
        >
          Sender guidelines
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </span>
    </label>
  );
}
