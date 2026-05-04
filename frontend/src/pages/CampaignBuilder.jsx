import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Play,
  Rocket,
  Save,
} from "lucide-react";
import {
  createCampaignDraft,
  attachCompaniesToCampaign,
  upsertCampaignStep,
  launchCampaign,
  sendTestEmail,
} from "@/lib/api";
import { applyMergeVars, buildMergeContext } from "@/lib/mergeVars";

import { useSavedCompanies } from "@/features/outbound/hooks/useSavedCompanies";
import { useInboxStatus } from "@/features/outbound/hooks/useInboxStatus";
import { useTemplates, usePersonas } from "@/features/outbound/hooks/useTemplates";
import { useCampaign } from "@/features/outbound/hooks/useCampaign";

import { ForecastStrip } from "@/features/outbound/components/ForecastStrip";
import { PersonaPanel } from "@/features/outbound/components/PersonaPanel";
import { TimelineCanvas } from "@/features/outbound/components/TimelineCanvas";
import { StepInspector } from "@/features/outbound/components/StepInspector";
import { TemplatesDrawer } from "@/features/outbound/components/TemplatesDrawer";
import { AudiencePickerDrawer } from "@/features/outbound/components/AudiencePickerDrawer";
import { PreviewModal } from "@/features/outbound/components/PreviewModal";
import { CreateTemplateModal } from "@/features/outbound/components/CreateTemplateModal";
import { CreatePersonaModal } from "@/features/outbound/components/CreatePersonaModal";
import { findPlay } from "@/features/outbound/data/plays";
import { INDUSTRY_OPTIONS, TONE_OPTIONS } from "@/features/outbound/data/templates";
import { fontDisplay, fontBody } from "@/features/outbound/tokens";
import {
  updateCampaignBasics,
  setCampaignCompanies,
  deleteCampaignStepsFrom,
} from "@/features/outbound/api/campaignActions";

// /app/campaigns/new — create flow
// /app/campaigns/new?edit=:id — edit flow (loads existing campaign)
//
// Save flow:
//   CREATE: createCampaignDraft → attachCompaniesToCampaign → upsertCampaignStep×N
//   EDIT:   updateCampaignBasics → setCampaignCompanies (diff) →
//           upsertCampaignStep×N → deleteCampaignStepsFrom(N+1) (cleanup)
//
// All paths use existing channel + step_type columns on lit_campaign_steps.
// LinkedIn / call / wait persist as planned manual tasks. Test send and
// Launch remain disabled until the dispatcher ships.

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

// Hydrate a BuilderStep from a stored lit_campaign_steps row.
function dbStepToBuilder(row) {
  const stepType = String(row.step_type || row.channel || "email").toLowerCase();
  const channel = String(row.channel || "email").toLowerCase();
  let kind = "email";
  if (stepType === "wait" || channel === "wait") kind = "wait";
  else if (stepType === "linkedin_invite" || stepType === "linkedin")
    kind = "linkedin_invite";
  else if (stepType === "linkedin_message") kind = "linkedin_message";
  else if (stepType === "call") kind = "call";
  else kind = "email";

  const base = {
    localId: row.id || uid(),
    kind,
    subject: "",
    body: "",
    title: "",
    description: "",
    waitDays: 2,
    delayDays: 0,
    expanded: false,
  };
  if (kind === "wait") {
    return { ...base, waitDays: Math.max(0, Number(row.delay_days) || 0) };
  }
  if (kind === "email") {
    const out = {
      ...base,
      subject: row.subject || "",
      body: row.body || "",
      delayDays: Math.max(0, Number(row.delay_days) || 0),
    };
    // A/B variant — present only when explicitly set on the saved row.
    if (row.subject_b !== undefined && row.subject_b !== null) {
      out.subject_b = row.subject_b;
    }
    return out;
  }
  return {
    ...base,
    title: row.subject || "",
    description: row.body || "",
    delayDays: Math.max(0, Number(row.delay_days) || 0),
  };
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
    const payload = {
      campaign_id: campaignId,
      step_order: order,
      channel: "email",
      step_type: "email",
      subject: step.subject?.trim() || null,
      body: step.body?.trim() || null,
      delay_days: Math.max(0, Number(step.delayDays) || 0),
      delay_hours: 0,
    };
    // Only write subject_b when the variant exists. Trimmed empty
    // string → null so the dispatcher's "subject_b is set?" check
    // doesn't fire on a variant the user opened then left blank.
    if (step.subject_b !== undefined) {
      payload.subject_b = step.subject_b?.trim() || null;
    }
    return payload;
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
  const editId = searchParams.get("edit");
  const isEditMode = Boolean(editId);
  const seedPlay = useMemo(() => findPlay(playId), [playId]);

  // Load existing campaign when in edit mode.
  const { details, loading: campaignLoading, error: campaignError } =
    useCampaign(editId);

  // Initial state seeds depend on whether we're editing or creating.
  const [name, setName] = useState(() =>
    seedPlay ? `${seedPlay.name} — draft` : "Untitled campaign",
  );
  const [steps, setSteps] = useState(() => seedStepsFromPlay(seedPlay));
  const [selectedStepId, setSelectedStepId] = useState(
    () => steps[0]?.localId ?? null,
  );
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [manualEmails, setManualEmails] = useState([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState(null);
  const [industry, setIndustry] = useState("any");
  const [tone, setTone] = useState("consultative");
  const [hydratedFromEdit, setHydratedFromEdit] = useState(false);

  const { companies, loading: companiesLoading } = useSavedCompanies();
  const { primaryEmail, known: inboxKnown } = useInboxStatus();
  const { state: templatesState, refresh: refreshTemplates } = useTemplates();
  const { result: personasResult, refresh: refreshPersonas } = usePersonas();

  const [audienceOpen, setAudienceOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [createPersonaOpen, setCreatePersonaOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [toast, setToast] = useState(null);

  // When edit-mode details land, hydrate state.
  useEffect(() => {
    if (!isEditMode || !details || hydratedFromEdit) return;
    setName(details.name);
    const builderSteps =
      details.steps.length > 0
        ? details.steps.map(dbStepToBuilder)
        : [emptyStep("email")];
    // Expand the first step so the inspector has something to show.
    if (builderSteps[0]) builderSteps[0].expanded = true;
    setSteps(builderSteps);
    setSelectedStepId(builderSteps[0]?.localId ?? null);
    setSelectedIds(new Set(details.companyIds));
    const metricsPersona = details.metrics?.persona_id;
    if (typeof metricsPersona === "string" && metricsPersona) {
      setSelectedPersonaId(metricsPersona);
    }
    // Pull persisted manual recipients (added in a previous Launch). The
    // edge function persists them on lit_campaigns.metrics.manual_recipients
    // when Launch runs, so re-launching keeps them.
    const persistedManual = Array.isArray(details.metrics?.manual_recipients)
      ? details.metrics.manual_recipients.filter(
          (m) => m && typeof m === "object" && typeof m.email === "string",
        )
      : [];
    setManualEmails(persistedManual);
    if (typeof details.metrics?.industry === "string") setIndustry(details.metrics.industry);
    if (typeof details.metrics?.tone === "string") setTone(details.metrics.tone);
    setHydratedFromEdit(true);
  }, [isEditMode, details, hydratedFromEdit]);

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
  const canSave = hasName && hasFilledStep && !saving && (!isEditMode || hydratedFromEdit);
  // Launch becomes available once: campaign is saved (we have an id),
  // a sender mailbox is connected, at least one step is filled in, and
  // at least one recipient is selected (company OR manual email). The
  // actual queueing runs through queue-campaign-recipients.
  const hasRecipients = selectedIds.size > 0 || manualEmails.length > 0;
  const canLaunch =
    Boolean(editId) &&
    Boolean(primaryEmail) &&
    hasFilledStep &&
    hasRecipients &&
    !saving;

  const saveGuidance = useMemo(() => {
    if (isEditMode && !hydratedFromEdit && campaignLoading) return null;
    if (!hasName) return "Add a campaign name to save.";
    if (!hasFilledStep)
      return "Add a subject or body to at least one step to save.";
    return null;
  }, [hasName, hasFilledStep, isEditMode, hydratedFromEdit, campaignLoading]);

  // ---- Step handlers ----
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

  // ---- Audience handlers ----
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

  // ---- Save flow (create + edit) ----
  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const baseChannel = "email";
      const metricsExtras = {};
      if (selectedPersonaId) metricsExtras.persona_id = selectedPersonaId;
      if (playId) metricsExtras.play_id = playId;
      // Industry + tone drive the template drawer's filter chips. Saved
      // so reopening the campaign restores the same template shortlist.
      if (industry) metricsExtras.industry = industry;
      if (tone) metricsExtras.tone = tone;
      // Persist manual recipients on every save so reopening the draft
      // shows what the user typed in. The queue function reads this on
      // Launch in addition to whatever's passed in the request body.
      if (manualEmails.length > 0) {
        metricsExtras.manual_recipients = manualEmails;
      } else if (isEditMode && details?.metrics?.manual_recipients) {
        // Explicitly clear if the user removed them all in this edit session.
        metricsExtras.manual_recipients = [];
      }
      // Preserve any pre-existing metrics keys (description, etc.) when editing.
      const mergedMetrics = isEditMode
        ? { ...(details?.metrics ?? {}), ...metricsExtras }
        : metricsExtras;

      let campaignId;
      if (isEditMode && details) {
        await updateCampaignBasics(details.id, {
          name: trimmedName,
          channel: baseChannel,
          metrics: mergedMetrics,
        });
        campaignId = details.id;
      } else {
        const created = await createCampaignDraft({
          name: trimmedName,
          channel: baseChannel,
          description: null,
          metrics: mergedMetrics,
        });
        campaignId = created.id;
      }

      // Companies — full set diff in edit mode, additive in create mode.
      const companyIds = Array.from(selectedIds);
      if (isEditMode) {
        await setCampaignCompanies(campaignId, companyIds);
      } else if (companyIds.length > 0) {
        await attachCompaniesToCampaign(campaignId, companyIds);
      }

      // Steps — upsert by step_order; in edit mode also delete any leftover
      // steps that the user removed from the sequence.
      const persistable = steps.filter(
        (s) => s.kind === "wait" || isStepFilled(s),
      );
      let order = 1;
      for (const s of persistable) {
        await upsertCampaignStep(persistPayloadFor(s, order, campaignId));
        order += 1;
      }
      if (isEditMode) {
        await deleteCampaignStepsFrom(campaignId, order);
      }

      setSuccess(
        isEditMode
          ? `Saved changes to "${trimmedName}".`
          : `Saved "${trimmedName}" as draft. Returning to Outbound…`,
      );
      window.setTimeout(
        () => navigate("/app/campaigns"),
        isEditMode ? 900 : 700,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save campaign.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    details,
    isEditMode,
    navigate,
    playId,
    selectedIds,
    selectedPersonaId,
    steps,
    trimmedName,
  ]);

  const handleTestSend = useCallback(async () => {
    if (testSending) return;
    if (!primaryEmail) {
      setError("Connect a Gmail or Outlook mailbox in Settings first.");
      return;
    }
    // Send-to defaults to the user's own inbox so the test always lands somewhere
    // visible. The user can override via prompt in case they want a different
    // address (different inbox, deliverability test).
    let toEmail = primaryEmail;
    if (typeof window !== "undefined") {
      const entered = window.prompt(
        "Send test email to which address?",
        primaryEmail,
      );
      if (entered === null) return; // cancelled
      const trimmed = String(entered).trim();
      if (!trimmed) return;
      toEmail = trimmed;
    }

    // Render the currently-selected step (or the first email step) with
    // sample variables so the recipient sees a fully-rendered preview.
    const emailStep =
      (selectedStep && selectedStep.kind === "email" ? selectedStep : null) ||
      steps.find((s) => s.kind === "email");
    const sampleCtx = buildMergeContext({
      recipient: {
        email: toEmail,
        first_name: "Linh",
        last_name: "Pham",
        display_name: "Linh Pham",
        title: "VP Logistics",
      },
      company: { name: "NorthBay Furniture", country_code: "VN" },
      sender: { email: primaryEmail, display_name: primaryEmail.split("@")[0] },
    });
    const subject = applyMergeVars(
      emailStep?.subject || "[TEST] Logistic Intel campaign preview",
      sampleCtx,
      { onMissing: "blank" },
    );
    const body = applyMergeVars(
      emailStep?.body ||
        "This is a test send from your Logistic Intel campaign builder.",
      sampleCtx,
      { onMissing: "blank" },
    );

    setTestSending(true);
    setError(null);
    try {
      const res = await sendTestEmail(toEmail, subject, body);
      if ("ok" in res && res.ok) {
        setToast({ message: `Test sent to ${toEmail}`, tone: "success" });
        window.setTimeout(() => setToast(null), 2500);
      } else if ("setupRequired" in res) {
        setError("Test send not deployed yet. Contact support.");
      } else if ("configError" in res) {
        setError("Integration service unavailable. Try again in a moment.");
      } else {
        setError(`Test send failed — ${(res).error}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTestSending(false);
    }
  }, [testSending, primaryEmail, selectedStep, steps]);

  // Auto-save when the audience picker closes IF the campaign has been
  // saved at least once (editId set). For new campaigns we surface a
  // sticky banner instead, since auto-create on every change would
  // pollute the campaigns list with empty drafts.
  const handleAudiencePickerClose = useCallback(() => {
    setAudienceOpen(false);
    if (canSave && editId) {
      // Fire-and-forget. handleSave already toasts on success/error.
      Promise.resolve().then(() => handleSave());
    }
  }, [canSave, editId]); // handleSave is stable enough; ignore exhaustive-deps

  const handleLaunch = useCallback(async () => {
    if (!canLaunch || !editId) return;
    if (typeof window !== "undefined" && !window.confirm(
      `Launch this campaign? Recipients will be queued and the dispatcher will start sending emails from ${primaryEmail}.`,
    )) return;
    setLaunching(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await launchCampaign(editId, manualEmails);
      if (res.ok) {
        setSuccess(
          `Launched · ${res.queued} recipient${res.queued === 1 ? "" : "s"} queued${res.skipped ? ` (${res.skipped} skipped)` : ""}.`,
        );
        setTimeout(() => navigate("/app/campaigns/analytics"), 800);
      } else {
        setError(`Launch failed — ${res.error}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }, [canLaunch, editId, primaryEmail, manualEmails, navigate]);

  // ---- Misc keyboard handler ----
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (createTemplateOpen) setCreateTemplateOpen(false);
      else if (previewOpen) setPreviewOpen(false);
      else if (audienceOpen) setAudienceOpen(false);
      else if (templatesOpen) setTemplatesOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [audienceOpen, templatesOpen, previewOpen, createTemplateOpen]);

  // ---- Save-as-template seed values from current step ----
  const templateSeed = useMemo(() => {
    const s = selectedStep;
    if (!s) return { title: "", subject: "", body: "", channel: "email" };
    if (s.kind === "email") {
      return {
        title: s.subject?.trim() ? s.subject.trim().slice(0, 80) : "",
        subject: s.subject || "",
        body: s.body || "",
        channel: "email",
      };
    }
    return {
      title: s.title?.trim() ? s.title.trim().slice(0, 80) : "",
      subject: s.title || "",
      body: s.description || "",
      channel: channelFor(s.kind),
    };
  }, [selectedStep]);

  return (
    <div className="mx-auto flex h-[calc(100vh-72px)] min-h-[640px] w-full max-w-[1500px] flex-col overflow-hidden bg-[#F8FAFC]">
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
              disabled={isEditMode && !hydratedFromEdit}
            />
            <span
              className="rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase tracking-[0.04em]"
              style={{
                fontFamily: fontDisplay,
                background: isEditMode ? "#F0FDF4" : "#E0F2FE",
                color: isEditMode ? "#15803d" : "#0369A1",
                borderColor: isEditMode ? "#BBF7D0" : "#BAE6FD",
              }}
            >
              {isEditMode ? (details?.status || "Editing") : "Draft"}
            </span>
          </div>
          <div
            className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            {isEditMode ? (
              campaignLoading ? (
                <span>Loading campaign…</span>
              ) : (
                <span>Editing existing campaign</span>
              )
            ) : seedPlay ? (
              <span>
                Seeded from <strong className="text-[#0F172A]">{seedPlay.name}</strong>
              </span>
            ) : (
              <span>Build a sequence and save as draft.</span>
            )}
            <span className="text-[#CBD5E1]">·</span>
            <span>
              {selectedIds.size} compan{selectedIds.size === 1 ? "y" : "ies"}
              {manualEmails.length > 0 ? ` · ${manualEmails.length} manual email${manualEmails.length === 1 ? "" : "s"}` : ""}
            </span>
            <span className="text-[#CBD5E1]">·</span>
            <span>{steps.length} step{steps.length === 1 ? "" : "s"}</span>
            <span className="text-[#CBD5E1]">·</span>
            {/* Industry + tone selectors. Drive template-drawer filter chips
                and inform the user's pitch style. Persisted on
                lit_campaigns.metrics so re-opening keeps the choice. */}
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
              style={{ fontFamily: fontDisplay }}
              title="Recipient industry — filters template suggestions"
            >
              {INDUSTRY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
              style={{ fontFamily: fontDisplay }}
              title={TONE_OPTIONS.find((t) => t.id === tone)?.helper || "Pitch style"}
            >
              {TONE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
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
          >
            <Play className="h-2.5 w-2.5" />
            Preview as contact
          </button>
          <button
            type="button"
            onClick={handleTestSend}
            disabled={testSending || !primaryEmail}
            title={
              !primaryEmail
                ? "Connect a Gmail or Outlook mailbox in Settings first."
                : "Send the currently-selected email step to your inbox with sample variables."
            }
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            <FlaskConical className="h-2.5 w-2.5" />
            {testSending ? "Sending…" : "Test send"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            title={saveGuidance ?? ""}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ fontFamily: fontDisplay }}
          >
            <Save className="h-2.5 w-2.5" />
            {saving ? "Saving…" : isEditMode ? "Save changes" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={!canLaunch || launching}
            title={
              canLaunch
                ? "Queue recipients and start sending."
                : !editId
                  ? "Save the campaign first."
                  : !primaryEmail
                    ? "Connect a Gmail or Outlook mailbox in Settings first."
                    : !hasRecipients
                      ? "Add at least one recipient — pick a company with enriched contacts, or type emails into the Manual tab."
                      : "Add at least one filled step first."
            }
            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-[#10B981] to-[#059669] px-3 py-1 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(16,185,129,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ fontFamily: fontDisplay }}
          >
            <Rocket className="h-2.5 w-2.5" />
            {launching ? "Launching…" : "Launch"}
          </button>
        </div>
      </div>

      <ForecastStrip audienceCount={selectedIds.size} />

      {error || campaignError ? (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-700"
          style={{ fontFamily: fontBody }}
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error || campaignError}
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

      {/* 3-column body — Timeline + Inspector at md, full 3-pane at lg.
          PersonaPanel hidden under lg; audience picker reachable via the
          top-bar Recipients button on tablets and phones. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_340px] lg:grid-cols-[260px_1fr_340px]">
        <div className="hidden lg:block">
          <PersonaPanel
            audienceCount={selectedIds.size}
            totalSavedCompanies={companies.length}
            selectedCompanies={selectedCompanies}
            personasResult={personasResult}
            selectedPersonaId={selectedPersonaId}
            onSelectPersona={setSelectedPersonaId}
            onOpenAudiencePicker={() => setAudienceOpen(true)}
            onOpenTemplates={() => setTemplatesOpen(true)}
            onCreatePersona={() => setCreatePersonaOpen(true)}
          />
        </div>
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
          onSaveAsTemplate={() => setCreateTemplateOpen(true)}
        />
      </div>

      <AudiencePickerDrawer
        open={audienceOpen}
        loading={companiesLoading}
        companies={companies}
        selectedIds={selectedIds}
        manualEmails={manualEmails}
        onClose={handleAudiencePickerClose}
        onToggle={handleToggleCompany}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onChangeManualEmails={setManualEmails}
        onOpenCommandCenter={() => navigate("/app/command-center")}
      />

      <TemplatesDrawer
        open={templatesOpen}
        state={templatesState}
        onClose={() => setTemplatesOpen(false)}
        onApply={handleApplyTemplate}
        onCreate={() => setCreateTemplateOpen(true)}
        defaultIndustry={industry}
        defaultTone={tone}
      />

      <PreviewModal
        open={previewOpen}
        steps={steps}
        onClose={() => setPreviewOpen(false)}
        senderEmail={primaryEmail}
        senderName={primaryEmail ? primaryEmail.split("@")[0] : null}
      />

      <CreateTemplateModal
        open={createTemplateOpen}
        initialTitle={templateSeed.title}
        initialSubject={templateSeed.subject}
        initialBody={templateSeed.body}
        initialChannel={templateSeed.channel}
        onClose={() => setCreateTemplateOpen(false)}
        onCreated={async () => {
          setCreateTemplateOpen(false);
          setToast({ message: "Template saved to your workspace.", tone: "success" });
          window.setTimeout(() => setToast(null), 2200);
          await refreshTemplates();
        }}
      />

      <CreatePersonaModal
        open={createPersonaOpen}
        onClose={() => setCreatePersonaOpen(false)}
        onCreated={async (newId) => {
          setCreatePersonaOpen(false);
          setToast({ message: "Persona saved to your workspace.", tone: "success" });
          window.setTimeout(() => setToast(null), 2200);
          await refreshPersonas();
          setSelectedPersonaId(newId);
        }}
      />

      {toast ? (
        <div
          className="fixed bottom-5 right-5 z-50 rounded-md px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_8px_24px_rgba(15,23,42,0.3)]"
          style={{
            fontFamily: fontDisplay,
            background:
              toast.tone === "danger"
                ? "linear-gradient(180deg,#EF4444,#DC2626)"
                : "linear-gradient(180deg,#10B981,#059669)",
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
