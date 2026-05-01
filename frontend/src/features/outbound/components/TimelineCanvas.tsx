import React, { useState } from "react";
import { Check, Plus } from "lucide-react";
import { CHANNEL, fontDisplay, fontBody } from "../tokens";
import { ChannelIcon } from "./ChannelChip";
import { StepCard } from "./StepCard";
import type { ChannelKind } from "../tokens";
import type { BuilderStep } from "../types";

interface Props {
  steps: BuilderStep[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddBelow: (afterId: string, kind: ChannelKind) => void;
  onDelete: (id: string) => void;
  onAddFirst: (kind: ChannelKind) => void;
}

const ADD_OPTIONS: ChannelKind[] = [
  "email",
  "linkedin_invite",
  "linkedin_message",
  "call",
  "wait",
];

export function TimelineCanvas({
  steps,
  selectedId,
  onSelect,
  onAddBelow,
  onDelete,
  onAddFirst,
}: Props) {
  const days = computeDays(steps);
  const totalDays = days.length > 0 ? days[days.length - 1] : 0;
  const touchCount = steps.filter((s) => s.kind !== "wait").length;

  return (
    <div className="overflow-y-auto bg-[#F8FAFC] px-4 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div
          className="text-[13px] font-bold text-[#0F172A]"
          style={{ fontFamily: fontDisplay }}
        >
          Sequence
        </div>
        <span
          className="text-[11px] text-slate-500"
          style={{ fontFamily: fontBody }}
        >
          · {touchCount} touch{touchCount === 1 ? "" : "es"} over {totalDays} day
          {totalDays === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative">
        {/* Vertical rail */}
        {steps.length > 0 ? (
          <div
            className="pointer-events-none absolute top-2 bottom-2 w-0.5 rounded"
            style={{
              left: 19,
              background:
                "linear-gradient(180deg,#3B82F6 0%,#8B5CF6 50%,#EC4899 100%)",
            }}
          />
        ) : null}

        {steps.length === 0 ? (
          <EmptyTimeline onAddFirst={onAddFirst} />
        ) : (
          steps.map((step, i) => (
            <StepCard
              key={step.localId}
              step={step}
              index={i}
              isLast={i === steps.length - 1}
              selected={selectedId === step.localId}
              day={days[i]}
              onSelect={() => onSelect(step.localId)}
              onAddBelow={(kind) => onAddBelow(step.localId, kind)}
              onDelete={() => onDelete(step.localId)}
            />
          ))
        )}

        {/* End cap */}
        {steps.length > 0 ? (
          <div className="mt-2.5 flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
              style={{
                background: "linear-gradient(135deg,#10B981,#059669)",
                boxShadow: "0 4px 14px rgba(16,185,129,0.3)",
              }}
            >
              <Check className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 rounded-md border border-dashed border-[#86EFAC] bg-[#F0FDF4] px-3 py-2">
              <div
                className="text-[12px] font-bold text-[#15803d]"
                style={{ fontFamily: fontDisplay }}
              >
                Sequence complete
              </div>
              <div
                className="mt-0.5 text-[10px] text-[#15803d]/80"
                style={{ fontFamily: fontBody }}
              >
                Replies route to inbox · contacts move to "Pending follow-up" once sending ships.
              </div>
            </div>
          </div>
        ) : null}

        {/* Always-visible Add step CTA at the bottom of the timeline */}
        {steps.length > 0 ? (
          <div className="mt-3">
            <BottomAdder
              lastStepId={steps[steps.length - 1].localId}
              onAddBelow={onAddBelow}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BottomAdder({
  lastStepId,
  onAddBelow,
}: {
  lastStepId: string;
  onAddBelow: (afterId: string, kind: ChannelKind) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:border-[#3B82F6] hover:bg-[#F0F9FF] hover:text-[#1d4ed8]"
        style={{ fontFamily: fontDisplay }}
      >
        <Plus className="h-3 w-3" />
        Add step
      </button>
      {open ? (
        <div
          className="absolute left-1/2 top-10 z-10 flex -translate-x-1/2 flex-col gap-0.5 rounded-md border border-slate-200 bg-white p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          style={{ minWidth: 180 }}
        >
          {ADD_OPTIONS.map((k) => {
            const v = CHANNEL[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onAddBelow(lastStepId, k);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[#0F172A] hover:bg-slate-100"
                style={{ fontFamily: fontBody }}
              >
                <span
                  className="inline-flex h-[20px] w-[20px] items-center justify-center rounded-md"
                  style={{ background: v.bg, border: `1px solid ${v.border}` }}
                >
                  <ChannelIcon kind={k} size={10} />
                </span>
                {v.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function EmptyTimeline({
  onAddFirst,
}: {
  onAddFirst: (kind: ChannelKind) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-md border-2 border-dashed border-slate-200 bg-white px-4 py-7 text-center">
      <div
        className="text-[13px] font-bold text-[#0F172A]"
        style={{ fontFamily: fontDisplay }}
      >
        Start the sequence
      </div>
      <div
        className="max-w-md text-[11px] text-slate-500"
        style={{ fontFamily: fontBody }}
      >
        Add the first step. Email is the most common opener; LinkedIn invites and call tasks
        are saved as manual tasks for your reps.
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onAddFirst("email")}
          className="rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
          style={{ fontFamily: fontDisplay }}
        >
          Add email
        </button>
        <button
          type="button"
          onClick={() => onAddFirst("linkedin_invite")}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700"
          style={{ fontFamily: fontDisplay }}
        >
          Add LinkedIn invite
        </button>
        <button
          type="button"
          onClick={() => onAddFirst("call")}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700"
          style={{ fontFamily: fontDisplay }}
        >
          Add call task
        </button>
      </div>
    </div>
  );
}

export function computeDays(steps: BuilderStep[]): number[] {
  let day = 1;
  const out: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (i > 0) {
      if (s.kind === "wait") {
        day += Math.max(0, Number(s.waitDays || 0));
      } else {
        day += Math.max(0, Number(s.delayDays || 0));
      }
    } else {
      if (s.kind !== "wait") {
        day += Math.max(0, Number(s.delayDays || 0));
      } else {
        day += Math.max(0, Number(s.waitDays || 0));
      }
    }
    out.push(day);
  }
  return out;
}