import React from "react";
import {
  Mail,
  UserPlus,
  MessageSquare,
  Phone,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { CHANNEL, type ChannelKind } from "../tokens";
import {
  GmailIcon,
  OutlookIcon,
  LinkedInIcon,
  normalizeEmailProvider,
} from "./BrandIcons";

const ICON: Record<ChannelKind, LucideIcon> = {
  email: Mail,
  linkedin_invite: UserPlus,
  linkedin_message: MessageSquare,
  call: Phone,
  wait: Clock,
};

const LINKEDIN_KINDS: ReadonlySet<ChannelKind> = new Set([
  "linkedin_invite",
  "linkedin_message",
]);

// Channel/provider branding rules (owner ask, 2026-08):
//   - email steps show the ACTUAL mailbox brand — Gmail "M" when the sending
//     account provider is gmail, Microsoft squares when outlook. Unknown /
//     unresolvable provider falls back to the generic lucide Mail icon.
//   - linkedin_invite / linkedin_message always show the LinkedIn mark.
//   - call keeps the phone icon; wait keeps the clock.
export function ChannelIcon({
  kind,
  size = 11,
  className,
  provider,
}: {
  kind: ChannelKind;
  size?: number;
  className?: string;
  /** lit_email_accounts.provider of the sending mailbox (email steps only). */
  provider?: string | null;
}) {
  if (LINKEDIN_KINDS.has(kind)) {
    return <LinkedInIcon size={size} className={className} />;
  }
  if (kind === "email") {
    const p = normalizeEmailProvider(provider);
    if (p === "gmail") return <GmailIcon size={size} className={className} />;
    if (p === "outlook") return <OutlookIcon size={size} className={className} />;
  }
  const Icon = ICON[kind] ?? Mail;
  return (
    <Icon
      style={{ width: size, height: size, color: CHANNEL[kind].color }}
      className={className}
    />
  );
}

export function ChannelChip({
  kind,
  size = 20,
  iconSize = 10,
  title,
  provider,
}: {
  kind: ChannelKind;
  size?: number;
  iconSize?: number;
  title?: string;
  /** lit_email_accounts.provider of the sending mailbox (email steps only). */
  provider?: string | null;
}) {
  const meta = CHANNEL[kind];
  const p = kind === "email" ? normalizeEmailProvider(provider) : null;
  const label =
    kind === "email" && p === "gmail"
      ? "Email · Gmail"
      : kind === "email" && p === "outlook"
        ? "Email · Outlook"
        : meta.label;
  return (
    <span
      title={title ?? label}
      className="inline-flex items-center justify-center rounded-md"
      style={{
        width: size,
        height: size,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
      }}
    >
      <ChannelIcon kind={kind} size={iconSize} provider={provider} />
    </span>
  );
}
