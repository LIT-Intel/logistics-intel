"use client";

/**
 * Pipeline (Phase 2 placeholder). The board/Kanban view is a follow-up; for
 * now we render the live per-stage summary from `lit_leadcrm_pipeline_summary`
 * (counts + conversion rates) so the tab is useful immediately and null-safe
 * against the near-empty backend. Full drag board lands in Phase 2.
 */
import React from "react";
import { KanbanSquare, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { type PipelineStageSummary, pipelineSummary } from "@/api/leadCrm";
import { FONT_HEAD, FONT_BODY, FONT_MONO, stageBadgeStyle, stageDot } from "./leadCrmFormat";

export default function PipelinePage() {
  const { data: rows = [], isLoading } = useQuery<PipelineStageSummary[]>({
    queryKey: ["lead-crm", "pipeline-summary"],
    queryFn: pipelineSummary,
    staleTime: 30_000,
  });

  const ordered = [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const total = ordered.reduce((acc, r) => acc + (r.lead_count || 0), 0);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#F8FAFC" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 48px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
            Pipeline
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#94A3B8", background: "#F1F5F9", borderRadius: 999, padding: "2px 8px", fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Phase 2 preview
          </span>
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginBottom: 18 }}>
          Per-stage counts and conversion. The drag-and-drop board is coming next.
        </div>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "48px 0", color: "#64748b", fontFamily: FONT_BODY, fontSize: 14 }}>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            Loading pipeline…
          </div>
        ) : ordered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", background: "#F1F5F9", marginBottom: 14 }}>
              <KanbanSquare style={{ width: 22, height: 22, color: "#94a3b8" }} />
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: "#0F172A" }}>No pipeline data yet</div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 4 }}>
              Stage counts appear here once leads start flowing in.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {ordered.map((r) => {
              const pct = total > 0 ? Math.round(((r.lead_count || 0) / total) * 100) : 0;
              return (
                <div key={r.stage_id ?? r.stage_name ?? Math.random()} style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={stageBadgeStyle(r.color)}>{r.stage_name || "Stage"}</span>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: stageDot(r.color), flexShrink: 0 }} />
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 700, color: "#0F172A", marginTop: 10 }}>
                    {r.lead_count ?? 0}
                  </div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                    {pct}% of pipeline
                    {r.conversion_rate != null ? ` · ${Math.round((r.conversion_rate || 0) * 100)}% conv.` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
