"use client";

/**
 * Pipeline kanban — the real drag-and-drop board for the Lead CRM.
 *
 * Columns = the 6 pipeline stages (ordered, stage-colored headers with counts);
 * cards = the leads in each stage (logo via CompanyAvatar, name/company, score,
 * assignee avatar). One efficient RPC (`lit_leadcrm_board`) returns leads grouped
 * + capped per stage; each column shows its true total with a "+N more" note when
 * the cap is exceeded. Dragging a card to another column calls
 * `lit_leadcrm_set_stage` (optimistic move + toast + refetch). Clicking a card
 * opens the LeadDetailDrawer. Mirrors the user-CRM PipelineBoard DnD pattern
 * (native HTML5 drag, no dnd-kit dependency). Every rendered value is coerced
 * through `asText` so no jsonb/object leaks in as a React child.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KanbanSquare, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useToast } from "@/components/ui/use-toast";
import {
  type BoardColumn,
  type Lead,
  type LeadStage,
  type Assignee,
  getBoard,
  listStages,
  listAssignees,
  setStage as apiSetStage,
} from "@/api/leadCrm";
import LeadDetailDrawer from "./LeadDetailDrawer";
import {
  FONT_HEAD,
  FONT_BODY,
  FONT_MONO,
  asText,
  initials,
  avatarColor,
  leadDisplayName,
  stageDot,
} from "./leadCrmFormat";

const CARD_CAP = 50;

export default function PipelinePage() {
  const { toast } = useToast();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);

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
    data: board = [],
    isLoading,
    refetch,
  } = useQuery<BoardColumn[]>({
    queryKey: ["lead-crm", "board"],
    queryFn: () => getBoard(CARD_CAP),
    staleTime: 15_000,
  });

  // Local mirror so optimistic drops render instantly before the refetch.
  useEffect(() => {
    setColumns(board);
  }, [board]);

  const stageById = useMemo(() => {
    const m: Record<string, LeadStage> = {};
    for (const s of stages) m[s.id] = s;
    return m;
  }, [stages]);

  const leadById = useMemo(() => {
    const m: Record<string, Lead> = {};
    for (const col of columns) for (const l of col.leads) m[l.id] = l;
    return m;
  }, [columns]);

  const handleDrop = useCallback(
    async (stageId: string) => {
      const id = dragId;
      setDragId(null);
      setDragOver(null);
      if (!id) return;
      const lead = leadById[id];
      if (!lead || lead.stage_id === stageId) return;
      const fromStage = lead.stage_id;

      // Optimistic move: pull the card from its column, push to the target.
      setColumns((prev) =>
        prev.map((col) => {
          if (col.stage_id === fromStage) {
            return { ...col, leads: col.leads.filter((l) => l.id !== id), total: Math.max(0, col.total - 1) };
          }
          if (col.stage_id === stageId) {
            const moved: Lead = { ...lead, stage_id: stageId, stage_name: col.stage_name };
            return { ...col, leads: [moved, ...col.leads], total: col.total + 1 };
          }
          return col;
        }),
      );

      try {
        await apiSetStage(id, stageId);
        const to = stageById[stageId];
        toast({ title: to?.is_won ? "Marked subscriber" : to?.is_lost ? "Marked lost" : "Stage updated" });
        refetch();
      } catch (e: any) {
        toast({ title: "Could not move lead", description: e?.message, variant: "destructive" });
        refetch();
      }
    },
    [dragId, leadById, stageById, toast, refetch],
  );

  const isEmpty = !isLoading && columns.every((c) => c.total === 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8FAFC" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #E5E7EB",
          background: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: "#3B82F6", letterSpacing: "0.22em", textTransform: "uppercase" }}>
            Pipeline
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
            Leads board
          </div>
        </div>
      </div>

      {isLoading ? (
        <div style={centerMsg}>
          <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Loading pipeline…
        </div>
      ) : columns.length === 0 ? (
        <div style={{ ...centerMsg, flexDirection: "column", gap: 12 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", background: "#F1F5F9" }}>
            <KanbanSquare style={{ width: 22, height: 22, color: "#94a3b8" }} />
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: "#0F172A" }}>No pipeline yet</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: 16 }}>
          <div style={{ display: "flex", gap: 14, height: "100%", minWidth: "min-content" }}>
            {columns.map((col) => {
              const isOver = dragOver === col.stage_id;
              const hidden = Math.max(0, col.total - col.leads.length);
              return (
                <div
                  key={col.stage_id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOver !== col.stage_id) setDragOver(col.stage_id);
                  }}
                  onDragLeave={() => dragOver === col.stage_id && setDragOver(null)}
                  onDrop={() => handleDrop(col.stage_id)}
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
                  {/* Column header — stage color + count */}
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #E5E7EB", background: "#FFFFFF" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: stageDot(col.color), flexShrink: 0 }} />
                      <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: "#0F172A", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {asText(col.stage_name) || "Stage"}
                      </span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: "#64748b", background: "#F1F5F9", borderRadius: 9999, padding: "1px 8px" }}>
                        {asText(col.total)}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    {col.leads.length === 0 ? (
                      <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>
                        Drop leads here
                      </div>
                    ) : (
                      <>
                        {col.leads.map((lead) => (
                          <LeadCardView
                            key={lead.id}
                            lead={lead}
                            dragging={dragId === lead.id}
                            onDragStart={() => setDragId(lead.id)}
                            onDragEnd={() => setDragId(null)}
                            onOpen={() => setOpenLead(lead)}
                          />
                        ))}
                        {hidden > 0 ? (
                          <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: "#94a3b8", textAlign: "center", padding: "6px 0" }}>
                            +{asText(hidden)} more — view in Leads
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

function LeadCardView({
  lead,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  lead: Lead;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const name = leadDisplayName(lead.full_name, lead.email);
  const company = lead.company_name || lead.company_domain || null;
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {company ? (
          <CompanyAvatar
            name={company}
            domain={lead.company_domain}
            logoUrl={lead.company_logo_url}
            size="sm"
            className="!h-6 !w-6 !rounded-md shrink-0"
          />
        ) : (
          <span
            style={{ width: 24, height: 24, borderRadius: 6, background: avatarColor(name), color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 700, flexShrink: 0 }}
          >
            {asText(initials(name))}
          </span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {asText(name)}
          </div>
          {company ? (
            <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {asText(company)}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, color: lead.lead_score != null ? "#1d4ed8" : "#94A3B8" }}>
          {lead.lead_score != null ? `Score ${asText(lead.lead_score)}` : "—"}
        </span>
        {lead.assignee_name ? (
          <span
            title={`Assigned: ${asText(lead.assignee_name)}`}
            style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColor(lead.assignee_name), color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 700, flexShrink: 0 }}
          >
            {asText(initials(lead.assignee_name))}
          </span>
        ) : (
          <span style={{ fontFamily: FONT_BODY, fontSize: 10, color: "#cbd5e1" }}>Unassigned</span>
        )}
      </div>
    </div>
  );
}

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
