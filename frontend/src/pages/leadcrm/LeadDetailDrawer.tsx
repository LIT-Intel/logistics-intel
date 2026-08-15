"use client";

/**
 * Lead detail drawer — mirrors `frontend/src/features/crm/DealDetailDrawer`.
 *
 * Right-hand slide-over with the same layout language: white header on a slate
 * scrim, stacked white "Section" cards, Space Grotesk labels. Surfaces:
 *   - Header: name / email / company + current stage badge
 *   - Stage picker  → lit_leadcrm_set_stage
 *   - Assignee picker → lit_leadcrm_assign
 *   - Subscription / plan panel (from get_lead: plan/status/trial/converted)
 *   - Activity timeline (lit_leadcrm_lead_timeline) with source-badged entries
 *   - Note composer (lit_leadcrm_add_note) + Log touch (call/email → log_touch)
 *
 * Mutations refresh the lead + timeline in place and call `onChanged()` so the
 * parent list re-reads. Everything null-safe: the backend is near-empty until
 * backfill, so every field renders a clean "—" rather than crashing.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Phone,
  Mail,
  StickyNote,
  Magnet,
  Package,
  Presentation,
  Hand,
  Cog,
  Building2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import {
  type Lead,
  type LeadStage,
  type LeadTimelineEntry,
  type Assignee,
  getLead,
  getLeadTimeline,
  setStage as apiSetStage,
  assignLead,
  addNote,
  logTouch,
} from "@/api/leadCrm";
import {
  FONT_HEAD,
  FONT_BODY,
  FONT_MONO,
  formatDate,
  formatRelative,
  initials,
  avatarColor,
  stageBadgeStyle,
  leadDisplayName,
  sourceMeta,
} from "./leadCrmFormat";
import { CompanyPanel, ContactsPanel } from "./LeadCompanyPanels";

type Tab = "activity" | "details";

export default function LeadDetailDrawer({
  lead: initialLead,
  stages,
  assignees,
  onClose,
  onChanged,
}: {
  lead: Lead;
  stages: LeadStage[];
  assignees: Assignee[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead>(initialLead);
  const [timeline, setTimeline] = useState<LeadTimelineEntry[]>([]);
  const [tab, setTab] = useState<Tab>("activity");

  const [stageId, setStageId] = useState<string>(initialLead.stage_id ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(initialLead.assigned_to ?? "");
  const [savingStage, setSavingStage] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);

  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [touchText, setTouchText] = useState("");
  const [touchBusy, setTouchBusy] = useState<"call" | "email" | null>(null);

  const name = leadDisplayName(lead.full_name, lead.email);
  const currentStage = useMemo(
    () => stages.find((s) => s.id === (lead.stage_id ?? stageId)),
    [stages, lead.stage_id, stageId],
  );

  // Load the full lead record (resolved subscription summary) + timeline.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [full, tl] = await Promise.all([
        getLead(initialLead.id),
        getLeadTimeline(initialLead.id),
      ]);
      if (!alive) return;
      if (full) {
        setLead(full);
        setStageId(full.stage_id ?? "");
        setAssigneeId(full.assigned_to ?? "");
      }
      setTimeline(tl);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLead.id]);

  async function refresh() {
    const [full, tl] = await Promise.all([getLead(lead.id), getLeadTimeline(lead.id)]);
    if (full) setLead(full);
    setTimeline(tl);
    onChanged();
  }

  async function handleStage(next: string) {
    if (!next || next === lead.stage_id) return;
    setSavingStage(true);
    const prev = stageId;
    setStageId(next);
    try {
      await apiSetStage(lead.id, next);
      toast({ title: "Stage updated" });
      await refresh();
    } catch (e: any) {
      setStageId(prev);
      toast({ title: "Could not update stage", description: e?.message, variant: "destructive" });
    } finally {
      setSavingStage(false);
    }
  }

  async function handleAssign(next: string) {
    if (!next || next === lead.assigned_to) return;
    setSavingAssignee(true);
    const prev = assigneeId;
    setAssigneeId(next);
    try {
      await assignLead(lead.id, next);
      toast({ title: "Lead assigned" });
      await refresh();
    } catch (e: any) {
      setAssigneeId(prev);
      toast({ title: "Could not assign", description: e?.message, variant: "destructive" });
    } finally {
      setSavingAssignee(false);
    }
  }

  async function handleAddNote() {
    const body = noteText.trim();
    if (!body) return;
    setNoteBusy(true);
    try {
      await addNote(lead.id, body);
      setNoteText("");
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not add note", description: e?.message, variant: "destructive" });
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleTouch(channel: "call" | "email") {
    const body = touchText.trim() || `Logged ${channel}`;
    setTouchBusy(channel);
    try {
      await logTouch(lead.id, channel, body);
      setTouchText("");
      toast({ title: channel === "call" ? "Call logged" : "Email logged" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not log touch", description: e?.message, variant: "destructive" });
    } finally {
      setTouchBusy(null);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(560px, 100%)",
          height: "100%",
          background: "#F8FAFC",
          boxShadow: "-8px 0 24px rgba(15,23,42,0.12)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #E5E7EB",
            background: "#FFFFFF",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: avatarColor(name),
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT_HEAD,
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials(name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {name}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {lead.email || "No email"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {currentStage ? <span style={stageBadgeStyle(currentStage.color)}>{currentStage.name}</span> : null}
              {lead.company_name || lead.company_domain ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY, fontSize: 11.5, color: "#475569" }}>
                  {lead.company_domain || lead.company_logo_url ? (
                    <CompanyAvatar
                      name={lead.company_name || lead.company_domain || "Company"}
                      domain={lead.company_domain}
                      logoUrl={lead.company_logo_url}
                      size="sm"
                      className="!h-4 !w-4 !rounded"
                    />
                  ) : (
                    <Building2 style={{ width: 12, height: 12 }} />
                  )}
                  {lead.company_name || lead.company_domain}
                </span>
              ) : null}
            </div>
          </div>
          <button onClick={onClose} style={iconBtn} title="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, padding: "0 20px", borderBottom: "1px solid #E5E7EB", background: "#FFFFFF" }}>
          <DrawerTab active={tab === "activity"} onClick={() => setTab("activity")} label="Activity" />
          <DrawerTab active={tab === "details"} onClick={() => setTab("details")} label="Details" />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Stage + Assignee pickers — always visible so reps can work the lead
              from either tab. */}
          <Section title="Work this lead">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Stage">
                <div style={{ position: "relative" }}>
                  <select
                    value={stageId}
                    onChange={(e) => handleStage(e.target.value)}
                    disabled={savingStage || stages.length === 0}
                    style={inputStyle}
                  >
                    {stages.length === 0 ? <option value="">—</option> : null}
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {savingStage ? <SpinnerAdorn /> : null}
                </div>
              </Field>
              <Field label="Assignee">
                <div style={{ position: "relative" }}>
                  <select
                    value={assigneeId}
                    onChange={(e) => handleAssign(e.target.value)}
                    disabled={savingAssignee}
                    style={inputStyle}
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((a) => (
                      <option key={a.user_id} value={a.user_id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {savingAssignee ? <SpinnerAdorn /> : null}
                </div>
              </Field>
            </div>
          </Section>

          {tab === "details" ? (
            <>
              {/* Company intelligence (recognition + snapshot) */}
              <CompanyPanel lead={lead} onRecognized={refresh} />

              {/* Company contacts + enrichment */}
              <ContactsPanel lead={lead} />

              {/* Subscription / plan panel */}
              <Section title="Subscription">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Stat label="Plan" value={lead.current_plan || "—"} />
                  <Stat label="Status" value={lead.current_status || lead.status || "—"} />
                  <Stat label="Trial started" value={formatDate(lead.trial_started_at)} />
                  <Stat label="Converted" value={formatDate(lead.converted_at)} />
                </div>
              </Section>

              {/* Lead facts */}
              <Section title="Lead">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Stat label="Source" value={lead.primary_source || "—"} />
                  <Stat label="Magnet" value={lead.magnet_slug || "—"} />
                  <Stat label="UTM source" value={lead.utm_source || "—"} />
                  <Stat label="Score" value={lead.lead_score != null ? String(lead.lead_score) : "—"} mono />
                  <Stat label="First seen" value={formatDate(lead.first_seen_at)} />
                  <Stat label="Signed up" value={formatDate(lead.signup_at)} />
                </div>
              </Section>
            </>
          ) : (
            <>
              {/* Note composer + log touch */}
              <Section title="Log activity">
                <textarea
                  value={touchText || noteText}
                  onChange={(e) => {
                    setNoteText(e.target.value);
                    setTouchText(e.target.value);
                  }}
                  rows={2}
                  placeholder="Add a note or describe the touch…"
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={handleAddNote} disabled={noteBusy || !noteText.trim()} style={primaryBtn}>
                    {noteBusy ? <Loader2 style={spinIcon} /> : <StickyNote style={{ width: 14, height: 14 }} />}
                    Add note
                  </button>
                  <button onClick={() => handleTouch("call")} disabled={touchBusy != null} style={ghostBtn}>
                    {touchBusy === "call" ? <Loader2 style={spinIcon} /> : <Phone style={{ width: 14, height: 14 }} />}
                    Log call
                  </button>
                  <button onClick={() => handleTouch("email")} disabled={touchBusy != null} style={ghostBtn}>
                    {touchBusy === "email" ? <Loader2 style={spinIcon} /> : <Mail style={{ width: 14, height: 14 }} />}
                    Log email
                  </button>
                </div>
              </Section>

              {/* Activity timeline */}
              <Section title="Timeline">
                {timeline.length === 0 ? (
                  <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8" }}>No activity yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {timeline.map((e, i) => (
                      <TimelineRow key={`${e.occurred_at ?? ""}-${i}`} entry={e} />
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Source icon vocabulary for timeline entries.
function SourceIcon({ source }: { source: string | null | undefined }) {
  const key = String(source ?? "").toLowerCase();
  const style = { width: 13, height: 13 };
  if (key === "magnet") return <Magnet style={style} />;
  if (key === "product") return <Package style={style} />;
  if (key === "email") return <Mail style={style} />;
  if (key === "demo") return <Presentation style={style} />;
  if (key === "manual") return <Hand style={style} />;
  return <Cog style={style} />;
}

function TimelineRow({ entry }: { entry: LeadTimelineEntry }) {
  const meta = sourceMeta(entry.source);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 8,
          background: meta.bg,
          border: `1px solid ${meta.bd}`,
          color: meta.fg,
          flexShrink: 0,
        }}
      >
        <SourceIcon source={entry.source} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: "#0F172A" }}>
            {entry.title || entry.kind || "Activity"}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 7px",
              borderRadius: 999,
              background: meta.bg,
              color: meta.fg,
              border: `1px solid ${meta.bd}`,
              fontFamily: FONT_HEAD,
              fontSize: 9.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {meta.label}
          </span>
        </div>
        {entry.detail ? (
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#475569", marginTop: 2, wordBreak: "break-word" }}>
            {entry.detail}
          </div>
        ) : null}
        <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>
          {formatRelative(entry.occurred_at)}
        </div>
      </div>
    </div>
  );
}

// ── Small UI atoms (mirror DealDetailDrawer) ───────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14, padding: 14 }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: mono ? FONT_MONO : FONT_BODY,
          fontSize: 13,
          fontWeight: mono ? 700 : 500,
          color: "#0F172A",
          marginTop: 2,
          wordBreak: "break-word",
          textTransform: label === "Status" || label === "Plan" ? "capitalize" : "none",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DrawerTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "11px 14px",
        border: "none",
        borderBottom: `2px solid ${active ? "#3B82F6" : "transparent"}`,
        background: "transparent",
        color: active ? "#1D4ED8" : "#64748b",
        fontFamily: FONT_HEAD,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );
}

function SpinnerAdorn() {
  return (
    <Loader2
      style={{
        position: "absolute",
        right: 8,
        top: "50%",
        transform: "translateY(-50%)",
        width: 14,
        height: 14,
        color: "#94a3b8",
        animation: "spin 1s linear infinite",
        pointerEvents: "none",
      }}
    />
  );
}

const spinIcon: React.CSSProperties = { width: 14, height: 14, animation: "spin 1s linear infinite" };

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1.5px solid #CBD5E1",
  background: "#FFFFFF",
  fontFamily: FONT_BODY,
  fontSize: 13,
  color: "#0F172A",
  outline: "none",
};

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: "#64748b",
  cursor: "pointer",
  flexShrink: 0,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  fontFamily: FONT_HEAD,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1.5px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#475569",
  fontFamily: FONT_HEAD,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
