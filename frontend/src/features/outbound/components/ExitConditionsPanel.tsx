// Sub-project O — ExitConditionsPanel
//
// Renders inside the CampaignBuilder below ScheduleStrip. Shows the org-default
// exit rules (3 always-on greyed, 2 togglable inherited) and lets the user
// override per-campaign by writing to lit_campaigns.exit_overrides.

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type ExitOverrides = {
  exit_on_meeting_booked?: boolean;
  exit_on_attio_won?: boolean;
};

type Props = {
  campaignId: string | null;
  /** Optional — if not provided, the panel fetches campaign.org_id itself. */
  orgId?: string | null;
  // Initial overrides from the parent's campaign row; the panel reloads
  // effective rules from server on mount.
  initialOverrides?: ExitOverrides;
  onSaved?: (overrides: ExitOverrides) => void;
};

type EffectiveRules = {
  exit_on_reply: boolean;
  exit_on_bounce: boolean;
  exit_on_unsubscribe: boolean;
  exit_on_meeting_booked: boolean;
  exit_on_attio_won: boolean;
  attio_won_stages?: string[];
};

export default function ExitConditionsPanel({ campaignId, orgId, initialOverrides, onSaved }: Props) {
  const [orgRules, setOrgRules] = useState<EffectiveRules | null>(null);
  const [overrides, setOverrides] = useState<ExitOverrides>(initialOverrides ?? {});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Effective values shown in UI — overrides win over org defaults.
  const effective: EffectiveRules = {
    exit_on_reply: orgRules?.exit_on_reply ?? true,
    exit_on_bounce: orgRules?.exit_on_bounce ?? true,
    exit_on_unsubscribe: orgRules?.exit_on_unsubscribe ?? true,
    exit_on_meeting_booked:
      overrides.exit_on_meeting_booked !== undefined
        ? overrides.exit_on_meeting_booked
        : orgRules?.exit_on_meeting_booked ?? true,
    exit_on_attio_won:
      overrides.exit_on_attio_won !== undefined
        ? overrides.exit_on_attio_won
        : orgRules?.exit_on_attio_won ?? true,
    attio_won_stages: orgRules?.attio_won_stages ?? ["Won", "Closed Won", "Customer"],
  };

  // Resolve org_id — either via prop or by fetching the campaign row.
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(orgId ?? null);
  useEffect(() => {
    if (orgId) {
      setResolvedOrgId(orgId);
      return;
    }
    if (!campaignId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lit_campaigns")
        .select("org_id, exit_overrides")
        .eq("id", campaignId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.org_id) setResolvedOrgId(data.org_id);
      if (data?.exit_overrides && !initialOverrides) {
        setOverrides(data.exit_overrides as ExitOverrides);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, campaignId, initialOverrides]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!resolvedOrgId) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("lit_org_exit_settings")
        .select("*")
        .eq("org_id", resolvedOrgId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[ExitConditionsPanel] org rules fetch failed", error);
      }
      if (data) {
        setOrgRules({
          exit_on_reply: !!data.exit_on_reply,
          exit_on_bounce: !!data.exit_on_bounce,
          exit_on_unsubscribe: !!data.exit_on_unsubscribe,
          exit_on_meeting_booked: !!data.exit_on_meeting_booked,
          exit_on_attio_won: !!data.exit_on_attio_won,
          attio_won_stages: data.attio_won_stages ?? ["Won", "Closed Won", "Customer"],
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedOrgId]);

  const toggleOverride = useCallback(
    (key: keyof ExitOverrides, nextValue: boolean) => {
      setOverrides((prev) => ({ ...prev, [key]: nextValue }));
    },
    [],
  );

  const save = useCallback(async () => {
    if (!campaignId) return;
    setSaving(true);
    const { error } = await supabase
      .from("lit_campaigns")
      .update({ exit_overrides: overrides })
      .eq("id", campaignId);
    setSaving(false);
    if (error) {
      console.error("[ExitConditionsPanel] save failed", error);
      return;
    }
    onSaved?.(overrides);
  }, [campaignId, overrides, onSaved]);

  const labelStyle: React.CSSProperties = { fontSize: 13, color: "#475569" };
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #f1f5f9",
  };

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "16px 20px",
        background: "#ffffff",
        marginTop: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Exit conditions</h3>
        {loading && <span style={{ fontSize: 11, color: "#94a3b8" }}>Loading…</span>}
      </div>
      <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
        Recipients automatically exit this sequence when:
      </p>

      {/* Always-on */}
      <div style={rowStyle}>
        <span style={labelStyle}>They reply to an email</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Always on</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Their address hard bounces</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Always on</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>They unsubscribe</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Always on</span>
      </div>

      {/* Togglable */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>They book a meeting (Cal.com)</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            Inheriting org default: {orgRules?.exit_on_meeting_booked ? "ON" : "OFF"}
          </div>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={effective.exit_on_meeting_booked}
            onChange={(e) => toggleOverride("exit_on_meeting_booked", e.target.checked)}
            disabled={loading}
          />
          <span style={{ fontSize: 12 }}>{effective.exit_on_meeting_booked ? "On" : "Off"}</span>
        </label>
      </div>

      <div style={{ ...rowStyle, borderBottom: "none" }}>
        <div>
          <div style={labelStyle}>Their Attio deal moves to Won</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            Inheriting org default: {orgRules?.exit_on_attio_won ? "ON" : "OFF"} ·{" "}
            stages: {(effective.attio_won_stages ?? []).join(", ")}
          </div>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={effective.exit_on_attio_won}
            onChange={(e) => toggleOverride("exit_on_attio_won", e.target.checked)}
            disabled={loading}
          />
          <span style={{ fontSize: 12 }}>{effective.exit_on_attio_won ? "On" : "Off"}</span>
        </label>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !campaignId}
          style={{
            background: "#0f172a",
            color: "#fff",
            border: "none",
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 12,
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save exit conditions"}
        </button>
      </div>
    </div>
  );
}
