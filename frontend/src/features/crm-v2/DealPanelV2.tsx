/**
 * DealPanelV2 — the 600px dark deal drawer (handoff README §Deal panel).
 * Self-contained: fetches its own activity / line items / committee /
 * contact-picker rows, performs real writes (setStage, next-step, markLost,
 * line items, committee, activity log) and owns its Lost-reason modal.
 * Shipment-intelligence cells render "—" unless a real `intel` prop is
 * provided — nothing is invented.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  CalendarCheck,
  CircleAlert,
  GitCommitHorizontal,
  Mail,
  Phone,
  Plus,
  Ship,
  StickyNote,
  Trophy,
  X,
} from "lucide-react";
import LogoTile from "@/features/dashboard/components/LogoTile";
import { formatMoney, initials, avatarColor } from "@/features/crm/crmFormat";
import { listDealActivity, listCompanyContacts, type DealStage, type DealActivity } from "@/api/crm";
import {
  addCommitteeMember,
  addLineItem,
  clearNextStep,
  createTaskV2,
  deleteLineItem,
  incrementRuleRunCount,
  listCommittee,
  listLineItems,
  logDealActivity,
  markLost,
  removeCommitteeMember,
  setNextStep,
  setStage,
  type AutomationRule,
  type DealCardV2,
} from "./api";
import {
  selectHarveyNBA,
  suggestStep,
  stageProbability,
  dueLabel,
  laneUnitsOf,
  type CompanyHealth,
} from "./data/computeCrm";
import LostReasonModal from "./LostReasonModal";
import { Crm2Style, CYAN, DRAWER_EASE, F_BODY, F_DISPLAY, F_MONO } from "./ui";

/** Optional company-derived shipment info (never invented when absent). */
export type DealIntel = {
  signal?: string | null;
  carrier?: string | null;
  cadenceDays?: number | null;
  lastShipmentLabel?: string | null;
};

export interface DealPanelV2Props {
  deal: DealCardV2;
  stages: DealStage[];
  rules: AutomationRule[];
  onClose: () => void;
  /** Called after any successful write so the caller can refetch. */
  onChanged: () => void;
  intel?: DealIntel | null;
  healthByCompanyUuid?: Record<string, CompanyHealth>;
  members?: Array<{ user_id: string; name: string }>;
}

const ROLE_COLORS: Record<string, string> = {
  "Decision maker": "#a78bfa",
  Champion: "#34d399",
  Influencer: "#60a5fa",
  User: "#94a3b8",
};
const ROLES = ["Decision maker", "Champion", "Influencer", "User"];

function agoLabel(isoTs: string): string {
  const t = new Date(isoTs).getTime();
  if (Number.isNaN(t)) return "—";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) {
    const hrs = Math.floor((Date.now() - t) / 3_600_000);
    return hrs <= 0 ? "Just now" : `${hrs}h ago`;
  }
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function activityIcon(a: DealActivity): { Icon: typeof Mail; color: string } {
  const subkind = (a.body as any)?.subkind;
  switch (a.kind) {
    case "stage_change":
      return { Icon: GitCommitHorizontal, color: "#a78bfa" };
    case "email":
      return { Icon: Mail, color: "#60a5fa" };
    case "meeting":
      return { Icon: CalendarCheck, color: "#34d399" };
    case "created":
      return { Icon: Plus, color: "#94a3b8" };
    case "task":
      return { Icon: CalendarCheck, color: "#34d399" };
    case "note":
    default:
      if (subkind === "call") return { Icon: Phone, color: "#34d399" };
      if (subkind === "shipment") return { Icon: Ship, color: CYAN };
      if (subkind === "signal") return { Icon: Activity, color: CYAN };
      return { Icon: StickyNote, color: "#fbbf24" };
  }
}

const label = (t: string) => (
  <div style={{ font: `600 10px ${F_MONO}`, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>{t}</div>
);

export default function DealPanelV2({
  deal,
  stages,
  rules,
  onClose,
  onChanged,
  intel,
  healthByCompanyUuid,
  members = [],
}: DealPanelV2Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [lostOpen, setLostOpen] = useState(false);
  const [draftStep, setDraftStep] = useState("");
  const [logKind, setLogKind] = useState<"call" | "email" | "note">("call");
  const [logText, setLogText] = useState("");
  const [addingLane, setAddingLane] = useState(false);
  const [lane, setLane] = useState({ label: "", origin: "", teu: "", rate: "" });
  const [addingMember, setAddingMember] = useState(false);
  const [pickContact, setPickContact] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [pickRole, setPickRole] = useState<string>("Decision maker");

  const stage = stages.find((s) => s.id === deal.stage_id);
  const isClosed = deal.status !== "open";
  const p = stageProbability(stage, stages);
  const value = Number(deal.value_amount) || 0;
  const orderedStages = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);
  const stageIdx = orderedStages.findIndex((s) => s.id === deal.stage_id);
  const nba = selectHarveyNBA(deal, stages, Date.now(), healthByCompanyUuid);
  const memberName = (uid: string | null) => members.find((m) => m.user_id === uid)?.name ?? null;

  const activityQ = useQuery({ queryKey: ["crm-v2", "activity", deal.id], queryFn: () => listDealActivity(deal.id) });
  const lanesQ = useQuery({ queryKey: ["crm-v2", "line-items", deal.id], queryFn: () => listLineItems(deal.id) });
  const committeeQ = useQuery({ queryKey: ["crm-v2", "committee", deal.id], queryFn: () => listCommittee(deal.id) });
  const contactsQ = useQuery({
    queryKey: ["crm-v2", "company-contacts", deal.company_id ?? "none"],
    queryFn: () => listCompanyContacts(deal.company_id),
    enabled: !!deal.company_id,
  });

  const refetchLocal = (key: string) => qc.invalidateQueries({ queryKey: ["crm-v2", key, deal.id] });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !lostOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, lostOpen]);

  // ── Stage moves (spec §Stage-move side effects) ──────────────────────
  const quotedRule = rules.find((r) => r.rule_key === "quoted_followup");
  const doMove = async (to: DealStage) => {
    if (to.id === deal.stage_id) return;
    if (to.is_lost) {
      setLostOpen(true);
      return;
    }
    try {
      await setStage(deal.id, to, stage?.name ?? null);
      const isQuotedLike = to.name.trim().toLowerCase() === "quoted";
      if (isQuotedLike && quotedRule?.enabled) {
        const due = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
        await createTaskV2({
          title: "Follow up on quote",
          task_type: "call",
          due_date: due,
          deal_id: deal.id,
          assignee_user_id: deal.owner_user_id,
          source: "automation",
          trigger_label: `Stage → ${to.name}`,
        });
        void incrementRuleRunCount("quoted_followup");
        toast(`Automation: created “Follow up on quote” for ${deal.companyName ?? deal.title}, due in 2 days`);
      } else if (to.is_won) {
        toast(`${deal.companyName ?? deal.title} won · ${formatMoney(value)}. Harvey will watch for expansion lanes.`);
      } else if (!deal.next_step_text) {
        toast(`Moved to ${to.name}. Add a next step to keep it moving.`);
      } else {
        toast(`${deal.companyName ?? deal.title} moved to ${to.name}`);
      }
      void refetchLocal("activity");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Move failed");
    }
  };

  const confirmLost = async (reason: string) => {
    const lostStage = stages.find((s) => s.is_lost);
    if (!lostStage) throw new Error("This pipeline has no Lost stage.");
    await markLost(deal.id, reason, lostStage, stage?.name ?? null);
    setLostOpen(false);
    void refetchLocal("activity");
    onChanged();
  };

  // ── Next step ────────────────────────────────────────────────────────
  const saveStep = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    try {
      const due = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      await setNextStep(deal.id, t, due);
      setDraftStep("");
      toast("Next step saved · due in 2 days");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the next step");
    }
  };
  const doneStep = async () => {
    try {
      await clearNextStep(deal.id, { completedText: deal.next_step_text });
      toast("Step done. Set the next one to keep the deal moving.");
      void refetchLocal("activity");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not complete the step");
    }
  };

  const stepDueDiff = useMemo(() => {
    if (!deal.next_step_due) return null;
    const d = new Date(deal.next_step_due + "T00:00:00");
    if (Number.isNaN(d.getTime())) return null;
    const n = new Date();
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    return Math.round((d.getTime() - today) / 86_400_000);
  }, [deal.next_step_due]);

  // ── Activity composer ────────────────────────────────────────────────
  const saveLog = async () => {
    const t = logText.trim();
    if (!t) return;
    try {
      if (logKind === "email") await logDealActivity(deal.id, "email", { text: t });
      else if (logKind === "call") await logDealActivity(deal.id, "note", { text: t, subkind: "call" });
      else await logDealActivity(deal.id, "note", { text: t });
      setLogText("");
      void refetchLocal("activity");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not log activity");
    }
  };

  // ── Lanes ────────────────────────────────────────────────────────────
  const submitLane = async () => {
    if (!lane.label.trim()) return;
    try {
      await addLineItem(deal.id, {
        lane_label: lane.label.trim(),
        origin_code: lane.origin.trim() || null,
        teu: lane.teu ? Number(lane.teu) : null,
        rate_usd: lane.rate ? Number(lane.rate) : null,
      });
      setLane({ label: "", origin: "", teu: "", rate: "" });
      setAddingLane(false);
      toast("Lane added to the deal");
      void refetchLocal("line-items");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the lane");
    }
  };

  // ── Committee ────────────────────────────────────────────────────────
  const submitMember = async () => {
    try {
      const contacts = contactsQ.data ?? [];
      const chosen = contacts.find((c) => c.id === pickContact);
      const name = chosen?.full_name ?? manualName.trim();
      if (!name) return;
      await addCommitteeMember(deal.id, {
        contact_id: chosen?.id ?? null,
        name,
        title: chosen?.title ?? (manualTitle.trim() || null),
        role: pickRole,
      });
      setAddingMember(false);
      setPickContact("");
      setManualName("");
      setManualTitle("");
      toast(`${name} added as ${pickRole}`);
      void refetchLocal("committee");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the contact");
    }
  };

  const committee = committeeQ.data ?? [];
  const noDM = !committee.some((c) => c.role === "Decision maker");
  const lanes = lanesQ.data ?? [];
  const lanesTotal = lanes.reduce((s, l) => s + (Number(l.value_usd) || 0), 0);

  const sourceLabel =
    (deal.source || "manual").toLowerCase() === "signal"
      ? "From shipment signal"
      : (deal.source || "manual").toLowerCase() === "outbound"
        ? "From Outbound Engine"
        : "Added manually";
  const closeLabel = deal.expected_close_date
    ? new Date(deal.expected_close_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : null;
  const laneLabel =
    deal.origin && deal.destination ? `${deal.origin} → ${deal.destination}` : deal.origin || deal.destination || null;
  const serviceLabel = deal.service_type ? deal.service_type.replace(/_/g, " ") : "Deal";
  // Service-aware line-item units (TEU / Loads / kg / Qty) — stored in the
  // existing teu / rate_usd columns unchanged.
  const units = laneUnitsOf(deal.service_type);

  const darkInput: CSSProperties = {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 9,
    color: "#e2e8f0",
    padding: "8px 10px",
    font: `400 13px ${F_BODY}`,
    outline: "none",
    minWidth: 0,
  };
  const intelCell = (l: string, v: string | null | undefined) => (
    <div style={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px" }}>
      {label(l)}
      <div style={{ marginTop: 5, font: `600 13px ${F_BODY}`, color: v ? "#e2e8f0" : "#475569" }}>{v || "—"}</div>
    </div>
  );

  return (
    <>
      <div
        className="crm2-scrim"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(2,6,23,0.35)" }}
      />
      <aside
        className="crm2-drawer"
        role="dialog"
        aria-label={`Deal · ${deal.companyName ?? deal.title}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 71,
          width: 600,
          maxWidth: "100vw",
          background: "#0F172A",
          borderLeft: "1px solid #1F2937",
          boxShadow: "-20px 0 40px rgba(2,6,23,0.4)",
          display: "flex",
          flexDirection: "column",
          transition: `transform 350ms ${DRAWER_EASE}`,
        }}
      >
        <Crm2Style />
        {/* Header */}
        <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 10px ${F_MONO}`, letterSpacing: "0.14em", textTransform: "uppercase", color: CYAN }}>
                Deal · {serviceLabel} · {sourceLabel}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                <LogoTile name={deal.companyName ?? deal.title} domain={deal.companyDomain} size={48} radius={12} dark />
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: `700 22px ${F_DISPLAY}`, color: "#f8fafc", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {deal.companyName ?? deal.title}
                  </div>
                  <div style={{ font: `400 12px ${F_BODY}`, color: "#94a3b8", marginTop: 2 }}>
                    {[serviceLabel !== "Deal" ? serviceLabel : null, laneLabel, closeLabel ? `closes ${closeLabel}` : null, deal.ownerName]
                      .filter(Boolean)
                      .join(" · ") || deal.title}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={{ font: `600 22px ${F_MONO}`, color: CYAN, textShadow: "0 0 12px rgba(0,240,255,0.35)" }}>
                {formatMoney(value)}
              </div>
              <div style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8" }}>{formatMoney(value * p)} weighted</div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="crm2-press crm2-focus"
              style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, marginLeft: 4 }}
            >
              <X size={18} />
            </button>
          </div>
          {/* Stage stepper */}
          <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
            {orderedStages.map((s, i) => {
              const on = s.id === deal.stage_id;
              const past = i < stageIdx && deal.status !== "lost";
              return (
                <button
                  key={s.id}
                  type="button"
                  className="crm2-press crm2-focus"
                  onClick={() => doMove(s)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    font: `600 11px ${F_DISPLAY}`,
                    background: on ? s.color : past ? `${s.color}40` : "#1e293b",
                    color: on ? "#020617" : past ? "#e2e8f0" : "#94a3b8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Harvey NBA */}
          <div
            style={{
              background: "linear-gradient(135deg,rgba(0,240,255,0.10),rgba(59,130,246,0.08))",
              border: "1px solid rgba(0,240,255,0.3)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ font: `600 10px ${F_MONO}`, letterSpacing: "0.14em", textTransform: "uppercase", color: CYAN }}>
              Harvey · next best action
            </div>
            <div style={{ font: `600 15px ${F_DISPLAY}`, color: "#f8fafc", marginTop: 8 }}>{nba.title}</div>
            <div style={{ font: `400 13px/1.5 ${F_BODY}`, color: "#cbd5e1", marginTop: 4 }}>{nba.body}</div>
            {nba.rule === "no-step" && !isClosed ? (
              <button
                type="button"
                className="crm2-press crm2-focus"
                onClick={() => saveStep(suggestStep(deal, stages))}
                style={{
                  marginTop: 10,
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 999,
                  padding: "7px 14px",
                  background: CYAN,
                  color: "#020617",
                  font: `700 12px ${F_DISPLAY}`,
                  boxShadow: "0 0 12px rgba(0,240,255,0.35)",
                }}
              >
                {nba.cta}
              </button>
            ) : (
              <button
                type="button"
                disabled
                title="Coming soon"
                style={{
                  marginTop: 10,
                  border: "none",
                  borderRadius: 999,
                  padding: "7px 14px",
                  background: "rgba(0,240,255,0.25)",
                  color: "#020617",
                  font: `700 12px ${F_DISPLAY}`,
                  cursor: "default",
                  opacity: 0.6,
                }}
              >
                {nba.cta}
              </button>
            )}
          </div>

          {/* Next step (REQUIRED for open deals) */}
          {!isClosed && (
            <div>
              {label("Next step · required")}
              {deal.next_step_text ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 8,
                    background: "#020617",
                    border: "1px solid #1e293b",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <CalendarCheck size={15} color="#0891b2" style={{ flex: "none" }} />
                  <div style={{ flex: 1, minWidth: 0, font: `600 13px ${F_BODY}`, color: "#e2e8f0" }}>{deal.next_step_text}</div>
                  <span style={{ font: `500 11px ${F_MONO}`, color: stepDueDiff != null && stepDueDiff < 0 ? "#fb7185" : "#94a3b8", flex: "none" }}>
                    {dueLabel(stepDueDiff)}
                  </span>
                  <button
                    type="button"
                    className="crm2-press crm2-focus"
                    onClick={doneStep}
                    style={{ border: "1px solid #334155", background: "transparent", color: "#e2e8f0", borderRadius: 8, padding: "5px 12px", font: `600 12px ${F_DISPLAY}`, cursor: "pointer", flex: "none" }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 8,
                    background: "rgba(244,63,94,0.08)",
                    border: "1px solid rgba(244,63,94,0.35)",
                    borderRadius: 10,
                    padding: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, font: `600 13px ${F_BODY}`, color: "#fb7185" }}>
                    <CircleAlert size={14} /> No next step on this deal
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <input
                      value={draftStep}
                      onChange={(e) => setDraftStep(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveStep(draftStep)}
                      placeholder="What happens next?"
                      style={{ ...darkInput, flex: 1 }}
                    />
                    <button
                      type="button"
                      className="crm2-press crm2-focus"
                      onClick={() => saveStep(draftStep)}
                      style={{ border: "none", background: "#3b82f6", color: "#fff", borderRadius: 9, padding: "0 14px", font: `600 12px ${F_DISPLAY}`, cursor: "pointer" }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Shipment intelligence 2×2 */}
          <div>
            {label("Shipment intelligence")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              {intelCell("Signal", intel?.signal)}
              {intelCell("Current carrier", intel?.carrier)}
              {intelCell("Cadence", intel?.cadenceDays ? `Every ~${intel.cadenceDays} days` : null)}
              {intelCell("Last shipment", intel?.lastShipmentLabel)}
            </div>
          </div>

          {/* Lanes on this deal */}
          <div>
            {label("Lanes on this deal")}
            <div style={{ marginTop: 8, border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden" }}>
              {lanes.length === 0 && !addingLane ? (
                <div style={{ padding: "14px 12px", font: `400 12px ${F_BODY}`, color: "#64748b" }}>
                  No lane line items yet.
                </div>
              ) : (
                lanes.map((l) => (
                  <div
                    key={l.id}
                    style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 76px 84px 76px 24px", gap: 8, alignItems: "center", padding: "9px 12px", borderBottom: "1px solid #1e293b" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {l.origin_code ? (
                        <span style={{ font: `600 10px ${F_MONO}`, color: "#fff", background: "#334155", borderRadius: 4, padding: "2px 5px", flex: "none" }}>
                          {l.origin_code}
                        </span>
                      ) : null}
                      <span style={{ font: `600 12px ${F_BODY}`, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.lane_label}</span>
                    </div>
                    <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8", textAlign: "right" }}>{l.teu != null ? `${l.teu} ${units.qty}` : "—"}</span>
                    <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8", textAlign: "right" }}>{l.rate_usd != null ? `${formatMoney(l.rate_usd)}/${units.per}` : "—"}</span>
                    <span style={{ font: `600 12px ${F_MONO}`, color: "#e2e8f0", textAlign: "right" }}>{l.value_usd != null ? formatMoney(l.value_usd) : "—"}</span>
                    <button
                      type="button"
                      aria-label="Remove lane"
                      className="crm2-press crm2-focus"
                      onClick={async () => {
                        try {
                          await deleteLineItem(l.id);
                          toast("Lane removed");
                          void refetchLocal("line-items");
                        } catch (e: any) {
                          toast.error(e?.message ?? "Could not remove the lane");
                        }
                      }}
                      style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", padding: 2 }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))
              )}
              {lanes.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: addingLane ? "1px solid #1e293b" : "none" }}>
                  <span style={{ font: `600 11px ${F_DISPLAY}`, color: "#94a3b8" }}>Deal value</span>
                  <span style={{ font: `600 14px ${F_MONO}`, color: CYAN }}>{formatMoney(lanesTotal)}</span>
                </div>
              )}
              {addingLane ? (
                <div style={{ padding: 12, display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 64px 64px 76px auto", gap: 6 }}>
                  <input value={lane.label} onChange={(e) => setLane({ ...lane, label: e.target.value })} placeholder="Lane (origin → destination)" style={darkInput} />
                  <input value={lane.origin} onChange={(e) => setLane({ ...lane, origin: e.target.value.toUpperCase() })} placeholder="CN" maxLength={3} style={darkInput} />
                  <input value={lane.teu} onChange={(e) => setLane({ ...lane, teu: e.target.value.replace(/[^\d]/g, "") })} placeholder={units.qty} inputMode="numeric" style={darkInput} />
                  <input value={lane.rate} onChange={(e) => setLane({ ...lane, rate: e.target.value.replace(/[^\d]/g, "") })} placeholder={`$/${units.per}`} inputMode="numeric" style={darkInput} />
                  <button type="button" className="crm2-press crm2-focus" onClick={submitLane} style={{ border: "none", background: "#3b82f6", color: "#fff", borderRadius: 9, padding: "0 12px", font: `600 12px ${F_DISPLAY}`, cursor: "pointer" }}>
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="crm2-press crm2-focus"
                  onClick={() => setAddingLane(true)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", color: CYAN, font: `600 12px ${F_DISPLAY}`, cursor: "pointer" }}
                >
                  + Add lane
                </button>
              )}
            </div>
            {lanes.length > 0 && (
              <div style={{ marginTop: 6, font: `400 11px ${F_BODY}`, color: "#64748b" }}>
                From {lanes.length} lane line item{lanes.length > 1 ? "s" : ""}.
              </div>
            )}
          </div>

          {/* Buying committee */}
          <div>
            {label("Buying committee")}
            {noDM && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "9px 12px", font: `600 12px ${F_BODY}`, color: "#fbbf24" }}>
                <CircleAlert size={14} style={{ flex: "none" }} />
                No decision maker mapped. Find a VP or C-level contact.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {committee.map((c) => {
                const roleColor = ROLE_COLORS[c.role] ?? "#94a3b8";
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: avatarColor(c.name), color: "#fff", font: `700 11px ${F_DISPLAY}` }}>
                      {initials(c.name)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: `600 13px ${F_BODY}`, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      {c.title ? <div style={{ font: `400 11px ${F_BODY}`, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div> : null}
                    </div>
                    <span style={{ font: `600 10px ${F_DISPLAY}`, color: roleColor, background: `${roleColor}22`, borderRadius: 999, padding: "3px 9px", flex: "none" }}>{c.role}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      className="crm2-press crm2-focus"
                      onClick={async () => {
                        try {
                          await removeCommitteeMember(c.id);
                          void refetchLocal("committee");
                        } catch (e: any) {
                          toast.error(e?.message ?? "Could not remove");
                        }
                      }}
                      style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", padding: 2, flex: "none" }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
              {addingMember ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#020617", border: "1px solid #1e293b", borderRadius: 10, padding: 10 }}>
                  {(contactsQ.data?.length ?? 0) > 0 ? (
                    <select value={pickContact} onChange={(e) => setPickContact(e.target.value)} style={{ ...darkInput }}>
                      <option value="">Pick a contact…</option>
                      {(contactsQ.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                          {c.title ? ` · ${c.title}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Name" style={darkInput} />
                      <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Title" style={darkInput} />
                    </>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={pickRole} onChange={(e) => setPickRole(e.target.value)} style={{ ...darkInput, flex: 1 }}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="crm2-press crm2-focus" onClick={submitMember} style={{ border: "none", background: "#3b82f6", color: "#fff", borderRadius: 9, padding: "0 12px", font: `600 12px ${F_DISPLAY}`, cursor: "pointer" }}>
                      Add
                    </button>
                    <button type="button" className="crm2-press crm2-focus" onClick={() => setAddingMember(false)} style={{ border: "1px solid #334155", background: "transparent", color: "#94a3b8", borderRadius: 9, padding: "0 10px", font: `600 12px ${F_DISPLAY}`, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="crm2-press crm2-focus" onClick={() => setAddingMember(true)} style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: CYAN, font: `600 12px ${F_DISPLAY}`, cursor: "pointer", padding: "4px 0" }}>
                  + Add contact
                </button>
              )}
            </div>
          </div>

          {/* Activity */}
          <div>
            {label("Activity")}
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <div style={{ display: "flex", background: "#020617", border: "1px solid #1e293b", borderRadius: 9, padding: 2, flex: "none" }}>
                {([
                  ["call", "Log call"],
                  ["email", "Email"],
                  ["note", "Note"],
                ] as const).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className="crm2-press crm2-focus"
                    onClick={() => setLogKind(k)}
                    style={{ border: "none", cursor: "pointer", borderRadius: 7, padding: "5px 9px", background: logKind === k ? "#1e293b" : "transparent", color: logKind === k ? "#f8fafc" : "#94a3b8", font: `600 11px ${F_DISPLAY}`, whiteSpace: "nowrap" }}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <input
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveLog()}
                placeholder={logKind === "call" ? "Call outcome, what was agreed…" : logKind === "email" ? "Subject or summary…" : "Add a note…"}
                style={{ ...darkInput, flex: 1 }}
              />
              <button type="button" className="crm2-press crm2-focus" onClick={saveLog} style={{ border: "none", background: "#3b82f6", color: "#fff", borderRadius: 9, padding: "8px 13px", font: `600 12px ${F_DISPLAY}`, cursor: "pointer", flex: "none" }}>
                Log
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              {(activityQ.data ?? []).map((a) => {
                const { Icon, color } = activityIcon(a);
                const text =
                  typeof (a.body as any)?.text === "string"
                    ? (a.body as any).text
                    : a.kind === "stage_change" && typeof (a.body as any)?.to === "string"
                      ? `Moved to ${(a.body as any).to}`
                      : a.kind;
                return (
                  <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", background: "#1e293b" }}>
                      <Icon size={13} color={color} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: `400 13px/1.4 ${F_BODY}`, color: "#e2e8f0", overflowWrap: "anywhere" }}>{text}</div>
                      <div style={{ font: `400 11px ${F_BODY}`, color: "#64748b", marginTop: 2 }}>
                        {memberName(a.actor_user_id) ?? (a.actor_user_id ? "Teammate" : "LIT data")}
                      </div>
                    </div>
                    <span style={{ font: `400 11px ${F_MONO}`, color: "#64748b", flex: "none" }}>{agoLabel(a.created_at)}</span>
                  </div>
                );
              })}
              {!activityQ.isLoading && (activityQ.data ?? []).length === 0 && (
                <div style={{ font: `400 12px ${F_BODY}`, color: "#64748b" }}>No activity yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid #1e293b" }}>
          <button
            type="button"
            className="crm2-press crm2-focus"
            disabled={!deal.companyKey}
            title={deal.companyKey ? undefined : "No company profile linked"}
            onClick={() => deal.companyKey && navigate(`/app/companies/${deal.companyKey}`)}
            style={{ border: "1px solid #334155", background: "transparent", color: deal.companyKey ? "#e2e8f0" : "#475569", borderRadius: 10, padding: "9px 14px", font: `600 12px ${F_DISPLAY}`, cursor: deal.companyKey ? "pointer" : "default" }}
          >
            Company Profile →
          </button>
          <span style={{ flex: 1 }} />
          {!isClosed && (
            <>
              <button
                type="button"
                className="crm2-press crm2-focus"
                onClick={() => setLostOpen(true)}
                style={{ border: "1px solid rgba(244,63,94,0.5)", background: "transparent", color: "#fb7185", borderRadius: 10, padding: "9px 16px", font: `600 12px ${F_DISPLAY}`, cursor: "pointer" }}
              >
                Lost
              </button>
              <button
                type="button"
                className="crm2-press crm2-focus"
                onClick={() => {
                  const won = stages.find((s) => s.is_won);
                  if (won) void doMove(won);
                  else toast.error("This pipeline has no Won stage.");
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "#10b981", color: "#022c22", borderRadius: 10, padding: "9px 16px", font: `700 12px ${F_DISPLAY}`, cursor: "pointer", boxShadow: "0 0 14px rgba(16,185,129,0.4)" }}
              >
                <Trophy size={13} /> Won
              </button>
            </>
          )}
        </div>
      </aside>
      {lostOpen && (
        <LostReasonModal
          companyName={deal.companyName ?? deal.title}
          onCancel={() => setLostOpen(false)}
          onConfirm={confirmLost}
        />
      )}
    </>
  );
}
