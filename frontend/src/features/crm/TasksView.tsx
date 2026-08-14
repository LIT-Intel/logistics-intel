"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Check, AlertTriangle, CheckSquare } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { type Task, listMyTasks, setTaskStatus } from "@/api/crm";
import { formatDate, isOverdue } from "./crmFormat";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

/**
 * "My tasks" — open tasks assigned to the viewer, due-date sorted, overdue
 * highlighted, mark-done inline. Workspace-scoped via RLS + assignee filter.
 */
export default function TasksView({ onCountChange }: { onCountChange?: (overdue: number) => void }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const t = await listMyTasks();
      setTasks(t);
      if (onCountChange) onCountChange(t.filter((x) => isOverdue(x.due_date)).length);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function markDone(t: Task) {
    // optimistic remove
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    try {
      await setTaskStatus(t.id, "done");
      reload();
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
      reload();
    }
  }

  const overdue = tasks.filter((t) => isOverdue(t.due_date));
  const upcoming = tasks.filter((t) => !isOverdue(t.due_date));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8FAFC" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #E5E7EB", background: "#FFFFFF", flexShrink: 0 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: "#6366F1", letterSpacing: "0.24em", textTransform: "uppercase" }}>Tasks</div>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>My tasks</div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 2 }}>
          {tasks.length} open{overdue.length ? ` · ${overdue.length} overdue` : ""}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "48px 0", color: "#64748b", fontFamily: FONT_BODY }}>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", background: "#F1F5F9", marginBottom: 14 }}>
              <CheckSquare style={{ width: 22, height: 22, color: "#94a3b8" }} />
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: "#0F172A" }}>You're all caught up</div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 4 }}>No open tasks assigned to you.</div>
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
            {overdue.length > 0 ? (
              <TaskGroup title="Overdue" icon={<AlertTriangle style={{ width: 13, height: 13, color: "#dc2626" }} />} tasks={overdue} onDone={markDone} danger />
            ) : null}
            <TaskGroup title="Open" tasks={upcoming} onDone={markDone} />
          </div>
        )}
      </div>
    </div>
  );
}

function TaskGroup({ title, icon, tasks, onDone, danger }: { title: string; icon?: React.ReactNode; tasks: Task[]; onDone: (t: Task) => void; danger?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: danger ? "#dc2626" : "#64748b" }}>
        {icon}
        {title} ({tasks.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "#FFFFFF", border: `1px solid ${danger ? "#FECACA" : "#E5E7EB"}`, borderRadius: 12 }}>
            <button
              onClick={() => onDone(t)}
              style={{ width: 20, height: 20, borderRadius: 6, border: "1.5px solid #CBD5E1", background: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
              title="Mark done"
            >
              <Check style={{ width: 13, height: 13, color: "#CBD5E1" }} />
            </button>
            <span style={{ flex: 1, fontFamily: FONT_BODY, fontSize: 13.5, color: "#0F172A" }}>{t.title}</span>
            {t.due_date ? (
              <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: danger ? "#dc2626" : "#64748b" }}>{formatDate(t.due_date)}</span>
            ) : (
              <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8" }}>No due date</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
