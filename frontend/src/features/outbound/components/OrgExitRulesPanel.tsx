// Sub-project O — OrgExitRulesPanel
//
// Settings-tab panel for managing the org's default exit rules. Reads /
// writes lit_org_exit_settings. Always-on rules render greyed; togglables
// are real toggles. Owner/admin-only writes (enforced by RLS).

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type OrgExitRules = {
  exit_on_reply: boolean;
  exit_on_bounce: boolean;
  exit_on_unsubscribe: boolean;
  exit_on_meeting_booked: boolean;
  exit_on_attio_won: boolean;
  attio_won_stages: string[];
};

const DEFAULTS: OrgExitRules = {
  exit_on_reply: true,
  exit_on_bounce: true,
  exit_on_unsubscribe: true,
  exit_on_meeting_booked: true,
  exit_on_attio_won: true,
  attio_won_stages: ["Won", "Closed Won", "Customer"],
};

export default function OrgExitRulesPanel({ orgId, canWrite }: { orgId: string | null; canWrite: boolean }) {
  const [rules, setRules] = useState<OrgExitRules>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [stageInput, setStageInput] = useState("");

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lit_org_exit_settings")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setRules({
          exit_on_reply: !!data.exit_on_reply,
          exit_on_bounce: !!data.exit_on_bounce,
          exit_on_unsubscribe: !!data.exit_on_unsubscribe,
          exit_on_meeting_booked: !!data.exit_on_meeting_booked,
          exit_on_attio_won: !!data.exit_on_attio_won,
          attio_won_stages: data.attio_won_stages ?? DEFAULTS.attio_won_stages,
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
      .from("lit_org_exit_settings")
      .upsert(
        {
          org_id: orgId,
          ...rules,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
    setSaving(false);
    if (error) {
      console.error("[OrgExitRulesPanel] save failed", error);
      window.alert(`Save failed: ${error.message}`);
      return;
    }
    setSavedAt(new Date().toLocaleTimeString());
  }, [orgId, rules]);

  const addStage = () => {
    const v = stageInput.trim();
    if (!v) return;
    if (rules.attio_won_stages.includes(v)) return;
    setRules((prev) => ({ ...prev, attio_won_stages: [...prev.attio_won_stages, v] }));
    setStageInput("");
  };

  const removeStage = (s: string) => {
    setRules((prev) => ({ ...prev, attio_won_stages: prev.attio_won_stages.filter((x) => x !== s) }));
  };

  if (!orgId) {
    return <div style={{ fontSize: 13, color: "#94a3b8" }}>No active org.</div>;
  }
  if (loading) {
    return <div style={{ fontSize: 13, color: "#94a3b8" }}>Loading exit rules…</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Sequence exit rules</h2>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
        Recipients automatically exit any active sequence when these events fire. Per-campaign overrides are available in
        the campaign builder.
      </p>

      <div style={{ borderTop: "1px solid #e2e8f0" }}>
        <Row label="They reply to an email" alwaysOn value={rules.exit_on_reply} />
        <Row label="Their address hard bounces" alwaysOn value={rules.exit_on_bounce} />
        <Row label="They unsubscribe" alwaysOn value={rules.exit_on_unsubscribe} />
        <Row
          label="They book a meeting (Cal.com)"
          value={rules.exit_on_meeting_booked}
          onChange={(v) => setRules((p) => ({ ...p, exit_on_meeting_booked: v }))}
          disabled={!canWrite}
        />
        <Row
          label="Their Attio deal moves to a Won stage"
          value={rules.exit_on_attio_won}
          onChange={(v) => setRules((p) => ({ ...p, exit_on_attio_won: v }))}
          disabled={!canWrite}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", margin: "0 0 8px" }}>Attio Won-stage values</h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>
          When an Attio deal's stage changes to one of these values, matching recipients exit.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {rules.attio_won_stages.map((s) => (
            <span
              key={s}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#f1f5f9",
                color: "#0f172a",
                padding: "4px 10px",
                borderRadius: 14,
                fontSize: 12,
              }}
            >
              {s}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => removeStage(s)}
                  style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, fontSize: 12 }}
                  aria-label={`Remove ${s}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {canWrite && (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={stageInput}
              onChange={(e) => setStageInput(e.target.value)}
              placeholder="Add stage…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addStage();
                }
              }}
              style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
            />
            <button
              type="button"
              onClick={addStage}
              style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
            >
              Add
            </button>
          </div>
        )}
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
          {saving ? "Saving…" : "Save defaults"}
        </button>
        {savedAt && <span style={{ fontSize: 11, color: "#94a3b8" }}>Saved at {savedAt}</span>}
        {!canWrite && <span style={{ fontSize: 11, color: "#94a3b8" }}>Read-only · org admin required</span>}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onChange,
  alwaysOn,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange?: (v: boolean) => void;
  alwaysOn?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{label}</div>
        {alwaysOn && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Always on — required for deliverability + compliance</div>}
      </div>
      {alwaysOn ? (
        <span style={{ fontSize: 11, color: "#94a3b8", padding: "2px 8px", background: "#f1f5f9", borderRadius: 10 }}>Always on</span>
      ) : (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange?.(e.target.checked)}
            disabled={disabled}
          />
          <span style={{ fontSize: 12 }}>{value ? "On" : "Off"}</span>
        </label>
      )}
    </div>
  );
}
