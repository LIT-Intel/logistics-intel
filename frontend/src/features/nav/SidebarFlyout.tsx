/**
 * SidebarFlyout — a hover panel for the Command Center + Outbound sidebar
 * icons (item 5). On hover it lists that destination's tabs with ⌥1.. hints
 * and links straight to them. Additive: it renders as an absolutely-positioned
 * sibling to the existing nav <Link>, so it never touches logo/brand rendering
 * or the item's own markup. Suppressed on touch / narrow viewports.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CC_PATH, CC_TABS, OUTBOUND_PATH, OUTBOUND_TABS, dispatchCcTab, type CcTabKey } from "./navModel";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_MONO = "'JetBrains Mono',monospace";

type FlyoutTab = { label: string; to: string; hint: string; ccTab?: CcTabKey };

const FLYOUTS: Record<"command-center" | "outbound", { title: string; tabs: FlyoutTab[] }> = {
  "command-center": {
    title: "Command Center",
    tabs: CC_TABS.map((t) => ({ label: t.label, to: CC_PATH, hint: `⌥${t.altDigit}`, ccTab: t.key })),
  },
  outbound: {
    title: "Outbound Engine",
    tabs: OUTBOUND_TABS.map((t) => ({ label: t.label, to: `${OUTBOUND_PATH}?tab=${t.tab}`, hint: `⌥${t.altDigit}` })),
  },
};

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 640px)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return coarse;
}

export default function SidebarFlyout({ which, children }: { which: "command-center" | "outbound"; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const coarse = useCoarsePointer();
  const cfg = FLYOUTS[which];

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => {
        // Keep open while focus stays inside the flyout.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(false);
      }}
    >
      {children}
      {!coarse && hover && (
        <div
          role="menu"
          aria-label={`${cfg.title} tabs`}
          style={{
            position: "absolute",
            left: "100%",
            top: 0,
            marginLeft: 8,
            zIndex: 70,
            minWidth: 200,
            padding: 6,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "linear-gradient(180deg,#0F172A 0%,#0B1220 100%)",
            boxShadow: "0 18px 44px rgba(2,6,23,0.5)",
          }}
        >
          <div style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b", padding: "6px 10px 4px" }}>
            {cfg.title}
          </div>
          {cfg.tabs.map((t) => (
            <Link
              key={t.label}
              to={t.to}
              role="menuitem"
              onClick={() => {
                if (t.ccTab) dispatchCcTab(t.ccTab);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 8,
                textDecoration: "none",
                color: "#e2e8f0",
                font: `600 12.5px ${F_DISPLAY}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ flex: 1, whiteSpace: "nowrap" }}>{t.label}</span>
              <kbd style={{ font: `600 10px ${F_MONO}`, color: "#94a3b8", background: "rgba(255,255,255,0.06)", borderRadius: 5, padding: "2px 6px" }}>
                {t.hint}
              </kbd>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
