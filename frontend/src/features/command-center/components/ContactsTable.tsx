/**
 * ContactsTable — Command Center §4.4: coverage-gaps card (amber inset
 * top line) + the contacts table, with the optional group-by-company
 * heads. Every value comes from computeContactsView's VMs.
 */
import { type CSSProperties } from "react";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  CircleDashed,
  CircleHelp,
  Crown,
  Linkedin,
  Mail,
  Phone,
  TriangleAlert,
  UserPlus,
  UserSearch,
} from "lucide-react";
import LogoTile from "@/features/dashboard/components/LogoTile";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";
const CARD: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
};

const GRID =
  "28px minmax(200px,1.2fr) minmax(210px,1.3fr) minmax(190px,1.1fr) minmax(230px,1.3fr) 84px 170px 84px 40px";
const ROW_PAD = "12px 20px";

const EMAIL_ICONS: Record<string, typeof BadgeCheck> = {
  verified: BadgeCheck,
  unverified: CircleHelp,
  none: CircleDashed,
};

function Checkbox({
  bd,
  bg,
  onClick,
  label,
}: {
  bd: string;
  bg: string;
  onClick: () => void;
  label: string;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={bg !== "#FFFFFF"}
      aria-label={label}
      tabIndex={0}
      className="cc-focus"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      style={{
        width: 16,
        height: 16,
        borderRadius: 5,
        border: `1.5px solid ${bd}`,
        background: bg,
        display: "grid",
        placeItems: "center",
        color: "#fff",
        cursor: "pointer",
        boxSizing: "border-box",
      }}
    >
      <Check size={10} strokeWidth={3.5} />
    </span>
  );
}

export interface ContactsTableProps {
  /** computeContactsView() result — rendered verbatim. */
  view: any;
  onClearAll: () => void;
}

export default function ContactsTable({ view, onClearAll }: ContactsTableProps) {
  return (
    <>
      {/* ── Coverage gaps card ────────────────────────────────────────── */}
      {view.showGaps && (
        <section
          style={{
            ...CARD,
            boxShadow: "0 8px 30px rgba(15,23,42,0.06),inset 0 3px 0 #f59e0b",
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                font: `600 11px ${F_DISPLAY}`,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#b45309",
              }}
            >
              <UserSearch size={14} />
              Coverage gaps · no decision maker on file
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Ranked by est. spend 12M</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {view.gaps.map((g: any) => (
              <button
                key={g.name}
                type="button"
                className="cc-gapchip cc-focus"
                onClick={g.onClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  border: "1px solid #E5E7EB",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: "transparent",
                }}
              >
                <LogoTile name={g.name} domain={g.logoDomain} size={26} radius={8} fontSize={10} />
                <span style={{ font: `600 13px ${F_BODY}`, color: "#0F172A" }}>{g.name}</span>
                <span style={{ font: `600 11px ${F_MONO}`, color: "#475569" }}>{g.spend}</span>
                <span style={{ font: `500 11px ${F_BODY}`, color: "#94a3b8" }}>{g.n}</span>
                <UserPlus size={14} style={{ color: "#3b82f6" }} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Table card ────────────────────────────────────────────────── */}
      <section style={{ ...CARD, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1280 }}>
            {/* header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 12,
                padding: "10px 20px",
                background: "#F8FAFC",
                borderBottom: "1px solid #EEF2F6",
                font: `600 10px ${F_DISPLAY}`,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#94a3b8",
                alignItems: "center",
              }}
            >
              <Checkbox bd={view.allBd} bg={view.allBg} onClick={view.selAll} label="Select all contacts" />
              <span>Contact</span>
              <span>Title</span>
              <span>Company</span>
              <span>Email</span>
              <span>Channels</span>
              <span>Outbound Engine</span>
              <span>Last touch</span>
              <span />
            </div>

            {view.groups.map((g: any, gi: number) => (
              <div key={gi}>
                {/* group head */}
                {g.showHead && g.head && (
                  <div
                    className="cc-grouphead"
                    role="button"
                    tabIndex={0}
                    onClick={g.head.onClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") g.head.onClick?.();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 20px 10px",
                      borderTop: "1px solid #E5E7EB",
                      background: "#FBFCFD",
                      cursor: "pointer",
                    }}
                  >
                    <LogoTile name={g.head.name} domain={g.head.logoDomain} size={28} radius={8} fontSize={10} />
                    <span style={{ font: `600 14px ${F_DISPLAY}` }}>{g.head.name}</span>
                    {g.head.stage && (
                      <span
                        style={{
                          font: `600 11px ${F_BODY}`,
                          color: g.head.stageFg,
                          background: g.head.stageBg,
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        {g.head.stage}
                      </span>
                    )}
                    <span style={{ font: `500 12px ${F_MONO}`, color: "#64748b" }}>{g.head.meta}</span>
                    <span style={{ flex: 1 }} />
                    {g.head.dm && (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          font: `600 12px ${F_BODY}`,
                          color: g.head.dmFg,
                        }}
                      >
                        {g.head.dmWarn ? <TriangleAlert size={14} /> : <Crown size={14} />}
                        {g.head.dm}
                      </span>
                    )}
                  </div>
                )}

                {/* contact rows */}
                {g.rows.map((p: any) => {
                  const EmailIcon = EMAIL_ICONS[p.emailState] ?? CircleDashed;
                  return (
                    <div
                      key={p.key}
                      className="cc-row"
                      role="button"
                      tabIndex={0}
                      onClick={p.onClick}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") p.onClick();
                      }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: GRID,
                        gap: 12,
                        padding: ROW_PAD,
                        borderTop: "1px solid #F1F5F9",
                        alignItems: "center",
                        fontSize: 13,
                        cursor: "pointer",
                        background: p.rowBg,
                      }}
                    >
                      <Checkbox bd={p.chkBd} bg={p.chkBg} onClick={p.onCheck} label={`Select ${p.name}`} />

                      {/* Contact */}
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span
                          style={{
                            width: 32,
                            height: 32,
                            flex: "none",
                            borderRadius: 999,
                            background: p.avBg,
                            color: p.avFg,
                            display: "grid",
                            placeItems: "center",
                            font: `700 11px ${F_DISPLAY}`,
                          }}
                        >
                          {p.initials}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span
                            style={{
                              display: "block",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.name}
                          </span>
                          <span style={{ display: "block", fontSize: 11, color: "#94a3b8" }}>{p.dept}</span>
                        </span>
                      </span>

                      {/* Title */}
                      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            flex: "none",
                            font: `600 10px ${F_MONO}`,
                            color: "#fff",
                            background: p.senColor,
                            borderRadius: 4,
                            padding: "2px 6px",
                          }}
                        >
                          {p.sen}
                        </span>
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: "#334155",
                          }}
                        >
                          {p.title}
                        </span>
                      </span>

                      {/* Company (click → company drawer) */}
                      <span
                        className="cc-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          p.onCo?.();
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, color: "#0F172A" }}
                      >
                        <LogoTile name={p.co} domain={p.coLogoDomain} size={20} radius={6} fontSize={8} />
                        <span
                          style={{
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.co}
                        </span>
                      </span>

                      {/* Email */}
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <EmailIcon size={14} style={{ flex: "none", color: p.emailFg }} />
                        <span
                          style={{
                            font: `500 12px ${F_MONO}`,
                            color: p.emailTx,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.email}
                        </span>
                      </span>

                      {/* Channels */}
                      <span style={{ display: "flex", gap: 6 }}>
                        <Mail size={15} style={{ color: p.chE }} />
                        <Phone size={15} style={{ color: p.chP }} />
                        <Linkedin size={15} style={{ color: p.chL }} />
                      </span>

                      {/* Outbound Engine */}
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span>
                          <span
                            style={{
                              font: `600 11px ${F_BODY}`,
                              color: p.campFg,
                              background: p.campBg,
                              borderRadius: 999,
                              padding: "2px 8px",
                            }}
                          >
                            {p.campStatus}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.campName}
                        </span>
                      </span>

                      {/* Last touch */}
                      <span style={{ font: `500 12px ${F_MONO}`, color: "#64748b" }}>{p.touch}</span>

                      <span style={{ display: "grid", placeItems: "center", color: "#94a3b8" }}>
                        <ChevronRight size={15} />
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* empty state */}
            {view.noContacts && (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#64748b", fontSize: 14 }}>
                No contacts match these filters.{" "}
                <span onClick={onClearAll} style={{ color: "#3b82f6", fontWeight: 600, cursor: "pointer" }}>
                  Clear filters
                </span>
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 20px",
            borderTop: "1px solid #EEF2F6",
            fontSize: 12,
            color: "#64748b",
          }}
        >
          <span>{view.footer}</span>
          <span style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <BadgeCheck size={14} style={{ color: "#10b981" }} />
              Verified
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <CircleHelp size={14} style={{ color: "#f59e0b" }} />
              Unverified
            </span>
          </span>
        </div>
      </section>
    </>
  );
}
