"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Clock, CheckSquare, Linkedin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useToast } from "@/components/ui/use-toast";
import {
  type DealCard,
  type DealStage,
  DEAL_SERVICE_TYPE_LABELS,
  listStages,
  listDeals,
  moveDealStage,
} from "@/api/crm";
import { formatMoney, sumMoney, daysBetween, formatDate, initials, avatarColor, isOverdue } from "./crmFormat";
import DealDetailDrawer from "./DealDetailDrawer";
import CreateDealModal from "./CreateDealModal";
import { useCrmTheme, type CrmThemeTokens } from "./CommandCenterTheme";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

/** Honor OS-level reduced-motion (SSR-safe). */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Minimal self-contained confetti burst — no npm dependency. Paints a
 * short-lived full-screen canvas overlay of falling/rotating particles and
 * cleans itself up. Called only on the transition INTO a won stage, and
 * skipped when reduced-motion is preferred.
 */
function fireConfetti(): void {
  if (typeof document === "undefined") return;
  if (prefersReducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const W = (canvas.width = window.innerWidth * dpr);
  const H = (canvas.height = window.innerHeight * dpr);
  ctx.scale(dpr, dpr);
  const vw = window.innerWidth;
  const colors = ["#3B82F6", "#6366F1", "#22C55E", "#F59E0B", "#EC4899", "#0EA5E9"];
  const N = 130;
  const parts = Array.from({ length: N }, () => ({
    x: vw / 2 + (Math.random() - 0.5) * 120,
    y: window.innerHeight * 0.35 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 12,
    vy: Math.random() * -14 - 4,
    size: Math.random() * 7 + 4,
    color: colors[(Math.random() * colors.length) | 0],
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
  }));
  const gravity = 0.45;
  const start = performance.now();
  const DURATION = 2600;
  let raf = 0;
  function frame(now: number) {
    const elapsed = now - start;
    ctx!.clearRect(0, 0, W, H);
    const fade = Math.max(0, 1 - Math.max(0, elapsed - 1600) / 1000);
    for (const p of parts) {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx!.save();
      ctx!.globalAlpha = fade;
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx!.restore();
    }
    if (elapsed < DURATION) {
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
      canvas.remove();
    }
  }
  raf = requestAnimationFrame(frame);
}

/**
 * Pipeline board (Kanban). Columns = stages, cards = deals. Drag-and-drop
 * between columns uses native HTML5 DnD (no @dnd-kit dependency in the
 * repo). Column headers show count + summed value. Deal cards open the
 * DealDetailDrawer. Horizontal scroll of columns on mobile.
 */
export default function PipelineBoard({ viewAsUserId = "" }: { viewAsUserId?: string }) {
  const { toast } = useToast();
  const { theme, mode } = useCrmTheme();
  const [stages, setStages] = useState<DealStage[]>([]);
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<DealCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  // Deal id currently playing the muted "lost" dim-pulse (cleared after the animation).
  const [lostPulseId, setLostPulseId] = useState<string | null>(null);
  const [linkedinPending, setLinkedinPending] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    supabase.from("lit_linkedin_outreach_actions").select("id", { count: "exact", head: true })
      .eq("status", "pending_approval")
      .then(({ count }) => { if (!cancelled) setLinkedinPending(count || 0); });
    return () => { cancelled = true; };
  }, []);

  const dealsByStage = useMemo(() => {
    const map: Record<string, DealCard[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const d of deals) {
      if (map[d.stage_id]) map[d.stage_id].push(d);
    }
    return map;
  }, [stages, deals]);

  // Fire the celebratory (won) / muted (lost) feedback — but ONLY when the deal
  // is transitioning INTO a won/lost stage from a stage that was not already the
  // same win/loss state. Prevents re-firing on same-column drops or re-renders.
  const celebrateMove = useCallback(
    (deal: DealCard, fromStageId: string, toStageId: string) => {
      if (fromStageId === toStageId) return;
      const from = stages.find((s) => s.id === fromStageId);
      const to = stages.find((s) => s.id === toStageId);
      if (!to) return;
      const label = deal.companyName || deal.title || "Deal";
      const value = formatMoney(deal.value_amount, deal.currency);
      if (to.is_won && !from?.is_won) {
        fireConfetti();
        toast({ title: `🎉 Won: ${label}`, description: value !== "—" ? value : undefined });
      } else if (to.is_lost && !from?.is_lost) {
        toast({ title: `Lost: ${label}`, description: value !== "—" ? value : undefined });
        if (!prefersReducedMotion()) {
          setLostPulseId(deal.id);
          window.setTimeout(() => {
            setLostPulseId((cur) => (cur === deal.id ? null : cur));
          }, 900);
        }
      }
    },
    [stages, toast],
  );

  async function handleDrop(stageId: string) {
    const id = dragId;
    setDragId(null);
    setDragOverStage(null);
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage_id === stageId) return;
    const fromStageId = deal.stage_id;
    // optimistic move
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage_id: stageId } : d)));
    celebrateMove(deal, fromStageId, stageId);
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
    const deal = deals.find((d) => d.id === dealId);
    if (deal && deal.stage_id !== stageId) celebrateMove(deal, deal.stage_id, stageId);
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: theme.bg }}>
      <style>{`
        @keyframes litLostPulse {
          0%   { box-shadow: 0 1px 2px ${theme.shadow}; background: ${theme.panel}; }
          35%  { box-shadow: 0 0 0 3px rgba(100,116,139,0.28); background: ${theme.panelMuted}; }
          100% { box-shadow: 0 1px 2px ${theme.shadow}; background: ${theme.panel}; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes litLostPulse { from {} to {} }
        }
      `}</style>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.panel, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: mode === "dark" ? "#A5B4FC" : "#6366F1", letterSpacing: "0.24em", textTransform: "uppercase" }}>Pipeline</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: theme.heading, letterSpacing: "-0.02em" }}>Deals board</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href="/app/inbox?channel=linkedin" style={{ ...secondaryBtn(theme), display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }} title="Open LinkedIn conversations and pending campaign actions">
            <Linkedin style={{ width: 14, height: 14, color: "#0A66C2" }} />
            LinkedIn activity{linkedinPending ? ` · ${linkedinPending} pending` : ""}
          </a>
          <button onClick={() => setCreating(true)} disabled={!stages.length} style={primaryBtn(theme)}>
            <Plus style={{ width: 15, height: 15 }} />
            New deal
          </button>
        </div>
      </div>

      {loading ? (
        <div style={centerMsg(theme)}>
          <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Loading pipeline…
        </div>
      ) : error && !stages.length ? (
        <div style={{ ...centerMsg(theme), flexDirection: "column", gap: 14 }}>
          <div style={{ color: theme.textMuted }}>{error}</div>
          <button onClick={() => setCreating(true)} style={primaryBtn(theme)}>
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
                    background: isOver ? theme.accentSoft : theme.panelAlt,
                    border: isOver ? `1.5px dashed ${theme.accentBorder}` : `1px solid ${theme.border}`,
                    borderRadius: 14,
                    overflow: "hidden",
                    transition: "background 120ms, border-color 120ms",
                  }}
                >
                  {/* Column header */}
                  <div style={{ padding: "12px 14px", borderBottom: `1px solid ${theme.border}`, background: theme.panel }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: theme.text, flex: 1 }}>{stage.name}</span>
                      <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: theme.textMuted, background: theme.panelMuted, borderRadius: 9999, padding: "1px 8px" }}>{cards.length}</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{formatMoney(total)}</div>
                  </div>

                  {/* Cards */}
                  <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    {cards.length === 0 ? (
                      <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: theme.textFaint, textAlign: "center", padding: "16px 0" }}>Drop deals here</div>
                    ) : (
                      cards.map((deal) => (
                        <DealCardView
                          key={deal.id}
                          deal={deal}
                          stages={stages}
                          dragging={dragId === deal.id}
                          lostPulse={lostPulseId === deal.id}
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
  lostPulse,
  onDragStart,
  onDragEnd,
  onOpen,
  onMove,
}: {
  deal: DealCard;
  stages: DealStage[];
  dragging: boolean;
  lostPulse: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onMove: (dealId: string, stageId: string) => void;
}) {
  const { theme, mode } = useCrmTheme();
  const days = daysBetween(deal.updated_at);
  const overdueTask = deal.nextTaskDue && isOverdue(deal.nextTaskDue);
  const serviceLabel = deal.service_type ? DEAL_SERVICE_TYPE_LABELS[deal.service_type] : null;
  const lane =
    deal.origin && deal.destination
      ? `${deal.origin} → ${deal.destination}`
      : deal.origin || deal.destination || null;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: 11,
        cursor: "grab",
        boxShadow: `0 1px 2px ${theme.shadow}`,
        opacity: dragging ? 0.5 : 1,
        animation: lostPulse ? "litLostPulse 900ms ease-out" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CompanyAvatar name={deal.companyName || deal.title} domain={deal.companyDomain || undefined} size="sm" className="shrink-0" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {deal.companyName || deal.title}
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: theme.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.title}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: mode === "dark" ? "#93C5FD" : "#1d4ed8" }}>{formatMoney(deal.value_amount, deal.currency)}</span>
        {deal.ownerName ? (
          <span title={`Owner: ${deal.ownerName}`} style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColor(deal.ownerName), color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 700 }}>
            {initials(deal.ownerName)}
          </span>
        ) : null}
      </div>

      {deal.contactName ? (
        <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: theme.textMuted, marginTop: 6 }}>{deal.contactName}</div>
      ) : null}

      {serviceLabel || lane ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
          {serviceLabel ? (
            <span
              title={`Service: ${serviceLabel}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontFamily: FONT_BODY,
                fontSize: 10,
                fontWeight: 600,
                color: theme.textMuted,
                background: theme.panelMuted,
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: "1px 6px",
                letterSpacing: "0.01em",
              }}
            >
              {serviceLabel}
            </span>
          ) : null}
          {lane ? (
            <span
              title={lane}
              style={{
                fontFamily: FONT_BODY,
                fontSize: 10.5,
                color: theme.textFaint,
                minWidth: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {lane}
            </span>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        {days != null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: FONT_BODY, fontSize: 10.5, color: theme.textFaint }}>
            <Clock style={{ width: 11, height: 11 }} />
            {days}d in stage
          </span>
        ) : null}
        {deal.openTaskCount ? (
          <span title={deal.nextTaskDue ? `Next task due ${formatDate(deal.nextTaskDue)}` : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: FONT_BODY, fontSize: 10.5, fontWeight: 600, color: overdueTask ? theme.danger : theme.textMuted }}>
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
          border: `1px solid ${theme.border}`,
          background: theme.inputBg,
          fontFamily: FONT_BODY,
          fontSize: 11,
          color: theme.textMuted,
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

function secondaryBtn(theme: CrmThemeTokens): React.CSSProperties {
  return {
    padding: "7px 11px",
    borderRadius: 9,
    border: `1px solid ${theme.border}`,
    background: theme.panel,
    color: theme.textMuted,
    fontFamily: FONT_HEAD,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function centerMsg(theme: CrmThemeTokens): React.CSSProperties {
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    color: theme.textMuted,
    fontFamily: FONT_BODY,
    fontSize: 14,
  };
}
