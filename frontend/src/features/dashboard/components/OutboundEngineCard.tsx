/**
 * OutboundEngineCard — Dashboard rebuild right-rail dark accent card
 * (Morning Brief handoff §3.2 right rail #4).
 *
 * Same data path as the legacy LITDashboard: getCampaignsFromSupabase
 * (org id via useEntitlements, scope via useAdminScope) + the batched
 * lit_campaign_metrics_batch RPC (fetchCampaignMetricsBatch).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useAdminScope } from "@/hooks/useAdminScope";
import { getCampaignsFromSupabase } from "@/lib/supabase";
import { fetchCampaignMetricsBatch } from "@/features/outbound/api/campaignMetrics";

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  sfg: string;
  sent: string;
  open: string;
  reply: string;
}

const ACTIVE_RE = /^(ACTIVE|RUNNING|LIVE)$/;

function useOutboundCampaigns(): { campaigns: CampaignRow[]; loading: boolean } {
  const { entitlements } = useEntitlements() as any;
  const { scope: adminScope } = useAdminScope() as any;
  const orgId = entitlements?.org_id || null;

  const q = useQuery({
    queryKey: ["dash-v2-campaigns", orgId, adminScope],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CampaignRow[]> => {
      const rows: any[] = (await getCampaignsFromSupabase({ orgId, adminScope })) ?? [];
      // getCampaignsFromSupabase already orders by created_at desc.
      const top = rows.slice(0, 3);
      const metrics = await fetchCampaignMetricsBatch(
        top.map((c) => String(c.id)).filter(Boolean),
      );
      return top.map((c) => {
        const f = metrics.get(String(c.id));
        const status = String(c.status || c.state || "draft").toUpperCase();
        const sent = Number(f?.sent ?? 0);
        return {
          id: String(c.id),
          name: String(c.campaign_name || c.name || "Untitled campaign"),
          status,
          sfg: ACTIVE_RE.test(status) ? "#34d399" : "#94a3b8",
          sent: sent.toLocaleString("en-US"),
          open: f?.openRate != null && sent > 0 ? `${Math.round(f.openRate)}%` : "—",
          reply: f?.replyRate != null && sent > 0 ? `${f.replyRate.toFixed(1)}%` : "—",
        };
      });
    },
  });

  return { campaigns: q.data ?? [], loading: q.isLoading };
}

export default function OutboundEngineCard() {
  const navigate = useNavigate();
  const { campaigns, loading } = useOutboundCampaigns();
  const rows = useMemo(() => campaigns.slice(0, 3), [campaigns]);

  return (
    <section
      style={{
        background: "#0F172A",
        border: "1px solid #1e293b",
        borderRadius: 14,
        padding: "18px 20px",
        color: "#f8fafc",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -60,
          top: -60,
          width: 180,
          height: 180,
          borderRadius: 999,
          background: "radial-gradient(circle,rgba(0,240,255,0.16),transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          font: `600 10px ${F_DISPLAY}`,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#00F0FF",
        }}
      >
        Outbound Engine
      </div>

      {loading ? (
        <div style={{ padding: "14px 0", font: `400 12px ${F_BODY}`, color: "#94a3b8" }}>
          Loading campaigns…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "14px 0", font: `400 12px/1.5 ${F_BODY}`, color: "#94a3b8" }}>
          No campaigns yet. Launch your first sequence from the Outbound Engine.
        </div>
      ) : (
        rows.map((c) => (
          <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid #1e293b" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                fontSize: 13,
                fontFamily: F_BODY,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.name}
              </span>
              <span style={{ flex: "none", font: `600 10px ${F_MONO}`, color: c.sfg }}>
                {c.status}
              </span>
            </div>
            <div style={{ font: `500 11px ${F_MONO}`, color: "#94a3b8", marginTop: 4 }}>
              {c.sent} sent · {c.open} open · {c.reply} reply
            </div>
          </div>
        ))
      )}

      <div
        onClick={() => navigate("/app/campaigns")}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate("/app/campaigns");
        }}
        style={{
          marginTop: 12,
          font: `600 12px ${F_BODY}`,
          color: "#60a5fa",
          cursor: "pointer",
          position: "relative",
        }}
      >
        Open Outbound Engine
      </div>
    </section>
  );
}
