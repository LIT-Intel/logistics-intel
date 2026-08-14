"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Clock, CheckSquare } from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useToast } from "@/components/ui/use-toast";
import {
  type DealCard,
  type DealStage,
  listStages,
  listDeals,
  moveDealStage,
} from "@/api/crm";
import { formatMoney, sumMoney, daysBetween, formatDate, initials, avatarColor, isOverdue } from "./crmFormat";
import DealDetailDrawer from "./DealDetailDrawer";
import CreateDealModal from "./CreateDealModal";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

/**
 * Pipeline board (Kanban). Columns = stages, cards = deals. Drag-and-drop
 * between columns uses native HTML5 DnD (no @dnd-kit dependency in the
 * repo). Column headers show count + summed value. Deal cards open the
 * DealDetailDrawer. Horizontal scroll of columns on mobile.
 */
export default function PipelineBoard({ viewAsUserId = "" }: { viewAsUserId?: string }) {
  const { toast } = useToast();
  const [stages, setStages] = useState<DealStage[]>([]);
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<DealCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // viewAsUserId (owner/admin "view as [member]") narrows the deal read to
      // one member; "" = All members. RLS still scopes members to own rows.
      const [s, d] = await Promise.all([listStages(), listDeals(viewAsUserId || null)]);
      setStages(s);
      setDeals(d);
      if (!s.length) {
        setError("This workspace has no pipeline yet. Create your first deal to get started.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [viewAsUserId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, DealCard[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const d of deals) {
      if (map[d.stage_id]) map[d.stage_id].push(d);
    }
    return map;
  }, [stages, deals]);

  async function handleDrop(stageId: string) {
    const id = dragId;
    setDragId(null);
    setDragOverStage(null);
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage_id === stageId) return;
    // optimistic move
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage_id: stageId } : d)));
    try {
      await moveDealStage(id, stageId);
      // refresh so derived status (won/lost) + activity are current
      reload();
    } catch (e: any) {
      toast({ title: "Move failed", description: e?.message, variant: "destructive" });
      reload();
    }
  }

  // Click-to-move fallback (accessible + mobile-friendly): move a card via a
  // small stage menu from the card footer. Native DnD is the primary path.
  async function handleClickMove(dealId: string, stageId: string) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage_id: stageId } : d)));
    try {
      await moveDealStage(dealId, stageId);
      reload();
    } catch (e: any) {
      toast({ title: "Move failed", description: e?.message, variant: "destructive" });
      reload();
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8FAFC" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #E5E7EB", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: "#6366F1", letterSpacing: "0.24em", textTransform: "uppercase" }}>Pipeline</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>Deals board</div>
        </div>
        <button onClick={() => setCreating(true)} disabled={!stages.length} style={primaryBtn}>
          <Plus style={{ width: 15, height: 15 }} />
          New deal
        </button>
      </div>

      {loading ? (
        <div style={centerMsg}>
          <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Loading pipeline…
        </div>
      ) : error && !stages.length ? (
        <div style={{ ...centerMsg, flexDirection: "column", gap: 14 }}>
          <div style={{ color: "#64748b" }}>{error}</div>
          <button onClick={() => setCreating(true)} style={primaryBtn}>
            <Plus style={{ width: 15, height: 15 }} />
            New deal
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: 16 }}>
          <div style={{ display: "flex", gap: 14, height: "100%", minWidth: "min-content" }}>
            {stages.map((stage) => {
              const cards = dealsByStage[stage.id] ?? [];
              const total = sumMoney(cards.map((c) => c.value_amount));
              const isOver = dragOverStage === stage.id;
              return (
                <div
                  key={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverStage !== stage.id) setDragOverStage(stage.id);
                  }}
                  onDragLeave={() => dragOverStage === stage.id && setDragOverStage(null)}
                  onDrop={() => handleDrop(stage.id)}
                  style={{
                    width: 288,
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    background: isOver ? "#EFF6FF" : "#F1F5F9",
                    border: isOver ? "1.5px dashed #3B82F6" : "1px solid #E5E7EB",
                    borderRadius: 14,
                    overflow: "hidden",
                    transition: "background 120ms, border-color 120ms",
                  }}
                >
                  {/* Column header */}
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #E5E7EB", background: "#FFFFFF" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: "#0F172A", flex: 1 }}>{stage.name}</span>
                      <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: "#64748b", background: "#F1F5F9", borderRadius: 9999, padding: "1px 8px" }}>{cards.length}</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#64748b", marginTop: 4 }}>{formatMoney(total)}</div>
                  </div>

                  {/* Cards */}
                  <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    {cards.length === 0 ? (
                      <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>Drop deals here</div>
                    ) : (
                      cards.map((deal) => (
                        <DealCardView
                          key={deal.id}
                          deal={deal}
                          stages={stages}
                          dragging={dragId === deal.id}
                          onDragStart={() => setDragId(deal.id)}
                          onDragEnd={() => setDragId(null)}
                          onOpen={() => setActiveDeal(deal)}
                          onMove={handleClickMove}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeDeal ? (
        <DealDetailDrawer
          deal={activeDeal}
          stages={stages}
          onClose={() => setActiveDeal(null)}
          onChanged={reload}
        />
      ) : null}

      {creating ? (
        <CreateDealModal stages={stages} onClose={() => setCreating(false)} onCreated={reload} />
      ) : null}
    </div>
  );
}

function DealCardView({
  deal,
  stages,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onMove,
}: {
  deal: DealCard;
  stages: DealStage[];
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onMove: (dealId: string, stageId: string) => void;
}) {
  const days = daysBetween(deal.updated_at);
  const overdueTask = deal.nextTaskDue && isOverdue(deal.nextTaskDue);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: 11,
        cursor: "grab",
        boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
        opacity: dragging ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CompanyAvatar name={deal.companyName || deal.title} domain={deal.companyDomain || undefined} size="sm" className="shrink-0" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {deal.companyName || deal.title}
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.title}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>{formatMoney(deal.value_amount, deal.currency)}</span>
        {deal.ownerName ? (
          <span title={`Owner: ${deal.ownerName}`} style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColor(deal.ownerName), color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 700 }}>
            {initials(deal.ownerName)}
          </span>
        ) : null}
      </div>

      {deal.contactName ? (
        <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: "#64748b", marginTop: 6 }}>{deal.contactName}</div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        {days != null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: FONT_BODY, fontSize: 10.5, color: "#94a3b8" }}>
            <Clock style={{ width: 11, height: 11 }} />
            {days}d in stage
          </span>
        ) : null}
        {deal.openTaskCount ? (
          <span title={deal.nextTaskDue ? `Next task due ${formatDate(deal.nextTaskDue)}` : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: FONT_BODY, fontSize: 10.5, fontWeight: 600, color: overdueTask ? "#dc2626" : "#64748b" }}>
            <CheckSquare style={{ width: 11, height: 11 }} />
            {deal.nextTaskDue ? formatDate(deal.nextTaskDue) : `${deal.openTaskCount} task${deal.openTaskCount > 1 ? "s" : ""}`}
          </span>
        ) : null}
      </div>

      {/* Click-to-move fallback for accessibility / touch. */}
      <select
        value={deal.stage_id}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onMove(deal.id, e.target.value);
        }}
        style={{
          marginTop: 9,
          width: "100%",
          padding: "4px 6px",
          borderRadius: 7,
          border: "1px solid #E5E7EB",
          background: "#F8FAFC",
          fontFamily: FONT_BODY,
          fontSize: 11,
          color: "#475569",
          outline: "none",
          cursor: "pointer",
        }}
        title="Move to stage"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            Move to: {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

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

const centerMsg: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  color: "#64748b",
  fontFamily: FONT_BODY,
  fontSize: 14,
};
