"use client";

/**
 * Tasks tab — the shell-level "my work" surface for the Lead CRM. Lists the
 * caller's open / overdue / done follow-ups (`lit_leadcrm_my_tasks`) with due
 * dates, an overdue highlight, a complete checkbox, and a "jump to lead" that
 * opens the LeadDetailDrawer. Managers still see their own tasks by default;
 * the RPC is membership-gated. Every rendered value passes through `asText`.
 */
import React, { useState } from "react";
import { Loader2, CheckSquare, Square, CircleAlert, ArrowUpRight, ListChecks } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  type LeadTask,
  type LeadStage,
  type Assignee,
  type Lead,
  getMyTasks,
  completeTask,
  getLead,
  listStages,
  listAssignees,
} from "@/api/leadCrm";
import LeadDetailDrawer from "./LeadDetailDrawer";
import { FONT_HEAD, FONT_BODY, asText, formatDate, initials, avatarColor } from "./leadCrmFormat";

type StatusFilter = "open" | "overdue" | "done" | "all";

export default function TasksPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [jumping, setJumping] = useState<string | null>(null);

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

  async function handleJump(leadId: string) {
    setJumping(leadId);
    try {
      const full = await getLead(leadId);
      if (full) setOpenLead(full);
      else toast({ title: "Could not open lead", variant: "destructive" });
    } finally {
      setJumping(null);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#F8FAFC" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px 48px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: "#3B82F6", letterSpacing: "0.22em", textTransform: "uppercase" }}>
              Follow-ups
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", marginTop: 3 }}>
              Tasks
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 2 }}>
              Your open follow-ups across every lead.
            </div>
          </div>
          {isFetching ? <Loader2 style={{ width: 14, height: 14, color: "#94a3b8", animation: "spin 1s linear infinite", marginTop: 6 }} /> : null}
        </div>

        {/* Status filter */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {(["open", "overdue", "done", "all"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              style={{
                padding: "6px 12px",
                borderRadius: 9,
                border: "1.5px solid " + (status === s ? "#3B82F6" : "#E5E7EB"),
                background: status === s ? "rgba(59,130,246,0.08)" : "#FFFFFF",
                color: status === s ? "#1D4ED8" : "#64748b",
                fontFamily: FONT_HEAD,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "48px 0", color: "#64748b", fontFamily: FONT_BODY, fontSize: 14 }}>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", background: "#F1F5F9", marginBottom: 14 }}>
              <ListChecks style={{ width: 22, height: 22, color: "#94a3b8" }} />
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: "#0F172A" }}>
              {status === "done" ? "No completed tasks" : "You're all caught up"}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 4 }}>
              {status === "done" ? "Completed follow-ups will appear here." : "Add follow-ups from a lead's detail drawer."}
            </div>
          </div>
        ) : (
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14, overflow: "hidden" }}>
            {tasks.map((t, i) => {
              const done = t.status === "done";
              const leadName = t.lead_name || t.lead_company || t.lead_email || "Lead";
              return (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderTop: i === 0 ? "none" : "1px solid #F1F5F9",
                    background: t.overdue ? "#FFFBFA" : "#FFFFFF",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(t)}
                    disabled={busyId === t.id}
                    title={done ? "Reopen" : "Complete"}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, border: "none", background: "transparent", color: done ? "#059669" : "#94a3b8", cursor: "pointer", flexShrink: 0 }}
                  >
                    {busyId === t.id ? (
                      <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                    ) : done ? (
                      <CheckSquare style={{ width: 18, height: 18 }} />
                    ) : (
                      <Square style={{ width: 18, height: 18 }} />
                    )}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: done ? "#94a3b8" : "#0F172A", textDecoration: done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {asText(t.title) || "Follow-up"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_BODY, fontSize: 11.5, color: "#94a3b8", marginTop: 1, minWidth: 0 }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", background: avatarColor(leadName), color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
                        {asText(initials(leadName))}
                      </span>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asText(leadName)}</span>
                    </div>
                  </div>

                  {t.due_date ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontFamily: FONT_BODY,
                        fontSize: 11.5,
                        fontWeight: t.overdue ? 700 : 500,
                        color: t.overdue ? "#dc2626" : "#64748b",
                        flexShrink: 0,
                      }}
                    >
                      {t.overdue ? <CircleAlert style={{ width: 12, height: 12 }} /> : null}
                      {asText(formatDate(t.due_date))}
                    </span>
                  ) : (
                    <span style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: "#cbd5e1", flexShrink: 0 }}>No due date</span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleJump(t.lead_id)}
                    disabled={jumping === t.lead_id}
                    title="Open lead"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#64748b", cursor: "pointer", flexShrink: 0 }}
                  >
                    {jumping === t.lead_id ? (
                      <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                    ) : (
                      <ArrowUpRight style={{ width: 15, height: 15 }} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
