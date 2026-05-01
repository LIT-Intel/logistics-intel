import React from "react";
import { CHANNEL, fontDisplay, fontBody, fontMono } from "../tokens";
import { ChannelIcon } from "./ChannelChip";
import type { BuilderStep, OutreachTemplate } from "../types";

const VARIABLES = [
  "{{first_name}}",
  "{{company_name}}",
  "{{top_lane}}",
  "{{sender_name}}",
];

interface Props {
  step: BuilderStep | null;
  primaryInboxEmail: string | null;
  inboxKnown: boolean;
  templates: OutreachTemplate[];
  onUpdate: (patch: Partial<BuilderStep>) => void;
  onApplyTemplate: (template: OutreachTemplate) => void;
  onPreview: () => void;
  onTestSend: () => void;
}

export function StepInspector({
  step,
  primaryInboxEmail,
  inboxKnown,
  templates,
  onUpdate,
  onApplyTemplate,
  onPreview,
  onTestSend,
}: Props) {
  if (!step) {
    return (
      <div className="flex h-full items-center justify-center border-l border-slate-200 bg-white px-6 text-center">
        <div>
          <div
            className="text-sm font-semibold text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            No step selected
          </div>
          <div
            className="mt-1 text-xs text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            Click a step in the timeline to edit it.
          </div>
        </div>
      </div>
    );
  }

  const meta = CHANNEL[step.kind];
  const isEmail = step.kind === "email";
  const isWait = step.kind === "wait";
  const isLinkedInOrCall =
    step.kind === "linkedin_invite" ||
    step.kind === "linkedin_message" ||
    step.kind === "call";

  const insertVariable = (variable: string) => {
    if (isEmail) {
      onUpdate({
        body: `${step.body || ""}${step.body && !step.body.endsWith(" ") ? " " : ""}${variable}`,
      });
    } else if (isLinkedInOrCall) {
      onUpdate({
        description: `${step.description || ""}${step.description && !step.description.endsWith(" ") ? " " : ""}${variable}`,
      });
    }
  };

  const channelTemplates = templates.filter((t) => {
    const c = (t.channel || "").toLowerCase();
    if (step.kind === "email") return !c || c === "email";
    if (step.kind === "linkedin_invite" || step.kind === "linkedin_message")
      return c.startsWith("linkedin");
    if (step.kind === "call") return c === "call";
    return false;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-slate-200 bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3.5">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
        >
          <ChannelIcon kind={step.kind} size={13} />
        </span>
        <div>
          <div
            className="text-sm font-bold text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            {meta.label}
          </div>
          <div
            className="text-[11px] text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            {isEmail
              ? "Compose · Schedule"
              : isWait
              ? "Wait between steps"
              : "Manual task — sequenced for the rep"}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3.5">
        {isWait ? (
          <Field label="Wait days">
            <input
              type="number"
              min={0}
              max={60}
              value={step.waitDays}
              onChange={(e) =>
                onUpdate({
                  waitDays: Math.max(0, Number(e.target.value || 0)),
                })
              }
              className={inputClass()}
              style={{ fontFamily: fontBody }}
            />
            <p
              className="mt-1.5 text-[11px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              How long to pause before the next step.
            </p>
          </Field>
        ) : null}

        {isEmail ? (
          <>
            <Field label="From">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-[#F8FAFC] px-2.5 py-2">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{
                    background: "#3B82F6",
                    fontFamily: fontDisplay,
                  }}
                >
                  {primaryInboxEmail
                    ? primaryInboxEmail.slice(0, 2).toUpperCase()
                    : "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-xs font-semibold text-[#0F172A]"
                    style={{ fontFamily: fontDisplay }}
                  >
                    {primaryInboxEmail
                      ? "Primary inbox"
                      : inboxKnown
                      ? "No inbox connected"
                      : "Inbox status unavailable"}
                  </div>
                  <div
                    className="truncate text-[10px] text-slate-500"
                    style={{ fontFamily: fontMono }}
                  >
                    {primaryInboxEmail || "Connect Gmail in Settings"}
                  </div>
                </div>
              </div>
            </Field>

            <Field label="Subject">
              <input
                value={step.subject}
                onChange={(e) => onUpdate({ subject: e.target.value })}
                placeholder="Re: VN→LAX volume +18%, what we're seeing"
                className={inputClass()}
                style={{ fontFamily: fontBody }}
              />
            </Field>

            <Field label="Body">
              <textarea
                rows={8}
                value={step.body}
                onChange={(e) => onUpdate({ body: e.target.value })}
                placeholder="Hi {{first_name}}, …"
                className={inputClass(true)}
                style={{ fontFamily: fontBody, lineHeight: 1.55 }}
              />
              <VariableChips onInsert={insertVariable} />
              <p
                className="mt-1.5 text-[11px] text-slate-400"
                style={{ fontFamily: fontBody }}
              >
                Plain text. Variables resolve at send time once the dispatcher ships.
              </p>
            </Field>
          </>
        ) : null}

        {isLinkedInOrCall ? (
          <>
            <Field label="Task title">
              <input
                value={step.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder={
                  step.kind === "call"
                    ? "Voicemail · 30 sec"
                    : step.kind === "linkedin_invite"
                    ? "Connect · referrer angle"
                    : "Direct message"
                }
                className={inputClass()}
                style={{ fontFamily: fontBody }}
              />
            </Field>
            <Field label="Description / script">
              <textarea
                rows={6}
                value={step.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                placeholder="What the rep should do or say. Variables OK."
                className={inputClass(true)}
                style={{ fontFamily: fontBody, lineHeight: 1.55 }}
              />
              <VariableChips onInsert={insertVariable} />
            </Field>
            <div
              className="mb-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] leading-relaxed text-[#B45309]"
              style={{ fontFamily: fontBody }}
            >
              {step.kind === "call"
                ? "Call steps are saved as manual tasks for the assigned rep."
                : "LinkedIn steps are saved as manual tasks — no automation runs from this step."}
            </div>
          </>
        ) : null}

        {!isWait ? (
          <Field label="Delay from previous (days)">
            <input
              type="number"
              min={0}
              max={60}
              value={step.delayDays}
              onChange={(e) =>
                onUpdate({
                  delayDays: Math.max(0, Number(e.target.value || 0)),
                })
              }
              className={inputClass()}
              style={{ fontFamily: fontBody }}
            />
          </Field>
        ) : null}

        {channelTemplates.length > 0 && !isWait ? (
          <Field label="Apply a template">
            <div className="flex flex-col gap-1.5">
              {channelTemplates.slice(0, 6).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onApplyTemplate(tpl)}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1.5 text-left text-xs hover:border-[#3B82F6] hover:bg-[#F0F9FF]"
                  style={{ fontFamily: fontBody }}
                >
                  <span className="truncate font-medium text-[#0F172A]">
                    {tpl.name}
                  </span>
                  <span className="text-[10px] text-slate-400">Use</span>
                </button>
              ))}
            </div>
          </Field>
        ) : null}
      </div>

      {/* Footer actions */}
      {!isWait ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onPreview}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
            style={{ fontFamily: fontDisplay }}
          >
            Preview as contact
          </button>
          <button
            type="button"
            onClick={onTestSend}
            disabled
            title="Test send ships with the dispatcher in a follow-up phase."
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            Test send · setup required
          </button>
        </div>
      ) : null}
    </div>
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
    <div className="mb-3.5">
      <div
        className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400"
        style={{ fontFamily: fontDisplay }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function VariableChips({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {VARIABLES.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="rounded border border-[#BAE6FD] bg-[#E0F2FE] px-1.5 py-0.5 text-[10px] font-semibold text-[#0369A1] transition hover:bg-[#BAE6FD]"
          style={{ fontFamily: fontMono }}
        >
          {v}
        </button>
      ))}
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