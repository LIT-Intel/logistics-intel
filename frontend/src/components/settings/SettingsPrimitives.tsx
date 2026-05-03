// SettingsPrimitives.tsx — Settings-page primitives, currently inline-style
// based for historical reasons (lifted from design/SettingsShared.jsx).
//
// MIGRATION NOTE (2026-05-03): the shared primitives in
// `@/components/ui/LitPill` and `@/components/ui/LitSectionCard` now cover
// the SBadge + SCard surface area (cyan/violet tones, dot variant,
// collapsible/danger/dense). For NEW Settings code, prefer importing those
// shared primitives directly so any future brand updates ripple across
// every page (Profile, Settings, Command Center, etc.) at once.
//
// The legacy inline-style components below (SCard, SBadge, etc.) stay
// exported for backward compatibility — ~70 call sites in
// SettingsSections.tsx still consume them. They produce visually
// equivalent output to the Lit* shared primitives but using inline
// style props rather than Tailwind classes. A future cleanup PR can
// migrate the SettingsSections call sites mechanically; doing it now
// would risk subtle visual regressions for low user-visible payoff.
import React from "react";
import { ChevronDown, Lock, ArrowUpCircle } from "lucide-react";

// ─── Button style objects (exported for callers that need the raw object) ──────
export const sBtnPrimary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "linear-gradient(180deg,#3B82F6,#2563EB)",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Space Grotesk,sans-serif",
  color: "#fff",
  cursor: "pointer",
  boxShadow: "0 1px 4px rgba(59,130,246,0.3)",
};

export const sBtnGhost: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Space Grotesk,sans-serif",
  color: "#374151",
  cursor: "pointer",
};

export const sBtnDanger: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "#FFFFFF",
  border: "1px solid #FECACA",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Space Grotesk,sans-serif",
  color: "#b91c1c",
  cursor: "pointer",
};

export const sBtnDark: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "#0F172A",
  border: "1px solid #0F172A",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Space Grotesk,sans-serif",
  color: "#fff",
  cursor: "pointer",
};

export const sInputStyle: React.CSSProperties = {
  width: "100%",
  background: "#F8FAFC",
  border: "1.5px solid #E5E7EB",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "DM Sans,sans-serif",
  color: "#0F172A",
  outline: "none",
  transition: "all 160ms",
};

// ─── SCard ────────────────────────────────────────────────────────────────────
export type SCardProps = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  dense?: boolean;
  danger?: boolean;
  /** When true, the title row becomes a chevron toggle that hides/shows
   *  the body. Mirrors the collapsible Section pattern in the Profile-page
   *  right rail (CDPDetailsPanel). Use for long lists or rarely-edited
   *  sections where the page should default to a quick scan. */
  collapsible?: boolean;
  /** Initial open state when collapsible=true. Defaults to true so the
   *  user always sees the content unless explicitly defaulted closed. */
  defaultOpen?: boolean;
};

export function SCard({
  title,
  subtitle,
  right,
  children,
  dense,
  danger,
  collapsible,
  defaultOpen = true,
}: SCardProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const showHeader = title || right;
  const headerInteractive = collapsible && Boolean(title);
  return (
    <div style={{
      background: "#fff",
      border: danger ? "1px solid #FECACA" : "1px solid #E5E7EB",
      borderRadius: 12,
      boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      overflow: "hidden",
    }}>
      {showHeader && (
        <div
          onClick={headerInteractive ? () => setOpen((v) => !v) : undefined}
          role={headerInteractive ? "button" : undefined}
          tabIndex={headerInteractive ? 0 : undefined}
          aria-expanded={collapsible ? open : undefined}
          onKeyDown={
            headerInteractive
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen((v) => !v);
                  }
                }
              : undefined
          }
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            padding: "16px 20px 14px",
            borderBottom: open || !collapsible ? "1px solid #F1F5F9" : "none",
            cursor: headerInteractive ? "pointer" : undefined,
            userSelect: headerInteractive ? "none" : undefined,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
            {collapsible && (
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 16,
                  height: 16,
                  marginTop: 2,
                  color: "#94a3b8",
                  transition: "transform 140ms",
                  transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                }}
              >
                <ChevronDown size={14} />
              </span>
            )}
            <div>
              {title && (
                <div style={{
                  fontFamily: "Space Grotesk,sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0F172A",
                  letterSpacing: "-0.01em",
                }}>{title}</div>
              )}
              {subtitle && (
                <div style={{
                  fontFamily: "DM Sans,sans-serif",
                  fontSize: 12.5,
                  color: "#64748b",
                  marginTop: 3,
                  lineHeight: 1.45,
                  maxWidth: 560,
                }}>{subtitle}</div>
              )}
            </div>
          </div>
          {right && (
            <div
              onClick={headerInteractive ? (e) => e.stopPropagation() : undefined}
              style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}
            >
              {right}
            </div>
          )}
        </div>
      )}
      {children !== undefined && (!collapsible || open) && (
        <div style={{ padding: dense ? "14px 20px" : "18px 20px" }}>{children}</div>
      )}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  // Legacy compat props (ignored but kept so old callers don't break)
  kicker?: string;
  description?: string;
};

export function SectionHeader({ title, subtitle, description, right }: SectionHeaderProps) {
  const sub = subtitle || description;
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 16,
      marginBottom: 16,
    }}>
      <div>
        <div style={{
          fontFamily: "Space Grotesk,sans-serif",
          fontSize: 22,
          fontWeight: 700,
          color: "#0F172A",
          letterSpacing: "-0.02em",
        }}>{title}</div>
        {sub && (
          <div style={{
            fontFamily: "DM Sans,sans-serif",
            fontSize: 13,
            color: "#64748b",
            marginTop: 4,
            lineHeight: 1.5,
            maxWidth: 680,
          }}>{sub}</div>
        )}
      </div>
      {right && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

// ─── SField ───────────────────────────────────────────────────────────────────
export function SField({
  label,
  hint,
  children,
  required,
  span,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
  span?: number;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 6,
      gridColumn: span ? `span ${span}` : "auto",
    }}>
      {label && (
        <label style={{
          fontFamily: "Space Grotesk,sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#334155",
          letterSpacing: "0.01em",
        }}>
          {label}
          {required && <span style={{ color: "#dc2626", marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {hint && (
        <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11.5, color: "#94a3b8" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ─── SInput ───────────────────────────────────────────────────────────────────
export function SInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...sInputStyle, ...(props.style || {}) }}
      onFocus={(e) => {
        e.target.style.borderColor = "#3b82f6";
        e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)";
        e.target.style.background = "#fff";
        props.onFocus && props.onFocus(e);
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "#E5E7EB";
        e.target.style.boxShadow = "none";
        e.target.style.background = "#F8FAFC";
        props.onBlur && props.onBlur(e);
      }}
    />
  );
}

// ─── STextarea ────────────────────────────────────────────────────────────────
export function STextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{ ...sInputStyle, resize: "vertical", lineHeight: 1.5, ...(props.style || {}) }}
      onFocus={(e) => {
        e.target.style.borderColor = "#3b82f6";
        e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)";
        e.target.style.background = "#fff";
        props.onFocus && props.onFocus(e);
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "#E5E7EB";
        e.target.style.boxShadow = "none";
        e.target.style.background = "#F8FAFC";
        props.onBlur && props.onBlur(e);
      }}
    />
  );
}

// ─── SSelect ─────────────────────────────────────────────────────────────────
export function SSelect({
  value,
  onChange,
  options,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options?: Array<string | { value: string; label: string }>;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={onChange}
        {...rest}
        style={{ ...sInputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}
      >
        {children
          ? children
          : (options || []).map((o) =>
              typeof o === "string" ? (
                <option key={o} value={o}>{o}</option>
              ) : (
                <option key={o.value} value={o.value}>{o.label}</option>
              )
            )}
      </select>
      <span style={{
        position: "absolute",
        right: 11,
        top: "50%",
        transform: "translateY(-50%)",
        pointerEvents: "none",
        color: "#94a3b8",
        display: "flex",
        alignItems: "center",
      }}>
        <ChevronDown size={13} />
      </span>
    </div>
  );
}

// ─── SToggle ─────────────────────────────────────────────────────────────────
export function SToggle({
  checked,
  onChange,
  label,
  sub,
  // Legacy prop aliases for callers using the old SettingsPrimitives API
  on,
  onToggle,
  title,
  description,
  disabled,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  sub?: string;
  // Legacy
  on?: boolean;
  onToggle?: () => void;
  title?: string;
  description?: string;
  disabled?: boolean;
}) {
  const isOn = checked !== undefined ? checked : (on ?? false);
  const handleClick = () => {
    if (disabled) return;
    if (onChange) onChange(!isOn);
    else if (onToggle) onToggle();
  };
  const displayLabel = label || title || "";
  const displaySub = sub || description;

  return (
    <div
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        background: isOn ? "#F0F9FF" : "#F8FAFC",
        border: `1px solid ${isOn ? "#BAE6FD" : "#E5E7EB"}`,
        transition: "all 160ms",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "Space Grotesk,sans-serif",
          fontSize: 13,
          fontWeight: 600,
          color: "#0F172A",
        }}>{displayLabel}</div>
        {displaySub && (
          <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {displaySub}
          </div>
        )}
      </div>
      <div style={{
        width: 34,
        height: 20,
        borderRadius: 10,
        background: isOn ? "#3b82f6" : "#CBD5E1",
        position: "relative",
        flexShrink: 0,
        transition: "all 160ms",
      }}>
        <div style={{
          position: "absolute",
          top: 2,
          left: isOn ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          transition: "all 160ms",
        }} />
      </div>
    </div>
  );
}

// ─── RawToggle (matrix cells) ─────────────────────────────────────────────────
export function RawToggle({
  on,
  onToggle,
  label,
  small,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  small?: boolean;
}) {
  const w = small ? 32 : 34;
  const h = small ? 18 : 20;
  const thumbSz = small ? 14 : 16;
  const thumbOn = small ? 16 : 16;

  return (
    <div
      onClick={onToggle}
      title={label}
      aria-pressed={on}
      style={{
        width: w,
        height: h,
        borderRadius: 10,
        background: on ? "#3b82f6" : "#CBD5E1",
        position: "relative",
        cursor: "pointer",
        transition: "all 160ms",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute",
        top: 2,
        left: on ? thumbOn : 2,
        width: thumbSz,
        height: thumbSz,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        transition: "all 160ms",
      }} />
    </div>
  );
}

// ─── SBadge ──────────────────────────────────────────────────────────────────
type BadgeTone = "slate" | "blue" | "green" | "amber" | "red" | "violet" | "cyan";

const BADGE_MAP: Record<BadgeTone, { bg: string; color: string; border: string; dot: string }> = {
  slate:  { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0", dot: "#94a3b8" },
  blue:   { bg: "#EFF6FF", color: "#1d4ed8", border: "#BFDBFE", dot: "#3b82f6" },
  green:  { bg: "#F0FDF4", color: "#15803d", border: "#BBF7D0", dot: "#22c55e" },
  amber:  { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A", dot: "#f59e0b" },
  red:    { bg: "#FEF2F2", color: "#b91c1c", border: "#FECACA", dot: "#ef4444" },
  violet: { bg: "#F5F3FF", color: "#6d28d9", border: "#DDD6FE", dot: "#8b5cf6" },
  cyan:   { bg: "#ECFEFF", color: "#0e7490", border: "#A5F3FC", dot: "#06b6d4" },
};

export function SBadge({
  tone = "slate",
  children,
  dot,
  icon,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  dot?: boolean;
  icon?: React.ReactNode;
}) {
  const s = BADGE_MAP[tone] || BADGE_MAP.slate;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: "Space Grotesk,sans-serif",
      padding: "3px 9px",
      borderRadius: 9999,
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      )}
      {icon && <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>}
      {children}
    </span>
  );
}

// Pill = SBadge alias (for SettingsLayout backward compat)
export const Pill = SBadge;
export type PillTone = BadgeTone;
export type PillProps = Parameters<typeof SBadge>[0];

// ─── SLockOverlay ─────────────────────────────────────────────────────────────
export function SLockOverlay({
  plan,
  need,
  children,
  onUpgrade,
}: {
  plan?: string;
  need?: string;
  children?: React.ReactNode;
  onUpgrade?: () => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      {children}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "rgba(248,250,252,0.88)",
        backdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        borderRadius: 12,
        border: "1px dashed #CBD5E1",
        padding: 20,
        textAlign: "center",
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "linear-gradient(180deg,#EFF6FF,#DBEAFE)",
          border: "1px solid #BFDBFE",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <Lock size={16} color="#2563EB" />
        </div>
        <div>
          <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
            Requires {need}
          </div>
          <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#64748b", marginTop: 2 }}>
            You&rsquo;re on the {plan} plan. Upgrade to unlock this module.
          </div>
        </div>
        <button onClick={onUpgrade} style={sBtnPrimary}>
          <ArrowUpCircle size={13} /> Upgrade plan
        </button>
      </div>
    </div>
  );
}

// ─── Button components (Tailwind wrappers kept for backward compat) ────────────
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode };

export function BtnPrimary({ children, style, ...props }: BtnProps) {
  return (
    <button {...props} style={{ ...sBtnPrimary, ...style }}>
      {children}
    </button>
  );
}

export function BtnGhost({ children, style, ...props }: BtnProps) {
  return (
    <button {...props} style={{ ...sBtnGhost, ...style }}>
      {children}
    </button>
  );
}

export function BtnDanger({ children, style, ...props }: BtnProps) {
  return (
    <button {...props} style={{ ...sBtnDanger, ...style }}>
      {children}
    </button>
  );
}

export function BtnDark({ children, style, ...props }: BtnProps) {
  return (
    <button {...props} style={{ ...sBtnDark, ...style }}>
      {children}
    </button>
  );
}

// ─── StatusMsg ────────────────────────────────────────────────────────────────
export function StatusMsg({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  if (error) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 10,
        border: "1px solid #FECACA",
        background: "#FEF2F2",
        padding: "10px 14px",
        fontFamily: "DM Sans,sans-serif",
        fontSize: 13,
        color: "#b91c1c",
      }}>
        {error}
      </div>
    );
  }
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderRadius: 10,
      border: "1px solid #BBF7D0",
      background: "#F0FDF4",
      padding: "10px 14px",
      fontFamily: "DM Sans,sans-serif",
      fontSize: 13,
      color: "#15803d",
    }}>
      {success}
    </div>
  );
}
