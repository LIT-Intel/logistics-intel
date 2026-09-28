/**
 * CommandCenterV2 — the Command Center rebuild (design handoff
 * `Command Center.dc.html` + README §4/§5).
 *
 * Pure UI over the finished data layer:
 *   - useCommandCenterData() / useCCState()   (data/useCommandCenterData.ts)
 *   - computeAccountsView / computeContactsView / computeDrawer
 *     (data/computeCommandCenter.ts) — every displayed number, label,
 *     color and onClick is precomputed there. Nothing is hardcoded here.
 *
 * Renders INSIDE the existing AppLayout (no chrome/sidebars here).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  Compass,
  Contact,
  Container,
  Crown,
  DollarSign,
  Download,
  Layers,
  Megaphone,
  Package,
  Phone,
  Search,
  Ship,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useReducedMotion } from "@/features/company-profile/components/ui";
import { useDashboardData } from "@/features/dashboard/data/useDashboardData";
import { miLabelOf } from "@/features/dashboard/data/computeDash";
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";
import {
  computeAccountsView,
  computeContactsView,
  computeDrawer,
} from "./data/computeCommandCenter";
import { useCCState, useCommandCenterData } from "./data/useCommandCenterData";
import AccountsTable from "./components/AccountsTable";
import ContactsTable from "./components/ContactsTable";
import CCDrawer from "./components/CCDrawer";
import BulkBar, { downloadCsv, rowsToCsv } from "./components/BulkBar";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";
const EASE = "cubic-bezier(0.16,1,0.3,1)";
const CARD: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
};

/** KPI overline icon strings from the VMs → lucide components. */
const KPI_ICONS: Record<string, typeof Building2> = {
  "building-2": Building2,
  ship: Ship,
  package: Package,
  container: Container,
  "dollar-sign": DollarSign,
  target: Target,
  contact: Contact,
  crown: Crown,
  "badge-check": BadgeCheck,
  phone: Phone,
  megaphone: Megaphone,
  "shield-check": ShieldCheck,
};

// Injected once — hover states, mobile rules and reduced-motion. All
// selectors are cc-prefixed so nothing leaks outside this page.
const CC_CSS = `
.cc-pad{padding-left:32px;padding-right:32px}
.cc-h1{margin:0;font:700 52px/1.04 ${F_DISPLAY};letter-spacing:-0.04em;color:#0F172A;text-wrap:balance}
.cc-narrative{margin:14px 0 0;max-width:920px;font:400 18px/1.55 ${F_BODY};color:#475569;text-wrap:pretty}
@media (max-width:768px){.cc-h1{font-size:32px}.cc-narrative{font-size:15px}}
@media (max-width:640px){
  .cc-pad{padding-left:16px;padding-right:16px}
  .cc-topbtns{width:100%}
  .cc-topbtns>button{flex:1;justify-content:center;padding:0 10px!important}
  .cc-bulklabel{display:none}
}
.cc-ghostbtn{transition:transform 160ms ${EASE},border-color 200ms,background 200ms}
.cc-ghostbtn:hover{border-color:rgba(0,200,212,0.5)!important;background:#F8FAFC!important}
.cc-ghostbtn:active{transform:scale(0.97)}
.cc-cta{transition:transform 160ms ${EASE},background 200ms}
.cc-cta:hover{background:#2563eb!important}
.cc-cta:active{transform:scale(0.97)}
.cc-kpicard{transition:border-color 200ms ${EASE},box-shadow 200ms}
.cc-kpicard:hover{border-color:rgba(0,200,212,0.5);box-shadow:0 12px 32px rgba(15,23,42,0.10)}
.cc-chip{transition:background 200ms,transform 160ms ${EASE}}
.cc-chip:active{transform:scale(0.96)}
.cc-seg{transition:background 200ms,color 200ms}
.cc-seg:active{transform:scale(0.96)}
.cc-press:active{transform:scale(0.97)}
.cc-row{transition:background 150ms}
.cc-row:hover{background:#F8FAFC!important}
.cc-grouphead:hover{background:#F1F5F9!important}
.cc-legend:hover{background:#F1F5F9!important}
.cc-gapchip{transition:border-color 200ms,background 200ms}
.cc-gapchip:hover{border-color:rgba(0,200,212,0.5)!important;background:#F8FAFC}
.cc-sendbtn{transition:border-color 150ms,color 150ms}
.cc-sendbtn:hover{border-color:#3b82f6!important;color:#3b82f6!important}
.cc-panelx:hover{background:#1e293b}
.cc-ghostdark:hover{background:#1e293b}
.cc-drawerrow:hover{background:#1e293b}
.cc-bulkghost:hover:not(:disabled){background:#1e293b;color:#f8fafc}
.cc-link:hover{color:#2563eb!important}
.cc-pagebtn:disabled{opacity:0.4;cursor:default}
.cc-focus:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(59,130,246,0.35)}
@media (prefers-reduced-motion: reduce){
  .cc-ghostbtn,.cc-cta,.cc-kpicard,.cc-chip,.cc-seg,.cc-press,.cc-row,.cc-gapchip,.cc-sendbtn,.cc-anim{transition:none!important}
  .cc-ghostbtn:active,.cc-cta:active,.cc-chip:active,.cc-seg:active,.cc-press:active{transform:none!important}
}
`;

const segItems = (
  items: [string, string][],
  cur: string,
  set: (v: string) => void,
) =>
  items.map(([id, label]) => ({
    id,
    label,
    onClick: () => set(id),
    bg: cur === id ? "#FFFFFF" : "transparent",
    fg: cur === id ? "#0F172A" : "#64748b",
    shadow: cur === id ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
  }));

export interface CommandCenterV2Props {
  initialTab?: "companies" | "contacts";
}

export default function CommandCenterV2({ initialTab }: CommandCenterV2Props) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { loading, accounts, contacts, owners } = useCommandCenterData();
  const { st, A } = useCCState();
  const { ds } = useDashboardData(); // period labels only (same cached query)
  const [params] = useSearchParams();

  // `initialTab` seeds st.tab once, only when no ?tab= param is present.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (initialTab && !params.get("tab") && st.tab !== initialTab) {
      A.set({ tab: initialTab });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const av = useMemo(
    () => computeAccountsView(accounts, st, A, owners),
    [accounts, st, A, owners],
  );
  const cv = useMemo(
    () => computeContactsView(contacts, accounts, st, A),
    [contacts, accounts, st, A],
  );
  const dv = useMemo(
    () => computeDrawer(st, accounts, contacts, A),
    [st, accounts, contacts, A],
  );

  const isCo = st.tab === "companies";

  // Real data-window labels from the dashboard dataset (no invented dates).
  const period12 = ds
    ? `${miLabelOf(ds.lastMi - 11, ds.firstYear)} – ${miLabelOf(ds.lastMi, ds.firstYear)}`
    : "";
  const period24 = ds
    ? `${miLabelOf(ds.lastMi - 23, ds.firstYear)} – ${miLabelOf(ds.lastMi, ds.firstYear)}`
    : "";

  // ── Search (200ms debounce into st.q) ───────────────────────────────
  const [qLocal, setQLocal] = useState(st.q);
  const stQRef = useRef(st.q);
  stQRef.current = st.q;
  useEffect(() => setQLocal(stQRef.current), [st.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qLocal !== stQRef.current) A.set({ q: qLocal });
    }, 200);
    return () => clearTimeout(t);
  }, [qLocal, A]);

  const clearAll = () => {
    setQLocal("");
    A.set({ q: "", health: null, stages: [], owner: null, sen: [], chan: "all", page: 0 });
  };

  // ── Selection → companies for "Add to Campaign" ─────────────────────
  const selectedCompanies = useMemo(() => {
    const bySaved = new Map(accounts.map((a) => ["a" + a.co.savedId, a]));
    const byContact = new Map(contacts.map((c) => ["c" + c.id, c]));
    const acctByUuid = new Map(
      accounts.filter((a) => a.co.uuid).map((a) => [a.co.uuid as string, a]),
    );
    const out = new Map<string, { company_id: string | null; name: string }>();
    st.sel.forEach((k) => {
      const a = bySaved.get(k);
      if (a) {
        out.set(String(a.co.uuid ?? k), { company_id: a.co.uuid ?? null, name: a.co.name });
        return;
      }
      const c = byContact.get(k);
      if (c) {
        const ca = acctByUuid.get(c.companyUuid);
        if (ca) out.set(String(ca.co.uuid), { company_id: ca.co.uuid ?? null, name: ca.co.name });
      }
    });
    return [...out.values()];
  }, [st.sel, accounts, contacts]);

  // lit_saved_companies.id behind the selected company rows (keys are "a"+savedId).
  const selectedSavedIds = useMemo(() => {
    if (st.tab !== "companies") return [];
    const valid = new Set(accounts.map((a) => String(a.co.savedId)));
    return st.sel
      .filter((k) => k.startsWith("a"))
      .map((k) => k.slice(1))
      .filter((id) => valid.has(id));
  }, [st.sel, st.tab, accounts]);

  // ── CSV export (row VMs only — header Export = all filtered rows) ───
  const allCompanyRows = () => {
    const out: any[] = [];
    for (let p = 0; p < av.pages; p++) {
      out.push(...computeAccountsView(accounts, { ...st, page: p }, A, owners).rows);
    }
    return out;
  };
  const allContactRows = () => cv.groups.flatMap((g: any) => g.rows);
  const exportAll = () => {
    const rows = isCo ? allCompanyRows() : allContactRows();
    if (!rows.length) return;
    downloadCsv(rowsToCsv(st.tab, rows), `command-center-${st.tab}.csv`);
  };
  const getSelectedRows = () =>
    (isCo ? allCompanyRows() : allContactRows()).filter((r: any) => st.sel.includes(r.key));

  // ── Drawer (content kept rendered during the close transition) ──────
  const lastDrawerRef = useRef<any>(null);
  if (st.drawer && (dv.pc || dv.pp)) lastDrawerRef.current = dv;
  const shown = st.drawer ? dv : lastDrawerRef.current;

  // Company for the campaign modal, resolved from the open drawer.
  const drawerCompany = useMemo(() => {
    if (shown?.pc) return { company_id: shown.pc.uuid ?? null, name: shown.pc.name as string };
    if (shown?.pp) {
      const a = accounts.find((x) => x.co.savedId === shown.pp.coSavedId);
      if (a) return { company_id: a.co.uuid ?? null, name: a.co.name };
    }
    return null;
  }, [shown, accounts]);

  const [campaignCo, setCampaignCo] = useState<{ company_id: string | null; name: string } | null>(
    null,
  );

  // ── Loading skeleton ────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: "#F1F5F9", minHeight: "100vh", fontFamily: F_BODY }} aria-busy>
        <style>{CC_CSS}</style>
        <div className="cc-pad" style={{ maxWidth: 1560, margin: "0 auto", paddingTop: 26, paddingBottom: 26 }}>
          <div className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 240, marginBottom: 20 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 118 }} />
            ))}
          </div>
          <div className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 92, marginBottom: 16 }} />
          <div className="motion-reduce:animate-none animate-pulse" style={{ ...CARD, height: 520 }} />
        </div>
      </div>
    );
  }

  const kpis: any[] = isCo ? av.kpis : cv.kpis;
  const hasFilters = isCo ? av.hasFilters : cv.hasFilters;
  const sorts = segItems(
    [
      ["spend", "Est. spend"],
      ["volume", "Volume"],
      ["recent", "Last shipment"],
      ["saved", "Recently saved"],
    ],
    st.sort,
    (v) => A.set({ sort: v as any, page: 0 }),
  );
  const chans = segItems(
    [
      ["all", "All"],
      ["email", "Verified email"],
      ["phone", "Direct dial"],
      ["fresh", "Not in campaign"],
    ],
    st.chan,
    (v) => A.set({ chan: v as any }),
  );
  const tabs = [
    { id: "companies" as const, label: "Saved companies", Icon: Building2, count: accounts.length },
    { id: "contacts" as const, label: "Contacts", Icon: Contact, count: contacts.length },
  ];

  return (
    <div style={{ background: "#F1F5F9", minHeight: "100vh", color: "#0F172A", fontFamily: F_BODY }}>
      <style>{CC_CSS}</style>

      {/* ══ Header — full-bleed gradient + masked grid + cyan glow ═════ */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg,#FFFFFF 0%,#F2FAFC 100%)",
          boxShadow: "inset 0 -1px 0 #E5E7EB",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(15,23,42,0.045) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,0.045) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
            WebkitMaskImage: "radial-gradient(ellipse 70% 90% at 70% 0%,#000,transparent)",
            maskImage: "radial-gradient(ellipse 70% 90% at 70% 0%,#000,transparent)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -160,
            top: -220,
            width: 720,
            height: 720,
            borderRadius: 999,
            background: "radial-gradient(circle,rgba(0,240,255,0.16),transparent 62%)",
            pointerEvents: "none",
          }}
        />

        <div className="cc-pad" style={{ position: "relative", maxWidth: 1560, margin: "0 auto", paddingTop: 26 }}>
          {/* top row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13, color: "#64748b" }}>
              <span
                style={{
                  font: `600 10px ${F_MONO}`,
                  letterSpacing: "0.12em",
                  color: "#0e7490",
                  background: "rgba(0,240,255,0.10)",
                  border: "1px solid rgba(0,200,212,0.35)",
                  borderRadius: 4,
                  padding: "3px 7px",
                }}
              >
                COMMAND CENTER
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#475569" }}>
                <ShieldCheck size={14} style={{ color: "#10b981" }} />
                U.S. CBP data · updated continuously
              </span>
            </div>
            <div className="cc-topbtns" style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="cc-ghostbtn cc-focus"
                onClick={exportAll}
                style={{
                  height: 40,
                  border: "1px solid #E5E7EB",
                  background: "#FFFFFF",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 14px",
                  font: `600 13px ${F_BODY}`,
                  color: "#0F172A",
                  cursor: "pointer",
                }}
              >
                <Download size={15} style={{ color: "#0891b2" }} />
                Export
              </button>
              <button
                type="button"
                className="cc-cta cc-focus"
                onClick={() => navigate("/app/search")}
                style={{
                  height: 40,
                  background: "#3b82f6",
                  border: "none",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 16px",
                  font: `600 13px ${F_BODY}`,
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
                }}
              >
                <Compass size={15} />
                Discover Companies
              </button>
            </div>
          </div>

          {/* title + narrative */}
          <div style={{ marginTop: 30 }}>
            {isCo ? (
              <>
                <h1 className="cc-h1">
                  Saved{" "}
                  <span
                    style={{
                      background: "linear-gradient(90deg,#2563eb,#00c8d4)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    companies
                  </span>
                </h1>
                <p className="cc-narrative">
                  You are tracking{" "}
                  <span style={{ color: "#0F172A", fontWeight: 600 }}>{av.sum.n} companies</span>.{" "}
                  <span style={{ color: "#0F172A", fontWeight: 600 }}>{av.sum.active}</span> shipped in
                  the last 90 days, moving{" "}
                  <span style={{ color: "#0F172A", fontWeight: 600 }}>{av.sum.ship} shipments</span>{" "}
                  worth an estimated{" "}
                  <span style={{ color: "#0F172A", fontWeight: 600 }}>{av.sum.spend}</span> over 12
                  months.{" "}
                  <span style={{ color: "#b45309", fontWeight: 600 }}>{av.sum.slowing} slowing</span>{" "}
                  and{" "}
                  <span style={{ color: "#e11d48", fontWeight: 600 }}>{av.sum.dormant} gone quiet</span>.
                </p>
              </>
            ) : (
              <>
                <h1 className="cc-h1">
                  Every contact,{" "}
                  <span
                    style={{
                      background: "linear-gradient(90deg,#2563eb,#00c8d4)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    one place
                  </span>
                </h1>
                <p className="cc-narrative">
                  <span style={{ color: "#0F172A", fontWeight: 600 }}>{cv.csum.n} contacts</span>{" "}
                  across {cv.csum.cos} saved companies.{" "}
                  <span style={{ color: "#0F172A", fontWeight: 600 }}>{cv.csum.dm}</span> are decision
                  makers (Director and above) and{" "}
                  <span style={{ color: "#0F172A", fontWeight: 600 }}>{cv.csum.verified}</span> have a
                  verified email.{" "}
                  <span style={{ color: "#b45309", fontWeight: 600 }}>{cv.csum.gap} companies</span>{" "}
                  still have no decision maker on file.
                </p>
              </>
            )}
          </div>

          {/* KPI cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
              gap: 12,
              marginTop: 28,
            }}
          >
            {kpis.map((k: any) => {
              const Icon = KPI_ICONS[k.icon] ?? Building2;
              return (
                <div
                  key={k.id ?? k.label}
                  className="cc-kpicard"
                  style={{ ...CARD, padding: "16px 18px 14px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      font: `600 10px ${F_DISPLAY}`,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#64748b",
                    }}
                  >
                    <Icon size={14} style={{ color: "#0891b2", flex: "none" }} />
                    {k.label}
                  </div>
                  <div
                    style={{
                      font: `600 30px/1 ${F_MONO}`,
                      letterSpacing: "-0.04em",
                      color: "#0F172A",
                      margin: "14px 0 8px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {k.value}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      font: `500 11px ${F_MONO}`,
                      color: "#64748b",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: k.dfg }}>{k.delta}</span>
                    {k.sub}
                  </div>
                </div>
              );
            })}
          </div>

          {/* tabs */}
          <div style={{ display: "flex", gap: 28, marginTop: 24 }}>
            {tabs.map((t) => {
              const on = t.id === st.tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="cc-focus"
                  onClick={() => {
                    setQLocal("");
                    A.set({ tab: t.id });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 2px 14px",
                    font: `600 14px ${F_DISPLAY}`,
                    cursor: "pointer",
                    color: on ? "#0F172A" : "#64748b",
                    boxShadow: on ? "inset 0 -2px 0 #00c8d4" : "none",
                    background: "transparent",
                    border: "none",
                    transition: reduced ? "none" : "color 200ms",
                  }}
                >
                  <t.Icon size={15} />
                  {t.label}
                  <span
                    style={{
                      font: `600 11px ${F_MONO}`,
                      color: on ? "#0e7490" : "#64748b",
                      background: on ? "rgba(0,240,255,0.12)" : "#F1F5F9",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {t.count.toLocaleString("en-US")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ Sticky toolbar ═════════════════════════════════════════════ */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(248,250,252,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <div
          className="cc-pad"
          style={{
            maxWidth: 1560,
            margin: "0 auto",
            paddingTop: 10,
            paddingBottom: 10,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* search */}
          <div
            style={{
              height: 36,
              flex: "0 1 300px",
              minWidth: 200,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 10,
            }}
          >
            <Search size={14} style={{ color: "#94a3b8", flex: "none" }} />
            <input
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              placeholder={
                isCo
                  ? "Search companies, cities, origins…"
                  : "Search names, titles, companies, emails…"
              }
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: 0,
                background: "transparent",
                font: `500 13px ${F_BODY}`,
                color: "#0F172A",
              }}
            />
          </div>

          {/* chips */}
          {isCo ? (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {av.stageChips.map((c: any) => (
                <button
                  key={c.label}
                  type="button"
                  className="cc-chip cc-focus"
                  onClick={c.onClick}
                  style={{
                    height: 30,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 10px",
                    borderRadius: 999,
                    font: `600 12px ${F_BODY}`,
                    cursor: "pointer",
                    background: c.bg,
                    color: c.fg,
                    border: `1px solid ${c.bd}`,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: c.color }} />
                  {c.label}
                  <span style={{ font: `500 11px ${F_MONO}`, opacity: 0.7 }}>{c.count}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {cv.senChips.map((c: any) => (
                  <button
                    key={c.label}
                    type="button"
                    className="cc-chip cc-focus"
                    onClick={c.onClick}
                    style={{
                      height: 30,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0 10px",
                      borderRadius: 999,
                      font: `600 12px ${F_BODY}`,
                      cursor: "pointer",
                      background: c.bg,
                      color: c.fg,
                      border: `1px solid ${c.bd}`,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: c.color }} />
                    {c.label}
                    <span style={{ font: `500 11px ${F_MONO}`, opacity: 0.7 }}>{c.count}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 2, background: "#EEF2F6", borderRadius: 10, padding: 3 }}>
                {chans.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="cc-seg cc-focus"
                    onClick={m.onClick}
                    style={{
                      padding: "6px 11px",
                      borderRadius: 7,
                      font: `600 12px ${F_BODY}`,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      background: m.bg,
                      color: m.fg,
                      boxShadow: m.shadow,
                      border: "none",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* owner avatars */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 6 }}>
            {av.owners.map((o: any) => (
              <button
                key={o.id}
                type="button"
                title={o.name}
                className="cc-focus"
                onClick={o.onClick}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: o.color,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  font: `600 10px ${F_DISPLAY}`,
                  cursor: "pointer",
                  border: "none",
                  opacity: o.opacity,
                  boxShadow: o.ring,
                  transition: reduced ? "none" : "opacity 200ms,box-shadow 200ms",
                }}
              >
                {o.key}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              type="button"
              className="cc-focus"
              onClick={clearAll}
              style={{
                font: `600 12px ${F_BODY}`,
                color: "#3b82f6",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                padding: 0,
              }}
            >
              Clear filters
            </button>
          )}

          <div style={{ flex: 1 }} />

          {isCo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  font: `600 10px ${F_DISPLAY}`,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                }}
              >
                Sort
              </span>
              <div style={{ display: "flex", gap: 2, background: "#EEF2F6", borderRadius: 10, padding: 3 }}>
                {sorts.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="cc-seg cc-focus"
                    onClick={m.onClick}
                    style={{
                      padding: "6px 11px",
                      borderRadius: 7,
                      font: `600 12px ${F_BODY}`,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      background: m.bg,
                      color: m.fg,
                      boxShadow: m.shadow,
                      border: "none",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="cc-focus"
              onClick={() => A.set({ group: !st.group })}
              style={{
                height: 32,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid #E5E7EB",
                background: st.group ? "#0F172A" : "#FFFFFF",
                color: st.group ? "#FFFFFF" : "#0F172A",
                font: `600 12px ${F_BODY}`,
                cursor: "pointer",
              }}
            >
              <Layers size={14} />
              Group by company
            </button>
          )}
        </div>
      </div>

      {/* ══ Tab content ════════════════════════════════════════════════ */}
      <div
        className="cc-pad"
        style={{
          maxWidth: 1560,
          margin: "0 auto",
          paddingTop: 20,
          paddingBottom: 96,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {isCo ? (
          <AccountsTable
            view={av}
            page={st.page}
            onPage={(p) => A.set({ page: p })}
            onClearAll={clearAll}
            onDiscover={() => navigate("/app/search")}
            period={period12}
            reduced={reduced}
          />
        ) : (
          <ContactsTable view={cv} onClearAll={clearAll} />
        )}
      </div>

      {/* ══ Bulk bar ═══════════════════════════════════════════════════ */}
      <BulkBar
        tab={st.tab}
        count={st.sel.length}
        companies={selectedCompanies}
        savedIds={selectedSavedIds}
        getSelectedRows={getSelectedRows}
        onClear={() => A.set({ sel: [] })}
        reduced={reduced}
      />

      {/* ══ Intelligence Panel drawer ══════════════════════════════════ */}
      <CCDrawer
        open={!!st.drawer}
        pc={shown?.pc ?? null}
        pp={shown?.pp ?? null}
        period24={period24}
        reduced={reduced}
        onClose={() => A.set({ drawer: null })}
        onAddToCampaign={() => {
          if (drawerCompany) setCampaignCo(drawerCompany);
        }}
      />

      {/* zIndex wrapper: the modal's own z-50 would sit under the 901 drawer */}
      <div style={{ position: "relative", zIndex: 1000 }}>
        <AddToCampaignModal
          open={!!campaignCo}
          onClose={() => setCampaignCo(null)}
          company={campaignCo ?? { company_id: null, name: "" }}
        />
      </div>
    </div>
  );
}
