/**
 * PipelineV2 — Command Center → Pipeline (handoff README §Pipeline).
 * Layout A: board over the org's REAL stages (HTML5 DnD like the prototype:
 * drag-over highlight, drop on Lost opens the reason modal, stale badge,
 * next-step footer, dashed empty drop zone; board bleeds to the page edges).
 * Layout B: forecast list grouped by expected close month with the
 * 5-segment stage progress. Quota attainment is NOT built (no quota data).
 * Layout persisted in localStorage `lit-crm-layout-pipeline`.
 */
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarDays,
  CircleAlert,
  CircleX,
  Handshake,
  Hourglass,
  Layers,
  Plus,
  Scale,
  Trophy,
} from "lucide-react";
import LogoTile from "@/features/dashboard/components/LogoTile";
import CreateDealModal from "@/features/crm/CreateDealModal";
import ViewAsFilter from "@/features/crm/ViewAsFilter";
import { formatMoney, initials, avatarColor } from "@/features/crm/crmFormat";
import type { DealStage } from "@/api/crm";
import {
  createTaskV2,
  incrementRuleRunCount,
  markLost,
  setStage,
  type DealCardV2,
} from "./api";
import { useCrmV2Data, getLayoutPref, setLayoutPref } from "./data/useCrmV2Data";
import {
  selectPipelineColumns,
  selectPipelineKpis,
  selectForecastGroups,
  stageProbability,
  isStale,
  hasNoStep,
  daysSinceTouch,
  serviceBucketOf,
  dueLabel,
  dueColor,
  SERVICE_BUCKETS,
  type CompanyHealth,
} from "./data/computeCrm";
import DealPanelV2, { type DealIntel } from "./DealPanelV2";
import LostReasonModal from "./LostReasonModal";
import {
  CARD,
  Crm2Style,
  F_BODY,
  F_DISPLAY,
  F_MONO,
  KpiCard,
  LayoutSwitcher,
  OwnerAvatars,
  SearchBox,
  SegRow,
  ToggleChip,
  primaryBtnStyle,
} from "./ui";

const LAYOUT_KEY = "lit-crm-layout-pipeline";

export interface PipelineV2Props {
  /** Owner/admin "view as [member]" — "" = all members (RLS still applies). */
  viewAsUserId?: string;
  /** Setter from CommandCenter — when provided, renders the compact member
   *  selector (owner/admin only) that switches viewAsUserId + refetches. */
  onViewAsChange?: (userId: string) => void;
  /** Optional company shipment health, keyed by lit_companies uuid. */
  healthByCompanyUuid?: Record<string, CompanyHealth>;
  /** Optional shipment intel for the deal panel, keyed by company uuid. */
  intelByCompanyUuid?: Record<string, DealIntel>;
}

export default function PipelineV2({
  viewAsUserId = "",
  onViewAsChange,
  healthByCompanyUuid,
  intelByCompanyUuid,
}: PipelineV2Props) {
  const { deals, stages, members, rules, loading, error, refetchDeals, refetchTasks } = useCrmV2Data(viewAsUserId);
  const [layout, setLayout] = useState<"A" | "B">(() => getLayoutPref(LAYOUT_KEY, "A"));
  const [q, setQ] = useState("");
  const [service, setService] = useState("all");
  const [staleOnly, setStaleOnly] = useState(false);
  const [noStepOnly, setNoStepOnly] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<DealCardV2 | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const now = Date.now();
  const setLayoutBoth = (v: "A" | "B") => {
    setLayout(v);
    setLayoutPref(LAYOUT_KEY, v);
  };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return deals.filter((d) => {
      if (ownerFilter && d.owner_user_id !== ownerFilter) return false;
      if (service !== "all" && serviceBucketOf(d.service_type) !== service) return false;
      if (staleOnly && !isStale(d, now)) return false;
      if (noStepOnly && !hasNoStep(d)) return false;
      if (ql) {
        const hay = `${d.companyName ?? ""} ${d.title} ${d.contactName ?? ""}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [deals, q, service, staleOnly, noStepOnly, ownerFilter, now]);

  const columns = useMemo(() => selectPipelineColumns(filtered, stages, now), [filtered, stages, now]);
  const kpis = useMemo(() => selectPipelineKpis(deals, stages, now), [deals, stages, now]);
  const groups = useMemo(() => selectForecastGroups(filtered, stages), [filtered, stages]);
  const openDeal = openDealId ? deals.find((d) => d.id === openDealId) ?? null : null;

  // ── Stage move + side effects (spec §Stage-move side effects) ────────
  const quotedRule = rules.find((r) => r.rule_key === "quoted_followup");
  const moveDeal = async (deal: DealCardV2, to: DealStage) => {
    if (deal.stage_id === to.id) return;
    if (to.is_lost) {
      setLostFor(deal);
      return;
    }
    const fromName = stages.find((s) => s.id === deal.stage_id)?.name ?? null;
    try {
      await setStage(deal.id, to, fromName);
      if (to.name.trim().toLowerCase() === "quoted" && quotedRule?.enabled) {
        const due = new Date(now + 2 * 86_400_000).toISOString().slice(0, 10);
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
        void refetchTasks();
        toast(`Automation: created “Follow up on quote” for ${deal.companyName ?? deal.title}, due in 2 days`);
      } else if (to.is_won) {
        toast(`${deal.companyName ?? deal.title} won · ${formatMoney(deal.value_amount)}. Harvey will watch for expansion lanes.`);
      } else if (!deal.next_step_text) {
        toast(`Moved to ${to.name}. Add a next step to keep it moving.`);
      } else {
        toast(`${deal.companyName ?? deal.title} moved to ${to.name}`);
      }
      void refetchDeals();
    } catch (e: any) {
      toast.error(e?.message ?? "Move failed");
    }
  };

  const confirmLost = async (reason: string) => {
    if (!lostFor) return;
    const lostStage = stages.find((s) => s.is_lost);
    if (!lostStage) throw new Error("This pipeline has no Lost stage.");
    const fromName = stages.find((s) => s.id === lostFor.stage_id)?.name ?? null;
    await markLost(lostFor.id, reason, lostStage, fromName);
    setLostFor(null);
    void refetchDeals();
  };

  // ── DnD (HTML5, prototype idiom) ─────────────────────────────────────
  const onDragStart = (e: DragEvent, dealId: string) => {
    e.dataTransfer.setData("text/plain", dealId);
    e.dataTransfer.effectAllowed = "move";
    window.setTimeout(() => setDragId(dealId), 0);
  };
  const onDragEnd = () => {
    setDragId(null);
    setOverStage(null);
  };
  const onDrop = (e: DragEvent, stage: DealStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setOverStage(null);
    setDragId(null);
    const deal = deals.find((d) => d.id === id);
    if (deal) void moveDeal(deal, stage);
  };

  const serviceSeg: Array<[string, string]> = [["all", "All pipelines"], ...SERVICE_BUCKETS.map((b) => [b, b] as [string, string])];

  return (
    <div className="crm2-pad" style={{ paddingBottom: 96 }}>
      <Crm2Style />
      {/* KPI row */}
      <div className="crm2-kpirow" style={{ marginTop: 20 }}>
        <KpiCard label="Open pipeline" icon={Layers} value={formatMoney(kpis.openValue)} delta={String(kpis.openCount)} deltaColor="#2563eb" sub="open deals" />
        <KpiCard label="Weighted forecast" icon={Scale} value={formatMoney(kpis.weighted)} sub="value × stage probability" />
        <KpiCard label="Commit" icon={Handshake} value={formatMoney(kpis.commit)} sub="in Negotiation" />
        <KpiCard label="Won this quarter" icon={Trophy} value={formatMoney(kpis.wonQtd)} sub="closed won" />
        <KpiCard label="Going stale" icon={Hourglass} value={String(kpis.staleCount)} deltaColor="#d97706" sub="no touch in 14+ days" />
        <KpiCard label="No next step" icon={CircleAlert} value={String(kpis.noStepCount)} deltaColor="#e11d48" sub="open deals" />
      </div>

      {/* Toolbar */}
      <div className="crm2-toolbar" style={{ marginTop: 16, marginLeft: -32, marginRight: -32, paddingLeft: 32, paddingRight: 32 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search deals and companies…" />
        <SegRow items={serviceSeg} value={service} onChange={setService} />
        <ToggleChip label="Stale" icon={Hourglass} on={staleOnly} onClick={() => setStaleOnly(!staleOnly)} />
        <ToggleChip label="No next step" icon={CircleAlert} on={noStepOnly} onClick={() => setNoStepOnly(!noStepOnly)} />
        <OwnerAvatars members={members} active={ownerFilter} onPick={setOwnerFilter} />
        {onViewAsChange ? <ViewAsFilter value={viewAsUserId} onChange={onViewAsChange} /> : null}
        <span style={{ flex: 1 }} />
        <button type="button" className="crm2-cta crm2-focus" style={primaryBtnStyle()} onClick={() => setCreating(true)} disabled={!stages.length}>
          <Plus size={15} /> New deal
        </button>
        <LayoutSwitcher options={[["A", "Board"], ["B", "Forecast list"]]} value={layout} onChange={setLayoutBoth} />
      </div>

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", font: `400 14px ${F_BODY}`, color: "#64748b" }}>Loading pipeline…</div>
      ) : error ? (
        <div style={{ padding: "48px 0", textAlign: "center", font: `400 14px ${F_BODY}`, color: "#e11d48" }}>{error}</div>
      ) : layout === "A" ? (
        /* ── Layout A · Board ─────────────────────────────────────────── */
        <div className="crm2-board" style={{ marginTop: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(270px, 1fr))`,
              gap: 12,
              minWidth: Math.max(1, columns.length) * 282,
              alignItems: "start",
            }}
          >
            {columns.map((col) => {
              const s = col.stage;
              const isOver = overStage === s.id;
              return (
                <div
                  key={s.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overStage !== s.id) setOverStage(s.id);
                  }}
                  onDragLeave={() => overStage === s.id && setOverStage(null)}
                  onDrop={(e) => onDrop(e, s)}
                  style={{
                    background: isOver ? "rgba(0,240,255,0.06)" : "#F8FAFC",
                    border: `1px solid ${isOver ? "rgba(0,200,212,0.7)" : "#E5E7EB"}`,
                    borderRadius: 14,
                    padding: 12,
                    minHeight: 520,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    transition: "background 120ms, border-color 120ms",
                  }}
                >
                  {/* Column header */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flex: "none" }} />
                      <span style={{ font: `600 14px ${F_DISPLAY}`, color: "#0F172A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                      <span style={{ font: `600 11px ${F_MONO}`, color: "#64748b", background: "#F1F5F9", borderRadius: 999, padding: "2px 8px" }}>{col.count}</span>
                      <span style={{ font: `600 13px ${F_MONO}`, color: "#0F172A" }}>{formatMoney(col.total)}</span>
                    </div>
                    <div style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8", marginTop: 4 }}>
                      {col.isClosedCol ? (s.is_won ? "This quarter" : "Last 90 days") : `${formatMoney(col.weighted)} weighted · ${Math.round(col.probability * 100)}%`}
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: s.color, opacity: 0.7, marginTop: 8 }} />
                  </div>
                  {/* Cards */}
                  {col.deals.length === 0 ? (
                    <div style={{ border: "1.5px dashed #CBD5E1", borderRadius: 12, padding: "24px 10px", textAlign: "center", font: `600 12px ${F_BODY}`, color: "#94a3b8" }}>
                      Drop a deal here
                    </div>
                  ) : (
                    col.deals.map((d) => (
                      <BoardCard
                        key={d.id}
                        deal={d}
                        stages={stages}
                        now={now}
                        dragging={dragId === d.id}
                        onDragStart={(e) => onDragStart(e, d.id)}
                        onDragEnd={onDragEnd}
                        onOpen={() => setOpenDealId(d.id)}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Layout B · Forecast list ─────────────────────────────────── */
        <div style={{ ...CARD, marginTop: 16, overflow: "hidden" }}>
          <div className="crm2-scroll-x">
            <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["Deal", "Stage", "Value", "Prob.", "Weighted", "Next step", "Last touch", "Owner"].map((h) => (
                    <th key={h} style={{ textAlign: h === "Deal" || h === "Stage" || h === "Next step" ? "left" : "right", padding: "9px 14px", font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "36px 14px", textAlign: "center", font: `400 13px ${F_BODY}`, color: "#64748b" }}>
                      No open deals match these filters.
                    </td>
                  </tr>
                )}
                {groups.map((g) => (
                  <GroupRows key={g.key} group={g} stages={stages} now={now} onOpen={setOpenDealId} />
                ))}
              </tbody>
            </table>
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
      {lostFor && (
        <LostReasonModal
          companyName={lostFor.companyName ?? lostFor.title}
          onCancel={() => setLostFor(null)}
          onConfirm={confirmLost}
        />
      )}
      {creating && (
        <CreateDealModal
          stages={stages}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void refetchDeals();
          }}
        />
      )}
    </div>
  );
}

// ── Board card (spec §Layout A deal card) ──────────────────────────────
function BoardCard({
  deal,
  stages,
  now,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  deal: DealCardV2;
  stages: DealStage[];
  now: number;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const stage = stages.find((s) => s.id === deal.stage_id);
  const p = stageProbability(stage, stages);
  const value = Number(deal.value_amount) || 0;
  const closed = deal.status !== "open";
  const stale = isStale(deal, now);
  const touch = daysSinceTouch(deal, now);
  const daysInStage = deal.stage_entered_at
    ? Math.max(0, Math.floor((now - new Date(deal.stage_entered_at).getTime()) / 86_400_000))
    : null;
  const lane =
    deal.origin && deal.destination ? `${deal.origin} → ${deal.destination}` : deal.origin || deal.destination || null;
  const stepDueDiff = (() => {
    if (!deal.next_step_due) return null;
    const d = new Date(deal.next_step_due + "T00:00:00");
    if (Number.isNaN(d.getTime())) return null;
    const n = new Date(now);
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    return Math.round((d.getTime() - today) / 86_400_000);
  })();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="crm2-card-hover"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        cursor: "grab",
        opacity: dragging ? 0.4 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <LogoTile name={deal.companyName ?? deal.title} domain={deal.companyDomain} size={30} radius={8} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 13px ${F_DISPLAY}`, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {deal.companyName ?? deal.title}
          </div>
          <div style={{ font: `400 11px ${F_BODY}`, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {daysInStage != null ? `${daysInStage}d in stage · ` : ""}
            {formatMoney(value * p)} weighted
          </div>
        </div>
        {deal.ownerName ? (
          <span title={deal.ownerName} style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: avatarColor(deal.ownerName), color: "#fff", font: `700 9px ${F_DISPLAY}` }}>
            {initials(deal.ownerName)}
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ font: `600 16px ${F_MONO}`, color: "#1d4ed8" }}>{formatMoney(value, deal.currency)}</span>
        {deal.service_type ? (
          <span style={{ font: `600 10px ${F_BODY}`, color: "#475569", background: "#F1F5F9", borderRadius: 4, padding: "2px 6px" }}>
            {serviceBucketOf(deal.service_type)}
          </span>
        ) : null}
        {!closed && stale && touch != null ? (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, font: `600 10px ${F_BODY}`, color: "#b45309", background: "rgba(245,158,11,0.14)", borderRadius: 999, padding: "3px 8px" }}>
            <Hourglass size={10} /> {touch}d no touch
          </span>
        ) : null}
      </div>

      {lane ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ font: `400 12px ${F_BODY}`, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lane}</span>
        </div>
      ) : null}

      {/* Footer: next step / no step / closed */}
      <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 8 }}>
        {closed ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: `600 12px ${F_BODY}`, color: deal.status === "won" ? "#059669" : "#e11d48" }}>
            {deal.status === "won" ? <Trophy size={12} /> : <CircleX size={12} />}
            {deal.status === "won" ? "Closed won" : `Lost · ${deal.lost_reason ?? "—"}`}
          </span>
        ) : deal.next_step_text ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <CalendarCheck size={12} color="#0891b2" style={{ flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0, font: `400 12px ${F_BODY}`, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {deal.next_step_text}
            </span>
            <span style={{ font: `500 11px ${F_MONO}`, color: dueColor(stepDueDiff), flex: "none" }}>{stepDueDiff != null ? dueLabel(stepDueDiff) : ""}</span>
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: `600 12px ${F_BODY}`, color: "#e11d48" }}>
            <CircleAlert size={12} /> No next step
          </span>
        )}
      </div>
    </div>
  );
}

// ── Forecast list group (Layout B) ─────────────────────────────────────
function GroupRows({
  group,
  stages,
  now,
  onOpen,
}: {
  group: { key: string; label: string; deals: DealCardV2[]; total: number; weighted: number };
  stages: DealStage[];
  now: number;
  onOpen: (id: string) => void;
}) {
  const openStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position).filter((s) => !s.is_lost).slice(0, 5),
    [stages],
  );
  return (
    <>
      <tr style={{ background: "#FBFCFD" }}>
        <td colSpan={8} style={{ padding: "8px 14px", borderTop: "1px solid #F1F5F9" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <CalendarDays size={13} color="#0e7490" />
            <span style={{ font: `600 13px ${F_DISPLAY}`, color: "#0F172A" }}>{group.label}</span>
            <span style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8" }}>
              {group.deals.length} deal{group.deals.length === 1 ? "" : "s"} · {formatMoney(group.total)} total
            </span>
            <span style={{ font: `600 12px ${F_MONO}`, color: "#1d4ed8", marginLeft: "auto" }}>{formatMoney(group.weighted)} weighted</span>
          </span>
        </td>
      </tr>
      {group.deals.map((d) => {
        const stage = stages.find((s) => s.id === d.stage_id);
        const p = stageProbability(stage, stages);
        const value = Number(d.value_amount) || 0;
        const touch = daysSinceTouch(d, now);
        const stageIdx = stage ? openStages.findIndex((s) => s.id === stage.id) : -1;
        const stepDiff = (() => {
          if (!d.next_step_due) return null;
          const dd = new Date(d.next_step_due + "T00:00:00");
          if (Number.isNaN(dd.getTime())) return null;
          const n = new Date(now);
          const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
          return Math.round((dd.getTime() - today) / 86_400_000);
        })();
        return (
          <tr key={d.id} className="crm2-row" onClick={() => onOpen(d.id)} style={{ cursor: "pointer", borderTop: "1px solid #F1F5F9" }}>
            <td style={{ padding: "10px 14px", minWidth: 220 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <LogoTile name={d.companyName ?? d.title} domain={d.companyDomain} size={26} radius={7} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", font: `600 13px ${F_DISPLAY}`, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.companyName ?? d.title}
                  </span>
                  <span style={{ display: "block", font: `400 11px ${F_BODY}`, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                </span>
              </span>
            </td>
            <td style={{ padding: "10px 14px", minWidth: 130 }}>
              <span style={{ font: `600 12px ${F_BODY}`, color: stage?.color ?? "#64748b" }}>{stage?.name ?? "—"}</span>
              <span style={{ display: "flex", gap: 2, marginTop: 5 }}>
                {openStages.map((s, j) => (
                  <span key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, background: stageIdx >= 0 && j <= stageIdx ? stage?.color ?? "#E2E8F0" : "#E2E8F0" }} />
                ))}
              </span>
            </td>
            <td style={{ padding: "10px 14px", textAlign: "right", font: `600 13px ${F_MONO}`, color: "#0F172A", whiteSpace: "nowrap" }}>{formatMoney(value, d.currency)}</td>
            <td style={{ padding: "10px 14px", textAlign: "right", font: `500 12px ${F_MONO}`, color: "#64748b" }}>{Math.round(p * 100)}%</td>
            <td style={{ padding: "10px 14px", textAlign: "right", font: `600 13px ${F_MONO}`, color: "#1d4ed8", whiteSpace: "nowrap" }}>{formatMoney(value * p)}</td>
            <td style={{ padding: "10px 14px", minWidth: 180 }}>
              {d.next_step_text ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <CalendarCheck size={12} color="#0891b2" style={{ flex: "none" }} />
                  <span style={{ font: `400 12px ${F_BODY}`, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.next_step_text}</span>
                  <span style={{ font: `500 11px ${F_MONO}`, color: dueColor(stepDiff), flex: "none" }}>{stepDiff != null ? dueLabel(stepDiff) : ""}</span>
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: `600 12px ${F_BODY}`, color: "#e11d48" }}>
                  <CircleAlert size={12} /> No next step
                </span>
              )}
            </td>
            <td style={{ padding: "10px 14px", textAlign: "right", font: `500 12px ${F_MONO}`, color: touch != null && touch > 14 ? "#d97706" : "#475569", whiteSpace: "nowrap" }}>
              {touch == null ? "—" : touch === 0 ? "today" : `${touch}d ago`}
            </td>
            <td style={{ padding: "10px 14px", textAlign: "right" }}>
              {d.ownerName ? (
                <span title={d.ownerName} style={{ width: 24, height: 24, borderRadius: "50%", display: "inline-grid", placeItems: "center", background: avatarColor(d.ownerName), color: "#fff", font: `700 9px ${F_DISPLAY}` }}>
                  {initials(d.ownerName)}
                </span>
              ) : null}
            </td>
          </tr>
        );
      })}
    </>
  );
}
