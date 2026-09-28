/**
 * CommandPalette — the global ⌘K / Ctrl+K command palette (item 5).
 * A 640px modal (full-width under 640px) with three static groups —
 * Go to (Command Center + Outbound tabs + Dashboard/Discover), Actions
 * (New deal / New campaign / Add task), and live results — plus a live
 * search over saved companies (getWorkspaceSavedCompanies) and campaigns
 * (getCrmCampaigns), capped at 10 each. Arrow/Enter/Esc navigation,
 * navigates via react-router useNavigate. Mounted once globally in AppLayout.
 *
 * Also owns the global keyboard listener that:
 *   - toggles the palette on ⌘K / Ctrl+K,
 *   - switches Command-Center tabs on ⌥1–⌥4 (event.code Digit1..Digit4)
 *     when the user is on /app/command-center, via the CC tab bridge event.
 *
 * Real handlers only — every result routes somewhere real; nothing faked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, ArrowRight, Building2, Megaphone, Zap, Compass } from "lucide-react";
import { getWorkspaceSavedCompanies } from "@/api/workspace";
import { getCrmCampaigns } from "@/lib/api";
import {
  ACTION_TARGETS,
  CC_PATH,
  CC_TABS,
  GO_TO_TARGETS,
  dispatchCcTab,
  type PaletteTarget,
} from "./navModel";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";
const RESULT_CAP = 10;

type DynEntry = {
  id: string;
  label: string;
  sub?: string;
  to: string;
  kind: "company" | "campaign";
};

type FlatRow =
  | { type: "target"; group: string; target: PaletteTarget }
  | { type: "dyn"; group: string; entry: DynEntry };

function goToTarget(navigate: ReturnType<typeof useNavigate>, t: PaletteTarget) {
  // Navigate first, then fire the CC tab bridge so CommandCenter switches its
  // internal tab even when we're already on /app/command-center (where the
  // navigate is a no-op).
  navigate(t.to);
  if (t.ccTab) dispatchCcTab(t.ccTab);
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // Raw datasets are fetched ONCE per open (not per keystroke) then filtered
  // client-side; `dataTick` just forces a re-render when they land.
  const allCompanies = useRef<DynEntry[]>([]);
  const allCampaigns = useRef<DynEntry[]>([]);
  const [dataTick, setDataTick] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // ── Global keyboard: ⌘K/Ctrl+K toggle + ⌥1–⌥4 CC tab switch ──────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // Alt+digit → Command Center tab switch (only while on the CC route and
      // not typing in a field). Match event.code Digit1..Digit4 so it works
      // regardless of the Alt-produced character on the user's layout.
      if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[1-4]$/.test(e.code)) {
        if (!pathname.startsWith(CC_PATH)) return;
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable) return;
        const n = Number(e.code.slice(5));
        const tab = CC_TABS.find((t) => t.altDigit === n);
        if (tab) {
          e.preventDefault();
          dispatchCcTab(tab.key);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname]);

  // Focus the input + reset transient state + fetch the datasets ONCE per
  // open (workspace saves + campaigns, filtered client-side thereafter).
  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    let alive = true;
    (async () => {
      const [savedRes, campRes] = await Promise.all([
        getWorkspaceSavedCompanies().catch(() => ({ rows: [] as any[] })),
        getCrmCampaigns().catch(() => ({ rows: [] as any[] })),
      ]);
      if (!alive) return;
      const savedRows = Array.isArray((savedRes as any)?.rows) ? (savedRes as any).rows : [];
      allCompanies.current = savedRows
        .map((r: any) => {
          const co = r?.company ?? r?.lit_companies ?? {};
          const key = co?.company_id ?? co?.source_company_key ?? null;
          const name = co?.name ?? co?.company_name ?? "Company";
          const domain = co?.domain ?? null;
          return key
            ? {
                id: `co-${key}`,
                label: String(name),
                sub: domain ? String(domain) : undefined,
                to: `/app/companies/${encodeURIComponent(String(key))}`,
                kind: "company" as const,
              }
            : null;
        })
        .filter((x: DynEntry | null): x is DynEntry => !!x);
      const campRows = Array.isArray((campRes as any)?.rows) ? (campRes as any).rows : [];
      allCampaigns.current = campRows.map((c: any) => ({
        id: `cp-${c?.id}`,
        label: String(c?.name ?? "Campaign"),
        sub: c?.status ? String(c.status) : undefined,
        to: `/app/outbound?tab=campaigns&campaignId=${encodeURIComponent(String(c?.id))}`,
        kind: "campaign" as const,
      }));
      setDataTick((n) => n + 1);
    })();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [open]);

  // ── Filter every group by the query + flatten for arrow-nav. Dynamic
  //    company/campaign results only surface once ≥2 chars are typed, capped
  //    at RESULT_CAP each. ──────────────────────────────────────────────
  const rows = useMemo<FlatRow[]>(() => {
    const term = q.trim().toLowerCase();
    const match = (t: PaletteTarget) => !term || t.label.toLowerCase().includes(term) || (t.hint ?? "").toLowerCase().includes(term);
    const out: FlatRow[] = [];
    for (const t of GO_TO_TARGETS.filter(match)) out.push({ type: "target", group: "Go to", target: t });
    for (const t of ACTION_TARGETS.filter(match)) out.push({ type: "target", group: "Actions", target: t });
    if (term.length >= 2) {
      const cos = allCompanies.current
        .filter((x) => x.label.toLowerCase().includes(term) || (x.sub ?? "").toLowerCase().includes(term))
        .slice(0, RESULT_CAP);
      const cps = allCampaigns.current.filter((x) => x.label.toLowerCase().includes(term)).slice(0, RESULT_CAP);
      for (const e of cos) out.push({ type: "dyn", group: "Saved companies", entry: e });
      for (const e of cps) out.push({ type: "dyn", group: "Campaigns", entry: e });
    }
    return out;
    // dataTick forces recompute once the async datasets land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, dataTick]);

  useEffect(() => {
    if (active >= rows.length) setActive(rows.length ? rows.length - 1 : 0);
  }, [rows.length, active]);

  const run = useCallback(
    (row: FlatRow) => {
      setOpen(false);
      if (row.type === "target") goToTarget(navigate, row.target);
      else navigate(row.entry.to);
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) run(row);
    }
  };

  // Keep the active row scrolled into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  // Group headers rendered inline as `rows` are walked.
  let lastGroup = "";
  let flatIdx = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(2,6,23,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12vh 16px 16px",
      }}
    >
      <style>{`
        @keyframes litpalPop{from{opacity:0;transform:scale(0.98) translateY(-6px)}to{opacity:1;transform:none}}
        .litpal{animation:litpalPop 160ms cubic-bezier(0.16,1,0.3,1)}
        .litpal-item:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(59,130,246,0.35)}
        @media (prefers-reduced-motion: reduce){.litpal{animation:none}}
        @media (max-width:640px){.litpal{width:100%!important;max-width:100%!important}}
      `}</style>
      <div
        className="litpal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: 640,
          maxWidth: "100%",
          maxHeight: "72vh",
          display: "flex",
          flexDirection: "column",
          background: "#FFFFFF",
          borderRadius: 16,
          border: "1px solid #E5E7EB",
          boxShadow: "0 30px 80px rgba(2,6,23,0.4)",
          overflow: "hidden",
        }}
      >
        {/* Search field */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid #F1F5F9" }}>
          <Search size={18} color="#94a3b8" style={{ flex: "none" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Search companies, campaigns, or jump to…"
            aria-label="Search"
            style={{ flex: 1, border: "none", outline: "none", font: `400 15px ${F_BODY}`, color: "#0F172A", background: "transparent" }}
          />
          <kbd style={{ font: `600 10px ${F_MONO}`, color: "#94a3b8", background: "#F1F5F9", borderRadius: 6, padding: "3px 7px", flex: "none" }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: "auto", padding: "6px 6px 8px" }}>
          {rows.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", font: `400 13px ${F_BODY}`, color: "#94a3b8" }}>
              {q.trim().length >= 2 ? "No matches." : "Type to search, or pick a destination below."}
            </div>
          ) : (
            rows.map((row) => {
              flatIdx += 1;
              const idx = flatIdx;
              const header = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              const on = idx === active;
              const label = row.type === "target" ? row.target.label : row.entry.label;
              const sub = row.type === "target" ? row.target.hint : row.entry.sub;
              const Icon =
                row.type === "target"
                  ? row.group === "Actions"
                    ? Zap
                    : row.target.label.startsWith("Discover")
                      ? Compass
                      : ArrowRight
                  : row.type === "dyn" && row.entry.kind === "company"
                    ? Building2
                    : Megaphone;
              return (
                <div key={row.type === "target" ? row.target.id : row.entry.id}>
                  {header ? (
                    <div style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#94a3b8", padding: "10px 12px 4px" }}>
                      {header}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    data-idx={idx}
                    className="litpal-item"
                    onMouseMove={() => setActive(idx)}
                    onClick={() => run(row)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      padding: "10px 12px",
                      background: on ? "#EFF6FF" : "transparent",
                      color: "#0F172A",
                    }}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", background: on ? "#DBEAFE" : "#F1F5F9" }}>
                      <Icon size={15} color={on ? "#1d4ed8" : "#64748b"} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", font: `600 14px ${F_BODY}`, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                      </span>
                      {sub ? (
                        <span style={{ display: "block", font: `400 12px ${F_BODY}`, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sub}
                        </span>
                      ) : null}
                    </span>
                    {row.type === "target" && row.target.hint && row.target.hint.startsWith("⌥") ? (
                      <kbd style={{ font: `600 10px ${F_MONO}`, color: "#64748b", background: "#F1F5F9", borderRadius: 6, padding: "3px 7px", flex: "none" }}>
                        {row.target.hint}
                      </kbd>
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
