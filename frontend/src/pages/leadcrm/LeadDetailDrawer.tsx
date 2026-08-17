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
  CheckSquare,
  Square,
  Plus,
  CircleAlert,
  Tag as TagIcon,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import {
  type Lead,
  type LeadStage,
  type LeadTimelineEntry,
  type Assignee,
  type LeadTask,
  getLead,
  getLeadTimeline,
  getLeadTasks,
  createTask,
  completeTask,
  setStage as apiSetStage,
  assignLead,
  addNote,
  logTouch,
  archiveLead,
  deleteLead,
  restoreLead,
  type LeadTag,
  listTags,
  createTag,
  getLeadTags,
  addLeadTag,
  removeLeadTag,
} from "@/api/leadCrm";
import {
  FONT_HEAD,
  FONT_BODY,
  FONT_MONO,
  asText,
  formatDate,
  formatRelative,
  initials,
  avatarColor,
  stageBadgeStyle,
  leadDisplayName,
  sourceMeta,
  kindLabel,
  type LeadCrmThemeTokens,
} from "./leadCrmFormat";
import { useLeadCrmTheme } from "./LeadCrmTheme";
import { CompanyPanel, ContactsPanel } from "./LeadCompanyPanels";
import LeadCommunicationPanel from "./LeadCommunicationPanel";

type Tab = "activity" | "communicate" | "details";

export default function LeadDetailDrawer({
  lead: initialLead,
  stages,
  assignees,
  onClose,
  onChanged,
  onRemoved,
}: {
  lead: Lead;
  stages: LeadStage[];
  assignees: Assignee[];
  onClose: () => void;
  onChanged: () => void;
  /** Called after archive/delete/restore so the parent can refresh + close.
   *  Falls back to onChanged()+onClose() when not supplied. */
  onRemoved?: () => void;
}) {
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const inputStyle = makeInputStyle(theme);
  const iconBtn = makeIconBtn(theme);
  const primaryBtn = makePrimaryBtn(theme);
  const ghostBtn = makeGhostBtn(theme);
  const [lead, setLead] = useState<Lead>(initialLead);
  const [timeline, setTimeline] = useState<LeadTimelineEntry[]>([]);
  const [tab, setTab] = useState<Tab>("activity");
  const [menuOpen, setMenuOpen] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  // Archive / delete / restore all remove the lead from the current view; after
  // success we notify the parent (refresh) and close the drawer.
  function afterLifecycle() {
    if (onRemoved) onRemoved();
    else {
      onChanged();
      onClose();
    }
  }

  async function handleArchive(archived: boolean) {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    setMenuOpen(false);
    try {
      const res = await archiveLead(lead.id, archived);
      if (!res.ok) throw new Error(res.reason || "failed");
      toast({ title: archived ? "Lead archived" : "Lead unarchived" });
      afterLifecycle();
    } catch (e: any) {
      toast({ title: archived ? "Could not archive" : "Could not unarchive", description: e?.message, variant: "destructive" });
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function handleDelete() {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    setMenuOpen(false);
    setConfirmDelete(false);
    try {
      const res = await deleteLead(lead.id);
      if (!res.ok) throw new Error(res.reason || "failed");
      toast({ title: "Lead deleted", description: "Moved to Deleted — restore anytime." });
      afterLifecycle();
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function handleRestore() {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    setMenuOpen(false);
    try {
      const res = await restoreLead(lead.id);
      if (!res.ok) throw new Error(res.reason || "failed");
      toast({ title: "Lead restored" });
      afterLifecycle();
    } catch (e: any) {
      toast({ title: "Could not restore", description: e?.message, variant: "destructive" });
    } finally {
      setLifecycleBusy(false);
    }
  }

  const isArchived = Boolean(lead.archived_at);
  const isDeleted = Boolean(lead.deleted_at);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: theme.overlay }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(560px, 100%)",
          height: "100%",
          background: theme.bg,
          boxShadow: `-8px 0 24px ${theme.shadow}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.panel,
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
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {asText(name)}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {asText(lead.email) || "No email"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {currentStage ? <span style={stageBadgeStyle(currentStage.color)}>{asText(currentStage.name)}</span> : null}
              {lead.company_name || lead.company_domain ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textMuted }}>
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
                  {asText(lead.company_name) || asText(lead.company_domain)}
                </span>
              ) : null}
            </div>
            <TagsRow leadId={lead.id} />
            {isArchived || isDeleted ? (
              <div style={{ marginTop: 6 }}>
                <span
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999,
                    background: isDeleted ? "#FEF2F2" : "#FFF7ED",
                    border: `1px solid ${isDeleted ? "#FECACA" : "#FED7AA"}`,
                    color: isDeleted ? "#b91c1c" : "#c2410c",
                    fontFamily: FONT_HEAD, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                  }}
                >
                  {isDeleted ? <Trash2 style={{ width: 11, height: 11 }} /> : <Archive style={{ width: 11, height: 11 }} />}
                  {isDeleted ? "Deleted" : "Archived"}
                </span>
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              style={iconBtn}
              title="Lead actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={lifecycleBusy}
            >
              {lifecycleBusy ? <Loader2 style={spinIcon} /> : <MoreHorizontal style={{ width: 16, height: 16 }} />}
            </button>
            <button onClick={onClose} style={iconBtn} title="Close">
              <X style={{ width: 16, height: 16 }} />
            </button>

            {menuOpen ? (
              <>
                {/* click-away scrim */}
                <div
                  onClick={() => { setMenuOpen(false); setConfirmDelete(false); }}
                  style={{ position: "fixed", inset: 0, zIndex: 30 }}
                />
                <div
                  role="menu"
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 31, width: 210,
                    background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12,
                    boxShadow: `0 12px 28px ${theme.shadow}`, padding: 6,
                    display: "flex", flexDirection: "column", gap: 2,
                  }}
                >
                  {isArchived || isDeleted ? (
                    <MenuItem icon={<RotateCcw style={menuIco} />} label="Restore lead" onClick={handleRestore} />
                  ) : null}
                  {!isDeleted ? (
                    isArchived ? (
                      <MenuItem icon={<ArchiveRestore style={menuIco} />} label="Unarchive" onClick={() => handleArchive(false)} />
                    ) : (
                      <MenuItem icon={<Archive style={menuIco} />} label="Archive lead" onClick={() => handleArchive(true)} />
                    )
                  ) : null}
                  {!isDeleted ? (
                    confirmDelete ? (
                      <MenuItem
                        icon={<Trash2 style={menuIco} />}
                        label="Confirm delete"
                        danger
                        onClick={handleDelete}
                      />
                    ) : (
                      <MenuItem
                        icon={<Trash2 style={menuIco} />}
                        label="Delete lead"
                        danger
                        onClick={() => setConfirmDelete(true)}
                      />
                    )
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, padding: "0 20px", borderBottom: `1px solid ${theme.border}`, background: theme.panel }}>
          <DrawerTab active={tab === "activity"} onClick={() => setTab("activity")} label="Activity" />
          <DrawerTab active={tab === "communicate"} onClick={() => setTab("communicate")} label="Communicate" />
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

          {tab === "communicate" ? (
            <LeadCommunicationPanel lead={lead} onLogged={refresh} />
          ) : tab === "details" ? (
            <>
              {/* Company intelligence (recognition + snapshot) */}
              <CompanyPanel lead={lead} onRecognized={refresh} />

              {/* Company contacts + enrichment */}
              <ContactsPanel lead={lead} />

              {/* Tasks / follow-ups */}
              <TasksSection leadId={lead.id} assignees={assignees} onChanged={onChanged} />

              {/* Subscription / plan panel */}
              <Section title="Subscription">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Stat label="Plan" value={asText(lead.current_plan) || "—"} />
                  <Stat label="Status" value={asText(lead.current_status) || asText(lead.status) || "—"} />
                  <Stat label="Trial started" value={formatDate(lead.trial_started_at)} />
                  <Stat label="Converted" value={formatDate(lead.converted_at)} />
                </div>
              </Section>

              {/* Lead facts */}
              <Section title="Lead">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Stat label="Source" value={asText(lead.primary_source) || "—"} />
                  <Stat label="Magnet" value={asText(lead.magnet_slug) || "—"} />
                  <Stat label="UTM source" value={asText(lead.utm_source) || "—"} />
                  <Stat label="Score" value={lead.lead_score != null ? asText(lead.lead_score) : "—"} mono />
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
                  <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textFaint }}>No activity yet.</div>
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
  const { theme, mode } = useLeadCrmTheme();
  const meta = sourceMeta(entry.source, mode);
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
          <span style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: theme.heading }}>
            {kindLabel(entry.kind) || asText(entry.title) || "Activity"}
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
        {(() => {
          const d = renderTimelineDetail(entry.detail);
          return d ? (
            <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textMuted, marginTop: 2, wordBreak: "break-word" }}>
              {d}
            </div>
          ) : null;
        })()}
        <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: theme.textFaint, marginTop: 2 }}>
          {formatRelative(entry.occurred_at)}
        </div>
      </div>
    </div>
  );
}

/** Render a timeline entry's `detail` (string OR jsonb object) as safe text.
 *  A jsonb object rendered directly as a React child throws React error #31
 *  ("Objects are not valid as a React child"). Delegates to the shared `asText`
 *  guard so the coercion rules are identical everywhere in the workspace. */
function renderTimelineDetail(detail: unknown): string {
  return asText(detail);
}

// ── Tasks section (this lead's follow-ups + add-follow-up composer) ─────────

function TasksSection({
  leadId,
  assignees,
  onChanged,
}: {
  leadId: string;
  assignees: Assignee[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const inputStyle = makeInputStyle(theme);
  const primaryBtn = makePrimaryBtn(theme);
  const ghostBtn = makeGhostBtn(theme);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const rows = await getLeadTasks(leadId);
      if (!alive) return;
      setTasks(rows);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [leadId]);

  async function reload() {
    setTasks(await getLeadTasks(leadId));
    onChanged();
  }

  async function handleCreate() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const res = await createTask({ leadId, title: t, dueDate: due || null, assignee: assignee || null });
      if (!res.ok) {
        toast({ title: res.reason === "title_required" ? "Enter a task title" : "Could not add task", variant: "destructive" });
        return;
      }
      setTitle("");
      setDue("");
      setAssignee("");
      setAdding(false);
      toast({ title: "Follow-up added" });
      await reload();
    } catch (e: any) {
      toast({ title: "Could not add task", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(task: LeadTask) {
    setBusyId(task.id);
    const done = task.status !== "done";
    try {
      await completeTask(task.id, done);
      await reload();
    } catch (e: any) {
      toast({ title: "Could not update task", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Section title="Tasks">
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.textFaint, fontFamily: FONT_BODY, fontSize: 12, padding: "4px 0" }}>
          <Loader2 style={spinIcon} /> Loading tasks…
        </div>
      ) : tasks.length === 0 ? (
        <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textFaint }}>No follow-ups yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tasks.map((task) => {
            const done = task.status === "done";
            return (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", border: `1px solid ${theme.border}`, borderRadius: 10, background: task.overdue ? theme.dangerSoft : theme.panelAlt }}>
                <button
                  type="button"
                  onClick={() => handleToggle(task)}
                  disabled={busyId === task.id}
                  title={done ? "Reopen" : "Complete"}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, border: "none", background: "transparent", color: done ? theme.success : theme.textFaint, cursor: "pointer", flexShrink: 0 }}
                >
                  {busyId === task.id ? (
                    <Loader2 style={spinIcon} />
                  ) : done ? (
                    <CheckSquare style={{ width: 16, height: 16 }} />
                  ) : (
                    <Square style={{ width: 16, height: 16 }} />
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: done ? theme.textFaint : theme.heading, textDecoration: done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asText(task.title) || "Follow-up"}
                  </div>
                  {task.due_date || task.assignee_name ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_BODY, fontSize: 10.5, color: task.overdue ? theme.danger : theme.textFaint, marginTop: 1 }}>
                      {task.overdue ? <CircleAlert style={{ width: 10, height: 10 }} /> : null}
                      {task.due_date ? asText(formatDate(task.due_date)) : ""}
                      {task.due_date && task.assignee_name ? " · " : ""}
                      {task.assignee_name ? asText(task.assignee_name) : ""}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, padding: 10, border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.panelAlt }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Follow-up (e.g. Call back re: pricing)"
            style={inputStyle}
            autoFocus
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inputStyle} />
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={inputStyle}>
              <option value="">Me</option>
              {assignees.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {asText(a.name)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCreate} disabled={saving || !title.trim()} style={primaryBtn}>
              {saving ? <Loader2 style={spinIcon} /> : <Plus style={{ width: 14, height: 14 }} />}
              Add follow-up
            </button>
            <button onClick={() => { setAdding(false); setTitle(""); setDue(""); setAssignee(""); }} disabled={saving} style={ghostBtn}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...ghostBtn, alignSelf: "flex-start" }}>
          <Plus style={{ width: 14, height: 14 }} />
          Add follow-up
        </button>
      )}
    </Section>
  );
}

// ── Small UI atoms (mirror DealDetailDrawer) ───────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useLeadCrmTheme();
  return (
    <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: theme.textMuted, marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useLeadCrmTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.textFaint }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { theme } = useLeadCrmTheme();
  return (
    <div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.textFaint }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: mono ? FONT_MONO : FONT_BODY,
          fontSize: 13,
          fontWeight: mono ? 700 : 500,
          color: theme.text,
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

const menuIco: React.CSSProperties = { width: 14, height: 14 };

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const { theme } = useLeadCrmTheme();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
        border: "none", borderRadius: 8, background: "transparent", cursor: "pointer",
        fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, textAlign: "left",
        color: danger ? theme.danger : theme.text,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? theme.dangerSoft : theme.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      {label}
    </button>
  );
}

function DrawerTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const { theme } = useLeadCrmTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "11px 14px",
        border: "none",
        borderBottom: `2px solid ${active ? theme.accentBorder : "transparent"}`,
        background: "transparent",
        color: active ? theme.accentSoftText : theme.textMuted,
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
  const { theme } = useLeadCrmTheme();
  return (
    <Loader2
      style={{
        position: "absolute",
        right: 8,
        top: "50%",
        transform: "translateY(-50%)",
        width: 14,
        height: 14,
        color: theme.textFaint,
        animation: "spin 1s linear infinite",
        pointerEvents: "none",
      }}
    />
  );
}

const spinIcon: React.CSSProperties = { width: 14, height: 14, animation: "spin 1s linear infinite" };

function makeInputStyle(theme: LeadCrmThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 8,
    border: `1.5px solid ${theme.borderStrong}`,
    background: theme.inputBg,
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: theme.text,
    outline: "none",
  };
}

function makeIconBtn(theme: LeadCrmThemeTokens): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    background: theme.panel,
    color: theme.textMuted,
    cursor: "pointer",
    flexShrink: 0,
  };
}

function makePrimaryBtn(theme: LeadCrmThemeTokens): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 10,
    border: "none",
    background: theme.accent,
    color: theme.accentText,
    fontFamily: FONT_HEAD,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function makeGhostBtn(theme: LeadCrmThemeTokens): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 10,
    border: `1.5px solid ${theme.borderStrong}`,
    background: theme.panel,
    color: theme.textMuted,
    fontFamily: FONT_HEAD,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}

/**
 * Tags on the lead — chips with a small add/create popover. All values pass
 * through asText() (React #31 safety). Best-effort: any error degrades to an
 * empty tag list rather than crashing the drawer.
 */
function TagsRow({ leadId }: { leadId: string }) {
  const { theme } = useLeadCrmTheme();
  const [tags, setTags] = useState<LeadTag[]>([]);
  const [all, setAll] = useState<LeadTag[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    const [lt, at] = await Promise.all([getLeadTags(leadId), listTags()]);
    setTags(lt);
    setAll(at);
  }, [leadId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [lt, at] = await Promise.all([getLeadTags(leadId), listTags()]);
      if (!alive) return;
      setTags(lt);
      setAll(at);
    })();
    return () => { alive = false; };
  }, [leadId]);

  const has = (id: string) => tags.some((t) => t.id === id);
  const available = all.filter((t) => !has(t.id));

  async function add(tagId: string) {
    setBusy(true);
    try { await addLeadTag(leadId, tagId); await load(); } catch { /* noop */ } finally { setBusy(false); }
  }
  async function remove(tagId: string) {
    setBusy(true);
    try { await removeLeadTag(leadId, tagId); await load(); } catch { /* noop */ } finally { setBusy(false); }
  }
  async function createAndAdd() {
    const nm = newName.trim();
    if (!nm) return;
    setBusy(true);
    try {
      const res = await createTag(nm);
      if (res.ok && res.tag_id) await addLeadTag(leadId, res.tag_id);
      setNewName("");
      await load();
    } catch { /* noop */ } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap", position: "relative" }}>
      {tags.map((t) => (
        <span
          key={t.id}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999,
            background: theme.panelMuted, border: `1px solid ${theme.border}`, color: theme.textMuted,
            fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600,
          }}
        >
          <TagIcon style={{ width: 10, height: 10, color: t.color ?? theme.textFaint }} />
          {asText(t.name)}
          <button onClick={() => remove(t.id)} disabled={busy} title="Remove tag"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: theme.textFaint, padding: 0, display: "inline-flex" }}>
            <X style={{ width: 10, height: 10 }} />
          </button>
        </span>
      ))}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 999,
          background: theme.panel, border: `1px dashed ${theme.borderStrong}`, color: theme.textMuted,
          fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 600, cursor: "pointer",
        }}
      >
        <Plus style={{ width: 11, height: 11 }} /> Tag
      </button>
      {open ? (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20, width: 220,
            background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12, boxShadow: `0 8px 24px ${theme.shadow}`, padding: 10,
          }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(); }}
              placeholder="New tag…"
              style={{ flex: 1, minWidth: 0, padding: "5px 8px", border: `1px solid ${theme.border}`, borderRadius: 8, fontFamily: FONT_BODY, fontSize: 12, background: theme.inputBg, color: theme.text }}
            />
            <button onClick={createAndAdd} disabled={busy || !newName.trim()}
              style={{ padding: "5px 9px", border: "none", borderRadius: 8, background: theme.accent, color: theme.accentText, fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700, cursor: "pointer", opacity: busy || !newName.trim() ? 0.6 : 1 }}>
              Add
            </button>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {available.length === 0 ? (
              <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textFaint, padding: "4px 2px" }}>No more tags — create one above.</div>
            ) : available.map((t) => (
              <button
                key={t.id}
                onClick={() => add(t.id)}
                disabled={busy}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", fontFamily: FONT_BODY, fontSize: 12, color: theme.text, textAlign: "left" }}
              >
                <TagIcon style={{ width: 11, height: 11, color: t.color ?? theme.textFaint }} />
                {asText(t.name)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
