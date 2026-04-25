import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Mail,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import {
  getSavedCompanies,
  createCampaignDraft,
  attachCompaniesToCampaign,
  upsertCampaignStep,
  getPrimaryEmailAccount,
  listEmailAccounts,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Phase C — Outbound Engine builder.
//
//   * Real data only. Reads `lit_saved_companies` via getSavedCompanies(),
//     reads `lit_email_accounts` for inbox readiness, writes drafts to
//     `lit_campaigns` + `lit_campaign_companies` + `lit_campaign_steps`.
//   * No raw company_ids textarea, no manual campaign_email_id panel,
//     no fake default sequence, no stub save alerts.
//   * Save Draft persists to real tables. Launch is honestly disabled
//     until Phase E ships Gmail OAuth + dispatcher.
// ---------------------------------------------------------------------------

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email", Icon: Mail },
];

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStep() {
  return {
    localId: uid(),
    subject: "",
    body: "",
    delay_days: 0,
    channel: "email",
    step_type: "email",
    expanded: true,
  };
}

function flattenSavedCompany(row) {
  const company = row?.lit_companies || row?.company || {};
  return {
    saved_id: row?.id,
    company_id: company?.id ?? row?.company_id,
    name: company?.name || row?.company_name || "Unnamed company",
    domain: company?.domain || company?.website || null,
    location: [company?.city, company?.state, company?.country_code]
      .filter(Boolean)
      .join(", "),
    stage: row?.stage || null,
    status: row?.status || null,
  };
}

// -------- shared shell --------

function BuilderHeader({ onBack, canSaveDraft, saving, onSaveDraft, canLaunch }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-indigo-600"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Outbound
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-600">
          Engage · Outbound · New campaign
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          New campaign
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Set the basics, pick your audience, build a sequence, and save as a
          draft. Launch becomes available once your inbox is connected.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={!canSaveDraft || saving}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          disabled={!canLaunch}
          title={
            canLaunch
              ? ""
              : "Launch will be available once Gmail is connected and a recipient + step are added"
          }
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Launch
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function StepShell({ kicker, title, description, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-black/[0.02]">
      <div className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-500">
          {kicker}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

// -------- card 1: basics --------

function BasicsCard({ name, channel, description, onChange }) {
  return (
    <StepShell
      kicker="Step 1 · Basics"
      title="Campaign basics"
      description="Name your campaign and choose a primary channel. The description is private to your team."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">
            Campaign name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Q2 Latin America trans-Pacific shippers"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">
            Channel
          </label>
          <select
            value={channel}
            onChange={(e) => onChange({ channel: e.target.value })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            LinkedIn / SMS arrive in a future release.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-slate-500">
          Description
        </label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Optional — what this campaign is for and who it targets"
          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>
    </StepShell>
  );
}

// -------- card 2: audience --------

function AudienceCard({
  loading,
  companies,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  onOpenCommandCenter,
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => {
      const haystack = `${c.name || ""} ${c.domain || ""} ${c.location || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [companies, filter]);

  const selectedCount = selectedIds.size;

  return (
    <StepShell
      kicker="Step 2 · Audience"
      title="Pick saved companies"
      description="Recipients come from Command Center. Select the shippers you want this sequence to reach."
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 ring-1 ring-slate-200">
            <Users className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-slate-900">
            No saved companies yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Save shippers in Command Center first — you&rsquo;ll be able to pick
            them here as your audience.
          </p>
          <button
            type="button"
            onClick={onOpenCommandCenter}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Open Command Center
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by name, domain, or location"
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                {selectedCount} selected
              </span>
              <button
                type="button"
                onClick={onSelectAll}
                disabled={!filtered.length}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={onClearAll}
                disabled={selectedCount === 0}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No companies match &ldquo;{filter}&rdquo;.
              </div>
            ) : (
              filtered.map((c) => {
                const checked = selectedIds.has(c.company_id);
                return (
                  <button
                    key={c.saved_id || c.company_id}
                    type="button"
                    onClick={() => c.company_id && onToggle(c.company_id)}
                    disabled={!c.company_id}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      checked
                        ? "border-indigo-300 bg-indigo-50/40 ring-1 ring-indigo-200"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        checked
                          ? "border-indigo-500 bg-indigo-500 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {checked ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {c.name}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[c.domain, c.location, c.stage]
                          .filter(Boolean)
                          .join(" · ") || "No metadata yet"}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </StepShell>
  );
}

// -------- card 3: sequence --------

function SequenceCard({ steps, onChange, onAdd, onRemove, onMove, onToggleExpand }) {
  return (
    <StepShell
      kicker="Step 3 · Sequence"
      title="Build the sequence"
      description="Add the email steps that go out in order. Wait days control the gap between steps."
    >
      <div className="space-y-3">
        {steps.map((step, idx) => (
          <SequenceStepCard
            key={step.localId}
            step={step}
            index={idx}
            isFirst={idx === 0}
            isLast={idx === steps.length - 1}
            canRemove={steps.length > 1}
            onChange={(patch) => onChange(idx, patch)}
            onRemove={() => onRemove(idx)}
            onMoveUp={() => onMove(idx, idx - 1)}
            onMoveDown={() => onMove(idx, idx + 1)}
            onToggleExpand={() => onToggleExpand(idx)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-700"
      >
        <Plus className="h-4 w-4" />
        Add step
      </button>
    </StepShell>
  );
}

function SequenceStepCard({
  step,
  index,
  isFirst,
  isLast,
  canRemove,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onToggleExpand,
}) {
  const summary = step.subject?.trim() || "(no subject)";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
          aria-label={step.expanded ? "Collapse step" : "Expand step"}
        >
          {step.expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {index + 1}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              <Mail className="h-3 w-3" />
              Email
            </span>
            <span className="text-[11px] text-slate-400">
              {step.delay_days > 0
                ? `Send +${step.delay_days}d after previous step`
                : "Send immediately"}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-slate-900">
            {summary}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Move step up"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Move step down"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label="Remove step"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {step.expanded ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <div className="grid gap-3 md:grid-cols-[1fr_140px]">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                Subject
              </label>
              <input
                type="text"
                value={step.subject}
                onChange={(e) => onChange({ subject: e.target.value })}
                placeholder="Subject line — merge tags supported in Phase E"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                Wait (days)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={step.delay_days}
                onChange={(e) =>
                  onChange({
                    delay_days: Math.max(0, Number(e.target.value || 0)),
                  })
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              Body
            </label>
            <textarea
              rows={5}
              value={step.body}
              onChange={(e) => onChange({ body: e.target.value })}
              placeholder="Hi {{first_name}}, …"
              className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              Plain text for now. Merge-tag rendering ships with the
              dispatcher in Phase E.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// -------- card 4: readiness --------

function ReadinessCard({
  hasName,
  hasAudience,
  audienceCount,
  hasStep,
  hasInbox,
  inboxStatusKnown,
  primaryInboxEmail,
  saving,
  canSaveDraft,
  canLaunch,
  onSaveDraft,
  error,
  success,
}) {
  const checks = [
    { ok: hasName, label: "Campaign name set" },
    {
      ok: hasAudience,
      label: hasAudience
        ? `${audienceCount} recipient${audienceCount === 1 ? "" : "s"} selected`
        : "Pick at least one recipient",
    },
    {
      ok: hasStep,
      label: hasStep
        ? "Sequence has at least one filled step"
        : "Add a subject or body to the first step",
    },
    {
      ok: hasInbox,
      label: !inboxStatusKnown
        ? "Email accounts not yet available in your workspace"
        : primaryInboxEmail
        ? `Inbox connected (${primaryInboxEmail})`
        : "Connect Gmail before launch",
    },
  ];

  return (
    <StepShell
      kicker="Step 4 · Readiness"
      title="Ready to save"
      description="Save your draft now — Launch unlocks once Gmail is connected and the dispatcher ships in Phase E."
    >
      <div className="space-y-2">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm ${
              check.ok
                ? "border-emerald-100 bg-emerald-50/50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {check.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-slate-300" />
            )}
            <span className="min-w-0 truncate">{check.label}</span>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={!canSaveDraft || saving}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          disabled={!canLaunch}
          title={
            canLaunch
              ? ""
              : "Launch dispatcher ships in Phase E. For now, save as draft."
          }
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Launch
        </button>
      </div>
    </StepShell>
  );
}

// -------- page --------

export default function CampaignBuilder() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [description, setDescription] = useState("");

  const [savedCompanies, setSavedCompanies] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [steps, setSteps] = useState(() => [emptyStep()]);

  const [primaryInboxEmail, setPrimaryInboxEmail] = useState(null);
  const [inboxStatusKnown, setInboxStatusKnown] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load saved companies + inbox state on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await getSavedCompanies();
        const rows = Array.isArray(resp?.rows)
          ? resp.rows
          : Array.isArray(resp)
          ? resp
          : [];
        const flattened = rows
          .map(flattenSavedCompany)
          .filter((c) => c.company_id);
        if (!cancelled) setSavedCompanies(flattened);
      } catch {
        if (!cancelled) setSavedCompanies([]);
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }

      try {
        const primary = await getPrimaryEmailAccount();
        if (cancelled) return;
        if (primary?.email) {
          setPrimaryInboxEmail(primary.email);
          setInboxStatusKnown(true);
        } else {
          const list = await listEmailAccounts();
          const connected = (list || []).find((a) => a.status === "connected");
          if (cancelled) return;
          setPrimaryInboxEmail(connected?.email ?? null);
          setInboxStatusKnown(true);
        }
      } catch {
        if (cancelled) return;
        setPrimaryInboxEmail(null);
        setInboxStatusKnown(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Form handlers.
  const handleBasicsChange = useCallback((patch) => {
    if (patch.name !== undefined) setName(patch.name);
    if (patch.channel !== undefined) setChannel(patch.channel);
    if (patch.description !== undefined) setDescription(patch.description);
  }, []);

  const handleToggleCompany = useCallback((companyId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(savedCompanies.map((c) => c.company_id)));
  }, [savedCompanies]);

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleStepChange = useCallback((idx, patch) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const handleAddStep = useCallback(() => {
    setSteps((prev) => [...prev, emptyStep()]);
  }, []);

  const handleRemoveStep = useCallback((idx) => {
    setSteps((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleMoveStep = useCallback((from, to) => {
    setSteps((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleToggleExpand = useCallback((idx) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, expanded: !s.expanded } : s)),
    );
  }, []);

  // Validation / readiness.
  const trimmedName = name.trim();
  const hasName = trimmedName.length > 0;
  const hasAudience = selectedIds.size > 0;
  const hasStep = steps.some(
    (s) => s.subject.trim().length > 0 || s.body.trim().length > 0,
  );
  const hasInbox = Boolean(primaryInboxEmail);
  const canSaveDraft = hasName && hasStep && !saving;
  const canLaunch = false; // honest disable until Phase E

  // Save flow.
  async function handleSaveDraft() {
    if (!canSaveDraft) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const campaign = await createCampaignDraft({
        name: trimmedName,
        channel,
        description: description.trim() || null,
      });

      const companyIds = Array.from(selectedIds);
      if (companyIds.length > 0) {
        await attachCompaniesToCampaign(campaign.id, companyIds);
      }

      const filledSteps = steps.filter(
        (s) => s.subject.trim().length > 0 || s.body.trim().length > 0,
      );
      let order = 1;
      for (const s of filledSteps) {
        await upsertCampaignStep({
          campaign_id: campaign.id,
          step_order: order,
          channel: s.channel || "email",
          step_type: s.step_type || "email",
          subject: s.subject.trim() || null,
          body: s.body.trim() || null,
          delay_days: Number.isFinite(s.delay_days) ? s.delay_days : 0,
          delay_hours: 0,
        });
        order += 1;
      }

      setSuccess(
        `Saved "${campaign.name}" as draft. Returning to Outbound…`,
      );
      window.setTimeout(() => navigate("/app/campaigns"), 700);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to save campaign draft";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1100px]">
        <BuilderHeader
          onBack={() => navigate("/app/campaigns")}
          canSaveDraft={canSaveDraft}
          saving={saving}
          onSaveDraft={handleSaveDraft}
          canLaunch={canLaunch}
        />

        <div className="space-y-6">
          <BasicsCard
            name={name}
            channel={channel}
            description={description}
            onChange={handleBasicsChange}
          />

          <AudienceCard
            loading={companiesLoading}
            companies={savedCompanies}
            selectedIds={selectedIds}
            onToggle={handleToggleCompany}
            onSelectAll={handleSelectAll}
            onClearAll={handleClearAll}
            onOpenCommandCenter={() => navigate("/app/command-center")}
          />

          <SequenceCard
            steps={steps}
            onChange={handleStepChange}
            onAdd={handleAddStep}
            onRemove={handleRemoveStep}
            onMove={handleMoveStep}
            onToggleExpand={handleToggleExpand}
          />

          <ReadinessCard
            hasName={hasName}
            hasAudience={hasAudience}
            audienceCount={selectedIds.size}
            hasStep={hasStep}
            hasInbox={hasInbox}
            inboxStatusKnown={inboxStatusKnown}
            primaryInboxEmail={primaryInboxEmail}
            saving={saving}
            canSaveDraft={canSaveDraft}
            canLaunch={canLaunch}
            onSaveDraft={handleSaveDraft}
            error={error}
            success={success}
          />
        </div>
      </div>
    </div>
  );
}
