"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Check, Loader2, Trash2 } from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useToast } from "@/components/ui/use-toast";
import {
  type DealCard,
  type DealStage,
  type Task,
  type DealActivity,
  updateDeal,
  deleteDeal,
  listDealActivity,
  listDealTasks,
  createTask,
  setTaskStatus,
  addDealNote,
  listCompanyContacts,
  listOrgMembers,
} from "@/api/crm";
import { formatDate, formatMoney, initials, avatarColor, isOverdue } from "./crmFormat";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

type Contact = { id: string; full_name: string; title: string | null; email: string | null };
type Member = { user_id: string; name: string };

export default function DealDetailDrawer({
  deal,
  stages,
  onClose,
  onChanged,
}: {
  deal: DealCard;
  stages: DealStage[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState<string>(deal.value_amount != null ? String(deal.value_amount) : "");
  const [stageId, setStageId] = useState(deal.stage_id);
  const [closeDate, setCloseDate] = useState<string>(deal.expected_close_date ?? "");
  const [ownerId, setOwnerId] = useState(deal.owner_user_id);
  const [contactId, setContactId] = useState<string>(deal.primary_contact_id ?? "");
  const [notes, setNotes] = useState<string>(deal.notes ?? "");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<DealActivity[]>([]);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, t, a] = await Promise.all([
        listOrgMembers(),
        listDealTasks(deal.id),
        listDealActivity(deal.id),
      ]);
      if (!alive) return;
      setMembers(m);
      setTasks(t);
      setActivity(a);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id]);

  // Load contacts for the company (needs the lit_companies UUID). We pull it
  // from the saved-company join done in listDeals via a targeted query.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!deal.saved_company_id) return;
      try {
        const { supabase } = await import("@/lib/supabase");
        const { data } = await supabase
          .from("lit_saved_companies")
          .select("company_id")
          .eq("id", deal.saved_company_id)
          .maybeSingle();
        const companyUuid = (data as any)?.company_id ?? null;
        const list = await listCompanyContacts(companyUuid);
        if (alive) setContacts(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [deal.saved_company_id]);

  const currentStage = useMemo(() => stages.find((s) => s.id === stageId), [stages, stageId]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateDeal(deal.id, {
        title: title.trim() || deal.title,
        value_amount: value.trim() === "" ? null : Number(value),
        stage_id: stageId,
        expected_close_date: closeDate || null,
        owner_user_id: ownerId,
        primary_contact_id: contactId || null,
        notes: notes.trim() || null,
      });
      toast({ title: "Deal saved" });
      onChanged();
      // refresh timeline (stage change may have logged a row)
      setActivity(await listDealActivity(deal.id));
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim()) return;
    try {
      await createTask({
        title: newTaskTitle.trim(),
        due_date: newTaskDue ? new Date(newTaskDue).toISOString() : null,
        deal_id: deal.id,
        saved_company_id: deal.saved_company_id,
      });
      setNewTaskTitle("");
      setNewTaskDue("");
      setTasks(await listDealTasks(deal.id));
      onChanged();
    } catch (e: any) {
      toast({ title: "Could not add task", description: e?.message, variant: "destructive" });
    }
  }

  async function toggleTask(t: Task) {
    try {
      await setTaskStatus(t.id, t.status === "done" ? "open" : "done");
      setTasks(await listDealTasks(deal.id));
      onChanged();
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    try {
      await addDealNote(deal.id, noteText.trim());
      setNoteText("");
      setActivity(await listDealActivity(deal.id));
    } catch (e: any) {
      toast({ title: "Could not add note", description: e?.message, variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this deal? This cannot be undone.")) return;
    try {
      await deleteDeal(deal.id);
      toast({ title: "Deal deleted" });
      onChanged();
      onClose();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
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
          <CompanyAvatar name={deal.companyName || deal.title} domain={deal.companyDomain || undefined} size="sm" className="shrink-0" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
              {deal.companyName || "Deal"}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#64748b" }}>
              {currentStage?.name ?? "—"} · {formatMoney(value === "" ? null : Number(value), deal.currency)}
            </div>
          </div>
          <button onClick={onClose} style={iconBtn} title="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Editable fields */}
          <Section title="Details">
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Value">
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" style={inputStyle} />
              </Field>
              <Field label="Stage">
                <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={inputStyle}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Expected close">
                <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Owner">
                <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={inputStyle}>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Primary contact">
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={inputStyle}>
                <option value="">— none —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.title ? ` · ${c.title}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={primaryBtn}>
                {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
                Save changes
              </button>
              <button onClick={handleDelete} style={dangerBtn} title="Delete deal">
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </Section>

          {/* Tasks */}
          <Section title={`Tasks${tasks.length ? ` (${tasks.filter((t) => t.status === "open").length} open)` : ""}`}>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                placeholder="Add a task…"
                style={{ ...inputStyle, flex: 1 }}
              />
              <input type="date" value={newTaskDue} onChange={(e) => setNewTaskDue(e.target.value)} style={{ ...inputStyle, width: 140 }} />
              <button onClick={handleAddTask} style={iconBtnBlue} title="Add task">
                <Plus style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {tasks.length === 0 ? (
                <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8" }}>No tasks yet.</div>
              ) : (
                tasks.map((t) => (
                  <div key={t.id} style={taskRow}>
                    <button onClick={() => toggleTask(t)} style={{ ...checkbox, background: t.status === "done" ? "#22C55E" : "#FFFFFF", borderColor: t.status === "done" ? "#22C55E" : "#CBD5E1" }} title="Toggle done">
                      {t.status === "done" ? <Check style={{ width: 12, height: 12, color: "#FFFFFF" }} /> : null}
                    </button>
                    <span style={{ flex: 1, fontFamily: FONT_BODY, fontSize: 13, color: t.status === "done" ? "#94a3b8" : "#0F172A", textDecoration: t.status === "done" ? "line-through" : "none" }}>
                      {t.title}
                    </span>
                    {t.due_date ? (
                      <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: isOverdue(t.due_date) && t.status === "open" ? "#dc2626" : "#64748b" }}>
                        {formatDate(t.due_date)}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section title="Timeline">
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                placeholder="Log a note…"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddNote} style={iconBtnBlue} title="Add note">
                <Plus style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {activity.length === 0 ? (
                <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8" }}>No activity yet.</div>
              ) : (
                activity.map((a) => <TimelineRow key={a.id} a={a} members={members} />)
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ a, members }: { a: DealActivity; members: Member[] }) {
  const actor = members.find((m) => m.user_id === a.actor_user_id)?.name ?? "Someone";
  let label = "";
  const b = a.body as any;
  if (a.kind === "stage_change") label = `moved ${b?.from ?? "?"} → ${b?.to ?? "?"}`;
  else if (a.kind === "created") label = `created the deal in ${b?.stage ?? "pipeline"}`;
  else if (a.kind === "note") label = `noted: "${b?.text ?? ""}"`;
  else label = a.kind;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", background: avatarColor(actor), color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
        {initials(actor)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: "#334155" }}>
          <b style={{ color: "#0F172A" }}>{actor}</b> {label}
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: "#94a3b8" }}>{formatDate(a.created_at)}</div>
      </div>
    </div>
  );
}

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
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1.5px solid #FECACA",
  background: "#FFFFFF",
  color: "#dc2626",
  cursor: "pointer",
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
};

const iconBtnBlue: React.CSSProperties = {
  ...iconBtn,
  border: "1.5px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#3B82F6",
};

const taskRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "6px 8px",
  borderRadius: 8,
  background: "#F8FAFC",
  border: "1px solid #F1F5F9",
};

const checkbox: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 5,
  border: "1.5px solid #CBD5E1",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};
