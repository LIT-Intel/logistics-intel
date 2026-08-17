"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Plus, Check, Loader2, Trash2, Building2, FileText, Mail, Link2, Unlink } from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useToast } from "@/components/ui/use-toast";
import {
  type DealCard,
  type DealStage,
  type DealServiceType,
  type Task,
  type DealActivity,
  DEAL_SERVICE_TYPES,
  DEAL_SERVICE_TYPE_LABELS,
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
import {
  listQuotesForDeal,
  listAttachableQuotes,
  attachQuoteToDeal,
  detachQuoteFromDeal,
  type LinkedQuote,
} from "@/api/quoteDeal";
import { formatDate, formatMoney, initials, avatarColor, isOverdue } from "./crmFormat";
import { useCrmTheme, type CrmThemeTokens } from "./CommandCenterTheme";

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
  const navigate = useNavigate();
  const { theme, mode } = useCrmTheme();
  const [saving, setSaving] = useState(false);
  // lit_companies UUID for this deal — resolved from saved_company_id so the
  // header cross-links (Company profile / Quotes / Inbox) can deep-link to the
  // real 360 hub. company_id (text) is the fallback when there's no saved row.
  const [companyUuid, setCompanyUuid] = useState<string | null>(null);
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState<string>(deal.value_amount != null ? String(deal.value_amount) : "");
  const [stageId, setStageId] = useState(deal.stage_id);
  const [closeDate, setCloseDate] = useState<string>(deal.expected_close_date ?? "");
  const [ownerId, setOwnerId] = useState(deal.owner_user_id);
  const [contactId, setContactId] = useState<string>(deal.primary_contact_id ?? "");
  const [notes, setNotes] = useState<string>(deal.notes ?? "");
  const [serviceType, setServiceType] = useState<DealServiceType | "">(deal.service_type ?? "");
  const [origin, setOrigin] = useState<string>(deal.origin ?? "");
  const [destination, setDestination] = useState<string>(deal.destination ?? "");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<DealActivity[]>([]);
  // Quotes linked to this deal (source of truth for value lives on the deal;
  // these roll up into it) + unlinked company quotes available to attach.
  const [linkedQuotes, setLinkedQuotes] = useState<LinkedQuote[]>([]);
  const [attachable, setAttachable] = useState<LinkedQuote[]>([]);
  const [attachId, setAttachId] = useState<string>("");
  const [quoteBusy, setQuoteBusy] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, t, a, q] = await Promise.all([
        listOrgMembers(),
        listDealTasks(deal.id),
        listDealActivity(deal.id),
        listQuotesForDeal(deal.id),
      ]);
      if (!alive) return;
      setMembers(m);
      setTasks(t);
      setActivity(a);
      setLinkedQuotes(q);
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
        const uuid = (data as any)?.company_id ?? null;
        if (alive) setCompanyUuid(uuid);
        const [list, att] = await Promise.all([
          listCompanyContacts(uuid),
          uuid ? listAttachableQuotes(uuid) : Promise.resolve([]),
        ]);
        if (alive) {
          setContacts(list);
          setAttachable(att);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [deal.saved_company_id]);

  const currentStage = useMemo(() => stages.find((s) => s.id === stageId), [stages, stageId]);

  // Company-profile route target for cross-links. Prefer the resolved
  // lit_companies UUID; fall back to the deal's companyKey / company_id text
  // so the link still lands somewhere real even before the UUID resolves.
  const companyRouteId = useMemo(
    () =>
      companyUuid ||
      (deal as any).companyKey ||
      deal.company_id ||
      null,
    [companyUuid, deal],
  );
  const companyHref = companyRouteId
    ? `/app/companies/${encodeURIComponent(String(companyRouteId))}`
    : null;

  function goCompany(tab?: "quotes" | "inbox") {
    if (!companyHref) {
      toast({ title: "No linked company for this deal" });
      return;
    }
    navigate(tab ? `${companyHref}?tab=${tab}` : companyHref);
    onClose();
  }

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
        service_type: serviceType || null,
        origin: origin.trim() || null,
        destination: destination.trim() || null,
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

  async function refreshQuotes() {
    const [linked, att] = await Promise.all([
      listQuotesForDeal(deal.id),
      companyUuid ? listAttachableQuotes(companyUuid) : Promise.resolve([]),
    ]);
    setLinkedQuotes(linked);
    setAttachable(att);
  }

  async function handleAttachQuote() {
    if (!attachId) return;
    setQuoteBusy(true);
    try {
      // Attach only — we do NOT overwrite the deal's value. An open deal may
      // already reflect a negotiated figure; linked quotes are shown so a human
      // decides the true number. This is the anti-double-count rule.
      await attachQuoteToDeal(attachId, deal.id);
      setAttachId("");
      await refreshQuotes();
      toast({ title: "Quote linked to deal" });
    } catch (e: any) {
      toast({ title: "Could not link quote", description: e?.message, variant: "destructive" });
    } finally {
      setQuoteBusy(false);
    }
  }

  async function handleDetachQuote(quoteId: string) {
    setQuoteBusy(true);
    try {
      await detachQuoteFromDeal(quoteId);
      await refreshQuotes();
    } catch (e: any) {
      toast({ title: "Could not unlink quote", description: e?.message, variant: "destructive" });
    } finally {
      setQuoteBusy(false);
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
          <CompanyAvatar name={deal.companyName || deal.title} domain={deal.companyDomain || undefined} size="sm" className="shrink-0" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: theme.heading }}>
              {deal.companyName || "Deal"}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textMuted }}>
              {currentStage?.name ?? "—"} · {formatMoney(value === "" ? null : Number(value), deal.currency)}
            </div>
            {(serviceType || origin || destination) ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {serviceType ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 9px",
                      borderRadius: 999,
                      border: `1px solid ${mode === "dark" ? "rgba(59,130,246,0.4)" : "#BFDBFE"}`,
                      background: mode === "dark" ? "rgba(59,130,246,0.16)" : "#EFF6FF",
                      color: mode === "dark" ? "#93C5FD" : "#1D4ED8",
                      fontFamily: FONT_HEAD,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {DEAL_SERVICE_TYPE_LABELS[serviceType]}
                  </span>
                ) : null}
                {(origin || destination) ? (
                  <span style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textMuted }}>
                    Lane: <b style={{ color: theme.text }}>{origin || "—"}</b> → <b style={{ color: theme.text }}>{destination || "—"}</b>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <button onClick={onClose} style={iconBtn(theme)} title="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Cross-links — tie the deal back to the company's 360 hub: the
            company profile, its quotes, and its inbox/email threads. */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 20px",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.panel,
            flexWrap: "wrap",
          }}
        >
          <button onClick={() => goCompany()} style={crossLinkBtn(theme)} title="Open company profile">
            <Building2 style={{ width: 13, height: 13 }} />
            Company
          </button>
          <button onClick={() => goCompany("quotes")} style={crossLinkBtn(theme)} title="Company quotes">
            <FileText style={{ width: 13, height: 13 }} />
            Quotes
          </button>
          <button onClick={() => goCompany("inbox")} style={crossLinkBtn(theme)} title="Company inbox / email">
            <Mail style={{ width: 13, height: 13 }} />
            Inbox
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Editable fields */}
          <Section title="Details">
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle(theme)} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Value">
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" style={inputStyle(theme)} />
              </Field>
              <Field label="Stage">
                <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={inputStyle(theme)}>
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
                <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={inputStyle(theme)} />
              </Field>
              <Field label="Owner">
                <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={inputStyle(theme)}>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Service type">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {DEAL_SERVICE_TYPES.map((m) => {
                  const active = serviceType === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setServiceType(active ? "" : m)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: active ? `1.5px solid ${theme.accentBorder}` : `1.5px solid ${theme.borderStrong}`,
                        background: active ? theme.accentSoft : theme.panel,
                        color: active ? theme.accentSoftText : theme.textMuted,
                        fontFamily: FONT_HEAD,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {DEAL_SERVICE_TYPE_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="From (origin)">
                <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Origin" style={inputStyle(theme)} />
              </Field>
              <Field label="To (destination)">
                <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination" style={inputStyle(theme)} />
              </Field>
            </div>
            <Field label="Primary contact">
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={inputStyle(theme)}>
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
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle(theme), resize: "vertical" }} />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={primaryBtn(theme)}>
                {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
                Save changes
              </button>
              <button onClick={handleDelete} style={dangerBtn(theme)} title="Delete deal">
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
                style={{ ...inputStyle(theme), flex: 1 }}
              />
              <input type="date" value={newTaskDue} onChange={(e) => setNewTaskDue(e.target.value)} style={{ ...inputStyle(theme), width: 140 }} />
              <button onClick={handleAddTask} style={iconBtnBlue(theme)} title="Add task">
                <Plus style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {tasks.length === 0 ? (
                <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textFaint }}>No tasks yet.</div>
              ) : (
                tasks.map((t) => (
                  <div key={t.id} style={taskRow(theme)}>
                    <button onClick={() => toggleTask(t)} style={{ ...checkbox(theme), background: t.status === "done" ? "#22C55E" : theme.panel, borderColor: t.status === "done" ? "#22C55E" : theme.borderStrong }} title="Toggle done">
                      {t.status === "done" ? <Check style={{ width: 12, height: 12, color: "#FFFFFF" }} /> : null}
                    </button>
                    <span style={{ flex: 1, fontFamily: FONT_BODY, fontSize: 13, color: t.status === "done" ? theme.textFaint : theme.text, textDecoration: t.status === "done" ? "line-through" : "none" }}>
                      {t.title}
                    </span>
                    {t.due_date ? (
                      <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: isOverdue(t.due_date) && t.status === "open" ? theme.danger : theme.textMuted }}>
                        {formatDate(t.due_date)}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Section>

          {/* Quotes — quotes linked to this deal roll UP into the deal's value.
              The deal is the single source of truth for pipeline value, so
              reporting counts the deal, never the linked quotes → no
              double-count. Attaching a quote does NOT overwrite deal value. */}
          <Section
            title={`Quotes${linkedQuotes.length ? ` (${linkedQuotes.length})` : ""}`}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {linkedQuotes.length === 0 ? (
                <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textFaint }}>
                  No quotes linked yet.
                </div>
              ) : (
                linkedQuotes.map((q) => (
                  <div key={q.id} style={quoteRow(theme)}>
                    <button
                      onClick={() => {
                        navigate(`/app/quoting/${q.id}`);
                        onClose();
                      }}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: mode === "dark" ? "#93C5FD" : "#1d4ed8",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title="Open quote"
                    >
                      {q.quote_number ?? "Quote"}
                    </button>
                    <span style={quoteStatusPill(q.status, mode)}>{quoteStatusLabel(q.status)}</span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: theme.text,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatMoney(q.total_sell ?? null, q.currency ?? deal.currency)}
                    </span>
                    <button
                      onClick={() => handleDetachQuote(q.id)}
                      disabled={quoteBusy}
                      style={iconBtn(theme)}
                      title="Unlink quote"
                    >
                      <Unlink style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                ))
              )}
            </div>
            {/* Attach an existing (unlinked) company quote. */}
            {attachable.length > 0 ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <select
                  value={attachId}
                  onChange={(e) => setAttachId(e.target.value)}
                  style={{ ...inputStyle(theme), flex: 1 }}
                >
                  <option value="">Link an existing quote…</option>
                  {attachable.map((q) => (
                    <option key={q.id} value={q.id}>
                      {(q.quote_number ?? "Quote") +
                        " · " +
                        formatMoney(q.total_sell ?? null, q.currency ?? deal.currency)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAttachQuote}
                  disabled={!attachId || quoteBusy}
                  style={iconBtnBlue(theme)}
                  title="Link quote to this deal"
                >
                  {quoteBusy ? (
                    <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Link2 style={{ width: 15, height: 15 }} />
                  )}
                </button>
              </div>
            ) : null}
          </Section>

          {/* Timeline */}
          <Section title="Timeline">
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                placeholder="Log a note…"
                style={{ ...inputStyle(theme), flex: 1 }}
              />
              <button onClick={handleAddNote} style={iconBtnBlue(theme)} title="Add note">
                <Plus style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {activity.length === 0 ? (
                <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textFaint }}>No activity yet.</div>
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
  const { theme } = useCrmTheme();
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
        <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: theme.textMuted }}>
          <b style={{ color: theme.text }}>{actor}</b> {label}
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: theme.textFaint }}>{formatDate(a.created_at)}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useCrmTheme();
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
  const { theme } = useCrmTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.textFaint }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle(theme: CrmThemeTokens): React.CSSProperties {
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

function primaryBtn(theme: CrmThemeTokens): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 10,
    border: "none",
    background: theme.accentBorder,
    color: "#FFFFFF",
    fontFamily: FONT_HEAD,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function dangerBtn(theme: CrmThemeTokens): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 10,
    border: `1.5px solid ${theme.dangerBorder}`,
    background: theme.panel,
    color: theme.danger,
    cursor: "pointer",
  };
}

function iconBtn(theme: CrmThemeTokens): React.CSSProperties {
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
  };
}

function iconBtnBlue(theme: CrmThemeTokens): React.CSSProperties {
  return {
    ...iconBtn(theme),
    border: `1.5px solid ${theme.mode === "dark" ? "rgba(59,130,246,0.4)" : "#BFDBFE"}`,
    background: theme.mode === "dark" ? "rgba(59,130,246,0.16)" : "#EFF6FF",
    color: theme.mode === "dark" ? "#93C5FD" : "#3B82F6",
  };
}

function crossLinkBtn(theme: CrmThemeTokens): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 11px",
    borderRadius: 9,
    border: `1px solid ${theme.border}`,
    background: theme.panelAlt,
    color: theme.textMuted,
    fontFamily: FONT_HEAD,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function quoteRow(theme: CrmThemeTokens): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "6px 8px",
    borderRadius: 8,
    background: theme.panelAlt,
    border: `1px solid ${theme.border}`,
  };
}

function quoteStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    sent: "Sent",
    viewed: "Viewed",
    approved: "Approved",
    closed_won: "Won",
    closed_lost: "Lost",
    expired: "Expired",
  };
  return map[status] ?? status;
}

function quoteStatusPill(status: string, mode: "light" | "dark" = "light"): React.CSSProperties {
  const light: Record<string, { bg: string; fg: string; bd: string }> = {
    closed_won: { bg: "#ECFDF5", fg: "#047857", bd: "#A7F3D0" },
    approved: { bg: "#ECFEFF", fg: "#0e7490", bd: "#A5F3FC" },
    sent: { bg: "#EFF6FF", fg: "#1d4ed8", bd: "#BFDBFE" },
    viewed: { bg: "#EFF6FF", fg: "#1d4ed8", bd: "#BFDBFE" },
    closed_lost: { bg: "#FEF2F2", fg: "#b91c1c", bd: "#FECACA" },
    expired: { bg: "#F1F5F9", fg: "#64748b", bd: "#E2E8F0" },
    draft: { bg: "#F1F5F9", fg: "#475569", bd: "#E2E8F0" },
  };
  // Dark tones — brighter fg on translucent tinted fills for legibility on slate.
  const dark: Record<string, { bg: string; fg: string; bd: string }> = {
    closed_won: { bg: "rgba(5,150,105,0.18)", fg: "#6EE7B7", bd: "rgba(16,185,129,0.35)" },
    approved: { bg: "rgba(14,116,144,0.2)", fg: "#67E8F9", bd: "rgba(34,211,238,0.35)" },
    sent: { bg: "rgba(59,130,246,0.16)", fg: "#93C5FD", bd: "rgba(59,130,246,0.4)" },
    viewed: { bg: "rgba(59,130,246,0.16)", fg: "#93C5FD", bd: "rgba(59,130,246,0.4)" },
    closed_lost: { bg: "rgba(220,38,38,0.16)", fg: "#FCA5A5", bd: "rgba(248,113,113,0.4)" },
    expired: { bg: "rgba(148,163,184,0.14)", fg: "#94A3B8", bd: "rgba(148,163,184,0.3)" },
    draft: { bg: "rgba(148,163,184,0.14)", fg: "#CBD5E1", bd: "rgba(148,163,184,0.3)" },
  };
  const table = mode === "dark" ? dark : light;
  const t = table[status] ?? table.draft;
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 8px",
    borderRadius: 999,
    background: t.bg,
    color: t.fg,
    border: `1px solid ${t.bd}`,
    fontFamily: FONT_HEAD,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

function taskRow(theme: CrmThemeTokens): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "6px 8px",
    borderRadius: 8,
    background: theme.panelAlt,
    border: `1px solid ${theme.border}`,
  };
}

function checkbox(theme: CrmThemeTokens): React.CSSProperties {
  return {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: `1.5px solid ${theme.borderStrong}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  };
}
