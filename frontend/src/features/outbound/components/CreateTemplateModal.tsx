import React, { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import { createWorkspaceTemplate } from "../api/campaignActions";

interface Props {
  open: boolean;
  /** Optional seeds — when "Save as template" is clicked from the inspector,
   *  the current step's content is pre-filled. */
  initialTitle?: string;
  initialSubject?: string;
  initialBody?: string;
  initialChannel?: string;
  onClose: () => void;
  onCreated: () => void;
}

const CHANNELS = ["email", "linkedin_invite", "linkedin_message", "call"];
const STAGES = ["cold", "follow_up", "breakup", "reply", "post_meeting"];

export function CreateTemplateModal({
  open,
  initialTitle = "",
  initialSubject = "",
  initialBody = "",
  initialChannel = "email",
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [channel, setChannel] = useState(initialChannel);
  const [stage, setStage] = useState("cold");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset internal state on open. (Hooks must run unconditionally — early
  // return is below this block.)
  React.useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setSubject(initialSubject);
      setBody(initialBody);
      setChannel(initialChannel || "email");
      setStage("cold");
      setError(null);
    }
  }, [open, initialTitle, initialSubject, initialBody, initialChannel]);

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && !busy;

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      await createWorkspaceTemplate({
        title: title.trim(),
        subject: subject.trim() || null,
        body: body.trim() || null,
        channel,
        stage,
      });
      onCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save template.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.5)]"
        onClick={busy ? undefined : onClose}
        aria-hidden
      />
      <div className="fixed inset-x-2 inset-y-4 z-50 mx-auto flex max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.35)] sm:inset-x-4 sm:inset-y-8">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#EFF6FF] text-[#1d4ed8] ring-1 ring-[#BFDBFE]">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div
              className="text-[14px] font-bold text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              Save as workspace template
            </div>
            <div
              className="text-[11px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              Visible only to your org. Reuse across campaigns.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3.5">
          <Field label="Template name (required)">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Auto Tier-1 lane shift opener"
              className={inputClass()}
              style={{ fontFamily: fontBody }}
              maxLength={120}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Channel">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className={inputClass()}
                style={{ fontFamily: fontBody }}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stage">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className={inputClass()}
                style={{ fontFamily: fontBody }}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Variables OK — {{first_name}}, {{top_lane}}, etc."
              className={inputClass()}
              style={{ fontFamily: fontBody }}
            />
          </Field>

          <Field label="Body">
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, …"
              className={inputClass(true)}
              style={{ fontFamily: fontBody, lineHeight: 1.55 }}
            />
            <p
              className="mt-1.5 text-[10px] text-slate-400"
              style={{ fontFamily: fontMono }}
            >
              {"{{first_name}}  {{company_name}}  {{top_lane}}  {{port}}  {{quarter}}  {{competitor}}  {{industry}}  {{sender_name}}"}
            </p>
          </Field>

          {error ? (
            <div
              className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700"
              style={{ fontFamily: fontBody }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-[#FAFBFC] px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            style={{ fontFamily: fontDisplay }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)] disabled:opacity-50"
            style={{ fontFamily: fontDisplay }}
          >
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5">
      <div
        className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400"
        style={{ fontFamily: fontDisplay }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function inputClass(textarea = false) {
  return [
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F172A] outline-none transition",
    "focus:border-[#3B82F6] focus:ring-2 focus:ring-blue-100",
    textarea ? "resize-y" : "",
  ]
    .filter(Boolean)
    .join(" ");
}