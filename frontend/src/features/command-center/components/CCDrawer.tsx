/**
 * CCDrawer — the Command Center Intelligence Panel (README §4.6), both
 * modes, driven entirely by computeDrawer's pc (company) / pp (contact)
 * view models. Slide + scrim identical to the Dashboard IntelligencePanel.
 */
import {
  ArrowRight,
  Building2,
  CircleDashed,
  Clock,
  FileText,
  Linkedin,
  Mail,
  Megaphone,
  Minus,
  Phone,
  Route,
  Send,
  TrendingDown,
  TrendingUp,
  UserPlus,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import LogoTile from "@/features/dashboard/components/LogoTile";
import { laneColor } from "./AccountsTable";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";
const EASE = "cubic-bezier(0.16,1,0.3,1)";
const DRAWER_EASE = "cubic-bezier(0.32,0.72,0,1)";

const SIG_ICONS: Record<string, typeof TrendingUp> = {
  "circle-dashed": CircleDashed,
  route: Route,
  clock: Clock,
  "trending-down": TrendingDown,
  "file-text": FileText,
  "trending-up": TrendingUp,
  minus: Minus,
};

const tile = (label: string, value: string, opts?: { mono?: boolean; glow?: boolean }) => (
  <div style={{ padding: 12, border: "1px solid #1e293b", borderRadius: 10, background: "#020617" }}>
    <div
      style={{
        font: `600 10px ${F_DISPLAY}`,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#64748b",
      }}
    >
      {label}
    </div>
    <div
      style={{
        font: `600 ${opts?.mono === false ? `15px ${F_DISPLAY}` : `15px ${F_MONO}`}`,
        marginTop: 6,
        color: opts?.glow ? "#00F0FF" : undefined,
        textShadow: opts?.glow ? "0 0 12px rgba(0,240,255,0.35)" : undefined,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
  </div>
);

const statTile = (label: string, value: string, foot?: { text: string; color: string }, glow?: boolean) => (
  <div style={{ padding: 12, border: "1px solid #1e293b", borderRadius: 10, background: "#020617" }}>
    <div
      style={{
        font: `600 10px ${F_DISPLAY}`,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#64748b",
      }}
    >
      {label}
    </div>
    <div
      style={{
        font: `600 20px ${F_MONO}`,
        marginTop: 6,
        color: glow ? "#00F0FF" : undefined,
        textShadow: glow ? "0 0 12px rgba(0,240,255,0.35)" : undefined,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
    {foot && (
      <div style={{ font: `600 11px ${F_MONO}`, color: foot.color, marginTop: 4 }}>{foot.text}</div>
    )}
  </div>
);

function PersonRow({ p }: { p: any }) {
  return (
    <div
      className="cc-drawerrow"
      role="button"
      tabIndex={0}
      onClick={p.onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 8,
        margin: "0 -8px",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          flex: "none",
          borderRadius: 999,
          background: "#1e293b",
          color: "#cbd5e1",
          display: "grid",
          placeItems: "center",
          font: `600 10px ${F_DISPLAY}`,
        }}
      >
        {p.initials}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", font: `600 13px ${F_BODY}` }}>{p.name}</span>
        <span
          style={{
            display: "block",
            fontSize: 12,
            color: "#94a3b8",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {p.title}
        </span>
      </span>
      <span
        style={{
          font: `600 10px ${F_MONO}`,
          color: "#fff",
          background: p.senColor,
          borderRadius: 4,
          padding: "2px 6px",
          flex: "none",
        }}
      >
        {p.sen}
      </span>
    </div>
  );
}

export interface CCDrawerProps {
  open: boolean;
  /** computeDrawer().pc — company mode when non-null. */
  pc: any | null;
  /** computeDrawer().pp — contact mode when non-null. */
  pp: any | null;
  /** "Oct 2024 – Sep 2026" — the real 24-month window label. */
  period24: string;
  reduced: boolean;
  onClose: () => void;
  /** Opens AddToCampaignModal for the drawer's company (resolved by the parent). */
  onAddToCampaign: () => void;
}

export default function CCDrawer({
  open,
  pc,
  pp,
  period24,
  reduced,
  onClose,
  onAddToCampaign,
}: CCDrawerProps) {
  const navigate = useNavigate();

  const closeBtn = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close panel"
      className="cc-panelx cc-focus"
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "1px solid #334155",
        background: "transparent",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        color: "#cbd5e1",
      }}
    >
      <X size={15} />
    </button>
  );

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(2,6,23,0.35)",
          zIndex: 900,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: reduced ? "none" : `opacity 250ms ${EASE}`,
        }}
      />
      <aside
        role="dialog"
        aria-modal={open || undefined}
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 500,
          maxWidth: "100vw",
          background: "#0F172A",
          color: "#f8fafc",
          zIndex: 901,
          borderLeft: "1px solid #1F2937",
          boxShadow: "-20px 0 40px rgba(2,6,23,0.4)",
          transform: open ? "translateX(0)" : "translateX(calc(100% + 64px))",
          transition: reduced ? "none" : `transform 350ms ${DRAWER_EASE}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: F_BODY,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -120,
            top: -120,
            width: 360,
            height: 360,
            borderRadius: 999,
            background: "radial-gradient(circle,rgba(0,240,255,0.12),transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* ══ Company mode ═════════════════════════════════════════════ */}
        {pc && (
          <>
            <div style={{ position: "relative", padding: "22px 24px 18px", borderBottom: "1px solid #1e293b" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div
                  style={{
                    font: `600 10px ${F_DISPLAY}`,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#00F0FF",
                  }}
                >
                  Intelligence Panel · Last 12M
                </div>
                {closeBtn}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
                <LogoTile name={pc.name} domain={pc.logoDomain} size={48} radius={12} fontSize={14} dark />
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: `700 22px/1.15 ${F_DISPLAY}`, letterSpacing: "-0.02em" }}>{pc.name}</div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginTop: 6,
                      fontSize: 12,
                      color: "#94a3b8",
                    }}
                  >
                    <span
                      style={{
                        font: `600 11px ${F_BODY}`,
                        color: "#fff",
                        background: pc.stageColor,
                        borderRadius: 999,
                        padding: "2px 9px",
                      }}
                    >
                      {pc.stage}
                    </span>
                    {pc.city} · {pc.owner} · saved {pc.saved}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                position: "relative",
                flex: 1,
                overflow: "auto",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 22,
              }}
            >
              {/* signal box */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "#020617",
                  border: "1px solid #1e293b",
                }}
              >
                {(() => {
                  const SigIcon = SIG_ICONS[pc.sigIcon] ?? Minus;
                  return <SigIcon size={16} style={{ color: pc.sigColor, flex: "none", marginTop: 1 }} />;
                })()}
                <div>
                  <div style={{ font: `600 13px ${F_BODY}` }}>{pc.sig}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{pc.lastLabel}</div>
                </div>
              </div>

              {pc.has && (
                <>
                  {/* stat tiles */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {statTile("Shipments", pc.ship, { text: `${pc.yoy} YoY`, color: pc.yoyFg })}
                    {statTile("TEU", pc.teu)}
                    {statTile("Est. spend", pc.spend, undefined, true)}
                  </div>

                  {/* 24-month bars */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8" }}>
                      <span>24-month shipments</span>
                      <span style={{ fontFamily: F_MONO }}>{period24}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, marginTop: 10 }}>
                      {(pc.bars ?? []).map((b: any, i: number) => (
                        <div
                          key={i}
                          title={b.title}
                          style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}
                        >
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              background: b.bg,
                              borderRadius: "2px 2px 0 0",
                              transform: `scaleY(${b.s})`,
                              transformOrigin: "bottom",
                              transition: reduced ? "none" : `transform 500ms ${EASE}`,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* lanes */}
                  <div>
                    <div
                      style={{
                        font: `600 10px ${F_DISPLAY}`,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "#64748b",
                        marginBottom: 8,
                      }}
                    >
                      Lanes · share of shipments
                    </div>
                    {(pc.lanes ?? []).map((l: any) => (
                      <div key={l.label} style={{ padding: "7px 0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                            <span
                              style={{
                                font: `600 10px ${F_MONO}`,
                                background: laneColor(l.oc),
                                borderRadius: 3,
                                padding: "1px 5px",
                              }}
                            >
                              {l.oc}
                            </span>
                            {l.label}
                          </span>
                          <span style={{ font: `600 12px ${F_MONO}`, fontVariantNumeric: "tabular-nums" }}>
                            {l.n} · {l.share}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 4,
                            background: "#1e293b",
                            borderRadius: 999,
                            marginTop: 6,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: l.share,
                              background: laneColor(l.oc),
                              borderRadius: 999,
                              transition: reduced ? "none" : `width 500ms ${EASE}`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* contacts */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      font: `600 10px ${F_DISPLAY}`,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#64748b",
                    }}
                  >
                    Contacts · {pc.contactCount}
                  </span>
                  <button
                    type="button"
                    className="cc-focus"
                    onClick={() => navigate(`/app/companies/${encodeURIComponent(pc.coKey)}?tab=contacts`)}
                    style={{
                      font: `600 12px ${F_BODY}`,
                      color: "#60a5fa",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                  >
                    <UserPlus size={14} />
                    Find contacts
                  </button>
                </div>
                {(pc.people ?? []).map((p: any) => (
                  <PersonRow key={p.id} p={p} />
                ))}
              </div>
            </div>

            {/* footer */}
            <div
              style={{
                position: "relative",
                padding: "16px 24px",
                borderTop: "1px solid #1e293b",
                display: "flex",
                gap: 8,
              }}
            >
              <button
                type="button"
                className="cc-cta cc-focus"
                onClick={() => navigate(`/app/companies/${encodeURIComponent(pc.coKey)}`)}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 10,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  font: `600 13px ${F_BODY}`,
                  cursor: "pointer",
                  boxShadow: "0 0 18px rgba(59,130,246,0.45)",
                }}
              >
                Open Company Profile
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="cc-ghostdark cc-focus"
                onClick={onAddToCampaign}
                style={{
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #334155",
                  background: "transparent",
                  color: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 14px",
                  font: `600 13px ${F_BODY}`,
                  cursor: "pointer",
                }}
              >
                <Send size={15} />
                Add to Campaign
              </button>
            </div>
          </>
        )}

        {/* ══ Contact mode ═════════════════════════════════════════════ */}
        {pp && (
          <>
            <div style={{ position: "relative", padding: "22px 24px 18px", borderBottom: "1px solid #1e293b" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div
                  style={{
                    font: `600 10px ${F_DISPLAY}`,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#00F0FF",
                  }}
                >
                  Contact
                </div>
                {closeBtn}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
                <span
                  style={{
                    width: 52,
                    height: 52,
                    flex: "none",
                    borderRadius: 999,
                    background: pp.senColor,
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    font: `700 16px ${F_DISPLAY}`,
                  }}
                >
                  {pp.initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: `700 22px/1.15 ${F_DISPLAY}`, letterSpacing: "-0.02em" }}>{pp.name}</div>
                  <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 4 }}>{pp.title}</div>
                  {pp.onCo && (
                    <button
                      type="button"
                      className="cc-focus"
                      onClick={pp.onCo}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 6,
                        font: `600 12px ${F_BODY}`,
                        color: "#60a5fa",
                        cursor: "pointer",
                        background: "transparent",
                        border: "none",
                        padding: 0,
                      }}
                    >
                      <Building2 size={14} />
                      {pp.co}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                position: "relative",
                flex: 1,
                overflow: "auto",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              {/* channels */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: "1px solid #1e293b",
                  borderRadius: 10,
                  background: "#020617",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderBottom: "1px solid #1e293b",
                  }}
                >
                  <Mail size={15} style={{ color: "#94a3b8", flex: "none" }} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      font: `500 12px ${F_MONO}`,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {pp.email}
                  </span>
                  <span style={{ font: `600 11px ${F_BODY}`, color: pp.emailFg }}>{pp.emailStatus}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderBottom: "1px solid #1e293b",
                  }}
                >
                  <Phone size={15} style={{ color: "#94a3b8", flex: "none" }} />
                  <span style={{ flex: 1, fontSize: 13, color: pp.phoneFg }}>{pp.phone}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                  <Linkedin size={15} style={{ color: "#94a3b8", flex: "none" }} />
                  <span style={{ flex: 1, fontSize: 13, color: pp.liFg }}>{pp.li}</span>
                </div>
              </div>

              {/* tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {tile("Seniority", pp.sen, { mono: false })}
                {tile("Last touch", pp.touch)}
                {tile("Added", pp.added)}
              </div>

              {/* Outbound Engine */}
              <div>
                <div
                  style={{
                    font: `600 10px ${F_DISPLAY}`,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#64748b",
                    marginBottom: 8,
                  }}
                >
                  Outbound Engine
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "#020617",
                    border: "1px solid #1e293b",
                  }}
                >
                  <Megaphone size={16} style={{ color: pp.campFg, flex: "none", marginTop: 1 }} />
                  <div>
                    <div style={{ font: `600 13px ${F_BODY}` }}>{pp.campTitle}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{pp.campBody}</div>
                  </div>
                </div>
              </div>

              {/* peers */}
              {(pp.peers ?? []).length > 0 && (
                <div>
                  <div
                    style={{
                      font: `600 10px ${F_DISPLAY}`,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#64748b",
                      marginBottom: 6,
                    }}
                  >
                    Also at {pp.co}
                  </div>
                  {(pp.peers ?? []).map((p: any) => (
                    <PersonRow key={p.id} p={p} />
                  ))}
                </div>
              )}
            </div>

            {/* footer */}
            <div
              style={{
                position: "relative",
                padding: "16px 24px",
                borderTop: "1px solid #1e293b",
                display: "flex",
                gap: 8,
              }}
            >
              <button
                type="button"
                className="cc-cta cc-focus"
                onClick={onAddToCampaign}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 10,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  font: `600 13px ${F_BODY}`,
                  cursor: "pointer",
                  boxShadow: "0 0 18px rgba(59,130,246,0.45)",
                }}
              >
                <Send size={15} />
                Add to Campaign
              </button>
              {pp.coKey && (
                <button
                  type="button"
                  className="cc-ghostdark cc-focus"
                  onClick={() => navigate(`/app/companies/${encodeURIComponent(pp.coKey)}`)}
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: "1px solid #334155",
                    background: "transparent",
                    color: "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 14px",
                    font: `600 13px ${F_BODY}`,
                    cursor: "pointer",
                  }}
                >
                  Company Profile
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
