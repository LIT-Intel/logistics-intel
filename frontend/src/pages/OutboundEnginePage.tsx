/**
 * /app/outbound — Outbound Engine v2 (CRM handoff 2026-09-28).
 * URL ↔ tab sync wrapper; gating lives in App.jsx (same campaign_builder
 * plan gate as /app/campaigns). Old campaigns pages stay routed for rollback.
 */
import { lazy, Suspense } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

const OutboundEngineV2 = lazy(() => import("@/features/outbound-v2/OutboundEngineV2"));

const TABS = ["campaigns", "inbox", "templates", "mailboxes"] as const;
type Tab = (typeof TABS)[number];

export default function OutboundEnginePage() {
  const { campaignId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("tab") ?? "campaigns";
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : "campaigns";

  return (
    <Suspense fallback={null}>
      <OutboundEngineV2
        initialTab={tab}
        campaignId={campaignId ?? null}
        onNavigate={(t: Tab, id?: string | null) =>
          navigate(
            id
              ? `/app/outbound/campaigns/${id}`
              : t === "campaigns"
                ? "/app/outbound"
                : `/app/outbound?tab=${t}`,
            { replace: true },
          )
        }
      />
    </Suspense>
  );
}
