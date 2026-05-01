import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Play,
  Rocket,
} from "lucide-react";
import {
  createCampaignDraft,
  attachCompaniesToCampaign,
  upsertCampaignStep,
} from "@/lib/api";

import { useSavedCompanies } from "@/features/outbound/hooks/useSavedCompanies";
import { useInboxStatus } from "@/features/outbound/hooks/useInboxStatus";
import { useTemplates, usePersonas } from "@/features/outbound/hooks/useTemplates";

import { ForecastStrip } from "@/features/outbound/components/ForecastStrip";
import { PersonaPanel } from "@/features/outbound/components/PersonaPanel";
import { TimelineCanvas } from "@/features/outbound/components/TimelineCanvas";
import { StepInspector } from "@/features/outbound/components/StepInspector";
import { TemplatesDrawer } from "@/features/outbound/components/TemplatesDrawer";
import { AudiencePickerDrawer } from "@/features/outbound/components/AudiencePickerDrawer";
import { findPlay } from "@/features/outbound/data/plays";
import { fontDisplay, fontBody } from "@/features/outbound/tokens";

// /app/campaigns/new — Outbound Engine v2 composer.
//
// The save flow is unchanged from the original Phase C builder:
//   createCampaignDraft({ name, channel, description })   → lit_campaigns
//   attachCompaniesToCampaign(id, companyIds)             → lit_campaign_companies
//   upsertCampaignStep({ campaign_id, step_order, ... })  → lit_campaign_steps
//
// Step kinds beyond email (linkedin_invite/linkedin_message/call/wait) are
// persisted via the same upsertCampaignStep helper using the existing
// `channel` + `step_type` columns:
//   email             → channel=email,    step_type=email
//   linkedin_invite   → channel=linkedin, step_type=linkedin_invite
//   linkedin_message  → channel=linkedin, step_type=linkedin_message
//   call              → channel=call,     step_type=call
//   wait              → channel=wait,     step_type=wait, delay_days=waitDays
//
// LinkedIn / call steps are stored as planned manual tasks. No automation,
// no Gmail/PhantomBuster/LinkedIn API call runs from this page. Launch and
// Test send are honestly disabled until the dispatcher ships.

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStep(kind = "email") {
  const base = {
    localId: uid(),
    kind,
    subject: "",
    body: "",
    title: "",
    description: "",
    waitDays: 2,
    delayDays: 0,
    expanded: true,
  };
  if (kind === "email") {
    return { ...base, delayDays: 0 };
  }
  if (kind === "wait") {
    return { ...base, waitDays: 2 };
  }
  return { ...base, delayDays: 2 };
}

// Seed steps from a starter play, mapped onto BuilderStep shape.
function seedStepsFromPlay(play) {
  if (!play) return [emptyStep("email")];
  const out = [];
  let firstNonWait = true;
  for (let i = 0; i < play.channels.length; i++) {
    const kind = play.channels[i];
    const step = emptyStep(kind);
    if (kind !== "wait") {
      step.delayDays = firstNonWait ? 0 : 2;
      firstNonWait = false;
    }
    out.push(step);
  }
  return out;
}

function isStepFilled(s) {
  if (s.kind === "wait") return true;
  if (s.kind === "email") {
    return Boolean(s.subject?.trim() || s.body?.trim());
  }
  return Boolean(s.title?.trim() || s.description?.trim());
}

function channelFor(kind) {
  if (kind === "email") return "email";
  if (kind === "linkedin_invite" || kind === "linkedin_message") return "linkedin";
  if (kind === "call") return "call";
  if (kind === "wait") return "wait";
  return "email";
}

function stepTypeFor(kind) {
  return kind; // kind already matches lit_campaign_steps.step_type values we want
}

// Map a builder step into the upsertCampaignStep payload.
function persistPayloadFor(step, order, campaignId) {
  if (step.kind === "wait") {
    return {
      campaign_id: campaignId,
      step_order: order,
      channel: "wait",
      step_type: "wait",
      subject: null,
      body: null,
      delay_days: Math.max(0, Number(step.waitDays) || 0),
      delay_hours: 0,
    };
  }
  if (step.kind === "email") {
    return {
      campaign_id: campaignId,
      step_order: order,
      channel: "email",
      step_type: "email",
      subject: step.subject?.trim() || null,
      body: step.body?.trim() || null,
      delay_days: Math.max(0, Number(step.delayDays) || 0),
      delay_hours: 0,
    };
  }
  // linkedin / call — title → subject, description → body
  return {
    campaign_id: campaignId,
    step_order: order,
    channel: channelFor(step.kind),
    step_type: stepTypeFor(step.kind),
    subject: step.title?.trim() || null,
    body: step.description?.trim() || null,
    delay_days: Math.max(0, Number(step.delayDays) || 0),
    delay_hours: 0,
  };
}

export default function CampaignBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const playId = searchParams.get("play");
  const seedPlay = useMemo(() => findPlay(playId), [playId]);

  const [name, setName] = useState(() =>
    seedPlay ? `${seedPlay.name} — draft` : "Untitled campaign",
  );
  const [description] = useState(""); // hidden field for now; could surface later

  const { companies, loading: companiesLoading } = useSavedCompanies();
  const { primaryEmail, known: inboxKnown } = useInboxStatus();
  const { result: templatesResult } = useTemplates();
  const { result: personasResult } = usePersonas();

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [steps, setSteps] = useState(() => seedStepsFromPlay(seedPlay));
  const [selectedStepId, setSelectedStepId] = useState(
    () => steps[0]?.localId ?? null,
  );
  const [selectedPersonaId, setSelectedPersonaId] = useState(null);

  const [audienceOpen, setAudienceOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const selectedStep = useMemo(
    () => steps.find((s) => s.localId === selectedStepId) ?? null,
    [steps, selectedStepId],
  );

  const selectedCompanies = useMemo(
    () => companies.filter((c) => c.company_id && selectedIds.has(c.company_id)),
    [companies, selectedIds],
  );

  // Validation
  const trimmedName = name.trim();
  const hasName = trimmedName.length > 0;
  const hasFilledStep = steps.some(
    (s) => s.kind !== "wait" && isStepFilled(s),
  );
  const canSaveDraft = hasName && hasFilledStep && !saving;
  const canLaunch = false; // honest disable — no dispatcher

  // Step handlers
  const handleAddStep = useCallback(
    (afterId, kind) => {
      const next = emptyStep(kind);
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.localId === afterId);
        if (idx < 0) return [...prev, next];
        return [...prev.slice(0, idx + 1), next, ...prev.slice(idx + 1)];
      });
      setSelectedStepId(next.localId);
    },
    [],
  );

  const handleAddFirst = useCallback((kind) => {
    const next = emptyStep(kind);
    setSteps([next]);
    setSelectedStepId(next.localId);
  }, []);

  const handleDeleteStep = useCallback(
    (id) => {
      setSteps((prev) => {
        const filtered = prev.filter((s) => s.localId !== id);
        if (selectedStepId === id) {
          setSelectedStepId(filtered[0]?.localId ?? null);
        }
        return filtered;
      });
    },
    [selectedStepId],
  );

  const handleUpdateStep = useCallback(
    (patch) => {
      if (!selectedStepId) return;
      setSteps((prev) =>
        prev.map((s) =>
          s.localId === selectedStepId ? { ...s, ...patch } : s,
        ),
      );
    },
    [selectedStepId],
  );

  const handleApplyTemplate = useCallback(
    (template) => {
      if (!selectedStepId) return;
      setSteps((prev) =>
        prev.map((s) => {
          if (s.localId !== selectedStepId) return s;
          if (s.kind === "email") {
            return {
              ...s,
              subject: template.subject || s.subject,
              body: template.body || s.body,
            };
          }
          return {
            ...s,
            title: template.subject || s.title,
            description: template.body || s.description,
          };
        }),
      );
      setTemplatesOpen(false);
    },
    [selectedStepId],
  );

  // Audience
  const handleToggleCompany = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const handleSelectAll = useCallback(() => {
    setSelectedIds(
      new Set(companies.map((c) => c.company_id).filter(Boolean)),
    );
  }, [companies]);
  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Save flow — preserves existing API contract.
  const handleSaveDraft = useCallback(async () => {
    if (!canSaveDraft) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const baseChannel =
        steps.find((s) => s.kind !== "wait")?.kind === "email" ? "email" : "email";
      const metricsExtras = {};
      if (selectedPersonaId) metricsExtras.persona_id = selectedPersonaId;
      if (playId) metricsExtras.play_id = playId;

      const campaign = await createCampaignDraft({
        name: trimmedName,
        channel: baseChannel,
        description: description.trim() || null,
        metrics: metricsExtras,
      });

      const companyIds = Array.from(selectedIds);
      if (companyIds.length > 0) {
        await attachCompaniesToCampaign(campaign.id, companyIds);
      }

      // Persist every filled or wait step in order.
      const persistable = steps.filter(
        (s) => s.kind === "wait" || isStepFilled(s),
      );
      let order = 1;
      for (const s of persistable) {
        await upsertCampaignStep(persistPayloadFor(s, order, campaign.id));
        order += 1;
      }

      setSuccess(`Saved "${campaign.name}" as draft. Returning to Outbound…`);
      window.setTimeout(() => navigate("/app/campaigns"), 700);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save campaign draft";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [
    canSaveDraft,
    description,
    navigate,
    playId,
    selectedIds,
    selectedPersonaId,
    steps,
    trimmedName,
  ]);

  // ESC closes drawers
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (audienceOpen) setAudienceOpen(false);
      else if (templatesOpen) setTemplatesOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [audienceOpen, templatesOpen]);

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col overflow-hidden bg-[#F8FAFC]">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:flex-nowrap">
        <button
          type="button"
          onClick={() => navigate("/app/campaigns")}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          aria-label="Back to Outbound"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-[18px] font-bold tracking-tight text-[#0F172A] outline-none"
              style={{ fontFamily: fontDisplay }}
              maxLength={120}
            />
            <span
              className="rounded-full border border-[#BAE6FD] bg-[#E0F2FE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#0369A1]"
              style={{ fontFamily: fontDisplay }}
            >
              Draft
            </span>
          </div>
          <div
            className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            {seedPlay ? (
              <span className="inline-flex items-center gap-1">
                Seeded from <strong className="text-[#0F172A]">{seedPlay.name}</strong> play
              </span>
            ) : (
              <span>Build a sequence and save as draft.</span>
            )}
            <span className="text-[#CBD5E1]">·</span>
            <span>{selectedIds.size} recipient{selectedIds.size === 1 ? "" : "s"}</span>
            <span className="text-[#CBD5E1]">·</span>
            <span>{steps.length} step{steps.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {success ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-[11px] font-medium text-[#15803d]"
              style={{ fontFamily: fontBody }}
            >
              <CheckCircle2 className="h-3 w-3" />
              {success}
            </span>
          ) : null}
          <button
            type="button"
            disabled
            title="Preview ships once subject/body merge tags resolve."
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            <Play className="h-3 w-3" />
            Preview as contact
          </button>
          <button
            type="button"
            disabled
            title="Test send requires the dispatcher edge function. Available once Gmail OAuth ships."
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            <FlaskConical className="h-3 w-3" />
            Test send
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={!canSaveDraft || saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ fontFamily: fontDisplay }}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={!canLaunch}
            title={
              canLaunch
                ? ""
                : "Launch becomes available once Gmail is connected and the dispatcher ships."
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-[#10B981] to-[#059669] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_1px_4px_rgba(16,185,129,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ fontFamily: fontDisplay }}
          >
            <Rocket className="h-3 w-3" />
            Launch campaign
          </button>
        </div>
      </div>

      {/* Forecast strip */}
      <ForecastStrip audienceCount={selectedIds.size} />

      {/* Error banner */}
      {error ? (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700"
          style={{ fontFamily: fontBody }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Inbox status hint */}
      {!primaryEmail ? (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50/60 px-4 py-2 text-xs text-[#B45309]"
          style={{ fontFamily: fontBody }}
        >
          <span className="font-semibold">Heads up:</span>
          {inboxKnown
            ? "No inbox connected. Save as draft now — connect Gmail in Settings before launch."
            : "Email-account status unavailable. Save as draft and reconnect once it's online."}
        </div>
      ) : null}

      {/* 3-column body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[288px_1fr_360px]">
        <PersonaPanel
          audienceCount={selectedIds.size}
          totalSavedCompanies={companies.length}
          selectedCompanies={selectedCompanies}
          personasResult={personasResult}
          selectedPersonaId={selectedPersonaId}
          onSelectPersona={setSelectedPersonaId}
          onOpenAudiencePicker={() => setAudienceOpen(true)}
          onOpenTemplates={() => setTemplatesOpen(true)}
        />
        <TimelineCanvas
          steps={steps}
          selectedId={selectedStepId}
          onSelect={setSelectedStepId}
          onAddBelow={handleAddStep}
          onDelete={handleDeleteStep}
          onAddFirst={handleAddFirst}
        />
        <StepInspector
          step={selectedStep}
          primaryInboxEmail={primaryEmail}
          inboxKnown={inboxKnown}
          templates={
            templatesResult?.state === "ok" ? templatesResult.rows : []
          }
          onUpdate={handleUpdateStep}
          onApplyTemplate={handleApplyTemplate}
          onPreview={() => {}}
          onTestSend={() => {}}
        />
      </div>

      <AudiencePickerDrawer
        open={audienceOpen}
        loading={companiesLoading}
        companies={companies}
        selectedIds={selectedIds}
        onClose={() => setAudienceOpen(false)}
        onToggle={handleToggleCompany}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onOpenCommandCenter={() => navigate("/app/command-center")}
      />

      <TemplatesDrawer
        open={templatesOpen}
        result={templatesResult}
        onClose={() => setTemplatesOpen(false)}
        onApply={handleApplyTemplate}
      />
    </div>
  );
}
