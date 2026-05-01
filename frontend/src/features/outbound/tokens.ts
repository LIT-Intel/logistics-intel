// Outbound Engine v2 design tokens — mirrors outbound-v2-handoff/CLAUDE.md §2.
// Used inline in components when a Tailwind utility doesn't fit (brand hexes,
// gradients, channel palette). The codebase is Tailwind-first, so prefer
// utilities; reach for these only when needed.

export const ob = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  cardHover: "#FAFBFC",
  border: "#E5E7EB",
  borderSoft: "#F1F5F9",

  ink900: "#0F172A",
  ink700: "#334155",
  ink500: "#64748B",
  ink300: "#94A3B8",
  ink200: "#CBD5E1",

  blue: "#3B82F6",
  blueDark: "#2563EB",
  blueBg: "#EFF6FF",
  blueBorder: "#BFDBFE",
  cyan: "#00F0FF",

  success: "#10B981",
  successFg: "#15803D",
  successBg: "#F0FDF4",
  successBorder: "#BBF7D0",

  warning: "#F59E0B",
  warningFg: "#B45309",
  warningBg: "#FFFBEB",
  warningBorder: "#FDE68A",

  danger: "#EF4444",
  purple: "#8B5CF6",
  purpleBg: "#FAF5FF",
  purpleBorder: "#E9D5FF",
  purpleFg: "#7E22CE",
  pink: "#EC4899",
  amber: "#F59E0B",

  coachBg: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)",
} as const;

export const fontDisplay = "'Space Grotesk', system-ui, sans-serif";
export const fontBody = "'DM Sans', system-ui, sans-serif";
export const fontMono = "'JetBrains Mono', ui-monospace, monospace";

export type ChannelKind =
  | "email"
  | "linkedin_invite"
  | "linkedin_message"
  | "call"
  | "wait";

export const CHANNEL: Record<
  ChannelKind,
  { icon: string; label: string; color: string; bg: string; border: string }
> = {
  email: {
    icon: "mail",
    label: "Email",
    color: "#3B82F6",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  linkedin_invite: {
    icon: "user-plus",
    label: "LinkedIn invite",
    color: "#0A66C2",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  linkedin_message: {
    icon: "message-square",
    label: "LinkedIn msg",
    color: "#0A66C2",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  call: {
    icon: "phone",
    label: "Call task",
    color: "#8B5CF6",
    bg: "#F5F3FF",
    border: "#DDD6FE",
  },
  wait: {
    icon: "clock",
    label: "Wait",
    color: "#64748B",
    bg: "#F1F5F9",
    border: "#E2E8F0",
  },
};