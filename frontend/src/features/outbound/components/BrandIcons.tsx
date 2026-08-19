import React from "react";

// Small inline brand SVGs for channel/provider chips. Kept as raw path data
// (well-known simple-icons / gilbarbara-logos geometry) so they render crisp
// at 10-18px without network fetches. Used by ChannelChip/ChannelIcon to show
// the ACTUAL sending surface: Gmail vs Outlook mailbox for email steps, the
// LinkedIn mark for linkedin_invite / linkedin_message steps.

export function GmailIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Multicolor Gmail "M" (2020 logo). Native aspect is 256x193.
  return (
    <svg
      viewBox="0 0 256 193"
      style={{ width: size, height: Math.round(size * (193 / 256)) }}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727Z"
      />
      <path
        fill="#34A853"
        d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837-27.026 25.798v98.91Z"
      />
      <path
        fill="#EA4335"
        d="m58.182 93.14-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.669 34.992-4.669 40.644L128 145.504z"
      />
      <path
        fill="#FBBC04"
        d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945l-16.292 12.218Z"
      />
      <path
        fill="#C5221F"
        d="m0 49.504 26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23v23.273Z"
      />
    </svg>
  );
}

export function OutlookIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Microsoft four-square mark — reads as "Microsoft/Outlook mailbox" and
  // stays crisp at 12-16px where the detailed Outlook "O" glyph muddies.
  return (
    <svg
      viewBox="0 0 23 23"
      style={{ width: size, height: size }}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path fill="#F35325" d="M1 1h10v10H1z" />
      <path fill="#81BC06" d="M12 1h10v10H12z" />
      <path fill="#05A6F0" d="M1 12h10v10H1z" />
      <path fill="#FFBA08" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function LinkedInIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // simple-icons LinkedIn glyph — solid LinkedIn-blue square with the "in"
  // knocked out.
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size }}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#0A66C2"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"
      />
    </svg>
  );
}

/** Normalized provider key from a lit_email_accounts.provider value. */
export type EmailProviderKind = "gmail" | "outlook" | null;

export function normalizeEmailProvider(
  provider: string | null | undefined,
): EmailProviderKind {
  const p = String(provider ?? "").toLowerCase();
  if (p === "gmail" || p === "google") return "gmail";
  if (p === "outlook" || p === "microsoft" || p === "office365") return "outlook";
  return null;
}
