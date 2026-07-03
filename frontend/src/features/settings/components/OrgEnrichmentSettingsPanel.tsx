// Phase 4 - OrgEnrichmentSettingsPanel
//
// Settings tab panel for the multi-provider enrichment orchestrator. Reads
// + writes `lit_org_enrichment_settings`. Mirrors the OrgExitRulesPanel
// pattern: inline styles, supabase client directly, owner/admin-only writes
// (RLS enforces the security boundary).
//
// Provider cascade is a small ordered list. Admins reorder with up/down
// buttons; the orchestrator (`enrich-contact-orchestrator`) reads the
// stored order on every invocation. The Tier-3 toggle gates the
// ZoomInfo/Cognism stub - even when 'tier3' is in the order, the
// orchestrator skips it unless this toggle is on.

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePqCreditsSummary } from "@/api/intel";

function PqCreditsGauge() {
  const { data, isLoading } = usePqCreditsSummary();
  const remaining = data?.credits_remaining ?? null;
  const burned = data?.credits_burned_30d ?? 0;
  const lastSync = data?.last_sync_at
    ? new Date(data.last_sync_at).toLocaleString()
    : null;

  const tone =
    remaining == null
      ? { border: "#e2e8f0", bg: "#f8fafc", fg: "#64748b" }
      : remaining < 100
        ? { border: "#fecaca", bg: "#fef2f2", fg: "#b91c1c" }
        : remaining < 1000
          ? { border: "#fed7aa", bg: "#fff7ed", fg: "#c2410c" }
          : { border: "#bbf7d0", bg: "#f0fdf4", fg: "#15803d" };

  return (
    <div
      style={{
        marginTop: 24,
        padding: 14,
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        background: tone.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            ImportYeti PowerQuery credits
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: tone.fg, fontVariantNumeric: "tabular-nums" }}>
              {isLoading
                ? "..."
                : remaining == null
                  ? "-"
                  : remaining.toLocaleString()}
            </span>
            <span style={{ fontSize: 11, color: "#64748b" }}>remaining</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            30-day burn: <span style={{ fontWeight: 600, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{burned.toLocaleString()}</span>
          </div>
          {lastSync && (
            <div style={{ marginTop: 2, fontSize: 10, color: "#94a3b8" }}>
              Last sync: {lastSync}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ProviderName = "lemlist" | "apollo" | "tier3";

type EnrichmentSettings = {
  provider_order: ProviderName[];
  enable_tier3: boolean;
};

const DEFAULTS: EnrichmentSettings = {
  provider_order: ["lemlist", "apollo"],
  enable_tier3: false,
};

const PROVIDER_LABEL: Record<ProviderName, string> = {
  lemlist: "Lemlist",
  apollo: "Apollo fallback",
  tier3: "Tier-3 (ZoomInfo / Cognism)",
};

const PROVIDER_BLURB: Record<ProviderName, string> = {
  lemlist: "Primary enrichment path for email, phone, LinkedIn, verification, and campaign-ready profile data.",
  apollo: "Fallback for discovery and enrichment gaps when Lemlist does not return a match.",
  tier3: "Premium fallback for enterprise targets. Disabled until credentials are configured.",
};

const VALID_PROVIDERS: ProviderName[] = ["lemlist", "apollo", "tier3"];

function normalizeProviderOrder(rawOrder: string[]): ProviderName[] {
  const seen = new Set<ProviderName>();
  const normalized: ProviderName[] = [];
  for (const raw of rawOrder) {
    const provider = raw === "lusha" ? "lemlist" : raw;
    if (!VALID_PROVIDERS.includes(provider as ProviderName)) continue;
    const typed = provider as ProviderName;
    if (seen.has(typed)) continue;
    seen.add(typed);
    normalized.push(typed);
  }
  return normalized.length ? normalized : DEFAULTS.provider_order;
}

export default function OrgEnrichmentSettingsPanel({
  orgId,
  canWrite,
}: {
  orgId: string | null;
  canWrite: boolean;
}) {
  const [settings, setSettings] = useState<EnrichmentSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lit_org_enrichment_settings")
        .select("provider_order, enable_tier3")
        .eq("org_id", orgId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const rawOrder: string[] = Array.isArray((data as any).provider_order)
          ? (data as any).provider_order
          : DEFAULTS.provider_order;
        setSettings({
          provider_order: normalizeProviderOrder(rawOrder),
          enable_tier3: !!(data as any).enable_tier3,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const save = useCallback(async () => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("lit_org_enrichment_settings")
      .upsert(
        {
          org_id: orgId,
          provider_order: settings.provider_order,
          enable_tier3: settings.enable_tier3,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
    setSaving(false);
    if (error) {
      console.error("[OrgEnrichmentSettingsPanel] save failed", error);
      window.alert(`Save failed: ${error.message}`);
      return;
    }
    setSavedAt(new Date().toLocaleTimeString());
  }, [orgId, settings]);

  const move = (index: number, delta: -1 | 1) => {
    const next = [...settings.provider_order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSettings((prev) => ({ ...prev, provider_order: next }));
  };

  const toggleInclude = (provider: ProviderName) => {
    setSettings((prev) => {
      const present = prev.provider_order.includes(provider);
      const nextOrder = present
        ? prev.provider_order.filter((p) => p !== provider)
        : [...prev.provider_order, provider];
      return { ...prev, provider_order: nextOrder };
    });
  };

  if (!orgId) {
    return <div style={{ fontSize: 13, color: "#94a3b8" }}>No active org.</div>;
  }
  if (loading) {
    return <div style={{ fontSize: 13, color: "#94a3b8" }}>Loading enrichment settings...</div>;
  }

  const inCascade = settings.provider_order;
  const inactive = VALID_PROVIDERS.filter((p) => !inCascade.includes(p));

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
        Enrichment provider order
      </h2>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
        Contact enrichment uses Lemlist first, then falls back only when needed. Reorder the cascade if your hit-rate data changes.
      </p>

      <div style={{ borderTop: "1px solid #e2e8f0", marginBottom: 16 }}>
        {inCascade.map((provider, i) => (
          <div
            key={provider}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 0",
              borderBottom: "1px solid #f1f5f9",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: provider === "lemlist" ? "#0891b2" : "#0f172a",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>
                  {PROVIDER_LABEL[provider]}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {PROVIDER_BLURB[provider]}
                </div>
              </div>
            </div>
            {canWrite && (
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${PROVIDER_LABEL[provider]} up`}
                  style={btn(i === 0)}
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === inCascade.length - 1}
                  aria-label={`Move ${PROVIDER_LABEL[provider]} down`}
                  style={btn(i === inCascade.length - 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => toggleInclude(provider)}
                  disabled={inCascade.length === 1}
                  aria-label={`Remove ${PROVIDER_LABEL[provider]} from cascade`}
                  style={{
                    ...btn(inCascade.length === 1),
                    color: inCascade.length === 1 ? "#94a3b8" : "#dc2626",
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {inactive.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: "#64748b", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Inactive providers
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {inactive.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => toggleInclude(provider)}
                disabled={!canWrite}
                style={{
                  background: "#f1f5f9",
                  color: "#0f172a",
                  border: "1px dashed #cbd5e1",
                  padding: "6px 12px",
                  borderRadius: 14,
                  fontSize: 12,
                  cursor: canWrite ? "pointer" : "not-allowed",
                }}
              >
                + {PROVIDER_LABEL[provider]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0",
          borderTop: "1px solid #f1f5f9",
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>Enable Tier-3 provider</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            ZoomInfo / Cognism cascade fallback. Returns no contacts until provider credentials are configured.
          </div>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={settings.enable_tier3}
            onChange={(e) => setSettings((p) => ({ ...p, enable_tier3: e.target.checked }))}
            disabled={!canWrite}
          />
          <span style={{ fontSize: 12 }}>{settings.enable_tier3 ? "On" : "Off"}</span>
        </label>
      </div>

      <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving || !canWrite}
          style={{
            background: canWrite ? "#0f172a" : "#94a3b8",
            color: "#fff",
            border: "none",
            padding: "8px 18px",
            borderRadius: 6,
            fontSize: 13,
            cursor: saving ? "wait" : canWrite ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving..." : "Save order"}
        </button>
        {savedAt && <span style={{ fontSize: 11, color: "#94a3b8" }}>Saved at {savedAt}</span>}
        {!canWrite && <span style={{ fontSize: 11, color: "#94a3b8" }}>Read-only - org admin required</span>}
      </div>

      <PqCreditsGauge />
    </div>
  );
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? "#f8fafc" : "#fff",
    color: disabled ? "#cbd5e1" : "#0f172a",
    border: "1px solid #e2e8f0",
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    minWidth: 28,
  };
}
