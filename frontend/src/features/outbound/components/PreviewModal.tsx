import React from "react";
import { X, AlertTriangle } from "lucide-react";
import { CHANNEL, fontDisplay, fontBody, fontMono } from "../tokens";
import { ChannelIcon } from "./ChannelChip";
import { applyVariables } from "../data/templates";
import { listMissingVars } from "@/lib/mergeVars";
import type { BuilderStep } from "../types";

// Renders the sequence as a sample contact would receive it. Variable
// resolution uses fixed sample values so the preview is deterministic
// (subject lines, lane data, names). Real send-time resolution will swap
// these for the actual recipient when the dispatcher ships.

// Sample values used to render the preview. Recipient-side values stay
// generic (Linh / NorthBay) because the preview shows what the recipient
// sees. Sender-side values come in via props from the live campaign so
// the From line matches the actual mailbox the dispatcher will send from.
const RECIPIENT_SAMPLE: Record<string, string> = {
  first_name: "Linh",
  last_name: "Pham",
  company_name: "NorthBay Furniture",
  top_lane: "VN→LAX",
  port: "LAX",
  quarter: "Q1",
  competitor: "MSC",
  carrier: "Maersk",
  industry: "automotive",
  tariff_event: "Section 201 update",
  pct: "18%",
  teu_growth: "+22%",
};

function dayLabelFor(steps: BuilderStep[], index: number): number {
  let day = 1;
  for (let i = 0; i <= index; i++) {
    const s = steps[i];
    if (i === 0) {
      if (s.kind === "wait") day += s.waitDays;
      else day += s.delayDays;
    } else {
      if (s.kind === "wait") day += s.waitDays;
      else day += s.delayDays;
    }
  }
  return day;
}

export function PreviewModal({
  open,
  steps,
  onClose,
  senderEmail,
  senderName,
}: {
  open: boolean;
  steps: BuilderStep[];
  onClose: () => void;
  senderEmail?: string | null;
  senderName?: string | null;
}) {
  if (!open) return null;
  const sendable = steps.filter((s) => s.kind !== "wait");
  // Build the live merge context: recipient sample + actual sender from
  // the connected mailbox. Falls back to placeholder hints when no inbox
  // is connected so the preview still renders.
  const resolvedSenderEmail =
    senderEmail || "no-inbox-connected@logisticintel.com";
  const resolvedSenderName =
    senderName ||
    (senderEmail ? senderEmail.split("@")[0] : "Your name");
  const SAMPLE_VARS: Record<string, string> = {
    ...RECIPIENT_SAMPLE,
    sender_name: resolvedSenderName,
    sender_email: resolvedSenderEmail,
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.5)]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-2 inset-y-4 z-50 mx-auto flex max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.35)] sm:inset-x-4 sm:inset-y-8">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-200 px-4 py-3">
          <div>
            <div
              className="text-[13px] font-bold text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              Preview as contact
            </div>
            <div
              className="text-[11px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              Sample recipient · {SAMPLE_VARS.first_name} at {SAMPLE_VARS.company_name} · sending from {resolvedSenderEmail}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Close preview"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#F8FAFC] px-4 py-4">
          {sendable.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-[12px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              No sendable steps yet — add an email, LinkedIn, or call task to preview.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {steps.map((s, i) => {
                if (s.kind === "wait") {
                  return (
                    <div
                      key={s.localId}
                      className="flex items-center gap-2 px-2 text-[11px] text-slate-500"
                      style={{ fontFamily: fontBody }}
                    >
                      <ChannelIcon kind="wait" size={11} />
                      Wait {s.waitDays} day{s.waitDays === 1 ? "" : "s"}
                    </div>
                  );
                }
                const meta = CHANNEL[s.kind];
                const day = dayLabelFor(steps, i);
                if (s.kind === "email") {
                  const subject = applyVariables(s.subject, SAMPLE_VARS);
                  const body = applyVariables(s.body, SAMPLE_VARS);
                  // Variables a real recipient might not have. Sample
                  // context is generous so anything missing here means
                  // the template references a token outside the standard
                  // recipient/company/sender set — flag it so the user
                  // can decide before launch.
                  const missingSubject = listMissingVars(s.subject, SAMPLE_VARS);
                  const missingBody = listMissingVars(s.body, SAMPLE_VARS);
                  const missing = Array.from(new Set([...missingSubject, ...missingBody]));
                  return (
                    <article
                      key={s.localId}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                    >
                      <header className="flex items-center gap-2 border-b border-slate-100 bg-[#FAFBFC] px-3 py-2">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
                          style={{
                            color: meta.color,
                            background: meta.bg,
                            border: `1px solid ${meta.border}`,
                            fontFamily: fontDisplay,
                          }}
                        >
                          <ChannelIcon kind={s.kind} size={10} />
                          Day {day}
                        </span>
                        <span
                          className="truncate text-[12px] text-slate-700"
                          style={{ fontFamily: fontBody }}
                        >
                          From: {resolvedSenderEmail}
                        </span>
                        <span
                          className="ml-auto text-[10px] text-slate-400"
                          style={{ fontFamily: fontMono }}
                        >
                          to {SAMPLE_VARS.first_name.toLowerCase()}@northbay.example
                        </span>
                      </header>
                      <div className="px-3 py-2.5">
                        <div
                          className="text-[13px] font-semibold text-[#0F172A]"
                          style={{ fontFamily: fontDisplay }}
                        >
                          {subject || (
                            <span className="text-slate-400">(no subject)</span>
                          )}
                        </div>
                        <pre
                          className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700"
                          style={{ fontFamily: fontBody }}
                        >
                          {body || (
                            <span className="text-slate-400">(empty body)</span>
                          )}
                        </pre>
                        {missing.length > 0 && (
                          <div
                            className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10.5px] text-[#B45309]"
                            style={{ fontFamily: fontBody }}
                          >
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              <strong>Unknown variable{missing.length === 1 ? "" : "s"}:</strong>{" "}
                              <span style={{ fontFamily: fontMono }}>
                                {missing.map((m) => `{{${m}}}`).join(", ")}
                              </span>{" "}
                              — won't resolve at send time. Remove or define before launch.
                            </span>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                }
                // linkedin / call rendered as a manual task card
                const title = applyVariables(s.title, SAMPLE_VARS);
                const description = applyVariables(s.description, SAMPLE_VARS);
                return (
                  <article
                    key={s.localId}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    <header className="flex items-center gap-2 border-b border-slate-100 bg-[#FAFBFC] px-3 py-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
                        style={{
                          color: meta.color,
                          background: meta.bg,
                          border: `1px solid ${meta.border}`,
                          fontFamily: fontDisplay,
                        }}
                      >
                        <ChannelIcon kind={s.kind} size={10} />
                        Day {day} · {meta.label}
                      </span>
                      <span
                        className="ml-auto text-[10px] text-slate-400"
                        style={{ fontFamily: fontBody }}
                      >
                        Manual task — for the assigned rep
                      </span>
                    </header>
                    <div className="px-3 py-2.5">
                      <div
                        className="text-[13px] font-semibold text-[#0F172A]"
                        style={{ fontFamily: fontDisplay }}
                      >
                        {title || (
                          <span className="text-slate-400">(no title)</span>
                        )}
                      </div>
                      <pre
                        className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700"
                        style={{ fontFamily: fontBody }}
                      >
                        {description || (
                          <span className="text-slate-400">(no script)</span>
                        )}
                      </pre>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-2.5">
          <div
            className="text-[11px] text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            Variables resolve from the recipient at send time. Sample values shown for preview only.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
            style={{ fontFamily: fontDisplay }}
          >
            Close preview
          </button>
        </div>
      </div>
    </>
  );
}