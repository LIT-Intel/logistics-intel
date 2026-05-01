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
import { PreviewModal } from "@/features/outbound/components/PreviewModal";
import { findPlay } from "@/features/outbound/data/plays";
import { fontDisplay, fontBody } from "@/features/outbound/tokens";

// /app/campaigns/new — Outbound Engine v2 composer.
//
// Save flow (unchanged from Phase C):
//   createCampaignDraft({ name, channel, description, metrics }) → lit_campaigns
//   attachCompaniesToCampaign(id, companyIds[])                  → lit_campaign_companies
//   upsertCampaignStep({ campaign_id, step_order, channel,
//                        step_type, subject, body, delay_days }) → lit_campaign_steps
//
// Step-kind → schema mapping uses the existing channel + step_type columns:
//   email             → channel=email,    step_type=email
//   linkedin_invite   → channel=linkedin, step_type=linkedin_invite
//   linkedin_message  → channel=linkedin, step_type=linkedin_message
//   call              → channel=call,     step_type=call
//   wait              → channel=wait,     step_type=wait, delay_days=waitDays
//
// LinkedIn / call steps are saved as planned manual tasks. No automation,
// no Gmail/PhantomBuster/LinkedIn API. Test send + Launch are honestly
// disabled until the dispatcher ships.

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
  if (kind === "email") return { ...base, delayDays: 0 };
  if (kind === "wait") return { ...base, waitDays: 2 };
  return { ...base, delayDays: 2 };
}

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
  return {
    campaign_id: campaignId,
    step_order: order,
    channel: channelFor(step.kind),
    step_type: step.kind,
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

  const { companies, loading: companiesLoading } = useSavedCompanies();
  const { primaryEmail, known: inboxKnown } = useInboxStatus();
  const { state: templatesState } = useTemplates();
  const { result: personasResult } = usePersonas();

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [steps, setSteps] = useState(() => seedStepsFromPlay(seedPlay));
  const [selectedStepId, setSelectedStepId] = useState(
    () => steps[0]?.localId ?? null,
  );
  const [selectedPersonaId, setSelectedPersonaId] = useState(null);

  const [audienceOpen, setAudienceOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  const trimmedName = name.trim();
  const hasName = trimmedName.length > 0;
  const hasFilledStep = steps.some(
    (s) => s.kind !== "wait" && isStepFilled(s),
  );
  const canSaveDraft = hasName && hasFilledStep && !saving;
  const canLaunch = false;

  // Save guidance — surfaced inline so users know why Save Draft is disabled.
  const saveGuidance = useMemo(() => {
    if (!hasName) return "Add a campaign name to save.";
    if (!hasFilledStep)
      return "Add a subject or body to at least one step to save.";
    return null;
  }, [hasName, hasFilledStep]);

  const handleAddStep = useCallback((afterId, kind) => {
    const next = emptyStep(kind);
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.localId === afterId);
      if (idx < 0) return [...prev, next];
      return [...prev.slice(0, idx + 1), next, ...prev.slice(idx + 1)];
    });
    setSelectedStepId(next.localId);
  }, []);

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

  const handleSaveDraft = useCallback(async () => {
    if (!canSaveDraft) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const baseChannel = "email";
      const metricsExtras = {};
      if (selectedPersonaId) metricsExtras.persona_id = selectedPersonaId;
      if (playId) metricsExtras.play_id = playId;

      const campaign = await createCampaignDraft({
        name: trimmedName,
        channel: baseChannel,
        description: null,
        metrics: metricsExtras,
      });

      const companyIds = Array.from(selectedIds);
      if (companyIds.length > 0) {
        await attachCompaniesToCampaign(campaign.id, companyIds);
      }

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
    navigate,
    playId,
    selectedIds,
    selectedPersonaId,
    steps,
    trimmedName,
  ]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (previewOpen) setPreviewOpen(false);
      else if (audienceOpen) setAudienceOpen(false);
      else if (templatesOpen) setTemplatesOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [audienceOpen, templatesOpen, previewOpen]);

  return (
    <div className="flex h-[calc(100vh-72px)] min-h-[640px] flex-col overflow-hidden bg-[#F8FAFC]">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 lg:flex-nowrap">
        <button
          type="button"
          onClick={() => navigate("/app/campaigns")}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          aria-label="Back to Outbound"
        >
          <ArrowLeft className="h-3 w-3" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-[15px] font-bold leading-tight tracking-tight text-[#0F172A] outline-none"
              style={{ fontFamily: fontDisplay }}
              maxLength={120}
            />
            <span
              className="rounded-full border border-[#BAE6FD] bg-[#E0F2FE] px-1.5 py-0 text-[9px] font-bold uppercase tracking-[0.04em] text-[#0369A1]"
              style={{ fontFamily: fontDisplay }}
            >
              Draft
            </span>
          </div>
          <div
            className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            {seedPlay ? (
              <span>
                Seeded from <strong className="text-[#0F172A]">{seedPlay.name}</strong>
              </span>
            ) : (
              <span>Build a sequence and save as draft.</span>
            )}
            <span className="text-[#CBD5E1]">·</span>
            <span>{selectedIds.size} recipient{selectedIds.size === 1 ? "" : "s"}</span>
            <span className="text-[#CBD5E1]">·</span>
            <span>{steps.length} step{steps.length === 1 ? "" : "s"}</span>
            {saveGuidance ? (
              <>
                <span className="text-[#CBD5E1]">·</span>
                <span className="text-[#B45309]">{saveGuidance}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {success ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[#BBF7D0] bg-[#F0FDF4] px-2 py-0.5 text-[10px] font-medium text-[#15803d]"
              style={{ fontFamily: fontBody }}
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              {success}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={steps.filter((s) => s.kind !== "wait").length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            style={{ fontFamily: fontDisplay }}
            title="Preview the sequence as a sample contact would receive it"
          >
            <Play className="h-2.5 w-2.5" />
            Preview as contact
          </button>
          <button
            type="button"
            disabled
            title="Test send requires the dispatcher edge function. Available once Gmail OAuth ships."
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            <FlaskConical className="h-2.5 w-2.5" />
            Test send
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={!canSaveDraft || saving}
            title={saveGuidance ?? ""}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-[#10B981] to-[#059669] px-3 py-1 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(16,185,129,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ fontFamily: fontDisplay }}
          >
            <Rocket className="h-2.5 w-2.5" />
            Launch
          </button>
        </div>
      </div>

      <ForecastStrip audienceCount={selectedIds.size} />

      {error ? (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-700"
          style={{ fontFamily: fontBody }}
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      ) : null}

      {!primaryEmail ? (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50/60 px-3 py-1.5 text-[11px] text-[#B45309]"
          style={{ fontFamily: fontBody }}
        >
          <span className="font-semibold">Heads up:</span>
          {inboxKnown
            ? "No inbox connected. Save as draft now — connect Gmail in Settings before launch."
            : "Email-account status unavailable. Save as draft and reconnect once it's online."}
        </div>
      ) : null}

      {/* 3-column body — collapses to single column on small screens */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_1fr_340px]">
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
            templatesState?.result.state === "ok" ? templatesState.result.rows : []
          }
          onUpdate={handleUpdateStep}
          onApplyTemplate={handleApplyTemplate}
          onPreview={() => setPreviewOpen(true)}
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
        state={templatesState}
        onClose={() => setTemplatesOpen(false)}
        onApply={handleApplyTemplate}
      />

      <PreviewModal
        open={previewOpen}
        steps={steps}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}