/**
 * OutboundEngineV2 — the Outbound Engine rebuild (design handoff
 * `design_handoff_crm_outbound/` README §Outbound + Command Center.dc.html
 * `crm()` outbound/inbox/templates/mailboxes branches).
 *
 * Real data only:
 *   - campaign list + funnel      → useCampaigns (lit_campaigns + metrics RPC)
 *   - steps                       → lit_campaign_steps via ./api
 *   - detail aggregates           → lit_campaign_contacts + lit_outreach_history
 *   - inbox                       → lit_email_threads / lit_email_messages
 *   - mailboxes                   → lit_email_accounts + real 7/30d counts
 * Anything without backing data renders "—" or a disabled "Coming soon".
 *
 * Renders inside the existing AppLayout. Tab/URL sync is delegated to the
 * orchestrator through `onNavigate`.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Crosshair,
  Eye,
  FileCheck,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Kanban,
  Library,
  Linkedin,
  Loader2,
  Mail,
  MailCheck,
  MailOpen,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  PackagePlus,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Reply as ReplyIcon,
  Rocket,
  RotateCcw,
  Route,
  Search,
  Send,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import { useCampaigns } from "@/features/outbound/hooks/useCampaigns";
import {
  archiveCampaign,
  deleteCampaign,
  pauseCampaign,
  resumeCampaign,
} from "@/features/outbound/api/campaignActions";
import {
  oauthGmailStart,
  oauthOutlookStart,
  queueCampaignRecipients,
} from "@/api/outreach";
import { supabase } from "@/lib/supabase";
import { attachCompaniesToCampaign } from "@/lib/api";
import { getWorkspaceSavedCompanies } from "@/api/workspace";
import { listPulseLists, getListCompanies } from "@/features/pulse/pulseListsApi";
import LogoTile from "@/features/dashboard/components/LogoTile";
import type { OutboundCampaign } from "@/features/outbound/types";
import {
  archiveThread,
  createCampaignStep,
  createDraftCampaign,
  deleteCampaignStep,
  disconnectEmailAccount,
  fetchCampaignAggregates,
  fetchCampaignHeader,
  countCampaignCompanies,
  fetchDealsSourcedTotal,
  fetchMailboxStats,
  getSampleEnrolledContact,
  listCampaignSteps,
  listDealsForCampaign,
  listEmailAccounts,
  listInboxThreads,
  listThreadMessages,
  listWorkspaceTemplates,
  markThreadRead,
  sendInboxReply,
  setThreadIntent,
  syncInbox,
  updateCampaignStep,
  type CampaignAggregates,
  type CampaignHeaderRow,
  type DealLite,
  type DealsSourced,
  type EmailMessageRow,
  type EmailThreadRow,
  type MailAccountRow,
  type MailboxStats,
  type OutboundStepRow,
  type SampleContact,
  type StepVariant,
  type WorkspaceTemplateRow,
} from "./api";
import {
  CHANNEL_META,
  INTENT_META,
  INTENT_ORDER,
  PLAYS,
  PLAY_CATS,
  STATUS_META,
  TOKENS,
  campaignsKpis,
  classifyIntent,
  detailFunnel,
  fmtMoney,
  fmtNum,
  intentCounts,
  listFunnelCells,
  mailboxAttention,
  mailboxVMs,
  normalizeIntent,
  playStepOutline,
  relTime,
  renderTokens,
  stepVMs,
  templatePerformance,
  threadVMs,
  uiChannelOf,
  variantsOf,
  type IntentId,
  type MailboxVM,
  type ThreadVM,
  type TokenVars,
  type UiChannel,
} from "./data/computeOutbound";

// ─────────────────────────────────────────────────────────── tokens/styles

const FD = "'Space Grotesk',sans-serif";
const FB = "'DM Sans',system-ui,sans-serif";
const FM = "'JetBrains Mono',monospace";
const EASE = "cubic-bezier(0.16,1,0.3,1)";
const DRAWER_EASE = "cubic-bezier(0.32,0.72,0,1)";

const CARD: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
};

const OB2_CSS = `
.ob2-pad{padding-left:32px;padding-right:32px}
.ob2-h1{margin:0;font:700 52px/1.04 ${FD};letter-spacing:-0.04em;color:#0F172A;text-wrap:balance}
.ob2-grad{background:linear-gradient(90deg,#2563eb,#00c8d4);-webkit-background-clip:text;background-clip:text;color:transparent}
.ob2-narrative{margin:14px 0 0;max-width:920px;font:400 18px/1.55 ${FB};color:#475569;text-wrap:pretty}
@media (max-width:768px){.ob2-h1{font-size:32px}.ob2-narrative{font-size:15px}}
@media (max-width:640px){.ob2-pad{padding-left:16px;padding-right:16px}.ob2-topbtns{width:100%}.ob2-topbtns>button{flex:1;justify-content:center}}
.ob2-scrollx{overflow-x:auto;-webkit-overflow-scrolling:touch}
.ob2-camprow{display:grid;grid-template-columns:minmax(280px,1.2fr) minmax(400px,2fr) 140px 60px;gap:28px;align-items:center}
@media (max-width:900px){.ob2-camprow{display:flex;flex-direction:column;align-items:stretch;gap:12px}.ob2-camprow .ob2-rowchev{display:none}}
.ob2-menuitem{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;padding:8px 12px;font:600 12.5px ${FD};color:#334155;cursor:pointer;text-align:left;white-space:nowrap}
.ob2-menuitem:hover{background:#F8FAFC}
.ob2-grid2{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
@media (max-width:1024px){.ob2-grid2{grid-template-columns:minmax(0,1fr)}}
.ob2-inboxgrid{display:grid;grid-template-columns:minmax(300px,400px) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:900px){.ob2-inboxgrid{grid-template-columns:minmax(0,1fr)}}
.ob2-tplgrid{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;align-items:start}
@media (max-width:1024px){.ob2-tplgrid{grid-template-columns:minmax(0,1fr)}}
.ob2-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.ob2-mbgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
@media (max-width:400px){.ob2-mbgrid{grid-template-columns:minmax(0,1fr)}}
.ob2-drawer{width:600px;max-width:100vw}
.ob2-ghost{transition:transform 160ms ${EASE},border-color 200ms,background 200ms}
.ob2-ghost:hover{border-color:rgba(0,200,212,0.5)!important;background:#F8FAFC!important}
.ob2-ghost:active{transform:scale(0.97)}
.ob2-cta{transition:transform 160ms ${EASE},background 200ms}
.ob2-cta:hover{background:#2563eb!important}
.ob2-cta:active{transform:scale(0.97)}
.ob2-cta:disabled{opacity:0.55;cursor:not-allowed}
.ob2-kpi{transition:border-color 200ms ${EASE},box-shadow 200ms}
.ob2-kpi:hover{border-color:rgba(0,200,212,0.5)}
.ob2-row{transition:background 150ms;cursor:pointer}
.ob2-row:hover{background:#F8FAFC}
.ob2-step{transition:border-color 150ms,background 150ms,box-shadow 150ms;cursor:pointer}
.ob2-step:hover{border-color:rgba(0,200,212,0.55)!important;box-shadow:0 10px 24px rgba(15,23,42,0.08)}
.ob2-press:active{transform:scale(0.97)}
.ob2-bar{transition:width 500ms ${EASE}}
.ob2-focus:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(59,130,246,0.35)}
.ob2-spin{animation:ob2spin 1s linear infinite}
@keyframes ob2spin{to{transform:rotate(360deg)}}
@keyframes ob2fade{from{opacity:0}to{opacity:1}}
@keyframes ob2slide{from{transform:translateX(40px);opacity:0.6}to{transform:translateX(0);opacity:1}}
@media (prefers-reduced-motion:reduce){.ob2-ghost,.ob2-cta,.ob2-kpi,.ob2-row,.ob2-step,.ob2-press,.ob2-bar,.ob2-anim{transition:none!important}.ob2-ghost:active,.ob2-cta:active,.ob2-press:active{transform:none!important}.ob2-spin{animation-duration:1.5s}.ob2-drawer{animation:none!important}}
`;

// ─────────────────────────────────────────────────────────── tiny shared UI

function GhostBtn({
  onClick,
  children,
  disabled,
  title,
  style,
}: {
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className="ob2-ghost ob2-focus"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 36,
        padding: "0 14px",
        borderRadius: 10,
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        font: `600 13px ${FD}`,
        color: "#334155",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({
  onClick,
  children,
  disabled,
  style,
}: {
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className="ob2-cta ob2-focus"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 36,
        padding: "0 16px",
        borderRadius: 10,
        border: "none",
        background: "#3b82f6",
        boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
        font: `600 13px ${FD}`,
        color: "#FFFFFF",
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        font: `600 11px ${FD}`,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#0e7490",
      }}
    >
      {icon}
      {children}
    </div>
  );
}

interface KpiDef {
  label: string;
  icon: ReactNode;
  value: string;
  sub: string;
  subColor?: string;
}

function KpiRow({ kpis }: { kpis: KpiDef[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
        gap: 12,
        marginTop: 28,
      }}
    >
      {kpis.map((k) => (
        <div
          key={k.label}
          className="ob2-kpi"
          style={{ ...CARD, padding: "16px 18px 14px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              font: `600 10px ${FD}`,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#64748b",
            }}
          >
            <span style={{ color: "#0891b2", display: "inline-flex" }}>{k.icon}</span>
            {k.label}
          </div>
          <div
            style={{
              marginTop: 10,
              font: `600 30px/1 ${FM}`,
              letterSpacing: "-0.04em",
              color: "#0F172A",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {k.value}
          </div>
          <div style={{ marginTop: 6, font: `500 11px ${FM}`, color: "#64748b" }}>
            {k.subColor ? (
              <span style={{ color: k.subColor, fontWeight: 600 }}>{k.sub}</span>
            ) : (
              k.sub
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span
      style={{
        font: `600 11px ${FD}`,
        color: m.fg,
        background: m.bg,
        borderRadius: 999,
        padding: "3px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function AudChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        font: `500 11px ${FM}`,
        color: "#0e7490",
        background: "rgba(0,240,255,0.08)",
        border: "1px solid rgba(0,200,212,0.25)",
        borderRadius: 6,
        padding: "3px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function ComingSoon() {
  return (
    <span
      style={{
        font: `600 10px ${FD}`,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#64748b",
        background: "#F1F5F9",
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      Coming soon
    </span>
  );
}

function ChannelIcons({ channels }: { channels: UiChannel[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, color: "#64748b" }}>
      {channels.includes("email") && <Mail size={13} />}
      {channels.includes("linkedin") && <Linkedin size={13} />}
      {channels.includes("call") && <Phone size={13} />}
    </span>
  );
}

const searchBox = (
  value: string,
  onChange: (v: string) => void,
  placeholder: string,
) => (
  <div style={{ position: "relative", flex: "0 1 280px", minWidth: 160 }}>
    <Search
      size={14}
      style={{
        position: "absolute",
        left: 10,
        top: "50%",
        transform: "translateY(-50%)",
        color: "#94a3b8",
      }}
    />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="ob2-focus"
      style={{
        width: "100%",
        height: 36,
        borderRadius: 10,
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        padding: "0 12px 0 30px",
        font: `400 13px ${FB}`,
        color: "#0F172A",
        boxSizing: "border-box",
      }}
    />
  </div>
);

function Seg({
  items,
  cur,
  onSelect,
}: {
  items: Array<{ id: string; label: string }>;
  cur: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        background: "#EEF2F6",
        borderRadius: 10,
        padding: 3,
      }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="ob2-press ob2-focus"
          onClick={() => onSelect(it.id)}
          style={{
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            font: `600 12px ${FD}`,
            cursor: "pointer",
            background: cur === it.id ? "#FFFFFF" : "transparent",
            color: cur === it.id ? "#0F172A" : "#64748b",
            boxShadow: cur === it.id ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
            whiteSpace: "nowrap",
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── page shell bits

export type OutboundTab = "campaigns" | "inbox" | "templates" | "mailboxes";

const TAB_DEF: Array<{ id: OutboundTab; label: string; icon: ReactNode }> = [
  { id: "campaigns", label: "Campaigns", icon: <Megaphone size={15} /> },
  { id: "inbox", label: "Inbox", icon: <InboxIcon size={15} /> },
  { id: "templates", label: "Templates", icon: <Library size={15} /> },
  { id: "mailboxes", label: "Mailboxes", icon: <MailCheck size={15} /> },
];

function Hero({
  h1,
  gradWord,
  narrative,
  kpis,
  tab,
  counts,
  onTab,
}: {
  h1: string;
  gradWord: string;
  narrative: ReactNode;
  kpis: KpiDef[];
  tab: OutboundTab;
  counts: Record<OutboundTab, number>;
  onTab: (t: OutboundTab) => void;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg,#FFFFFF 0%,#F2FAFC 100%)",
        boxShadow: "inset 0 -1px 0 #E5E7EB",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -160,
          top: -220,
          width: 720,
          height: 720,
          background:
            "radial-gradient(circle, rgba(0,240,255,0.16) 0%, rgba(0,240,255,0) 60%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="ob2-pad"
        style={{
          maxWidth: 1560,
          margin: "0 auto",
          paddingTop: 26,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <span
            style={{
              font: `600 10px ${FM}`,
              letterSpacing: "0.12em",
              color: "#0e7490",
              background: "rgba(0,240,255,0.10)",
              border: "1px solid rgba(0,200,212,0.35)",
              borderRadius: 4,
              padding: "3px 7px",
            }}
          >
            OUTBOUND ENGINE
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              font: `500 12px ${FB}`,
              color: "#64748b",
            }}
          >
            <ShieldCheck size={14} color="#10b981" />
            Live from your campaign + shipment data
          </span>
        </div>
        <h1 className="ob2-h1" style={{ marginTop: 18 }}>
          {h1} <span className="ob2-grad">{gradWord}</span>
        </h1>
        <p className="ob2-narrative">{narrative}</p>
        <KpiRow kpis={kpis} />
        <div
          className="ob2-scrollx"
          style={{ display: "flex", gap: 26, marginTop: 24 }}
        >
          {TAB_DEF.map((t) => {
            const active = t.id === tab;
            const count = counts[t.id];
            return (
              <button
                key={t.id}
                type="button"
                className="ob2-press ob2-focus"
                onClick={() => onTab(t.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "none",
                  background: "transparent",
                  padding: "12px 2px 14px",
                  font: `600 14px ${FD}`,
                  color: active ? "#0F172A" : "#64748b",
                  boxShadow: active ? "inset 0 -2px 0 #00c8d4" : "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t.icon}
                {t.label}
                {count > 0 && (
                  <span
                    style={{
                      font: `600 11px ${FM}`,
                      borderRadius: 999,
                      padding: "2px 8px",
                      color: active ? "#0e7490" : "#64748b",
                      background: active ? "rgba(0,240,255,0.12)" : "#F1F5F9",
                    }}
                  >
                    {fmtNum(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return (
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
        className="ob2-pad"
        style={{
          maxWidth: 1560,
          margin: "0 auto",
          padding: "10px 32px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── campaigns list

export type CampaignRowAction = "pause" | "resume" | "archive" | "delete";

/** Per-row ⋯ overflow menu — Pause/Resume/Archive/Delete via campaignActions. */
function RowMenu({
  campaign,
  onAction,
}: {
  campaign: OutboundCampaign;
  onAction: (c: OutboundCampaign, a: CampaignRowAction) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  const status = String(campaign.status).toLowerCase();
  const item = (
    label: string,
    icon: ReactNode,
    action: CampaignRowAction,
    color?: string,
  ) => (
    <button
      key={action}
      type="button"
      className="ob2-menuitem ob2-focus"
      style={color ? { color } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(false);
        onAction(campaign, action);
      }}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <span style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`Actions for ${campaign.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="ob2-press ob2-focus"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          border: "1px solid #E5E7EB",
          background: "#FFFFFF",
          color: "#64748b",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: 36,
            zIndex: 40,
            minWidth: 170,
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(15,23,42,0.16)",
            padding: 4,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {status === "active"
            ? item("Pause", <Pause size={13} />, "pause")
            : item(status === "paused" ? "Resume" : "Launch", <Play size={13} />, "resume")}
          {item("Archive", <Archive size={13} />, "archive")}
          {item("Delete", <Trash2 size={13} />, "delete", "#e11d48")}
        </div>
      )}
    </span>
  );
}

function FunnelCells({ campaign }: { campaign: OutboundCampaign }) {
  const cells = listFunnelCells(campaign);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5,minmax(64px,1fr))",
        gap: 10,
        minWidth: 360,
      }}
    >
      {cells.map((c) => (
        <div key={c.label}>
          <div
            style={{
              font: `600 15px ${FM}`,
              color: "#0F172A",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {c.value}
            {c.pct && (
              <span style={{ font: `500 10px ${FM}`, color: "#94a3b8", marginLeft: 5 }}>
                {c.pct}
              </span>
            )}
          </div>
          <div style={{ font: `600 9.5px ${FD}`, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", margin: "3px 0 5px" }}>
            {c.label}
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "#F1F5F9", overflow: "hidden" }}>
            <div
              className="ob2-bar"
              style={{ height: "100%", width: `${c.width}%`, background: c.color, borderRadius: 2 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CampaignsListView({
  campaigns,
  loading,
  error,
  q,
  ostatus,
  attention,
  dealsSourced,
  onOpen,
  onRowAction,
  onReviewMailboxes,
}: {
  campaigns: OutboundCampaign[];
  loading: boolean;
  error: string | null;
  q: string;
  ostatus: string;
  attention: { show: boolean; title: string; detail: string };
  dealsSourced: DealsSourced | null;
  onOpen: (id: string) => void;
  onRowAction: (c: OutboundCampaign, a: CampaignRowAction) => void;
  onReviewMailboxes: () => void;
}) {
  const ql = q.trim().toLowerCase();
  const list = campaigns.filter(
    (c) =>
      c.status !== "archived" &&
      (ostatus === "all" || c.status === ostatus) &&
      (!ql || c.name.toLowerCase().includes(ql)),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {attention.show && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.35)",
            borderRadius: 12,
            padding: "10px 14px",
          }}
        >
          <CircleAlert size={15} color="#b45309" />
          <span style={{ font: `600 13px ${FD}`, color: "#b45309" }}>{attention.title}</span>
          <span style={{ font: `500 12px ${FM}`, color: "#92650b" }}>{attention.detail}</span>
          <button
            type="button"
            className="ob2-press ob2-focus"
            onClick={onReviewMailboxes}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              font: `600 12px ${FD}`,
              color: "#b45309",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Review mailboxes <ArrowRight size={13} />
          </button>
        </div>
      )}
      <div style={{ ...CARD, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "28px 20px", font: `500 13px ${FB}`, color: "#94a3b8", display: "flex", gap: 8, alignItems: "center" }}>
            <Loader2 size={15} className="ob2-spin" />
            Loading campaigns…
          </div>
        ) : error ? (
          <div style={{ padding: "28px 20px", font: `500 13px ${FB}`, color: "#be123c" }}>{error}</div>
        ) : list.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", font: `500 13px ${FB}`, color: "#94a3b8" }}>
            No campaigns match. Start one from the Templates tab.
          </div>
        ) : (
          list.map((c, i) => {
            const sourced = dealsSourced?.perCampaign.get(c.id) ?? null;
            const audience = Array.isArray((c.metrics as any)?.audience)
              ? ((c.metrics as any).audience as string[])
              : [];
            const uiCh = [...new Set(c.channels.map((x) => uiChannelOf(x)))] as UiChannel[];
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                className="ob2-row ob2-camprow ob2-focus"
                onClick={() => onOpen(c.id)}
                onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)}
                style={{
                  padding: "16px 20px",
                  borderTop: i > 0 ? "1px solid #F1F5F9" : "none",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ font: `600 15px ${FD}`, color: "#0F172A" }}>{c.name}</span>
                    <StatusPill status={c.status} />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginTop: 6,
                      font: `500 12px ${FB}`,
                      color: "#64748b",
                      flexWrap: "wrap",
                    }}
                  >
                    <ChannelIcons channels={uiCh} />
                    {(c.metrics as any)?.play ? <span>{String((c.metrics as any).play)} play</span> : null}
                    <span>{c.creator?.full_name || c.creator?.email || "—"}</span>
                    <span style={{ font: `500 11px ${FM}`, color: "#94a3b8" }}>
                      created {relTime(c.createdAt)} ago
                    </span>
                  </div>
                  {audience.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {audience.slice(0, 3).map((a) => (
                        <AudChip key={a}>{a}</AudChip>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ob2-scrollx">
                  <FunnelCells campaign={c} />
                </div>
                <div>
                  <div style={{ font: `600 16px ${FM}`, color: sourced ? "#059669" : "#94a3b8" }}>
                    {sourced ? fmtMoney(sourced.value) : "—"}
                  </div>
                  <div style={{ font: `500 11px ${FM}`, color: "#94a3b8", marginTop: 2 }}>
                    {sourced ? `${sourced.count} deal${sourced.count === 1 ? "" : "s"} sourced` : "no deals linked"}
                  </div>
                </div>
                <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  <RowMenu campaign={c} onAction={onRowAction} />
                  <ChevronRight className="ob2-rowchev" size={16} color="#94a3b8" />
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── campaign detail

interface DetailBundle {
  header: CampaignHeaderRow;
  steps: OutboundStepRow[];
  agg: CampaignAggregates;
  deals: DealLite[];
  sample: SampleContact | null;
  companyCount: number;
  mailboxes: MailAccountRow[];
}

function SettingBox({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ padding: 14, border: "1px solid #E5E7EB", borderRadius: 12, background: "#F8FAFC" }}>
      <div style={{ font: `600 10px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#94a3b8" }}>
        {label}
      </div>
      <div style={{ font: `600 14px ${FB}`, color: "#0F172A", marginTop: 8 }}>{value}</div>
      {sub != null && (
        <div style={{ font: `500 11px ${FM}`, color: "#64748b", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function CampaignDetailView({
  bundle,
  loading,
  onStatusAction,
  onEnroll,
  enrolling,
  onOpenStep,
  onAddStep,
  addingStep,
  onAddAudience,
  onArchive,
  onDelete,
}: {
  bundle: DetailBundle | null;
  loading: boolean;
  onStatusAction: () => void;
  onEnroll: () => void;
  enrolling: boolean;
  onOpenStep: (stepId: string) => void;
  onAddStep: (channel: UiChannel) => void;
  addingStep: boolean;
  onAddAudience: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  if (loading || !bundle) {
    return (
      <div style={{ ...CARD, padding: 28, font: `500 13px ${FB}`, color: "#94a3b8" }}>
        Loading campaign…
      </div>
    );
  }
  const { header, steps, agg, deals, companyCount, mailboxes } = bundle;
  const vms = stepVMs(steps, agg.perStep);
  const funnel = detailFunnel(agg);
  const status = String(header.status).toLowerCase();
  const actionLabel = status === "active" ? "Pause" : status === "paused" ? "Resume" : "Launch";
  const ActionIcon = status === "active" ? Pause : Play;
  const audience = Array.isArray((header.metrics as any)?.audience)
    ? ((header.metrics as any).audience as string[])
    : [];
  const firstStep = steps[0];
  const primaryMb = mailboxes.find((m) => m.is_primary) ?? mailboxes[0] ?? null;
  const exitKeys =
    header.exit_overrides && typeof header.exit_overrides === "object"
      ? Object.entries(header.exit_overrides)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k.replace(/_/g, " "))
      : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header card */}
      <div style={{ ...CARD, padding: "20px 22px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, font: `700 28px ${FD}`, letterSpacing: "-0.03em", color: "#0F172A" }}>
            {header.name}
          </h2>
          <StatusPill status={status} />
          <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
            <GhostBtn onClick={onArchive} title="Archive campaign">
              <Archive size={14} />
              Archive
            </GhostBtn>
            <GhostBtn
              onClick={onDelete}
              title="Delete campaign"
              style={{ color: "#e11d48", borderColor: "rgba(225,29,72,0.35)" }}
            >
              <Trash2 size={14} />
              Delete
            </GhostBtn>
            <GhostBtn onClick={onStatusAction}>
              <ActionIcon size={14} />
              {actionLabel}
            </GhostBtn>
            <GhostBtn onClick={onAddAudience}>
              <Plus size={14} />
              Add audience
            </GhostBtn>
            <PrimaryBtn onClick={onEnroll} disabled={enrolling}>
              {enrolling ? <Loader2 size={14} className="ob2-spin" /> : <Users size={14} />}
              Enroll matches
            </PrimaryBtn>
          </div>
        </div>
        <div style={{ marginTop: 6, font: `500 13px ${FB}`, color: "#64748b" }}>
          {(header.metrics as any)?.play ? `${String((header.metrics as any).play)} play · ` : ""}
          created {relTime(header.created_at)} ago
          {header.scheduled_start_at
            ? ` · scheduled ${new Date(header.scheduled_start_at).toLocaleDateString()}`
            : ""}
        </div>
        <div className="ob2-settings" style={{ marginTop: 16 }}>
          <SettingBox
            label="Audience"
            value={
              audience.length > 0 ? (
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {audience.map((a) => (
                    <AudChip key={a}>{a}</AudChip>
                  ))}
                </span>
              ) : (
                `${fmtNum(companyCount)} compan${companyCount === 1 ? "y" : "ies"} attached`
              )
            }
            sub={`${fmtNum(agg.enrolledTotal)} contacts enrolled`}
          />
          <SettingBox
            label="Send window"
            value={
              firstStep?.time_of_day_local
                ? `${firstStep.time_of_day_local}${firstStep.weekdays_only ? " · Mon–Fri" : ""}`
                : "On schedule"
            }
            sub={header.send_timezone || "UTC"}
          />
          <SettingBox
            label="Sending limits"
            value={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                Per-mailbox cap <ComingSoon />
              </span>
            }
            sub={primaryMb ? primaryMb.email : "no mailbox connected"}
          />
          <SettingBox
            label="Auto-pause"
            value={exitKeys.length > 0 ? `On · ${exitKeys.join(", ")}` : "Default exit rules"}
            sub="stops a contact's sequence on exit events"
          />
        </div>
      </div>

      <div className="ob2-grid2">
        {/* Sequence builder */}
        <div style={{ ...CARD, padding: "18px 20px" }}>
          <SectionLabel icon={<Zap size={13} />}>
            Sequence · {vms.length} step{vms.length === 1 ? "" : "s"}
          </SectionLabel>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
            {vms.length === 0 && (
              <div style={{ font: `500 13px ${FB}`, color: "#94a3b8", padding: "8px 0 14px" }}>
                No steps yet. Add the first touch below.
              </div>
            )}
            {vms.map((s, i) => (
              <div key={s.id}>
                {i > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 0 0 17px" }}>
                    <span style={{ width: 2, height: 34, background: "#E2E8F0" }} />
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        font: `500 11px ${FM}`,
                        color: "#64748b",
                        background: "#F1F5F9",
                        borderRadius: 999,
                        padding: "3px 10px",
                      }}
                    >
                      <Clock size={11} />
                      {s.waitLabel}
                    </span>
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  className="ob2-step ob2-focus"
                  onClick={() => onOpenStep(s.id)}
                  onKeyDown={(e) => e.key === "Enter" && onOpenStep(s.id)}
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    background: "#FFFFFF",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 9,
                        display: "grid",
                        placeItems: "center",
                        background: s.bg,
                        color: s.fg,
                        flex: "none",
                      }}
                    >
                      {s.channel === "email" ? <Mail size={16} /> : s.channel === "linkedin" ? <Linkedin size={16} /> : <Phone size={16} />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: `600 10px ${FM}`, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {s.day} · {s.channelLabel}
                      </div>
                      <div style={{ font: `600 14px ${FD}`, color: "#0F172A", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.title}
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 14, font: `500 11px ${FM}`, color: "#64748b", whiteSpace: "nowrap" }}>
                      <span>Sent {fmtNum(s.sent)}</span>
                      <span>{s.openLabel} {s.openPct}</span>
                      <span style={{ color: "#059669" }}>Reply {s.replyPct}</span>
                    </div>
                  </div>
                  {s.variants.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {s.variants.map((v) => (
                        <div
                          key={v.key}
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 8,
                            background: v.winner ? "rgba(16,185,129,0.08)" : "#F8FAFC",
                            borderRadius: 8,
                            padding: "6px 8px",
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              display: "grid",
                              placeItems: "center",
                              background: "#0F172A",
                              color: "#00F0FF",
                              font: `700 10px ${FD}`,
                              flex: "none",
                            }}
                          >
                            {v.key}
                          </span>
                          <span style={{ font: `500 11px ${FM}`, color: "#334155", minWidth: 0, flex: "1 1 160px", overflowWrap: "anywhere" }}>
                            {v.subject || "(no subject)"}
                          </span>
                          <span style={{ font: `500 11px ${FM}`, color: "#64748b" }}>{v.openPct} open</span>
                          <span style={{ font: `500 11px ${FM}`, color: "#059669" }}>{v.replyPct} reply</span>
                          {v.winner && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                font: `600 10px ${FD}`,
                                color: "#047857",
                                background: "rgba(16,185,129,0.14)",
                                borderRadius: 999,
                                padding: "2px 8px",
                              }}
                            >
                              <Trophy size={10} /> Winner
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* Add step */}
            <div style={{ marginTop: 14 }}>
              {!addOpen ? (
                <button
                  type="button"
                  className="ob2-ghost ob2-focus"
                  onClick={() => setAddOpen(true)}
                  style={{
                    width: "100%",
                    border: "1px dashed #CBD5E1",
                    borderRadius: 12,
                    background: "transparent",
                    padding: "12px 0",
                    font: `600 13px ${FD}`,
                    color: "#64748b",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                  }}
                >
                  <Plus size={14} /> Add step
                </button>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(
                    [
                      ["email", "Email", <Mail key="e" size={14} />],
                      ["linkedin", "LinkedIn", <Linkedin key="l" size={14} />],
                      ["call", "Call task", <Phone key="c" size={14} />],
                    ] as Array<[UiChannel, string, ReactNode]>
                  ).map(([ch, label, icon]) => (
                    <GhostBtn
                      key={ch}
                      disabled={addingStep}
                      onClick={() => {
                        setAddOpen(false);
                        onAddStep(ch);
                      }}
                      style={{ color: CHANNEL_META[ch].fg, background: CHANNEL_META[ch].bg, border: "none" }}
                    >
                      {icon}
                      {label}
                    </GhostBtn>
                  ))}
                  <GhostBtn onClick={() => setAddOpen(false)}>
                    <X size={14} /> Cancel
                  </GhostBtn>
                </div>
              )}
              <div style={{ marginTop: 10, font: `500 11px ${FM}`, color: "#94a3b8" }}>
                A/B winner is shown once every variant has 20+ sends.
              </div>
            </div>
          </div>
        </div>

        {/* Right column: funnel + deals sourced */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...CARD, padding: "18px 20px" }}>
            <SectionLabel icon={<Kanban size={13} />}>Funnel</SectionLabel>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {funnel.rows.map((r) => (
                <div key={r.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ font: `600 12px ${FD}`, color: r.missing ? "#94a3b8" : "#334155" }}>
                      {r.label}
                    </span>
                    <span style={{ font: `600 13px ${FM}`, color: r.missing ? "#94a3b8" : "#0F172A" }}>
                      {r.value}
                      {r.pct && (
                        <span style={{ font: `500 10px ${FM}`, color: "#94a3b8", marginLeft: 6 }}>{r.pct}</span>
                      )}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#F1F5F9", marginTop: 5, overflow: "hidden" }}>
                    <div className="ob2-bar" style={{ height: "100%", width: `${r.width}%`, background: r.color, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
            {funnel.note && (
              <div style={{ marginTop: 12, font: `500 11px ${FM}`, color: "#94a3b8" }}>{funnel.note}</div>
            )}
          </div>
          <div style={{ ...CARD, padding: "18px 20px" }}>
            <SectionLabel icon={<Kanban size={13} />}>Deals sourced</SectionLabel>
            {deals.length === 0 ? (
              <div style={{ marginTop: 12, font: `500 13px ${FB}`, color: "#94a3b8" }}>
                No deals in the board from this campaign yet. Replies tagged Interested create one automatically.
              </div>
            ) : (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {deals.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <LogoTile name={d.title} size={28} radius={8} />
                    <span style={{ font: `600 13px ${FD}`, color: "#0F172A", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {d.title}
                    </span>
                    <span style={{ font: `600 12px ${FM}`, color: "#1d4ed8" }}>
                      {d.value_amount != null ? fmtMoney(Number(d.value_amount)) : "—"}
                    </span>
                    <span style={{ font: `500 11px ${FM}`, color: "#94a3b8", textTransform: "capitalize" }}>{d.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── add audience

/**
 * Thin adapter over the AudiencePickerDrawer enrollment path: lists REAL
 * saved companies (getWorkspaceSavedCompanies) + pulse lists, then attaches
 * the chosen companies via attachCompaniesToCampaign and queues recipients
 * through the queue-campaign-recipients edge fn — the exact same pipeline
 * the campaign builder uses. (The drawer itself is builder-state-coupled:
 * its Confirm and Close are indistinguishable to a parent.)
 */
function AddAudienceModal({
  campaignId,
  campaignName,
  onClose,
  onDone,
}: {
  campaignId: string;
  campaignName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; domain: string | null }> | null>(null);
  const [lists, setLists] = useState<Array<{ id: string; name: string; company_count: number }> | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selLists, setSelLists] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getWorkspaceSavedCompanies()
      .then(({ rows }) => {
        if (cancelled) return;
        setCompanies(
          (rows ?? [])
            .map((r: any) => ({
              id: r?.company?.id ? String(r.company.id) : "",
              name: String(r?.company?.name ?? "Unknown"),
              domain: (r?.company?.domain as string) ?? null,
            }))
            .filter((c: any) => c.id),
        );
      })
      .catch(() => !cancelled && setCompanies([]));
    void listPulseLists()
      .then((res: any) => {
        if (cancelled) return;
        setLists(res?.ok && Array.isArray(res.rows) ? res.rows : []);
      })
      .catch(() => !cancelled && setLists([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = (companies ?? []).filter(
    (c) => !filter.trim() || c.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ids = new Set(sel);
      for (const listId of selLists) {
        const res: any = await getListCompanies(listId);
        if (res?.ok && Array.isArray(res.rows)) {
          for (const row of res.rows) if (row?.id) ids.add(String(row.id));
        }
      }
      if (ids.size === 0) {
        toast.error("Pick at least one company or list");
        return;
      }
      await attachCompaniesToCampaign(campaignId, [...ids]);
      const q = await queueCampaignRecipients({ campaign_id: campaignId });
      if (q.ok === false) throw new Error(q.error || "queue_failed");
      toast.success(
        `${ids.size} compan${ids.size === 1 ? "y" : "ies"} added to "${campaignName}" · ${fmtNum(q.enqueued ?? 0)} recipient${(q.enqueued ?? 0) === 1 ? "" : "s"} queued`,
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the audience");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(2,6,23,0.45)", display: "grid", placeItems: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add audience"
        onClick={(e) => e.stopPropagation()}
        style={{ ...CARD, width: 640, maxWidth: "100%", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={16} color="#0891b2" />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: `700 15px ${FD}`, color: "#0F172A" }}>Add audience</div>
            <div style={{ font: `500 11px ${FB}`, color: "#64748b" }}>
              Saved companies and lists enroll into “{campaignName}”. Only contacts with an email get queued.
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ob2-focus" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Lists */}
          <div>
            <SectionLabel icon={<Library size={12} />}>Your lists</SectionLabel>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {lists == null ? (
                <div style={{ font: `500 12px ${FB}`, color: "#94a3b8" }}>Loading lists…</div>
              ) : lists.length === 0 ? (
                <div style={{ font: `500 12px ${FB}`, color: "#94a3b8" }}>No saved lists yet — curate them in Pulse → Lists.</div>
              ) : (
                lists.map((l) => {
                  const on = selLists.has(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className="ob2-press ob2-focus"
                      onClick={() => toggle(selLists, l.id, setSelLists)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        border: `1px solid ${on ? "#3b82f6" : "#E5E7EB"}`,
                        background: on ? "rgba(59,130,246,0.06)" : "#FFFFFF",
                        borderRadius: 10,
                        padding: "9px 12px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 5, border: `1px solid ${on ? "#3b82f6" : "#CBD5E1"}`, background: on ? "#3b82f6" : "#fff", color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
                        {on && <Check size={12} />}
                      </span>
                      <span style={{ font: `600 13px ${FD}`, color: "#0F172A", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                      <span style={{ font: `500 11px ${FM}`, color: "#94a3b8", flex: "none" }}>
                        {fmtNum(l.company_count ?? 0)} compan{(l.company_count ?? 0) === 1 ? "y" : "ies"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Saved companies */}
          <div>
            <SectionLabel icon={<Users size={12} />}>Saved companies</SectionLabel>
            <div style={{ marginTop: 8 }}>
              {searchBox(filter, setFilter, "Filter saved companies…")}
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {companies == null ? (
                <div style={{ font: `500 12px ${FB}`, color: "#94a3b8" }}>Loading companies…</div>
              ) : shown.length === 0 ? (
                <div style={{ font: `500 12px ${FB}`, color: "#94a3b8" }}>
                  {companies.length === 0 ? "No saved companies yet — save shippers in Command Center first." : "No companies match."}
                </div>
              ) : (
                shown.map((c) => {
                  const on = sel.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="ob2-press ob2-focus"
                      onClick={() => toggle(sel, c.id, setSel)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        border: `1px solid ${on ? "#3b82f6" : "#E5E7EB"}`,
                        background: on ? "rgba(59,130,246,0.06)" : "#FFFFFF",
                        borderRadius: 10,
                        padding: "8px 12px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 5, border: `1px solid ${on ? "#3b82f6" : "#CBD5E1"}`, background: on ? "#3b82f6" : "#fff", color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
                        {on && <Check size={12} />}
                      </span>
                      <LogoTile name={c.name} domain={c.domain} size={26} radius={7} />
                      <span style={{ font: `600 13px ${FD}`, color: "#0F172A", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ font: `500 12px ${FM}`, color: "#64748b" }}>
            {sel.size} compan{sel.size === 1 ? "y" : "ies"} · {selLists.size} list{selLists.size === 1 ? "" : "s"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <PrimaryBtn onClick={confirm} disabled={busy || (sel.size === 0 && selLists.size === 0)}>
              {busy ? <Loader2 size={14} className="ob2-spin" /> : <Users size={14} />}
              Add & queue
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── step editor drawer

const darkInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#020617",
  border: "1px solid #1e293b",
  borderRadius: 9,
  color: "#e2e8f0",
  padding: "9px 11px",
  font: `500 13px ${FM}`,
};

function DarkToggle({
  on,
  label,
  sub,
  onClick,
}: {
  on: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ font: `600 13px ${FB}`, color: "#e2e8f0" }}>{label}</div>
        <div style={{ font: `400 11px ${FB}`, color: "#64748b", marginTop: 1 }}>{sub}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className="ob2-focus"
        style={{
          width: 34,
          height: 20,
          borderRadius: 999,
          border: "none",
          background: on ? "#10b981" : "#334155",
          position: "relative",
          cursor: "pointer",
          flex: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: `left 200ms ${EASE}`,
          }}
        />
      </button>
    </div>
  );
}

function segDark<T extends string>(
  items: T[],
  cur: T,
  onSelect: (v: T) => void,
) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, background: "#020617", borderRadius: 9, padding: 3 }}>
      {items.map((l) => (
        <button
          key={l}
          type="button"
          className="ob2-press ob2-focus"
          onClick={() => onSelect(l)}
          style={{
            border: "none",
            borderRadius: 7,
            padding: "6px 10px",
            font: `600 12px ${FD}`,
            cursor: "pointer",
            background: cur === l ? "#1e293b" : "transparent",
            color: cur === l ? "#f8fafc" : "#94a3b8",
            whiteSpace: "nowrap",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const LI_ACTIONS = ["Visit profile", "Connection request", "Message", "Like post"] as const;
type LiAction = (typeof LI_ACTIONS)[number];

const LI_ACTION_DB: Record<LiAction, string> = {
  "Visit profile": "visit_profile",
  "Connection request": "connection_request",
  Message: "message",
  "Like post": "like_post",
};
const LI_ACTION_FROM_DB = Object.fromEntries(
  Object.entries(LI_ACTION_DB).map(([k, v]) => [v, k]),
) as Record<string, LiAction>;

interface DrawerDraft {
  title: string;
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
  /** "HH:MM" local send time bound to lit_campaign_steps.time_of_day_local. */
  timeOfDay: string;
  weekdaysOnly: boolean;
  variants: StepVariant[]; // email
  activeVar: string;
  body: string; // linkedin note / call script
  liAction: LiAction;
  voicemail: string;
  assignTo: "Campaign owner" | "Account owner";
  within: "Same day" | "1 day" | "2 days";
  threadReply: boolean;
  trackOpens: boolean;
  skipIfLiReplied: boolean;
}

function draftFromStep(step: OutboundStepRow, stepIndex: number): DrawerDraft {
  const meta = (step.metadata ?? {}) as Record<string, unknown>;
  const vars = variantsOf(step).map((v) => ({ ...v, body: v.body ?? step.body ?? "" }));
  return {
    title: (meta.title as string) || step.subject || "",
    delayDays: step.delay_days ?? 0,
    delayHours: step.delay_hours ?? 0,
    delayMinutes: step.delay_minutes ?? 0,
    // DB stores time; "HH:MM:SS" → the input's "HH:MM".
    timeOfDay: step.time_of_day_local ? String(step.time_of_day_local).slice(0, 5) : "",
    weekdaysOnly: Boolean(step.weekdays_only),
    variants: vars,
    activeVar: vars[0]?.key ?? "A",
    body: step.body ?? "",
    liAction: LI_ACTION_FROM_DB[step.linkedin_action ?? ""] ?? "Connection request",
    voicemail: (meta.voicemail as string) || "",
    assignTo: (meta.assign_to as DrawerDraft["assignTo"]) || "Account owner",
    within: (meta.complete_within as DrawerDraft["within"]) || "1 day",
    threadReply: meta.thread_reply != null ? Boolean(meta.thread_reply) : stepIndex > 0,
    trackOpens: meta.track_opens != null ? Boolean(meta.track_opens) : true,
    skipIfLiReplied: meta.skip_if_li_replied != null ? Boolean(meta.skip_if_li_replied) : true,
  };
}

function StepEditorDrawer({
  step,
  stepIndex,
  campaignName,
  stats,
  sample,
  onClose,
  onSaved,
  onDeleted,
}: {
  step: OutboundStepRow;
  stepIndex: number; // 0-based among non-branch steps
  campaignName: string;
  stats: { sent: number; opened: number; replied: number };
  sample: SampleContact | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const channel = uiChannelOf(step.channel || step.step_type);
  const meta = CHANNEL_META[channel];
  const [d, setD] = useState<DrawerDraft>(() => draftFromStep(step, stepIndex));
  const [busy, setBusy] = useState(false);
  // Body inserts (email): calendar link / image / video link.
  const [insertMode, setInsertMode] = useState<null | "image" | "video" | "calendar-setup">(null);
  const [insertUrl, setInsertUrl] = useState("");
  // undefined = not fetched yet; null = profile has no calendar_url.
  const [calUrl, setCalUrl] = useState<string | null | undefined>(undefined);
  const [calBusy, setCalBusy] = useState(false);
  useEffect(() => setD(draftFromStep(step, stepIndex)), [step.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (p: Partial<DrawerDraft>) => setD((x) => ({ ...x, ...p }));
  const activeIdx = Math.max(0, d.variants.findIndex((v) => v.key === d.activeVar));
  const active = d.variants[activeIdx];

  const bodyValue = channel === "email" ? active?.body ?? "" : d.body;
  const setBodyValue = (val: string) => {
    if (channel === "email") {
      patch({
        variants: d.variants.map((v, i) => (i === activeIdx ? { ...v, body: val } : v)),
      });
    } else {
      patch({ body: val });
    }
  };

  const liLimit =
    channel !== "linkedin" ? 0 : d.liAction === "Connection request" ? 300 : d.liAction === "Message" ? 1900 : 0;
  const hasBody =
    channel !== "linkedin" || d.liAction === "Connection request" || d.liAction === "Message";

  const tokenVars: TokenVars = sample
    ? {
        first_name: sample.firstName,
        company: sample.companyName,
      }
    : {};

  const appendToken = (t: string) => setBodyValue(`${bodyValue.replace(/\s*$/, "")} {{${t}}}`);

  // ── Body inserts (HTML — send-campaign-email renders text/html when the
  // body contains markup; verified in its sendEmail MIME builder). ────────
  const appendSnippet = (html: string) =>
    setBodyValue(bodyValue.trim() ? `${bodyValue.replace(/\s*$/, "")}\n\n${html}` : html);

  const calendarSnippet = (url: string) =>
    `<a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:8px;font-family:Arial,sans-serif;font-weight:600;text-decoration:none;">Book 30 minutes</a>`;

  const insertCalendar = async () => {
    if (calBusy) return;
    setCalBusy(true);
    try {
      let url = calUrl;
      if (url === undefined) {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) throw new Error("Not signed in");
        const { data, error } = await supabase
          .from("profiles")
          .select("calendar_url")
          .eq("id", uid)
          .maybeSingle();
        if (error) throw new Error(error.message);
        url = ((data as any)?.calendar_url as string) || null;
        setCalUrl(url);
      }
      if (!url) {
        // No saved link yet — inline input saves it to profiles first.
        setInsertMode("calendar-setup");
        setInsertUrl("");
        return;
      }
      appendSnippet(calendarSnippet(url));
      toast.success("Calendar link inserted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load your calendar link");
    } finally {
      setCalBusy(false);
    }
  };

  const confirmInsert = async () => {
    const url = insertUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      toast.error("Enter a full URL starting with http(s)://");
      return;
    }
    if (insertMode === "image") {
      appendSnippet(`<img src="${url}" width="480" style="max-width:100%;height:auto;border-radius:8px;" alt="" />`);
    } else if (insertMode === "video") {
      appendSnippet(
        `<a href="${url}" style="display:inline-block;background:#0F172A;color:#ffffff;padding:10px 18px;border-radius:8px;font-family:Arial,sans-serif;font-weight:600;text-decoration:none;">&#9654;&nbsp;&nbsp;Watch the video</a>`,
      );
    } else if (insertMode === "calendar-setup") {
      setCalBusy(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) throw new Error("Not signed in");
        const { error } = await supabase.from("profiles").update({ calendar_url: url }).eq("id", uid);
        if (error) throw new Error(error.message);
        setCalUrl(url);
        appendSnippet(calendarSnippet(url));
        toast.success("Calendar link saved to your profile and inserted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save your calendar link");
        return;
      } finally {
        setCalBusy(false);
      }
    }
    setInsertMode(null);
    setInsertUrl("");
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const newMeta: Record<string, unknown> = {
        ...((step.metadata ?? {}) as Record<string, unknown>),
        title: d.title || null,
      };
      if (channel === "email") {
        newMeta.thread_reply = d.threadReply;
        newMeta.track_opens = d.trackOpens;
        newMeta.skip_if_li_replied = d.skipIfLiReplied;
      }
      if (channel === "call") {
        newMeta.voicemail = d.voicemail || null;
        newMeta.assign_to = d.assignTo;
        newMeta.complete_within = d.within;
      }
      await updateCampaignStep(step.id, {
        delay_days: d.delayDays,
        delay_hours: Math.max(0, Math.min(23, d.delayHours || 0)),
        delay_minutes: Math.max(0, Math.min(59, d.delayMinutes || 0)),
        time_of_day_local: d.timeOfDay ? d.timeOfDay : null,
        weekdays_only: d.weekdaysOnly,
        metadata: newMeta,
        ...(channel === "email"
          ? { variants: d.variants }
          : { body: d.body || null, variants: null }),
        ...(channel === "linkedin" ? { linkedin_action: LI_ACTION_DB[d.liAction] } : {}),
      });
      toast.success(`Step ${stepIndex + 1} saved`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCampaignStep(step.id);
      toast.success("Step deleted");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const previewSubject = channel === "email" ? renderTokens(active?.subject ?? "", tokenVars) : null;
  const previewBody = renderTokens(bodyValue, tokenVars);
  const liCount = renderTokens(bodyValue, tokenVars).length;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(2,6,23,0.35)",
          zIndex: 60,
          animation: "ob2fade 250ms ease-out",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit step ${stepIndex + 1}`}
        className="ob2-drawer"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 61,
          background: "#0F172A",
          borderLeft: "1px solid #1F2937",
          boxShadow: "-20px 0 40px rgba(2,6,23,0.4)",
          display: "flex",
          flexDirection: "column",
          animation: `ob2slide 350ms ${DRAWER_EASE}`,
        }}
      >
        {/* Header */}
        <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                font: `600 10px ${FM}`,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#00F0FF",
              }}
            >
              Step {stepIndex + 1} · {meta.label} · {campaignName}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ob2-focus"
              style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}
            >
              <X size={17} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                display: "grid",
                placeItems: "center",
                background: meta.bg,
                color: meta.fg,
                flex: "none",
              }}
            >
              {channel === "email" ? <Mail size={19} /> : channel === "linkedin" ? <Linkedin size={19} /> : <Phone size={19} />}
            </span>
            <input
              value={d.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={`${meta.label} step title`}
              className="ob2-focus"
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                color: "#f8fafc",
                font: `700 22px ${FD}`,
                letterSpacing: "-0.02em",
              }}
            />
          </div>
          {/* Send timing — full dispatcher precision (delay d/h/m + local send
              time + weekdays-only, all persisted on lit_campaign_steps). */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, font: `500 12px ${FB}`, color: "#94a3b8" }}>
              Wait
              <button
                type="button"
                className="ob2-press ob2-focus"
                onClick={() => patch({ delayDays: Math.max(0, d.delayDays - 1) })}
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", cursor: "pointer" }}
              >
                −
              </button>
              <span style={{ font: `600 14px ${FM}`, color: "#f8fafc", minWidth: 18, textAlign: "center" }}>{d.delayDays}</span>
              <button
                type="button"
                className="ob2-press ob2-focus"
                onClick={() => patch({ delayDays: d.delayDays + 1 })}
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", cursor: "pointer" }}
              >
                +
              </button>
              days
              <input
                type="number"
                min={0}
                max={23}
                value={d.delayHours}
                onChange={(e) => patch({ delayHours: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })}
                aria-label="Delay hours"
                className="ob2-focus"
                style={{ ...darkInput, width: 58, padding: "5px 8px" }}
              />
              hours
              <input
                type="number"
                min={0}
                max={59}
                value={d.delayMinutes}
                onChange={(e) => patch({ delayMinutes: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
                aria-label="Delay minutes"
                className="ob2-focus"
                style={{ ...darkInput, width: 58, padding: "5px 8px" }}
              />
              minutes
              <span style={{ color: "#64748b" }}>
                {d.delayDays === 0 && d.delayHours === 0 && d.delayMinutes === 0
                  ? "· sends on enrollment"
                  : "· after the previous step"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, font: `500 12px ${FB}`, color: "#94a3b8" }}>
              Send at
              <input
                type="time"
                value={d.timeOfDay}
                onChange={(e) => patch({ timeOfDay: e.target.value })}
                aria-label="Send at local time"
                className="ob2-focus"
                style={{ ...darkInput, width: 110, padding: "5px 8px" }}
              />
              {d.timeOfDay && (
                <button
                  type="button"
                  className="ob2-press ob2-focus"
                  onClick={() => patch({ timeOfDay: "" })}
                  style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", font: `600 11px ${FD}` }}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={d.weekdaysOnly}
                className="ob2-press ob2-focus"
                onClick={() => patch({ weekdaysOnly: !d.weekdaysOnly })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  border: `1px solid ${d.weekdaysOnly ? "rgba(16,185,129,0.5)" : "#334155"}`,
                  background: d.weekdaysOnly ? "rgba(16,185,129,0.12)" : "#020617",
                  color: d.weekdaysOnly ? "#34d399" : "#94a3b8",
                  borderRadius: 999,
                  padding: "4px 11px",
                  font: `600 11px ${FD}`,
                  cursor: "pointer",
                }}
              >
                <CalendarCheck size={12} />
                Weekdays only
              </button>
            </div>
            <div style={{ font: `500 11px ${FM}`, color: "#64748b" }}>
              Dispatcher runs every minute — sends fire at exactly this local time.
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
          {channel === "email" && (
            <>
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", gap: 2, background: "#020617", borderRadius: 9, padding: 3 }}>
                    {d.variants.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        className="ob2-press ob2-focus"
                        onClick={() => patch({ activeVar: v.key })}
                        style={{
                          border: "none",
                          borderRadius: 7,
                          padding: "6px 12px",
                          font: `600 12px ${FD}`,
                          cursor: "pointer",
                          background: v.key === d.activeVar ? "#f8fafc" : "transparent",
                          color: v.key === d.activeVar ? "#020617" : "#cbd5e1",
                        }}
                      >
                        Variant {v.key}
                      </button>
                    ))}
                    {d.variants.length < 4 && (
                      <button
                        type="button"
                        className="ob2-press ob2-focus"
                        onClick={() => {
                          const nx = "ABCD"[d.variants.length];
                          patch({
                            variants: [...d.variants, { key: nx, subject: "", body: "" }],
                            activeVar: nx,
                          });
                        }}
                        style={{ border: "none", borderRadius: 7, padding: "6px 10px", font: `600 12px ${FD}`, cursor: "pointer", background: "transparent", color: "#94a3b8" }}
                      >
                        + Variant
                      </button>
                    )}
                  </div>
                  <span style={{ marginLeft: "auto", font: `500 11px ${FM}`, color: "#64748b" }}>
                    {(active?.sent ?? 0) > 0
                      ? `${Math.round(((active?.opened ?? 0) / Math.max(1, active?.sent ?? 0)) * 100)}% open · ${Math.round(((active?.replied ?? 0) / Math.max(1, active?.sent ?? 0)) * 100)}% reply`
                      : "No sends yet"}
                  </span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={{ font: `600 10px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                    Subject
                  </label>
                  <input
                    value={active?.subject ?? ""}
                    onChange={(e) =>
                      patch({
                        variants: d.variants.map((v, i) =>
                          i === activeIdx ? { ...v, subject: e.target.value } : v,
                        ),
                      })
                    }
                    className="ob2-focus"
                    style={{ ...darkInput, marginTop: 6 }}
                  />
                </div>
              </div>
            </>
          )}

          {channel === "linkedin" && (
            <div>
              <label style={{ font: `600 10px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                LinkedIn action
              </label>
              <div style={{ marginTop: 6 }}>
                {segDark([...LI_ACTIONS], d.liAction, (v) => patch({ liAction: v as LiAction }))}
              </div>
            </div>
          )}

          {hasBody && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <label style={{ font: `600 10px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                  {channel === "call" ? "Call script" : channel === "linkedin" ? "Note" : "Body"}
                </label>
                {liLimit > 0 && (
                  <span style={{ marginLeft: "auto", font: `500 11px ${FM}`, color: liCount > liLimit ? "#fb7185" : "#64748b" }}>
                    {liCount} / {liLimit}
                  </span>
                )}
              </div>
              <textarea
                value={bodyValue}
                onChange={(e) => setBodyValue(e.target.value)}
                rows={channel === "email" ? 9 : channel === "call" ? 6 : 5}
                className="ob2-focus"
                style={{ ...darkInput, marginTop: 6, resize: "vertical", lineHeight: 1.5 }}
              />
              {/* Token chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {TOKENS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="ob2-press ob2-focus"
                    onClick={() => appendToken(t)}
                    style={{
                      font: `500 11px ${FM}`,
                      color: "#00F0FF",
                      background: "rgba(0,240,255,0.08)",
                      border: "1px solid rgba(0,240,255,0.2)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      cursor: "pointer",
                    }}
                  >
                    {`{{${t}}}`}
                  </button>
                ))}
              </div>
              {/* Rich inserts — appended as HTML (send-campaign-email sends
                  text/html whenever the body contains markup). */}
              {channel === "email" && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(
                      [
                        ["calendar", "Insert calendar link", <CalendarPlus key="c" size={12} />, () => void insertCalendar()],
                        ["image", "Insert image", <ImageIcon key="i" size={12} />, () => { setInsertMode("image"); setInsertUrl(""); }],
                        ["video", "Insert video link", <Video key="v" size={12} />, () => { setInsertMode("video"); setInsertUrl(""); }],
                      ] as Array<[string, string, ReactNode, () => void]>
                    ).map(([key, lbl, icon, fn]) => (
                      <button
                        key={key}
                        type="button"
                        className="ob2-press ob2-focus"
                        disabled={calBusy && key === "calendar"}
                        onClick={fn}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          font: `600 11px ${FD}`,
                          color: "#cbd5e1",
                          background: "#020617",
                          border: "1px solid #334155",
                          borderRadius: 6,
                          padding: "4px 10px",
                          cursor: "pointer",
                        }}
                      >
                        {calBusy && key === "calendar" ? <Loader2 size={12} className="ob2-spin" /> : icon}
                        {lbl}
                      </button>
                    ))}
                  </div>
                  {insertMode && (
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <input
                        value={insertUrl}
                        onChange={(e) => setInsertUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void confirmInsert()}
                        placeholder={
                          insertMode === "image"
                            ? "https:// image URL"
                            : insertMode === "video"
                              ? "https:// video URL"
                              : "https:// your booking link (saved to your profile)"
                        }
                        autoFocus
                        className="ob2-focus"
                        style={{ ...darkInput, flex: "1 1 220px" }}
                      />
                      <button
                        type="button"
                        className="ob2-press ob2-focus"
                        onClick={() => void confirmInsert()}
                        disabled={calBusy}
                        style={{ border: "none", background: "#3b82f6", color: "#fff", borderRadius: 8, padding: "8px 13px", font: `600 12px ${FD}`, cursor: "pointer" }}
                      >
                        {insertMode === "calendar-setup" ? "Save & insert" : "Insert"}
                      </button>
                      <button
                        type="button"
                        className="ob2-press ob2-focus"
                        onClick={() => { setInsertMode(null); setInsertUrl(""); }}
                        style={{ border: "1px solid #334155", background: "transparent", color: "#94a3b8", borderRadius: 8, padding: "8px 11px", font: `600 12px ${FD}`, cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {channel === "call" && (
            <>
              <div>
                <label style={{ font: `600 10px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                  Voicemail
                </label>
                <textarea
                  value={d.voicemail}
                  onChange={(e) => patch({ voicemail: e.target.value })}
                  rows={3}
                  className="ob2-focus"
                  style={{ ...darkInput, marginTop: 6, resize: "vertical", lineHeight: 1.5 }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
                <div>
                  <label style={{ font: `600 10px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                    Assign call task to
                  </label>
                  <div style={{ marginTop: 6 }}>
                    {segDark(["Campaign owner", "Account owner"], d.assignTo, (v) => patch({ assignTo: v as DrawerDraft["assignTo"] }))}
                  </div>
                </div>
                <div>
                  <label style={{ font: `600 10px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                    Complete within
                  </label>
                  <div style={{ marginTop: 6 }}>
                    {segDark(["Same day", "1 day", "2 days"], d.within, (v) => patch({ within: v as DrawerDraft["within"] }))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Preview */}
          {hasBody && (
            <div>
              <div style={{ font: `600 10px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                Preview{" "}
                {sample?.firstName
                  ? `· ${sample.firstName}${sample.companyName ? ` at ${sample.companyName}` : ""}`
                  : "· raw tokens (no enrolled contact yet)"}
              </div>
              <div style={{ background: "#FFFFFF", borderRadius: 10, padding: "12px 14px", marginTop: 8 }}>
                {previewSubject != null && previewSubject !== "" && (
                  <div style={{ font: `600 13px ${FD}`, color: "#0F172A", paddingBottom: 8, borderBottom: "1px solid #E5E7EB", marginBottom: 8 }}>
                    {previewSubject}
                  </div>
                )}
                <div style={{ font: `400 12.5px ${FB}`, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {previewBody || "(empty)"}
                </div>
              </div>
            </div>
          )}

          {/* Email options */}
          {channel === "email" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <DarkToggle
                on={d.threadReply}
                label="Send as reply in the same thread"
                sub="Keeps the conversation in one email chain"
                onClick={() => patch({ threadReply: !d.threadReply })}
              />
              <DarkToggle
                on={d.trackOpens}
                label="Track opens"
                sub="Turn off for better deliverability on cold lists"
                onClick={() => patch({ trackOpens: !d.trackOpens })}
              />
              <DarkToggle
                on={d.skipIfLiReplied}
                label="Skip if contact replied on LinkedIn"
                sub="Avoids double-touching engaged contacts"
                onClick={() => patch({ skipIfLiReplied: !d.skipIfLiReplied })}
              />
            </div>
          )}

          {/* Stats */}
          {stats.sent > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { label: "Sent", v: fmtNum(stats.sent), fg: "#f8fafc" },
                {
                  label: meta.openLabel,
                  v: `${Math.round((stats.opened / Math.max(1, stats.sent)) * 100)}%`,
                  fg: "#60a5fa",
                },
                {
                  label: "Reply",
                  v: `${Math.round((stats.replied / Math.max(1, stats.sent)) * 100)}%`,
                  fg: "#34d399",
                },
              ].map((s) => (
                <div key={s.label} style={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ font: `600 9.5px ${FD}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                    {s.label}
                  </div>
                  <div style={{ font: `600 18px ${FM}`, color: s.fg, marginTop: 4 }}>{s.v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #1e293b", display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="ob2-press ob2-focus"
            onClick={remove}
            disabled={busy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid rgba(244,63,94,0.4)",
              background: "transparent",
              font: `600 13px ${FD}`,
              color: "#fb7185",
              cursor: "pointer",
            }}
          >
            <Trash2 size={14} /> Delete step
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              type="button"
              className="ob2-press ob2-focus"
              onClick={onClose}
              style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid #334155", background: "transparent", font: `600 13px ${FD}`, color: "#cbd5e1", cursor: "pointer" }}
            >
              Cancel
            </button>
            <PrimaryBtn onClick={save} disabled={busy}>
              {busy ? <Loader2 size={14} className="ob2-spin" /> :<FileCheck size={14} />}
              Save step
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────── inbox tab

function IntentPill({ intent }: { intent: IntentId | null }) {
  const m = INTENT_META[intent ?? "unclassified"];
  return (
    <span
      style={{
        font: `600 10px ${FD}`,
        color: m.fg,
        background: m.bg,
        borderRadius: 999,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function InboxView({
  vms,
  loading,
  error,
  selectedId,
  onSelect,
  messages,
  msgLoading,
  reply,
  setReply,
  onSend,
  sending,
  onSetIntent,
  onArchive,
}: {
  vms: ThreadVM[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (t: ThreadVM) => void;
  messages: EmailMessageRow[];
  msgLoading: boolean;
  reply: string;
  setReply: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  onSetIntent: (intent: IntentId | null) => void;
  onArchive: (t: ThreadVM) => void;
}) {
  const sel = vms.find((v) => v.id === selectedId) ?? null;
  return (
    <div className="ob2-inboxgrid">
      {/* Thread list */}
      <div style={{ ...CARD, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "28px 20px", font: `500 13px ${FB}`, color: "#94a3b8" }}>Loading inbox…</div>
        ) : error ? (
          <div style={{ padding: "28px 20px", font: `500 13px ${FB}`, color: "#be123c" }}>{error}</div>
        ) : vms.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", font: `500 13px ${FB}`, color: "#94a3b8" }}>
            No replies with this intent.
          </div>
        ) : (
          <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {vms.map((t) => {
              const on = t.id === selectedId;
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  className="ob2-row ob2-focus"
                  onClick={() => onSelect(t)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(t)}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "12px 14px",
                    borderBottom: "1px solid #F1F5F9",
                    background: on ? "rgba(59,130,246,0.06)" : "#FFFFFF",
                    boxShadow: on ? "inset 3px 0 0 #3b82f6" : "none",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: t.unread ? "#3b82f6" : "transparent",
                      flex: "none",
                      marginTop: 12,
                    }}
                  />
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background: "#0F172A",
                      color: "#00F0FF",
                      font: `700 11px ${FD}`,
                      flex: "none",
                    }}
                  >
                    {t.initials}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ font: `${t.unread ? 700 : 600} 13px ${FD}`, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}
                      </span>
                      <span style={{ marginLeft: "auto", font: `500 10px ${FM}`, color: "#94a3b8", flex: "none" }}>{t.when}</span>
                    </div>
                    <div style={{ font: `500 11.5px ${FB}`, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                      {t.subject}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                      <IntentPill intent={t.intent} />
                      <button
                        type="button"
                        aria-label={`Archive thread from ${t.name}`}
                        title="Archive"
                        className="ob2-press ob2-focus"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive(t);
                        }}
                        style={{
                          marginLeft: "auto",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          border: "1px solid #E5E7EB",
                          background: "#FFFFFF",
                          color: "#64748b",
                          borderRadius: 6,
                          padding: "2px 7px",
                          font: `600 10px ${FD}`,
                          cursor: "pointer",
                          flex: "none",
                        }}
                      >
                        <Archive size={11} />
                        Archive
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Thread detail */}
      <div style={{ ...CARD, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 420 }}>
        {!sel ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 40, font: `500 13px ${FB}`, color: "#94a3b8", textAlign: "center" }}>
            Pick a reply on the left to read it and respond.
          </div>
        ) : (
          <>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "#0F172A",
                    color: "#00F0FF",
                    font: `700 14px ${FD}`,
                    flex: "none",
                  }}
                >
                  {sel.initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ font: `700 15px ${FD}`, color: "#0F172A" }}>{sel.name}</span>
                    <IntentPill intent={sel.intent} />
                  </div>
                  <div style={{ font: `500 12px ${FB}`, color: "#64748b", marginTop: 2 }}>{sel.subject}</div>
                </div>
              </div>
              {/* Manual intent re-tag */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
                {INTENT_ORDER.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="ob2-press ob2-focus"
                    onClick={() => onSetIntent(sel.intent === k ? null : k)}
                    style={{
                      font: `600 10px ${FD}`,
                      color: INTENT_META[k].fg,
                      background: sel.intent === k ? INTENT_META[k].bg : "#F8FAFC",
                      border: sel.intent === k ? "1px solid transparent" : "1px solid #E5E7EB",
                      borderRadius: 999,
                      padding: "3px 9px",
                      cursor: "pointer",
                      opacity: sel.intent === k ? 1 : 0.75,
                    }}
                  >
                    {INTENT_META[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {msgLoading ? (
                <div style={{ font: `500 13px ${FB}`, color: "#94a3b8" }}>Loading messages…</div>
              ) : messages.length === 0 ? (
                <div style={{ font: `500 13px ${FB}`, color: "#94a3b8" }}>No messages in this thread yet.</div>
              ) : (
                messages.map((m) => {
                  const out = m.direction === "outbound";
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: out ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                        background: out ? "#FFFFFF" : "#EFF6FF",
                        border: out ? "1px solid #E5E7EB" : "1px solid #dbeafe",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ font: `600 11px ${FD}`, color: "#64748b" }}>
                        {out ? "You" : m.from_name || m.from_email || "Them"}
                        <span style={{ font: `500 10px ${FM}`, color: "#94a3b8", marginLeft: 8 }}>
                          {m.message_date ? new Date(m.message_date).toLocaleString() : ""}
                        </span>
                      </div>
                      <div style={{ font: `400 12.5px ${FB}`, color: "#334155", whiteSpace: "pre-wrap", marginTop: 4, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                        {m.body_text || m.snippet || "(empty)"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ borderTop: "1px solid #F1F5F9", padding: "12px 14px", background: "#F8FAFC" }}>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply…"
                rows={3}
                className="ob2-focus"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #E5E7EB",
                  borderRadius: 10,
                  padding: "9px 11px",
                  font: `400 13px ${FB}`,
                  color: "#0F172A",
                  resize: "vertical",
                  background: "#FFFFFF",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <PrimaryBtn onClick={onSend} disabled={sending || !reply.trim()}>
                  {sending ? <Loader2 size={14} className="ob2-spin" /> : <Send size={14} />}
                  Send reply
                </PrimaryBtn>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── templates tab

const PLAY_ICONS: Record<string, ReactNode> = {
  route: <Route size={17} />,
  crosshair: <Crosshair size={17} />,
  "package-plus": <PackagePlus size={17} />,
  zap: <Zap size={17} />,
  shuffle: <Shuffle size={17} />,
  "rotate-ccw": <RotateCcw size={17} />,
  "file-check": <FileCheck size={17} />,
  "calendar-days": <CalendarDays size={17} />,
};

type TplSel = { kind: "play"; idx: number } | { kind: "ws"; id: string };

function TemplatesView({
  cat,
  q,
  wsTemplates,
  campaigns,
  sel,
  setSel,
  onUse,
  using,
}: {
  cat: string;
  q: string;
  wsTemplates: WorkspaceTemplateRow[];
  campaigns: OutboundCampaign[];
  sel: TplSel;
  setSel: (s: TplSel) => void;
  onUse: (s: TplSel) => void;
  using: boolean;
}) {
  // Real effectiveness: join the user's campaigns by play/name match and
  // aggregate sends vs replies. Only the single best ≥20-send template gets
  // the "Top performer" badge; templates without data show nothing.
  const { perf, topKey } = useMemo(
    () =>
      templatePerformance(
        [
          ...PLAYS.map((p, idx) => ({ key: `play:${idx}`, name: p.name })),
          ...wsTemplates.map((t) => ({ key: `ws:${t.id}`, name: t.title })),
        ],
        campaigns,
      ),
    [wsTemplates, campaigns],
  );
  const perfLine = (key: string): ReactNode => {
    const p = perf.get(key);
    if (!p) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
        {topKey === key && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              font: `600 10px ${FD}`,
              color: "#047857",
              background: "rgba(16,185,129,0.14)",
              border: "1px solid rgba(16,185,129,0.35)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            <Trophy size={10} /> Top performer · {p.ratePct}% reply
          </span>
        )}
        <span style={{ font: `500 10.5px ${FM}`, color: "#64748b" }}>
          {fmtNum(p.sent)} sends · {p.ratePct}% reply
        </span>
      </div>
    );
  };
  const ql = q.trim().toLowerCase();
  const plays = PLAYS.map((p, idx) => ({ p, idx })).filter(
    ({ p }) =>
      (cat === "all" || p.cat === cat) &&
      (!ql || `${p.name} ${p.desc} ${p.who}`.toLowerCase().includes(ql)),
  );
  const ws = wsTemplates.filter((t) => !ql || t.title.toLowerCase().includes(ql));
  const selPlay = sel.kind === "play" ? PLAYS[sel.idx] : null;
  const selWs = sel.kind === "ws" ? wsTemplates.find((t) => t.id === sel.id) ?? null : null;
  const outline = selPlay ? playStepOutline(selPlay) : null;

  const cardStyle = (on: boolean): CSSProperties => ({
    ...CARD,
    borderRadius: 12,
    padding: 14,
    cursor: "pointer",
    border: on ? "1px solid #3b82f6" : "1px solid #E5E7EB",
    boxShadow: on ? "0 0 0 3px rgba(59,130,246,0.14)" : (CARD.boxShadow as string),
  });

  return (
    <div className="ob2-tplgrid">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ font: `500 11px ${FM}`, color: "#94a3b8" }}>
          Reply stats join your own campaigns by template name. The Top performer badge needs 20+
          sends; templates without campaign data show no stats.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 12 }}>
          {plays.map(({ p, idx }) => {
            const on = sel.kind === "play" && sel.idx === idx;
            return (
              <div
                key={p.name}
                role="button"
                tabIndex={0}
                className="ob2-step ob2-focus"
                onClick={() => setSel({ kind: "play", idx })}
                onKeyDown={(e) => e.key === "Enter" && setSel({ kind: "play", idx })}
                style={cardStyle(on)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(0,240,255,0.1)", color: "#0891b2", flex: "none" }}>
                    {PLAY_ICONS[p.icon] ?? <Sparkles size={17} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: `600 14px ${FD}`, color: "#0F172A" }}>{p.name}</div>
                    <div style={{ font: `500 11px ${FB}`, color: "#64748b" }}>
                      {p.cat} · {p.who}
                    </div>
                  </div>
                </div>
                <div style={{ font: `400 12px ${FB}`, color: "#475569", marginTop: 10, lineHeight: 1.5 }}>{p.desc}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <ChannelIcons channels={p.channels} />
                  <span style={{ font: `500 11px ${FM}`, color: "#94a3b8" }}>
                    {playStepOutline(p).length} steps
                  </span>
                </div>
                {perfLine(`play:${idx}`)}
              </div>
            );
          })}
        </div>
        {ws.length > 0 && (
          <div>
            <SectionLabel icon={<Library size={13} />}>Your workspace templates</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 12, marginTop: 12 }}>
              {ws.map((t) => {
                const on = sel.kind === "ws" && sel.id === t.id;
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    className="ob2-step ob2-focus"
                    onClick={() => setSel({ kind: "ws", id: t.id })}
                    onKeyDown={(e) => e.key === "Enter" && setSel({ kind: "ws", id: t.id })}
                    style={cardStyle(on)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(59,130,246,0.1)", color: "#1d4ed8", flex: "none" }}>
                        <Mail size={16} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ font: `600 14px ${FD}`, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                        <div style={{ font: `500 11px ${FB}`, color: "#64748b" }}>
                          {t.channel || "email"}{t.stage ? ` · ${t.stage}` : ""}
                        </div>
                      </div>
                    </div>
                    {t.subject_template && (
                      <div style={{ font: `500 11px ${FM}`, color: "#64748b", marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.subject_template}
                      </div>
                    )}
                    {perfLine(`ws:${t.id}`)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Preview panel */}
      <div style={{ ...CARD, padding: "18px 20px", position: "sticky", top: 68 }}>
        {selPlay ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(0,240,255,0.1)", color: "#0891b2" }}>
                {PLAY_ICONS[selPlay.icon] ?? <Sparkles size={18} />}
              </span>
              <div>
                <div style={{ font: `700 17px ${FD}`, color: "#0F172A" }}>{selPlay.name}</div>
                <div style={{ font: `500 11px ${FB}`, color: "#64748b" }}>{selPlay.cat} · {selPlay.who}</div>
              </div>
            </div>
            <div style={{ font: `400 13px ${FB}`, color: "#475569", marginTop: 12, lineHeight: 1.55 }}>{selPlay.desc}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {selPlay.aud.map((a) => (
                <AudChip key={a}>{a}</AudChip>
              ))}
            </div>
            <div style={{ marginTop: 8, font: `500 11px ${FM}`, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
              Audience matching <ComingSoon />
            </div>
            <div style={{ marginTop: 16 }}>
              <SectionLabel icon={<Zap size={13} />}>Sequence</SectionLabel>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
                {(outline ?? []).map((s, i) => {
                  let day = 0;
                  for (let j = 0; j <= i; j++) day += (outline ?? [])[j].delayDays;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ font: `600 10px ${FM}`, color: "#94a3b8", width: 44, flex: "none" }}>Day {day}</span>
                      <span style={{ color: CHANNEL_META[s.channel].fg, display: "inline-flex" }}>
                        {s.channel === "email" ? <Mail size={13} /> : s.channel === "linkedin" ? <Linkedin size={13} /> : <Phone size={13} />}
                      </span>
                      <span style={{ font: `500 12px ${FB}`, color: "#334155" }}>{s.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <PrimaryBtn onClick={() => onUse(sel)} disabled={using} style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>
              {using ? <Loader2 size={14} className="ob2-spin" /> : <Rocket size={14} />}
              Use template
            </PrimaryBtn>
          </>
        ) : selWs ? (
          <>
            <div style={{ font: `700 17px ${FD}`, color: "#0F172A" }}>{selWs.title}</div>
            <div style={{ font: `500 11px ${FB}`, color: "#64748b", marginTop: 4 }}>
              Workspace template · {selWs.channel || "email"}
            </div>
            {selWs.subject_template && (
              <div style={{ font: `600 13px ${FD}`, color: "#0F172A", marginTop: 14, paddingBottom: 8, borderBottom: "1px solid #E5E7EB" }}>
                {selWs.subject_template}
              </div>
            )}
            <div style={{ font: `400 12.5px ${FB}`, color: "#334155", whiteSpace: "pre-wrap", marginTop: 8, lineHeight: 1.55, maxHeight: 260, overflowY: "auto" }}>
              {selWs.body_template || "(empty body)"}
            </div>
            <PrimaryBtn onClick={() => onUse(sel)} disabled={using} style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>
              {using ? <Loader2 size={14} className="ob2-spin" /> : <Rocket size={14} />}
              Use template
            </PrimaryBtn>
          </>
        ) : (
          <div style={{ font: `500 13px ${FB}`, color: "#94a3b8" }}>Pick a template to preview it.</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── mailboxes tab

function MailboxesView({
  vms,
  loading,
  stats,
  onConnect,
  connecting,
  onRemove,
  removingId,
}: {
  vms: MailboxVM[];
  loading: boolean;
  stats: MailboxStats | null;
  onConnect: (provider: "gmail" | "outlook") => void;
  connecting: boolean;
  onRemove: (m: MailboxVM) => void;
  removingId: string | null;
}) {
  const perAccountAvailable = stats?.perAccount != null && stats.perAccount.size > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!perAccountAvailable && stats && vms.length > 0 && (
        <div style={{ font: `500 12px ${FM}`, color: "#64748b" }}>
          Per-mailbox attribution isn't recorded on send history yet — showing workspace totals:
          {" "}{fmtNum(stats.totals.sent7)} sent · {fmtNum(stats.totals.replies7)} replies · {fmtNum(stats.totals.failed7)} failed (7d).
        </div>
      )}
      <div className="ob2-mbgrid">
        {loading ? (
          <div style={{ ...CARD, padding: 24, font: `500 13px ${FB}`, color: "#94a3b8" }}>Loading mailboxes…</div>
        ) : (
          vms.map((m) => (
            <div key={m.id} style={{ ...CARD, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ font: `600 13px ${FM}`, color: "#0F172A", overflowWrap: "anywhere" }}>{m.address}</span>
                {m.isPrimary && (
                  <span style={{ font: `600 10px ${FD}`, color: "#1d4ed8", background: "rgba(59,130,246,0.12)", borderRadius: 999, padding: "2px 8px" }}>
                    Primary
                  </span>
                )}
                <span style={{ marginLeft: "auto", font: `600 10px ${FD}`, color: m.statusFg, background: m.statusBg, borderRadius: 999, padding: "3px 9px" }}>
                  {m.status}
                </span>
              </div>
              <div style={{ font: `500 12px ${FB}`, color: "#64748b", marginTop: 4 }}>{m.provider}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
                {[
                  { label: "Sent 7d", v: m.sent7, fg: "#0F172A" },
                  { label: "Sent 30d", v: m.sent30, fg: "#0F172A" },
                  { label: "Replies 7d", v: m.replies7, fg: "#059669" },
                  { label: "Failed 7d", v: m.failed7, fg: (m.failed7 ?? 0) > 0 ? "#e11d48" : "#059669" },
                ].map((b) => (
                  <div key={b.label} style={{ background: "#F8FAFC", border: "1px solid #EEF2F6", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ font: `600 9px ${FD}`, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8" }}>{b.label}</div>
                    <div style={{ font: `600 16px ${FM}`, color: b.fg, marginTop: 3 }}>
                      {b.v == null ? "—" : fmtNum(b.v)}
                    </div>
                  </div>
                ))}
              </div>
              {m.needsAttention && (
                <div style={{ marginTop: 12, font: `500 12px ${FB}`, color: "#b45309", display: "flex", alignItems: "center", gap: 6 }}>
                  <CircleAlert size={13} /> Reconnect this mailbox to resume sending.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="button"
                  className="ob2-press ob2-focus"
                  onClick={() => onRemove(m)}
                  disabled={removingId === m.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: "1px solid rgba(225,29,72,0.35)",
                    background: "transparent",
                    color: "#e11d48",
                    borderRadius: 8,
                    padding: "6px 12px",
                    font: `600 12px ${FD}`,
                    cursor: "pointer",
                    opacity: removingId === m.id ? 0.6 : 1,
                  }}
                >
                  {removingId === m.id ? <Loader2 size={13} className="ob2-spin" /> : <Trash2 size={13} />}
                  Disconnect
                </button>
              </div>
            </div>
          ))
        )}
        {/* Connect card */}
        <div
          style={{
            border: "1px dashed #CBD5E1",
            borderRadius: 14,
            padding: "20px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-start",
            justifyContent: "center",
            background: "transparent",
          }}
        >
          <div style={{ font: `600 14px ${FD}`, color: "#0F172A" }}>Connect mailbox</div>
          <div style={{ font: `400 12px ${FB}`, color: "#64748b" }}>Google Workspace or Microsoft 365</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <GhostBtn onClick={() => onConnect("gmail")} disabled={connecting}>
              <Plus size={14} /> Google
            </GhostBtn>
            <GhostBtn onClick={() => onConnect("outlook")} disabled={connecting}>
              <Plus size={14} /> Microsoft 365
            </GhostBtn>
          </div>
        </div>
      </div>
      {/* Sending rules — not backed by data yet */}
      <div style={{ ...CARD, padding: "18px 20px", opacity: 0.75 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SectionLabel icon={<ShieldCheck size={13} />}>Sending rules · all mailboxes</SectionLabel>
          <ComingSoon />
        </div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["Daily cap per mailbox", "Hard stop across all campaigns"],
            ["Ramp-up for new mailboxes", "Adds sends per day until the cap"],
            ["Auto-pause on high bounce", "Pauses a mailbox above the bounce threshold"],
            ["Random send delay", "Spaces sends 60–180 seconds apart"],
          ].map(([label, sub]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: `600 13px ${FB}`, color: "#334155" }}>{label}</div>
                <div style={{ font: `400 11px ${FB}`, color: "#94a3b8" }}>{sub}</div>
              </div>
              <span
                aria-disabled
                style={{ width: 34, height: 20, borderRadius: 999, background: "#CBD5E1", position: "relative", flex: "none" }}
              >
                <span style={{ position: "absolute", top: 2, left: 2, width: 16, height: 16, borderRadius: "50%", background: "#fff" }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════ root component

export interface OutboundEngineV2Props {
  initialTab?: OutboundTab;
  /** Deep link: open a campaign's detail (#/outbound/campaigns/:id). */
  campaignId?: string | null;
  /** Orchestrator hook to sync the URL when tabs / detail change. */
  onNavigate?: (tab: OutboundTab, campaignId?: string) => void;
}

export default function OutboundEngineV2({
  initialTab = "campaigns",
  campaignId: campaignIdProp = null,
  onNavigate,
}: OutboundEngineV2Props) {
  const [tab, setTab] = useState<OutboundTab>(initialTab);
  const [campaignId, setCampaignId] = useState<string | null>(campaignIdProp);
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => setCampaignId(campaignIdProp), [campaignIdProp]);

  const nav = useCallback(
    (t: OutboundTab, cid?: string) => {
      setTab(t);
      setCampaignId(cid ?? null);
      onNavigate?.(t, cid);
    },
    [onNavigate],
  );

  // ── shared datasets ─────────────────────────────────────────────────
  const { campaigns, loading: campLoading, error: campError, refresh } = useCampaigns();

  const [accounts, setAccounts] = useState<MailAccountRow[]>([]);
  const [mbStats, setMbStats] = useState<MailboxStats | null>(null);
  const [mbLoading, setMbLoading] = useState(true);
  const [threadsRaw, setThreadsRaw] = useState<EmailThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [wsTemplates, setWsTemplates] = useState<WorkspaceTemplateRow[]>([]);
  const [dealsSourced, setDealsSourced] = useState<DealsSourced | null>(null);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      setThreadsRaw(await listInboxThreads());
    } catch (e) {
      setThreadsError(e instanceof Error ? e.message : "Couldn't load inbox");
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    void (async () => {
      try {
        setAccounts(await listEmailAccounts());
      } catch {
        setAccounts([]);
      }
      try {
        setMbStats(await fetchMailboxStats());
      } catch {
        setMbStats(null);
      } finally {
        setMbLoading(false);
      }
    })();
    void listWorkspaceTemplates().then(setWsTemplates).catch(() => setWsTemplates([]));
    void fetchDealsSourcedTotal().then(setDealsSourced).catch(() => setDealsSourced(null));
  }, [loadThreads]);

  const mailboxes = useMemo(() => mailboxVMs(accounts, mbStats), [accounts, mbStats]);
  const attention = useMemo(() => mailboxAttention(mailboxes), [mailboxes]);
  const allThreadVMs = useMemo(() => threadVMs(threadsRaw), [threadsRaw]);
  const iCounts = useMemo(() => intentCounts(allThreadVMs), [allThreadVMs]);
  const unreadCount = allThreadVMs.filter((t) => t.unread).length;
  const kc = useMemo(() => campaignsKpis(campaigns), [campaigns]);

  // ── filters ─────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [ostatus, setOstatus] = useState("all");
  const [intentFilter, setIntentFilter] = useState<"all" | IntentId>("all");
  const [tplCat, setTplCat] = useState("all");
  const [tplSel, setTplSel] = useState<TplSel>({ kind: "play", idx: 0 });

  // ── campaign detail bundle ──────────────────────────────────────────
  const [bundle, setBundle] = useState<DetailBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const bundleReq = useRef(0);

  const loadBundle = useCallback(
    async (id: string) => {
      const req = ++bundleReq.current;
      setBundleLoading(true);
      try {
        const header = await fetchCampaignHeader(id);
        const [steps, agg, deals, sample, companyCount] = await Promise.all([
          listCampaignSteps(id),
          fetchCampaignAggregates(id),
          listDealsForCampaign(id, header.name),
          getSampleEnrolledContact(id),
          countCampaignCompanies(id),
        ]);
        if (req !== bundleReq.current) return;
        setBundle({ header, steps, agg, deals, sample, companyCount, mailboxes: accounts });
      } catch (e) {
        if (req !== bundleReq.current) return;
        toast.error(e instanceof Error ? e.message : "Couldn't load campaign");
        setBundle(null);
      } finally {
        if (req === bundleReq.current) setBundleLoading(false);
      }
    },
    [accounts],
  );

  useEffect(() => {
    if (tab === "campaigns" && campaignId) void loadBundle(campaignId);
    else setBundle(null);
  }, [tab, campaignId, loadBundle]);

  // ── step editor ─────────────────────────────────────────────────────
  const [drawerStepId, setDrawerStepId] = useState<string | null>(null);
  const drawerStep = bundle?.steps.find((s) => s.id === drawerStepId) ?? null;
  const drawerStepIndex =
    drawerStep && bundle ? bundle.steps.findIndex((s) => s.id === drawerStep.id) : -1;
  const drawerStats = drawerStep
    ? bundle?.agg.perStep?.get(drawerStep.id) ?? { sent: 0, opened: 0, replied: 0 }
    : { sent: 0, opened: 0, replied: 0 };

  const [addingStep, setAddingStep] = useState(false);
  const addStep = useCallback(
    async (ch: UiChannel) => {
      if (!campaignId || !bundle) return;
      setAddingStep(true);
      try {
        const maxOrder = bundle.steps.reduce((m, s) => Math.max(m, s.step_order), 0);
        const dbCh = ch === "linkedin" ? "linkedin_invite" : ch === "call" ? "call" : "email";
        const created = await createCampaignStep(campaignId, {
          channel: dbCh,
          step_type: dbCh,
          step_order: maxOrder + 1,
          delay_days: bundle.steps.length > 0 ? 3 : 0,
          subject: ch === "email" ? "Following up on {{top_lane}}" : null,
          metadata: {
            title: ch === "email" ? "New email" : ch === "linkedin" ? "LinkedIn touch" : "Call task",
          },
          linkedin_action: ch === "linkedin" ? "connection_request" : null,
        });
        await loadBundle(campaignId);
        setDrawerStepId(created.id);
        toast.success("Step added");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't add step");
      } finally {
        setAddingStep(false);
      }
    },
    [campaignId, bundle, loadBundle],
  );

  // ── campaign actions ────────────────────────────────────────────────
  const [enrolling, setEnrolling] = useState(false);
  const statusAction = useCallback(async () => {
    if (!bundle || !campaignId) return;
    const st = String(bundle.header.status).toLowerCase();
    try {
      if (st === "active") {
        await pauseCampaign(campaignId);
        toast.success(`${bundle.header.name} paused`);
      } else {
        await resumeCampaign(campaignId);
        toast.success(`${bundle.header.name} is live`);
      }
      await Promise.all([loadBundle(campaignId), refresh()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status change failed");
    }
  }, [bundle, campaignId, loadBundle, refresh]);

  // Pause/Resume/Archive/Delete — shared by the list row menu and the
  // detail header. Delete always confirms.
  const campaignAction = useCallback(
    async (c: { id: string; name: string; status: string }, action: CampaignRowAction) => {
      try {
        if (action === "pause") {
          await pauseCampaign(c.id);
          toast.success(`${c.name} paused`);
        } else if (action === "resume") {
          await resumeCampaign(c.id);
          toast.success(`${c.name} is live`);
        } else if (action === "archive") {
          await archiveCampaign(c.id);
          toast.success(`${c.name} archived`);
        } else {
          const ok = window.confirm(
            `Delete "${c.name}" permanently? Its steps and enrollment go with it. This can't be undone.`,
          );
          if (!ok) return;
          await deleteCampaign(c.id);
          toast.success(`${c.name} deleted`);
        }
        if ((action === "archive" || action === "delete") && campaignId === c.id) {
          nav("campaigns");
        }
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    },
    [campaignId, nav, refresh],
  );

  // "Add audience" adapter modal over the same enrollment path the builder
  // uses (attachCompaniesToCampaign + queue-campaign-recipients).
  const [audienceOpen, setAudienceOpen] = useState(false);

  const enroll = useCallback(async () => {
    if (!campaignId) return;
    setEnrolling(true);
    try {
      const res = await queueCampaignRecipients({ campaign_id: campaignId });
      if (res.ok === false) throw new Error(res.error || "enroll_failed");
      toast.success(
        `${fmtNum(res.enqueued ?? 0)} recipient${(res.enqueued ?? 0) === 1 ? "" : "s"} queued${res.skipped ? ` · ${res.skipped} skipped` : ""}`,
      );
      await loadBundle(campaignId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enroll failed");
    } finally {
      setEnrolling(false);
    }
  }, [campaignId, loadBundle]);

  // ── inbox interactions ──────────────────────────────────────────────
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessageRow[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const openThread = useCallback(
    async (t: ThreadVM) => {
      setSelectedThreadId(t.id);
      setReply("");
      setMsgLoading(true);
      // Optimistic mark-read.
      if (t.unread || !t.raw.read_at) {
        setThreadsRaw((rows) =>
          rows.map((r) =>
            r.id === t.id ? { ...r, unread_count: 0, read_at: new Date().toISOString() } : r,
          ),
        );
        markThreadRead(t.id).catch(() => {
          /* non-fatal; next sync reconciles */
        });
      }
      try {
        const msgs = await listThreadMessages(t.id);
        setMessages(msgs);
        // Persist a classified intent when none is stored yet.
        if (!normalizeIntent(t.raw.intent)) {
          const lastIn = [...msgs].reverse().find((m) => m.direction !== "outbound");
          const it = classifyIntent(t.raw.subject, lastIn?.body_text ?? lastIn?.snippet ?? null);
          if (it) {
            setThreadsRaw((rows) => rows.map((r) => (r.id === t.id ? { ...r, intent: it } : r)));
            setThreadIntent(t.id, it).catch(() => {});
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load thread");
        setMessages([]);
      } finally {
        setMsgLoading(false);
      }
    },
    [],
  );

  const sendReply = useCallback(async () => {
    if (!selectedThreadId || !reply.trim()) return;
    setSending(true);
    try {
      await sendInboxReply(selectedThreadId, reply.trim());
      toast.success("Reply sent");
      setReply("");
      setMessages(await listThreadMessages(selectedThreadId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setSending(false);
    }
  }, [selectedThreadId, reply]);

  const doSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncInbox();
      await loadThreads();
      toast.success("Inbox synced");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [syncing, loadThreads]);

  // Archive a thread — optimistic removal; the list filter hides archived.
  const archiveThreadAction = useCallback(
    async (t: ThreadVM) => {
      setThreadsRaw((rows) => rows.filter((r) => r.id !== t.id));
      setSelectedThreadId((cur) => (cur === t.id ? null : cur));
      try {
        await archiveThread(t.id);
        toast.success("Thread archived");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't archive the thread");
        void loadThreads(); // reconcile the optimistic removal
      }
    },
    [loadThreads],
  );

  const retagIntent = useCallback(
    async (intent: IntentId | null) => {
      if (!selectedThreadId) return;
      setThreadsRaw((rows) =>
        rows.map((r) => (r.id === selectedThreadId ? { ...r, intent } : r)),
      );
      try {
        await setThreadIntent(selectedThreadId, intent);
        toast.success(intent ? `Tagged ${INTENT_META[intent].label}` : "Intent cleared");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save intent");
      }
    },
    [selectedThreadId],
  );

  // ── templates: use template ─────────────────────────────────────────
  const [usingTpl, setUsingTpl] = useState(false);
  const useTemplate = useCallback(
    async (sel: TplSel) => {
      setUsingTpl(true);
      try {
        let newId: string;
        let label: string;
        if (sel.kind === "play") {
          const p = PLAYS[sel.idx];
          label = p.name;
          // channel must be one of email|linkedin|call (save-campaign-draft's
          // VALID_CHANNELS whitelist); the step_type carries the specific
          // linkedin_invite flavor. Sending dbChannel as channel was the bug
          // that 400'd every LinkedIn-bearing play ("Use template" broken).
          const steps = playStepOutline(p).map((s) => ({
            channel: s.channel,
            step_type: s.dbChannel,
            subject: s.subject,
            body: s.body,
            delay_days: s.delayDays,
            metadata: { title: s.title },
          }));
          newId = await createDraftCampaign({
            name: `${p.name} · draft`,
            channels: p.channels,
            audience: p.aud,
            playName: p.name,
            steps,
          });
        } else {
          const t = wsTemplates.find((x) => x.id === sel.id);
          if (!t) throw new Error("Template not found");
          label = t.title;
          newId = await createDraftCampaign({
            name: `${t.title} · draft`,
            channels: ["email"],
            steps: [
              {
                channel: "email",
                step_type: "email",
                subject: t.subject_template,
                body: t.body_template,
                delay_days: 0,
                metadata: { title: t.title },
              },
            ],
          });
        }
        await refresh();
        toast.success(`Draft created from "${label}". Review the steps, then launch.`);
        nav("campaigns", newId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create draft");
      } finally {
        setUsingTpl(false);
      }
    },
    [wsTemplates, refresh, nav],
  );

  // ── mailbox remove (soft: lit_email_accounts.status → 'disconnected') ──
  const [removingMailboxId, setRemovingMailboxId] = useState<string | null>(null);
  const removeMailbox = useCallback(async (m: MailboxVM) => {
    const ok = window.confirm(
      `Disconnect ${m.address}? Campaigns stop sending from this mailbox until you reconnect it.`,
    );
    if (!ok) return;
    setRemovingMailboxId(m.id);
    try {
      await disconnectEmailAccount(m.id);
      toast.success(`${m.address} disconnected`);
      setAccounts(await listEmailAccounts());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect the mailbox");
    } finally {
      setRemovingMailboxId(null);
    }
  }, []);

  // ── mailbox connect ─────────────────────────────────────────────────
  const [connecting, setConnecting] = useState(false);
  const connectMailbox = useCallback(async (provider: "gmail" | "outlook") => {
    setConnecting(true);
    try {
      const start = provider === "gmail" ? oauthGmailStart : oauthOutlookStart;
      const res = await start({ return_url: window.location.href });
      if (res.redirect_url) {
        window.location.assign(res.redirect_url);
      } else {
        throw new Error(res.error || "OAuth start failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start OAuth");
      setConnecting(false);
    }
  }, []);

  // ── hero content per tab ────────────────────────────────────────────
  const tabCounts: Record<OutboundTab, number> = {
    campaigns: kc.activeCount,
    inbox: unreadCount,
    templates: PLAYS.length + wsTemplates.length,
    mailboxes: mailboxes.filter((m) => m.needsAttention).length,
  };

  const em = (v: ReactNode, color = "#0F172A"): ReactNode => (
    <span style={{ color, fontWeight: 600 }}>{v}</span>
  );

  let h1 = "Outbound";
  let gradWord = "Engine";
  let narrative: ReactNode;
  let kpis: KpiDef[];
  if (tab === "inbox") {
    h1 = "Replies,";
    gradWord = "sorted by intent";
    narrative = (
      <>
        {em(fmtNum(iCounts.all))} replies in the inbox, {em(fmtNum(unreadCount), "#2563eb")} unread.{" "}
        {em(fmtNum(iCounts.interested), "#059669")} interested and{" "}
        {em(fmtNum(iCounts.meeting_request), "#6d28d9")} meeting requests are waiting on a response.
      </>
    );
    kpis = [
      { label: "Replies", icon: <ReplyIcon size={14} />, value: fmtNum(iCounts.all), sub: "threads" },
      { label: "Unread", icon: <Mail size={14} />, value: fmtNum(unreadCount), sub: "need a response", subColor: "#2563eb" },
      { label: "Interested", icon: <Zap size={14} />, value: fmtNum(iCounts.interested), sub: "ready for a quote", subColor: "#059669" },
      { label: "Meeting requests", icon: <CalendarCheck size={14} />, value: fmtNum(iCounts.meeting_request), sub: "book today", subColor: "#7c3aed" },
      { label: "Not now", icon: <Clock size={14} />, value: fmtNum(iCounts.not_now), sub: "revisit later" },
      { label: "Out of office", icon: <MessageSquare size={14} />, value: fmtNum(iCounts.out_of_office), sub: "auto-replies" },
    ];
  } else if (tab === "templates") {
    h1 = "Winning plays,";
    gradWord = "ready to launch";
    narrative = (
      <>
        {em(PLAYS.length)} freight plays plus {em(wsTemplates.length)} workspace templates. Pick one,
        review the steps, and it becomes a draft campaign.
      </>
    );
    kpis = [
      { label: "Plays", icon: <Library size={14} />, value: fmtNum(PLAYS.length), sub: `${PLAY_CATS.length} categories` },
      { label: "Your templates", icon: <FileCheck size={14} />, value: fmtNum(wsTemplates.length), sub: "workspace" },
      { label: "Campaigns", icon: <Megaphone size={14} />, value: fmtNum(campaigns.filter((c) => c.status !== "archived").length), sub: `${kc.activeCount} active` },
      { label: "Drafts", icon: <Eye size={14} />, value: fmtNum(campaigns.filter((c) => c.status === "draft").length), sub: "ready to review" },
      { label: "Sent", icon: <Send size={14} />, value: fmtNum(kc.sent), sub: "all campaigns" },
      { label: "Reply rate", icon: <ReplyIcon size={14} />, value: kc.replyRate, sub: "of sends", subColor: "#059669" },
    ];
  } else if (tab === "mailboxes") {
    h1 = "Sending health,";
    gradWord = "at a glance";
    const issues = mailboxes.filter((m) => m.needsAttention).length;
    narrative = (
      <>
        {em(fmtNum(mailboxes.length))} mailbox{mailboxes.length === 1 ? "" : "es"} connected,{" "}
        {em(fmtNum(mbStats?.totals.sent7 ?? 0))} emails sent in the last 7 days.{" "}
        {issues > 0 ? (
          <>{em(fmtNum(issues), "#b45309")} need attention before they hurt deliverability.</>
        ) : (
          <>All mailboxes are healthy.</>
        )}
      </>
    );
    kpis = [
      { label: "Mailboxes", icon: <Mail size={14} />, value: fmtNum(mailboxes.length), sub: "connected" },
      { label: "Sent 7d", icon: <Send size={14} />, value: fmtNum(mbStats?.totals.sent7 ?? 0), sub: "workspace" },
      { label: "Sent 30d", icon: <Send size={14} />, value: fmtNum(mbStats?.totals.sent30 ?? 0), sub: "workspace" },
      { label: "Replies 7d", icon: <ReplyIcon size={14} />, value: fmtNum(mbStats?.totals.replies7 ?? 0), sub: "inbound", subColor: "#059669" },
      { label: "Failed 7d", icon: <CircleAlert size={14} />, value: fmtNum(mbStats?.totals.failed7 ?? 0), sub: "bounced or failed", subColor: (mbStats?.totals.failed7 ?? 0) > 0 ? "#e11d48" : undefined },
      { label: "Needs attention", icon: <CircleAlert size={14} />, value: fmtNum(issues), sub: "reconnect required", subColor: issues > 0 ? "#d97706" : undefined },
    ];
  } else {
    narrative = (
      <>
        {em(kc.activeCount)} active campaign{kc.activeCount === 1 ? "" : "s"} reaching{" "}
        {em(fmtNum(kc.enrolled))} contacts. {em(fmtNum(kc.sent))} sends have produced{" "}
        {em(fmtNum(kc.replied), "#059669")} replies and {em(fmtNum(kc.meetings), "#7c3aed")} meetings.{" "}
        {unreadCount > 0 && <>{em(fmtNum(unreadCount), "#2563eb")} replies are waiting in the inbox.</>}
      </>
    );
    kpis = [
      { label: "Enrolled", icon: <Users size={14} />, value: fmtNum(kc.enrolled), sub: "active contacts" },
      { label: "Sent", icon: <Send size={14} />, value: fmtNum(kc.sent), sub: "all events" },
      { label: "Open rate", icon: <MailOpen size={14} />, value: kc.openRate, sub: "of sends" },
      { label: "Reply rate", icon: <ReplyIcon size={14} />, value: kc.replyRate, sub: `${fmtNum(kc.replied)} replies`, subColor: "#059669" },
      { label: "Meetings", icon: <CalendarCheck size={14} />, value: fmtNum(kc.meetings), sub: "booked from replies", subColor: "#7c3aed" },
      {
        label: "Pipeline sourced",
        icon: <Kanban size={14} />,
        value: dealsSourced ? fmtMoney(dealsSourced.value) : "—",
        sub: dealsSourced ? `${fmtNum(dealsSourced.count)} deals` : "not tracked yet",
        subColor: dealsSourced ? "#059669" : undefined,
      },
    ];
  }

  const detailOpen = tab === "campaigns" && campaignId != null;
  const filteredThreads =
    intentFilter === "all" ? allThreadVMs : allThreadVMs.filter((t) => t.intent === intentFilter);

  return (
    <div style={{ minHeight: "100%", background: "#F1F5F9", fontFamily: FB, color: "#334155" }}>
      <style>{OB2_CSS}</style>

      <Hero
        h1={h1}
        gradWord={gradWord}
        narrative={narrative}
        kpis={kpis}
        tab={tab}
        counts={tabCounts}
        onTab={(t) => nav(t)}
      />

      {/* Sticky toolbar */}
      <Toolbar>
        {detailOpen ? (
          <>
            <GhostBtn onClick={() => nav("campaigns")}>
              <ArrowLeft size={14} /> All campaigns
            </GhostBtn>
            {bundle && (
              <span style={{ font: `600 13px ${FD}`, color: "#0F172A" }}>{bundle.header.name}</span>
            )}
            <div style={{ marginLeft: "auto" }} />
            <GhostBtn disabled title="Coming soon">
              <Eye size={14} /> Preview
            </GhostBtn>
          </>
        ) : tab === "campaigns" ? (
          <>
            {searchBox(q, setQ, "Search campaigns…")}
            <Seg
              items={[
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "paused", label: "Paused" },
                { id: "draft", label: "Drafts" },
              ]}
              cur={ostatus}
              onSelect={setOstatus}
            />
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }} className="ob2-topbtns">
              <GhostBtn onClick={() => nav("templates")}>
                <Library size={14} /> Templates
              </GhostBtn>
              <PrimaryBtn onClick={() => nav("templates")}>
                <Plus size={14} /> New campaign
              </PrimaryBtn>
            </div>
          </>
        ) : tab === "inbox" ? (
          <>
            <Seg
              items={[
                { id: "all", label: `All · ${iCounts.all}` },
                ...INTENT_ORDER.map((k) => ({
                  id: k as string,
                  label: `${INTENT_META[k].label} · ${iCounts[k]}`,
                })),
              ]}
              cur={intentFilter}
              onSelect={(v) => setIntentFilter(v as "all" | IntentId)}
            />
            <div style={{ marginLeft: "auto" }}>
              <GhostBtn onClick={doSync} disabled={syncing}>
                {syncing ? <Loader2 size={14} className="ob2-spin" /> : <RefreshCw size={14} />}
                {syncing ? "Syncing…" : "Sync mailbox"}
              </GhostBtn>
            </div>
          </>
        ) : tab === "templates" ? (
          <>
            {searchBox(q, setQ, "Search templates…")}
            <Seg
              items={[
                { id: "all", label: "All" },
                ...PLAY_CATS.map((c) => ({ id: c, label: c })),
              ]}
              cur={tplCat}
              onSelect={setTplCat}
            />
          </>
        ) : (
          <>
            <span style={{ font: `500 12px ${FB}`, color: "#64748b" }}>
              Connected sending identities for campaigns and the inbox.
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <PrimaryBtn onClick={() => connectMailbox("gmail")} disabled={connecting}>
                <Plus size={14} /> Connect mailbox
              </PrimaryBtn>
            </div>
          </>
        )}
      </Toolbar>

      {/* Content */}
      <div className="ob2-pad" style={{ maxWidth: 1560, margin: "0 auto", padding: "20px 32px 96px" }}>
        {tab === "campaigns" &&
          (detailOpen ? (
            <CampaignDetailView
              bundle={bundle}
              loading={bundleLoading}
              onStatusAction={statusAction}
              onEnroll={enroll}
              enrolling={enrolling}
              onOpenStep={setDrawerStepId}
              onAddStep={addStep}
              addingStep={addingStep}
              onAddAudience={() => setAudienceOpen(true)}
              onArchive={() => {
                if (!bundle) return;
                void campaignAction(
                  { id: bundle.header.id, name: bundle.header.name, status: bundle.header.status },
                  "archive",
                );
              }}
              onDelete={() => {
                if (!bundle) return;
                void campaignAction(
                  { id: bundle.header.id, name: bundle.header.name, status: bundle.header.status },
                  "delete",
                );
              }}
            />
          ) : (
            <CampaignsListView
              campaigns={campaigns}
              loading={campLoading}
              error={campError}
              q={q}
              ostatus={ostatus}
              attention={attention}
              dealsSourced={dealsSourced}
              onOpen={(id) => nav("campaigns", id)}
              onRowAction={(c, a) => void campaignAction(c, a)}
              onReviewMailboxes={() => nav("mailboxes")}
            />
          ))}
        {tab === "inbox" && (
          <InboxView
            vms={filteredThreads}
            loading={threadsLoading}
            error={threadsError}
            selectedId={selectedThreadId}
            onSelect={openThread}
            messages={messages}
            msgLoading={msgLoading}
            reply={reply}
            setReply={setReply}
            onSend={sendReply}
            sending={sending}
            onSetIntent={retagIntent}
            onArchive={(t) => void archiveThreadAction(t)}
          />
        )}
        {tab === "templates" && (
          <TemplatesView
            cat={tplCat}
            q={q}
            wsTemplates={wsTemplates}
            campaigns={campaigns}
            sel={tplSel}
            setSel={setTplSel}
            onUse={useTemplate}
            using={usingTpl}
          />
        )}
        {tab === "mailboxes" && (
          <MailboxesView
            vms={mailboxes}
            loading={mbLoading}
            stats={mbStats}
            onConnect={connectMailbox}
            connecting={connecting}
            onRemove={(m) => void removeMailbox(m)}
            removingId={removingMailboxId}
          />
        )}
      </div>

      {/* Add-audience adapter modal (campaign detail) */}
      {audienceOpen && campaignId && bundle && (
        <AddAudienceModal
          campaignId={campaignId}
          campaignName={bundle.header.name}
          onClose={() => setAudienceOpen(false)}
          onDone={() => {
            void loadBundle(campaignId);
            void refresh();
          }}
        />
      )}

      {/* Step editor drawer */}
      {drawerStep && bundle && campaignId && (
        <StepEditorDrawer
          step={drawerStep}
          stepIndex={drawerStepIndex}
          campaignName={bundle.header.name}
          stats={drawerStats}
          sample={bundle.sample}
          onClose={() => setDrawerStepId(null)}
          onSaved={() => {
            setDrawerStepId(null);
            void loadBundle(campaignId);
          }}
          onDeleted={() => {
            setDrawerStepId(null);
            void loadBundle(campaignId);
          }}
        />
      )}
    </div>
  );
}
