"use client";

/**
 * Tasks tab — the shell-level "my work" surface for the Lead CRM, rebuilt to
 * Attio-grade: a "＋ New task" composer (title, due date, assignee, OPTIONAL
 * linked lead via typeahead), tasks GROUPED by Overdue / Today / Upcoming /
 * No due date, a complete checkbox, and a jump-to-lead that opens the drawer.
 *
 * Standalone tasks (no lead) are supported via migration
 * 20260816930000_lit_leadcrm_standalone_tasks — a task can be a plain personal
 * follow-up tied only to the creator. Open/Overdue/Done/All filters are kept.
 * Every rendered dynamic value passes through `asText` (React #31 safety).
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Loader2, CheckSquare, Square, CircleAlert, ArrowUpRight, ListChecks,
  Plus, X, Search, Calendar,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  type LeadTask,
  type LeadStage,
  type Assignee,
  type Lead,
  getMyTasks,
  completeTask,
  createTask,
  getLead,
  listStages,
  listAssignees,
  listLeadsPage,
} from "@/api/leadCrm";
import LeadDetailDrawer from "./LeadDetailDrawer";
import { FONT_HEAD, FONT_BODY, asText, formatDate, initials, avatarColor, leadDisplayName } from "./leadCrmFormat";
import { useLeadCrmTheme } from "./LeadCrmTheme";

type StatusFilter = "open" | "overdue" | "done" | "all";
type GroupKey = "overdue" | "today" | "upcoming" | "none";

const GROUP_META: Record<GroupKey, { label: string }> = {
  overdue: { label: "Overdue" },
  today: { label: "Today" },
  upcoming: { label: "Upcoming" },
  none: { label: "No due date" },
};
const GROUP_ORDER: GroupKey[] = ["overdue", "today", "upcoming", "none"];

/** Bucket a task into a due-date group. */
function groupOf(t: LeadTask): GroupKey {
  if (t.status !== "done" && t.overdue) return "overdue";
  if (!t.due_date) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(t.due_date);
  due.setHours(0, 0, 0, 0);
  if (Number.isNaN(due.getTime())) return "none";
  if (due.getTime() <= today.getTime()) return t.status === "done" ? "upcoming" : "today";
  return "upcoming";
}

export default function TasksPage() {
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [jumping, setJumping] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const { data: stages = [] } = useQuery<LeadStage[]>({
    queryKey: ["lead-crm", "stages"],
    queryFn: listStages,
    staleTime: 5 * 60_000,
  });
  const { data: assignees = [] } = useQuery<Assignee[]>({
    queryKey: ["lead-crm", "assignees"],
    queryFn: listAssignees,
    staleTime: 5 * 60_000,
  });

  const {
    data: tasks = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<LeadTask[]>({
    queryKey: ["lead-crm", "my-tasks", status],
    queryFn: () => getMyTasks(status),
    staleTime: 15_000,
  });

  // Group the returned tasks by due-date bucket, preserving RPC sort order.
  const grouped = useMemo(() => {
    const map: Record<GroupKey, LeadTask[]> = { overdue: [], today: [], upcoming: [], none: [] };
    for (const t of tasks) map[groupOf(t)].push(t);
    return map;
  }, [tasks]);

  async function handleToggle(t: LeadTask) {
    setBusyId(t.id);
    const done = t.status !== "done";
    try {
      await completeTask(t.id, done);
      toast({ title: done ? "Task completed" : "Task reopened" });
      await refetch();
    } catch (e: any) {
      toast({ title: "Could not update task", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleJump(leadId: string | null) {
    if (!leadId) return;
    setJumping(leadId);
    try {
      const full = await getLead(leadId);
      if (full) setOpenLead(full);
      else toast({ title: "Could not open lead", variant: "destructive" });
    } finally {
      setJumping(null);
    }
  }

  const emptyCopy: Record<StatusFilter, { title: string; sub: string }> = {
    open: { title: "You're all caught up", sub: "Create a task above, or add follow-ups from a lead." },
    overdue: { title: "Nothing overdue", sub: "Great — no follow-ups have slipped past their due date." },
    done: { title: "No completed tasks", sub: "Completed follow-ups will appear here." },
    all: { title: "No tasks yet", sub: "Create your first task with ＋ New task." },
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: theme.bg }}>
      <div style={{ padding: "20px 24px 48px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: theme.accent, letterSpacing: "0.22em", textTransform: "uppercase" }}>
              Follow-ups
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: theme.heading, letterSpacing: "-0.02em", marginTop: 3 }}>
              Tasks
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
              Your open follow-ups across every lead — grouped by when they're due.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isFetching ? <Loader2 style={{ width: 14, height: 14, color: theme.textFaint, animation: "spin 1s linear infinite" }} /> : null}
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px",
                borderRadius: 10, border: "none", background: theme.accent, color: theme.accentText,
                fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              New task
            </button>
          </div>
        </div>

        {/* Status filter */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {(["open", "overdue", "done", "all"] as StatusFilter[]).map((s) => {
            const on = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 9,
                  border: "1.5px solid " + (on ? theme.accentBorder : theme.border),
                  background: on ? theme.accentSoft : theme.panel,
                  color: on ? theme.accentSoftText : theme.textMuted,
                  fontFamily: FONT_HEAD,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "48px 0", color: theme.textMuted, fontFamily: FONT_BODY, fontSize: 14 }}>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 0", border: `1px dashed ${theme.border}`, borderRadius: 14, background: theme.panel }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", background: theme.panelMuted, marginBottom: 14 }}>
              <ListChecks style={{ width: 22, height: 22, color: theme.textFaint }} />
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: theme.heading }}>
              {emptyCopy[status].title}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
              {emptyCopy[status].sub}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {GROUP_ORDER.map((g) => {
              const rows = grouped[g];
              if (rows.length === 0) return null;
              return (
                <section key={g}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.1em", color: g === "overdue" ? theme.danger : theme.textMuted,
                      }}
                    >
                      {GROUP_META[g].label}
                    </span>
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 18,
                        padding: "0 6px", borderRadius: 999, fontFamily: FONT_HEAD, fontSize: 10.5, fontWeight: 700,
                        background: g === "overdue" ? theme.dangerSoft : theme.panelMuted,
                        color: g === "overdue" ? theme.danger : theme.textMuted,
                      }}
                    >
                      {rows.length}
                    </span>
                  </div>
                  <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
                    {rows.map((t, i) => (
                      <TaskRow
                        key={t.id}
                        t={t}
                        first={i === 0}
                        busy={busyId === t.id}
                        jumping={jumping === t.lead_id}
                        onToggle={() => handleToggle(t)}
                        onJump={() => handleJump(t.lead_id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {composerOpen ? (
        <NewTaskModal
          assignees={assignees}
          onClose={() => setComposerOpen(false)}
          onCreated={async () => {
            setComposerOpen(false);
            await refetch();
          }}
        />
      ) : null}

      {openLead ? (
        <LeadDetailDrawer
          lead={openLead}
          stages={stages}
          assignees={assignees}
          onClose={() => setOpenLead(null)}
          onChanged={() => refetch()}
        />
      ) : null}
    </div>
  );
}

// ── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({
  t,
  first,
  busy,
  jumping,
  onToggle,
  onJump,
}: {
  t: LeadTask;
  first: boolean;
  busy: boolean;
  jumping: boolean;
  onToggle: () => void;
  onJump: () => void;
}) {
  const { theme } = useLeadCrmTheme();
  const done = t.status === "done";
  const leadName = t.lead_name || t.lead_company || t.lead_email || null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderTop: first ? "none" : `1px solid ${theme.border}`,
        background: t.overdue && !done ? theme.dangerSoft : "transparent",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        title={done ? "Reopen" : "Complete"}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, border: "none", background: "transparent", color: done ? theme.success : theme.textFaint, cursor: "pointer", flexShrink: 0 }}
      >
        {busy ? (
          <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
        ) : done ? (
          <CheckSquare style={{ width: 18, height: 18 }} />
        ) : (
          <Square style={{ width: 18, height: 18 }} />
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: done ? theme.textFaint : theme.heading, textDecoration: done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {asText(t.title) || "Follow-up"}
        </div>
        {leadName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textFaint, marginTop: 1, minWidth: 0 }}>
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: avatarColor(leadName), color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
              {asText(initials(leadName))}
            </span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asText(leadName)}</span>
          </div>
        ) : (
          <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textFaint, marginTop: 1 }}>Personal task</div>
        )}
      </div>

      {t.assignee_name ? (
        <span
          title={`Assigned: ${asText(t.assignee_name)}`}
          style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColor(t.assignee_name), color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 8.5, fontWeight: 700, flexShrink: 0 }}
        >
          {asText(initials(t.assignee_name))}
        </span>
      ) : null}

      {t.due_date ? (
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontFamily: FONT_BODY, fontSize: 11.5,
            fontWeight: t.overdue && !done ? 700 : 500,
            color: t.overdue && !done ? theme.danger : theme.textMuted, flexShrink: 0,
          }}
        >
          {t.overdue && !done ? <CircleAlert style={{ width: 12, height: 12 }} /> : null}
          {asText(formatDate(t.due_date))}
        </span>
      ) : (
        <span style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textFaint, flexShrink: 0 }}>No due date</span>
      )}

      {t.lead_id ? (
        <button
          type="button"
          onClick={onJump}
          disabled={jumping}
          title="Open lead"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.panel, color: theme.textMuted, cursor: "pointer", flexShrink: 0 }}
        >
          {jumping ? (
            <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
          ) : (
            <ArrowUpRight style={{ width: 15, height: 15 }} />
          )}
        </button>
      ) : (
        <span style={{ width: 30, flexShrink: 0 }} />
      )}
    </div>
  );
}

// ── New task composer (modal) ────────────────────────────────────────────────

function NewTaskModal({
  assignees,
  onClose,
  onCreated,
}: {
  assignees: Assignee[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  // Optional lead link — typeahead over the leads list (reuses listLeadsPage q).
  const [leadQuery, setLeadQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pickedLead, setPickedLead] = useState<Lead | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(leadQuery.trim()), 250);
    return () => clearTimeout(h);
  }, [leadQuery]);

  const { data: leadResults = { leads: [], total: 0 }, isFetching: searching } = useQuery({
    queryKey: ["lead-crm", "task-lead-search", debouncedQuery],
    queryFn: () => listLeadsPage({ q: debouncedQuery, status: "active", limit: 8, offset: 0 }),
    enabled: debouncedQuery.length >= 2 && !pickedLead,
    staleTime: 30_000,
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${theme.borderStrong}`,
    background: theme.inputBg, fontFamily: FONT_BODY, fontSize: 13, color: theme.text, outline: "none",
  };

  async function handleSubmit() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await createTask({
        leadId: pickedLead?.id ?? null,
        title: t,
        dueDate: due || null,
        assignee: assignee || null,
      });
      if (!res.ok) {
        toast({
          title: res.reason === "title_required" ? "Enter a task title" : "Could not create task",
          variant: "destructive",
        });
        return;
      }
      toast({ title: pickedLead ? "Task added to lead" : "Task created" });
      onCreated();
    } catch (e: any) {
      toast({ title: "Could not create task", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: theme.overlay }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", width: "min(460px, 100%)", background: theme.panel, borderRadius: 16, boxShadow: `0 24px 48px ${theme.shadow}`, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: theme.heading }}>New task</div>
          <button onClick={onClose} style={{ display: "inline-flex", width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.panel, color: theme.textMuted, cursor: "pointer" }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <Labeled label="Task">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call back re: pricing" style={inputStyle} autoFocus />
          </Labeled>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label="Due date">
              <div style={{ position: "relative" }}>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inputStyle} />
                <Calendar style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: theme.textFaint, pointerEvents: "none" }} />
              </div>
            </Labeled>
            <Labeled label="Assignee">
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={inputStyle}>
                <option value="">Me</option>
                {assignees.map((a) => (
                  <option key={a.user_id} value={a.user_id}>{a.name}</option>
                ))}
              </select>
            </Labeled>
          </div>

          {/* Optional lead link */}
          <Labeled label="Link a lead (optional)">
            {pickedLead ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: `1.5px solid ${theme.accentBorder}`, borderRadius: 8, background: theme.accentSoft }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColor(leadDisplayName(pickedLead.full_name, pickedLead.email)), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {asText(initials(leadDisplayName(pickedLead.full_name, pickedLead.email)))}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asText(leadDisplayName(pickedLead.full_name, pickedLead.email))}
                  </div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: theme.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asText(pickedLead.company_name) || asText(pickedLead.email) || "Lead"}
                  </div>
                </div>
                <button onClick={() => { setPickedLead(null); setLeadQuery(""); }} title="Unlink" style={{ border: "none", background: "transparent", cursor: "pointer", color: theme.textFaint, flexShrink: 0, lineHeight: 0 }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1.5px solid ${theme.borderStrong}`, borderRadius: 8, padding: "0 10px", background: theme.inputBg }}>
                  <Search style={{ width: 14, height: 14, color: theme.textFaint, flexShrink: 0 }} />
                  <input
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search leads by name, email, company…"
                    style={{ ...inputStyle, border: "none", padding: "8px 0", background: "transparent" }}
                  />
                  {searching ? <Loader2 style={{ width: 13, height: 13, color: theme.textFaint, animation: "spin 1s linear infinite" }} /> : null}
                </div>
                {debouncedQuery.length >= 2 ? (
                  <>
                    <div onClick={() => setLeadQuery("")} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: `0 8px 24px ${theme.shadow}`, maxHeight: 240, overflowY: "auto" }}>
                      {leadResults.leads.length === 0 ? (
                        <div style={{ padding: "12px", fontFamily: FONT_BODY, fontSize: 12.5, color: theme.textFaint }}>No leads match. Leave blank for a personal task.</div>
                      ) : (
                        leadResults.leads.map((l) => {
                          const nm = leadDisplayName(l.full_name, l.email);
                          return (
                            <button
                              key={l.id}
                              onClick={() => { setPickedLead(l); setLeadQuery(""); }}
                              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", border: "none", borderTop: `1px solid ${theme.border}`, background: theme.panel, cursor: "pointer", textAlign: "left" }}
                            >
                              <span style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColor(nm), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                {asText(initials(nm))}
                              </span>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asText(nm)}</div>
                                <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: theme.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {asText(l.company_name) || asText(l.email) || "Lead"}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </Labeled>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 18px", borderTop: `1px solid ${theme.border}`, background: theme.panelAlt }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${theme.borderStrong}`, background: theme.panel, color: theme.textMuted, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy || !title.trim()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: theme.accent, color: theme.accentText, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: busy || !title.trim() ? "not-allowed" : "pointer", opacity: busy || !title.trim() ? 0.6 : 1 }}
          >
            {busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 14, height: 14 }} />}
            Create task
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useLeadCrmTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.textMuted }}>{label}</span>
      {children}
    </label>
  );
}
