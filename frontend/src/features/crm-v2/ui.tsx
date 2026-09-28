/**
 * crm-v2 shared UI primitives — tokens, injected CSS (crm2-* prefixed so
 * nothing leaks), layout switcher, toolbar chips/segments, owner avatars,
 * KPI card, iOS-style toggle. Follows the CommandCenterV2 cc-* idioms and
 * the handoff README §Design Tokens / §Motion exactly.
 */
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { initials, avatarColor } from "@/features/crm/crmFormat";

export const F_DISPLAY = "'Space Grotesk',sans-serif";
export const F_BODY = "'DM Sans',system-ui,sans-serif";
export const F_MONO = "'JetBrains Mono',monospace";
export const EASE = "cubic-bezier(0.16,1,0.3,1)";
export const DRAWER_EASE = "cubic-bezier(0.32,0.72,0,1)";
export const CYAN = "#00F0FF";

export const CARD: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
};

export const CRM2_CSS = `
.crm2-pad{padding-left:32px;padding-right:32px}
@media (max-width:640px){.crm2-pad{padding-left:16px;padding-right:16px}}
.crm2-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;position:sticky;top:0;z-index:20;background:rgba(248,250,252,0.92);backdrop-filter:blur(16px);border-bottom:1px solid #E5E7EB;padding-top:10px;padding-bottom:10px}
.crm2-board{overflow-x:auto;margin-left:-32px;margin-right:-32px;padding-left:32px;padding-right:32px}
@media (max-width:640px){.crm2-board{margin-left:-16px;margin-right:-16px;padding-left:16px;padding-right:16px}}
.crm2-scroll-x{overflow-x:auto}
.crm2-card-hover{transition:border-color 200ms ${EASE},box-shadow 200ms ${EASE}}
.crm2-card-hover:hover{border-color:rgba(0,200,212,0.55)!important;box-shadow:0 10px 24px rgba(15,23,42,0.08)!important}
.crm2-kpicard{transition:border-color 200ms ${EASE},box-shadow 200ms}
.crm2-kpicard:hover{border-color:rgba(0,200,212,0.5);box-shadow:0 12px 32px rgba(15,23,42,0.10)}
.crm2-press{transition:transform 160ms ${EASE},background 200ms,border-color 200ms}
.crm2-press:active{transform:scale(0.97)}
.crm2-cta{transition:transform 160ms ${EASE},background 200ms}
.crm2-cta:hover{background:#2563eb!important}
.crm2-cta:active{transform:scale(0.97)}
.crm2-chip{transition:background 200ms,transform 160ms ${EASE}}
.crm2-chip:active{transform:scale(0.96)}
.crm2-row{transition:background 150ms}
.crm2-row:hover{background:#F8FAFC!important}
.crm2-drawer{animation:crm2SlideIn 350ms ${DRAWER_EASE}}
.crm2-scrim{animation:crm2Fade 250ms ease-out}
@keyframes crm2SlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes crm2Fade{from{opacity:0}to{opacity:1}}
.crm2-modal{animation:crm2Pop 200ms ${EASE}}
@keyframes crm2Pop{from{opacity:0;transform:scale(0.97) translateY(6px)}to{opacity:1;transform:none}}
.crm2-bar{transition:width 500ms ${EASE}}
.crm2-knob{transition:transform 200ms ${EASE}}
.crm2-focus:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(59,130,246,0.35)}
.crm2-focuscard{padding:28px 30px}
@media (max-width:640px){.crm2-focuscard{padding:16px 14px}}
.crm2-2col{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
@media (max-width:960px){.crm2-2col{grid-template-columns:minmax(0,1fr)}}
.crm2-2col-wide{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
@media (max-width:960px){.crm2-2col-wide{grid-template-columns:minmax(0,1fr)}}
.crm2-repgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.crm2-kpirow{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
@media (prefers-reduced-motion: reduce){
  .crm2-card-hover,.crm2-kpicard,.crm2-press,.crm2-cta,.crm2-chip,.crm2-row,.crm2-bar,.crm2-knob{transition:none!important}
  .crm2-press:active,.crm2-cta:active,.crm2-chip:active{transform:none!important}
  .crm2-drawer,.crm2-scrim,.crm2-modal{animation:none!important}
}
`;

export function Crm2Style() {
  return <style>{CRM2_CSS}</style>;
}

// ── Layout switcher (spec §Layout switcher) ────────────────────────────
export function LayoutSwitcher({
  options,
  value,
  onChange,
}: {
  options: Array<["A" | "B", string]>;
  value: "A" | "B";
  onChange: (v: "A" | "B") => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
      <span style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.12em", color: "#94a3b8" }}>LAYOUT</span>
      <div style={{ display: "flex", background: "#EEF2F6", borderRadius: 10, padding: 3, gap: 2 }}>
        {options.map(([id, label]) => {
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              className="crm2-press crm2-focus"
              onClick={() => onChange(id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "none",
                cursor: "pointer",
                borderRadius: 8,
                padding: "4px 8px",
                background: on ? "#0F172A" : "transparent",
                color: on ? "#FFFFFF" : "#475569",
                font: `600 12px ${F_DISPLAY}`,
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  display: "grid",
                  placeItems: "center",
                  background: on ? CYAN : "#E2E8F0",
                  color: on ? "#0F172A" : "#475569",
                  font: `600 11px ${F_MONO}`,
                }}
              >
                {id}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Toolbar pieces ─────────────────────────────────────────────────────
export function SegRow({
  items,
  value,
  onChange,
}: {
  items: Array<[string, string]>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", background: "#EEF2F6", borderRadius: 10, padding: 3, gap: 2, flexWrap: "wrap" }}>
      {items.map(([id, label]) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            className="crm2-press crm2-focus"
            onClick={() => onChange(id)}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: 8,
              padding: "6px 10px",
              background: on ? "#FFFFFF" : "transparent",
              color: on ? "#0F172A" : "#64748b",
              boxShadow: on ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
              font: `600 12px ${F_DISPLAY}`,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ToggleChip({
  label,
  icon: Icon,
  on,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="crm2-chip crm2-focus"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 12px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${on ? "#0F172A" : "#E5E7EB"}`,
        background: on ? "#0F172A" : "#FFFFFF",
        color: on ? "#FFFFFF" : "#334155",
        font: `600 12px ${F_DISPLAY}`,
      }}
    >
      {Icon ? <Icon size={13} /> : null}
      {label}
    </button>
  );
}

/** 28px owner avatar row — simple owner filter per ViewAsFilter semantics. */
export function OwnerAvatars({
  members,
  active,
  onPick,
}: {
  members: Array<{ user_id: string; name: string }>;
  active: string; // "" = all
  onPick: (userId: string) => void;
}) {
  if (members.length < 2) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {members.map((m) => {
        const on = active === m.user_id;
        const dimmed = active !== "" && !on;
        const color = avatarColor(m.name);
        return (
          <button
            key={m.user_id}
            type="button"
            title={on ? `${m.name} — click to clear` : m.name}
            className="crm2-press crm2-focus"
            onClick={() => onPick(on ? "" : m.user_id)}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              background: color,
              color: "#FFFFFF",
              font: `700 10px ${F_DISPLAY}`,
              opacity: dimmed ? 0.35 : 1,
              boxShadow: on ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : "none",
            }}
          >
            {initials(m.name)}
          </button>
        );
      })}
    </div>
  );
}

// ── KPI card (spec §KPI row) ───────────────────────────────────────────
export function KpiCard({
  label,
  icon: Icon,
  value,
  delta,
  deltaColor = "#64748b",
  sub,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  delta?: string;
  deltaColor?: string;
  sub?: string;
}) {
  return (
    <div className="crm2-kpicard" style={{ ...CARD, padding: "16px 18px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Icon size={14} color="#0891b2" />
        <span style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>
          {label}
        </span>
      </div>
      <div style={{ marginTop: 10, font: `600 30px/1 ${F_MONO}`, letterSpacing: "-0.04em", color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {(delta || sub) && (
        <div style={{ marginTop: 6, font: `500 11px ${F_MONO}`, color: "#64748b" }}>
          {delta ? <span style={{ color: deltaColor, marginRight: 5 }}>{delta}</span> : null}
          {sub}
        </div>
      )}
    </div>
  );
}

// ── iOS-style toggle (34×20, knob slides 200ms) ────────────────────────
export function ToggleSwitch({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="crm2-focus"
      onClick={onClick}
      style={{
        width: 34,
        height: 20,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: on ? "#10b981" : "#CBD5E1",
        position: "relative",
        flex: "none",
        padding: 0,
      }}
    >
      <span
        className="crm2-knob"
        style={{
          position: "absolute",
          top: 2,
          left: 0,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#FFFFFF",
          boxShadow: "0 1px 2px rgba(2,6,23,0.3)",
          transform: `translateX(${on ? 16 : 2}px)`,
        }}
      />
    </button>
  );
}

// ── Section label ──────────────────────────────────────────────────────
export function SectionLabel({ icon: Icon, children, color = "#0e7490" }: { icon?: LucideIcon; children: ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, font: `600 11px ${F_DISPLAY}`, letterSpacing: "0.12em", textTransform: "uppercase", color }}>
      {Icon ? <Icon size={13} /> : null}
      {children}
    </div>
  );
}

// ── Buttons ────────────────────────────────────────────────────────────
export function primaryBtnStyle(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    padding: "0 14px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: "#3b82f6",
    color: "#FFFFFF",
    font: `600 13px ${F_DISPLAY}`,
    boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
  };
}
export function ghostBtnStyle(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    cursor: "pointer",
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    color: "#0F172A",
    font: `600 13px ${F_DISPLAY}`,
  };
}

/** Search input (h36, flex 0 1 280px) */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="crm2-focus"
      style={{
        height: 36,
        flex: "0 1 280px",
        minWidth: 140,
        borderRadius: 10,
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        padding: "0 12px",
        font: `400 13px ${F_BODY}`,
        color: "#0F172A",
        outline: "none",
      }}
    />
  );
}
