/**
 * TasksV2 — Command Center → Tasks (handoff README §Tasks).
 * Layout A: Overdue / Today / Upcoming section cards + sticky Automations
 * card wired to real lit_automation_rules toggles (+ run_count).
 * Layout B: Focus mode — big card, context boxes, outcome chips persisted
 * to lit_tasks.outcome, Complete-and-next / Snooze(+1d → snoozed_until) /
 * Skip, Up-next list. Harvey talking points render ONLY when real company
 * shipment info is provided via props (else the box is hidden entirely).
 * Layout persisted in localStorage `lit-crm-layout-tasks`.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlarmClock,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCheck,
  Linkedin,
  Mail,
  Phone,
  Plus,
  User,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import LogoTile from "@/features/dashboard/components/LogoTile";
import ViewAsFilter from "@/features/crm/ViewAsFilter";
import { formatMoney, initials, avatarColor } from "@/features/crm/crmFormat";
import { setTaskStatus } from "@/api/crm";
import {
  createTaskV2,
  snoozeTask,
  setTaskOutcome,
  toggleAutomationRule,
  type DealCardV2,
  type TaskV2,
} from "./api";
import { useCrmV2Data, getLayoutPref, setLayoutPref } from "./data/useCrmV2Data";
import {
  selectTaskSections,
  selectFocusQueue,
  dueDayDiff,
  dueLabel,
  dueColor,
  effectiveDue,
  type CompanyHealth,
} from "./data/computeCrm";
import DealPanelV2, { type DealIntel } from "./DealPanelV2";
import {
  CARD,
  Crm2Style,
  CYAN,
  F_BODY,
  F_DISPLAY,
  F_MONO,
  KpiCard,
  LayoutSwitcher,
  OwnerAvatars,
  SearchBox,
  SegRow,
  SectionLabel,
  ToggleSwitch,
  primaryBtnStyle,
} from "./ui";

const LAYOUT_KEY = "lit-crm-layout-tasks";

const TYPE_STYLE: Record<string, { Icon: LucideIcon; fg: string; bg: string; action: string }> = {
  call: { Icon: Phone, fg: "#0e7490", bg: "rgba(0,240,255,0.12)", action: "Call" },
  email: { Icon: Mail, fg: "#1d4ed8", bg: "rgba(59,130,246,0.12)", action: "Email" },
  linkedin: { Icon: Linkedin, fg: "#0369a1", bg: "rgba(14,165,233,0.12)", action: "Connect" },
  meeting: { Icon: Calendar, fg: "#7c3aed", bg: "rgba(139,92,246,0.12)", action: "Schedule" },
};
const SRC_STYLE: Record<string, { Icon: LucideIcon; fg: string; bg: string }> = {
  signal: { Icon: Activity, fg: "#0e7490", bg: "rgba(0,240,255,0.10)" },
  automation: { Icon: Workflow, fg: "#7c3aed", bg: "rgba(139,92,246,0.10)" },
  manual: { Icon: User, fg: "#475569", bg: "#F1F5F9" },
};
const typeStyle = (t: string | null | undefined) => TYPE_STYLE[t ?? "call"] ?? TYPE_STYLE.call;
const srcStyle = (s: string | null | undefined) => SRC_STYLE[s ?? "manual"] ?? SRC_STYLE.manual;

const OUTCOMES = ["Connected", "Left voicemail", "No answer", "Wrong person"];

export interface TasksV2Props {
  viewAsUserId?: string;
  /** Setter from CommandCenter — renders the compact member selector (owner/
   *  admin only) that switches viewAsUserId + refetches. */
  onViewAsChange?: (userId: string) => void;
  healthByCompanyUuid?: Record<string, CompanyHealth>;
  intelByCompanyUuid?: Record<string, DealIntel>;
}

export default function TasksV2({ viewAsUserId = "", onViewAsChange, healthByCompanyUuid, intelByCompanyUuid }: TasksV2Props) {
  const { tasks, deals, stages, members, rules, loading, refetchTasks, refetchRules, refetchDeals } =
    useCrmV2Data(viewAsUserId);
  const [layout, setLayout] = useState<"A" | "B">(() => getLayoutPref(LAYOUT_KEY, "A"));
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [doneIds, setDoneIds] = useState<string[]>([]); // session strike-through before refetch
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const now = Date.now();
  const setLayoutBoth = (v: "A" | "B") => {
    setLayout(v);
    setLayoutPref(LAYOUT_KEY, v);
  };

  const dealById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const stagesById = useMemo(
    () => new Map(stages.map((s) => [s.id, { name: s.name, color: s.color }])),
    [stages],
  );

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (ownerFilter && t.assignee_user_id !== ownerFilter) return false;
      if (kind !== "all") {
        if (kind === "signal" || kind === "automation") {
          if ((t.source ?? "manual") !== kind) return false;
        } else if ((t.task_type ?? "call") !== kind) return false;
      }
      if (ql) {
        const deal = t.deal_id ? dealById.get(t.deal_id) : null;
        const hay = `${t.title} ${deal?.companyName ?? ""}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [tasks, q, kind, ownerFilter, dealById]);

  const sections = useMemo(() => selectTaskSections(filtered, now), [filtered, now]);
  const queue = useMemo(
    () => selectFocusQueue(filtered, now).filter((t) => !doneIds.includes(t.id)),
    [filtered, now, doneIds],
  );
  const focusTask = queue.length ? queue[focusIdx % queue.length] : null;
  const openDeal = openDealId ? deals.find((d) => d.id === openDealId) ?? null : null;

  const completeTask = async (t: TaskV2, withOutcome?: string | null) => {
    try {
      if (withOutcome !== undefined) await setTaskOutcome(t.id, withOutcome);
      await setTaskStatus(t.id, "done");
      setDoneIds((p) => [...p, t.id]);
      setSessionCompleted((n) => n + 1);
      setOutcome(null);
      toast(`Done · ${t.title}${withOutcome ? ` · ${withOutcome}` : ""}`);
      void refetchTasks();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not complete the task");
    }
  };

  const snooze = async (t: TaskV2) => {
    try {
      const eff = effectiveDue(t);
      const base = eff ? new Date(eff + "T00:00:00").getTime() : now;
      const from = Math.max(base, now);
      const until = new Date(from + 86_400_000);
      const untilStr = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, "0")}-${String(until.getDate()).padStart(2, "0")}`;
      await snoozeTask(t.id, untilStr);
      setOutcome(null);
      toast(`Snoozed · ${t.title}`);
      void refetchTasks();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not snooze the task");
    }
  };

  const kpiCounts = useMemo(() => {
    const s = selectTaskSections(tasks, now);
    return {
      overdue: s.overdue.length,
      today: s.today.length,
      upcoming: s.upcoming.length,
      signal: tasks.filter((t) => (t.source ?? "manual") === "signal").length,
      rulesOn: rules.filter((r) => r.enabled).length,
    };
  }, [tasks, rules, now]);

  return (
    <div className="crm2-pad" style={{ paddingBottom: 96 }}>
      <Crm2Style />
      <div className="crm2-kpirow" style={{ marginTop: 20 }}>
        <KpiCard label="Overdue" icon={AlarmClock} value={String(kpiCounts.overdue)} sub="past due date" deltaColor="#e11d48" />
        <KpiCard label="Due today" icon={CalendarCheck} value={String(kpiCounts.today)} sub="by end of day" />
        <KpiCard label="Upcoming" icon={CalendarDays} value={String(kpiCounts.upcoming)} sub="scheduled ahead" />
        <KpiCard label="Signal-triggered" icon={Activity} value={String(kpiCounts.signal)} sub="from shipment data" />
        <KpiCard label="Completed" icon={CheckCheck} value={String(sessionCompleted)} sub="this session" />
        <KpiCard label="Automations" icon={Workflow} value={String(kpiCounts.rulesOn)} sub="rules on" />
      </div>

      <div className="crm2-toolbar" style={{ marginTop: 16, marginLeft: -32, marginRight: -32, paddingLeft: 32, paddingRight: 32 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search tasks and companies…" />
        <SegRow
          items={[
            ["all", "All"],
            ["call", "Calls"],
            ["email", "Emails"],
            ["linkedin", "LinkedIn"],
            ["meeting", "Meetings"],
            ["signal", "Signal-triggered"],
            ["automation", "Automated"],
          ]}
          value={kind}
          onChange={(v) => {
            setKind(v);
            setFocusIdx(0);
          }}
        />
        <OwnerAvatars members={members} active={ownerFilter} onPick={setOwnerFilter} />
        {onViewAsChange ? <ViewAsFilter value={viewAsUserId} onChange={onViewAsChange} /> : null}
        <span style={{ flex: 1 }} />
        <button type="button" className="crm2-cta crm2-focus" style={primaryBtnStyle()} onClick={() => setAdding(true)}>
          <Plus size={15} /> Add task
        </button>
        <LayoutSwitcher options={[["A", "Queue"], ["B", "Focus mode"]]} value={layout} onChange={setLayoutBoth} />
      </div>

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", font: `400 14px ${F_BODY}`, color: "#64748b" }}>Loading tasks…</div>
      ) : layout === "A" ? (
        /* ── Layout A · Queue ─────────────────────────────────────────── */
        <div className="crm2-2col" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {(
              [
                ["Overdue", "#e11d48", sections.overdue, "Oldest first"],
                ["Today", "#d97706", sections.today, "Due by end of day"],
                ["Upcoming", "#3b82f6", sections.upcoming, "Scheduled ahead"],
              ] as Array<[string, string, TaskV2[], string]>
            )
              .filter(([, , items]) => items.length > 0)
              .map(([label, color, items, hint]) => (
                <div key={label} style={{ ...CARD, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: "1px solid #F1F5F9" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ font: `600 14px ${F_DISPLAY}`, color: "#0F172A" }}>{label}</span>
                    <span style={{ font: `600 11px ${F_MONO}`, color: "#64748b", background: "#F1F5F9", borderRadius: 999, padding: "2px 8px" }}>
                      {items.filter((t) => !doneIds.includes(t.id)).length}
                    </span>
                    <span style={{ font: `400 11px ${F_BODY}`, color: "#94a3b8", marginLeft: "auto" }}>{hint}</span>
                  </div>
                  {items.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      deal={t.deal_id ? dealById.get(t.deal_id) ?? null : null}
                      done={doneIds.includes(t.id)}
                      members={members}
                      now={now}
                      onToggle={() => completeTask(t)}
                      onOpen={() => t.deal_id && setOpenDealId(t.deal_id)}
                    />
                  ))}
                </div>
              ))}
            {sections.overdue.length + sections.today.length + sections.upcoming.length === 0 && (
              <div style={{ ...CARD, padding: 36, textAlign: "center", font: `400 13px ${F_BODY}`, color: "#64748b" }}>
                No open tasks match these filters.
              </div>
            )}
          </div>

          {/* Automations (sticky) */}
          <div style={{ ...CARD, padding: 18, position: "sticky", top: 72 }}>
            <SectionLabel icon={Workflow}>Automations</SectionLabel>
            <div style={{ font: `400 12px ${F_BODY}`, color: "#64748b", marginTop: 6 }}>
              Rules that create tasks and move deals for you.
            </div>
            {/* item 5: these are real toggles on lit_automation_rules; the rules
                fire server-side on a cron (owned by the orchestrator) — nothing
                is executed client-side here. */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.06em", textTransform: "uppercase", color: "#0e7490", background: "rgba(8,145,178,0.10)", borderRadius: 999, padding: "3px 9px" }}>
              <Workflow size={11} /> Runs automatically
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
              {rules.map((r) => (
                <div key={r.rule_key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `600 12.5px ${F_BODY}`, color: "#0F172A" }}>
                      When {r.when}, then {r.then}
                    </div>
                    <div style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8", marginTop: 3 }}>
                      {r.enabled ? (r.run_count > 0 ? `Ran ${r.run_count} time${r.run_count === 1 ? "" : "s"}` : "On · not run yet") : "Off"}
                    </div>
                  </div>
                  <ToggleSwitch
                    on={r.enabled}
                    label={`Toggle rule: when ${r.when}`}
                    onClick={async () => {
                      try {
                        await toggleAutomationRule(r.rule_key, !r.enabled);
                        toast(`Automation ${r.enabled ? "off" : "on"} · when ${r.when}`);
                        void refetchRules();
                      } catch (e: any) {
                        toast.error(e?.message ?? "Could not update the rule");
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled
              title="Coming soon"
              style={{ marginTop: 14, background: "transparent", border: "none", color: "#94a3b8", font: `600 12px ${F_DISPLAY}`, cursor: "default", padding: 0 }}
            >
              + New rule
            </button>
          </div>
        </div>
      ) : (
        /* ── Layout B · Focus mode ────────────────────────────────────── */
        <div className="crm2-2col-wide" style={{ marginTop: 16 }}>
          {focusTask ? (
            <FocusCard
              task={focusTask}
              pos={`${(focusIdx % queue.length) + 1} of ${queue.length}`}
              deal={focusTask.deal_id ? dealById.get(focusTask.deal_id) ?? null : null}
              intel={
                focusTask.deal_id
                  ? (() => {
                      const d = dealById.get(focusTask.deal_id!);
                      return d?.company_id ? intelByCompanyUuid?.[d.company_id] ?? null : null;
                    })()
                  : null
              }
              stagesById={stagesById}
              outcome={outcome}
              now={now}
              onOutcome={(o) => setOutcome((cur) => (cur === o ? null : o))}
              onComplete={() => completeTask(focusTask, outcome)}
              onSnooze={() => snooze(focusTask)}
              onSkip={() => {
                setFocusIdx((i) => i + 1);
                setOutcome(null);
              }}
              onOpenDeal={() => focusTask.deal_id && setOpenDealId(focusTask.deal_id)}
            />
          ) : (
            <div style={{ ...CARD, borderRadius: 16, padding: 48, textAlign: "center" }}>
              <CheckCheck size={34} color="#10b981" style={{ margin: "0 auto" }} />
              <div style={{ font: `700 22px ${F_DISPLAY}`, color: "#0F172A", marginTop: 12 }}>Queue cleared</div>
              <div style={{ font: `400 13px ${F_BODY}`, color: "#64748b", marginTop: 6 }}>No open tasks match these filters.</div>
            </div>
          )}
          {/* Up next */}
          <div style={{ ...CARD, padding: 16, position: "sticky", top: 72 }}>
            <SectionLabel icon={CalendarDays}>Up next</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
              {queue.length <= 1 && <div style={{ font: `400 12px ${F_BODY}`, color: "#94a3b8" }}>Nothing else queued.</div>}
              {queue
                .filter((_, i) => i !== focusIdx % Math.max(1, queue.length))
                .slice(0, 8)
                .map((t) => {
                  const ts = typeStyle(t.task_type);
                  const diff = dueDayDiff(t, now);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="crm2-row crm2-focus"
                      onClick={() => {
                        const idx = queue.findIndex((x) => x.id === t.id);
                        if (idx >= 0) setFocusIdx(idx);
                        setOutcome(null);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", width: "100%" }}
                    >
                      <span style={{ width: 28, height: 28, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", background: ts.bg }}>
                        <ts.Icon size={13} color={ts.fg} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, font: `600 12.5px ${F_BODY}`, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title}
                      </span>
                      <span style={{ font: `500 11px ${F_MONO}`, color: dueColor(diff), flex: "none" }}>{dueLabel(diff)}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {openDeal && (
        <DealPanelV2
          deal={openDeal}
          stages={stages}
          rules={rules}
          members={members}
          intel={openDeal.company_id ? intelByCompanyUuid?.[openDeal.company_id] ?? null : null}
          healthByCompanyUuid={healthByCompanyUuid}
          onClose={() => setOpenDealId(null)}
          onChanged={() => {
            void refetchDeals();
            void refetchTasks();
          }}
        />
      )}
      {adding && (
        <AddTaskModal
          deals={deals}
          members={members}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            void refetchTasks();
          }}
        />
      )}
    </div>
  );
}

// ── Queue row ──────────────────────────────────────────────────────────
function TaskRow({
  task,
  deal,
  done,
  members,
  now,
  onToggle,
  onOpen,
}: {
  task: TaskV2;
  deal: DealCardV2 | null;
  done: boolean;
  members: Array<{ user_id: string; name: string }>;
  now: number;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const ts = typeStyle(task.task_type);
  const ss = srcStyle(task.source);
  const diff = dueDayDiff(task, now);
  const ownerName = members.find((m) => m.user_id === task.assignee_user_id)?.name ?? null;
  return (
    <div
      className="crm2-row"
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 20px",
        borderTop: "1px solid #F8FAFC",
        opacity: done ? 0.6 : 1,
        cursor: task.deal_id ? "pointer" : "default",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        aria-label={done ? "Completed" : "Complete task"}
        className="crm2-press crm2-focus"
        onClick={(e) => {
          e.stopPropagation();
          if (!done) onToggle();
        }}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          flex: "none",
          border: `2px solid ${done ? "#10b981" : "#CBD5E1"}`,
          background: done ? "#10b981" : "#FFFFFF",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: 0,
        }}
      >
        {done ? <Check size={12} color="#fff" /> : null}
      </button>
      <span style={{ width: 36, height: 36, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: ts.bg }}>
        <ts.Icon size={16} color={ts.fg} />
      </span>
      <span style={{ flex: "1 1 200px", minWidth: 0 }}>
        <span style={{ display: "block", font: `600 14px ${F_BODY}`, color: done ? "#94a3b8" : "#0F172A", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </span>
        <span style={{ display: "block", font: `400 12px ${F_BODY}`, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {deal ? deal.companyName ?? deal.title : "No linked deal"}
        </span>
      </span>
      {task.trigger_label || task.source ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: `600 11px ${F_BODY}`, color: ss.fg, background: ss.bg, borderRadius: 999, padding: "3px 10px", flex: "none" }}>
          <ss.Icon size={11} />
          {task.trigger_label ?? (task.source ?? "manual")}
        </span>
      ) : null}
      <span style={{ font: `600 12px ${F_MONO}`, color: dueColor(diff), background: diff != null && diff < 0 ? "rgba(244,63,94,0.10)" : diff === 0 ? "rgba(245,158,11,0.12)" : "#F1F5F9", borderRadius: 8, padding: "4px 9px", flex: "none" }}>
        {dueLabel(diff)}
      </span>
      <button
        type="button"
        disabled
        title="Coming soon"
        onClick={(e) => e.stopPropagation()}
        style={{ height: 32, padding: "0 12px", borderRadius: 9, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#94a3b8", font: `600 12px ${F_DISPLAY}`, cursor: "default", flex: "none" }}
      >
        {ts.action}
      </button>
      {ownerName ? (
        <span title={ownerName} style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: avatarColor(ownerName), color: "#fff", font: `700 9px ${F_DISPLAY}` }}>
          {initials(ownerName)}
        </span>
      ) : null}
    </div>
  );
}

// ── Focus card (Layout B) ──────────────────────────────────────────────
function FocusCard({
  task,
  pos,
  deal,
  intel,
  stagesById,
  outcome,
  now,
  onOutcome,
  onComplete,
  onSnooze,
  onSkip,
  onOpenDeal,
}: {
  task: TaskV2;
  pos: string;
  deal: DealCardV2 | null;
  intel: DealIntel | null;
  stagesById: Map<string, { name: string; color: string }>;
  outcome: string | null;
  now: number;
  onOutcome: (o: string) => void;
  onComplete: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  onOpenDeal: () => void;
}) {
  const ts = typeStyle(task.task_type);
  const ss = srcStyle(task.source);
  const diff = dueDayDiff(task, now);
  const stage = deal ? stagesById.get(deal.stage_id) : null;
  // Talking points ONLY from real shipment info (spec: hide the Harvey box otherwise).
  const talkingPoints: string[] = [];
  if (intel) {
    if (intel.lastShipmentLabel) talkingPoints.push(`Last shipment ${intel.lastShipmentLabel}${intel.carrier ? `, booked with ${intel.carrier}` : ""}.`);
    if (intel.cadenceDays) talkingPoints.push(`They ship about every ${intel.cadenceDays} days — time the quote to the next booking.`);
    if (intel.signal) talkingPoints.push(`Signal: ${intel.signal}.`);
  }
  return (
    <div className="crm2-focuscard" style={{ ...CARD, borderRadius: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ font: `600 12px ${F_MONO}`, color: dueColor(diff), background: diff != null && diff < 0 ? "rgba(244,63,94,0.10)" : diff === 0 ? "rgba(245,158,11,0.12)" : "#F1F5F9", borderRadius: 999, padding: "4px 10px" }}>
          {dueLabel(diff)}
        </span>
        <span style={{ font: `400 12px ${F_BODY}`, color: "#94a3b8" }}>Task {pos}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, font: `600 11px ${F_BODY}`, color: ss.fg, background: ss.bg, borderRadius: 999, padding: "3px 10px" }}>
          <ss.Icon size={11} />
          {task.trigger_label ?? (task.source ?? "manual")}
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 18 }}>
        <span style={{ width: 52, height: 52, borderRadius: 14, flex: "none", display: "grid", placeItems: "center", background: ts.bg }}>
          <ts.Icon size={24} color={ts.fg} />
        </span>
        <h2 style={{ margin: 0, font: `700 32px/1.12 ${F_DISPLAY}`, letterSpacing: "-0.03em", color: "#0F172A", overflowWrap: "anywhere" }}>{task.title}</h2>
      </div>

      {/* Context boxes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={onOpenDeal}
          disabled={!deal}
          className="crm2-row crm2-focus"
          style={{ textAlign: "left", background: "#F8FAFC", border: "1px solid #EEF2F6", borderRadius: 12, padding: 12, cursor: deal ? "pointer" : "default" }}
        >
          <div style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Company</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            {deal ? <LogoTile name={deal.companyName ?? deal.title} domain={deal.companyDomain} size={26} radius={7} /> : null}
            <span style={{ font: `600 13px ${F_BODY}`, color: "#0F172A", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {deal ? deal.companyName ?? deal.title : "No linked deal"}
            </span>
          </div>
          {deal && stage ? (
            <div style={{ font: `500 11px ${F_MONO}`, marginTop: 6, color: stage.color }}>
              {stage.name} · {formatMoney(deal.value_amount, deal.currency)}
            </div>
          ) : null}
        </button>
        <div style={{ background: "#F8FAFC", border: "1px solid #EEF2F6", borderRadius: 12, padding: 12 }}>
          <div style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Contact</div>
          <div style={{ font: `600 13px ${F_BODY}`, color: deal?.contactName ? "#0F172A" : "#94a3b8", marginTop: 8 }}>
            {deal?.contactName ?? "No contact on file"}
          </div>
        </div>
        {intel?.signal || intel?.carrier ? (
          <div style={{ background: "#F8FAFC", border: "1px solid #EEF2F6", borderRadius: 12, padding: 12 }}>
            <div style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Shipment signal</div>
            <div style={{ font: `600 13px ${F_BODY}`, color: "#0e7490", marginTop: 8 }}>{intel.signal ?? "—"}</div>
            {intel.carrier ? <div style={{ font: `400 11px ${F_BODY}`, color: "#64748b", marginTop: 4 }}>Books with {intel.carrier}</div> : null}
          </div>
        ) : null}
      </div>

      {/* Harvey talking points — ONLY with real shipment info */}
      {talkingPoints.length > 0 && (
        <div style={{ background: "#0F172A", borderRadius: 12, padding: "14px 16px", marginTop: 14 }}>
          <div style={{ font: `600 10px ${F_MONO}`, letterSpacing: "0.14em", textTransform: "uppercase", color: CYAN }}>Harvey · talking points</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {talkingPoints.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ font: `600 11px ${F_MONO}`, color: CYAN, flex: "none" }}>0{i + 1}</span>
                <span style={{ font: `400 13px/1.5 ${F_BODY}`, color: "#e2e8f0" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outcome chips → lit_tasks.outcome */}
      <div style={{ marginTop: 16 }}>
        <div style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Log outcome</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {OUTCOMES.map((o) => {
            const on = outcome === o;
            return (
              <button
                key={o}
                type="button"
                className="crm2-chip crm2-focus"
                onClick={() => onOutcome(o)}
                style={{ height: 30, padding: "0 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? "#0F172A" : "#E5E7EB"}`, background: on ? "#0F172A" : "#FFFFFF", color: on ? "#FFFFFF" : "#334155", font: `600 12px ${F_BODY}` }}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
        <button type="button" className="crm2-cta crm2-focus" onClick={onComplete} style={{ ...primaryBtnStyle(), height: 44, padding: "0 18px" }}>
          <Check size={15} /> Complete and next
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          style={{ height: 44, padding: "0 16px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#94a3b8", font: `600 13px ${F_DISPLAY}`, cursor: "default" }}
        >
          {ts.action}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="crm2-press crm2-focus" onClick={onSnooze} style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#334155", font: `600 13px ${F_DISPLAY}`, cursor: "pointer" }}>
          Snooze 1 day
        </button>
        <button type="button" className="crm2-press crm2-focus" onClick={onSkip} style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "none", background: "transparent", color: "#64748b", font: `600 13px ${F_DISPLAY}`, cursor: "pointer" }}>
          Skip →
        </button>
      </div>
    </div>
  );
}

// ── Add-task modal (real createTaskV2) ─────────────────────────────────
function AddTaskModal({
  deals,
  members,
  onClose,
  onCreated,
}: {
  deals: DealCardV2[];
  members: Array<{ user_id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("call");
  const [due, setDue] = useState("");
  const [dealId, setDealId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await createTaskV2({
        title: title.trim(),
        task_type: type,
        due_date: due || null,
        deal_id: dealId || null,
        assignee_user_id: assignee || null,
        source: "manual",
      });
      toast(`Task added · ${title.trim()}`);
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the task");
      setSaving(false);
    }
  };

  const field: CSSProperties = { width: "100%", height: 38, borderRadius: 10, border: "1px solid #E5E7EB", padding: "0 12px", font: `400 13px ${F_BODY}`, color: "#0F172A", outline: "none", background: "#fff", boxSizing: "border-box" };
  return (
    <div onClick={onClose} className="crm2-scrim" style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(2,6,23,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" className="crm2-modal" style={{ width: 440, maxWidth: "100%", background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 30px 60px rgba(2,6,23,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ font: `700 20px ${F_DISPLAY}`, color: "#0F172A" }}>Add task</div>
          <button type="button" aria-label="Close" onClick={onClose} className="crm2-press crm2-focus" style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" style={field} autoFocus />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select value={type} onChange={(e) => setType(e.target.value)} style={field}>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="linkedin">LinkedIn</option>
              <option value="meeting">Meeting</option>
            </select>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={field} />
          </div>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} style={field}>
            <option value="">No linked deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.companyName ?? d.title}
              </option>
            ))}
          </select>
          {members.length > 1 && (
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={field}>
              <option value="">Assign to me</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" className="crm2-press crm2-focus" onClick={onClose} style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", color: "#0F172A", font: `600 13px ${F_DISPLAY}`, cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" className="crm2-cta crm2-focus" disabled={!title.trim() || saving} onClick={submit} style={{ ...primaryBtnStyle(), opacity: title.trim() ? 1 : 0.5 }}>
            {saving ? "Saving…" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}
