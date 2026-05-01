import React from "react";
import { Check, Copy, GitBranch } from "lucide-react";
import { fontDisplay, fontBody } from "../tokens";
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
    <div className="overflow-y-auto bg-[#F8FAFC] px-6 py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div
          className="text-sm font-bold text-[#0F172A]"
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
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            disabled
            title="Branch logic ships in a follow-up phase."
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            <GitBranch className="h-2.5 w-2.5" />
            Add branch
          </button>
          <button
            type="button"
            disabled
            title="Available after first save."
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            <Copy className="h-2.5 w-2.5" />
            Duplicate
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Vertical rail */}
        {steps.length > 0 ? (
          <div
            className="pointer-events-none absolute top-2 bottom-2 w-0.5 rounded"
            style={{
              left: 23,
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
          <div className="mt-3 flex items-center gap-3.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
              style={{
                background: "linear-gradient(135deg,#10B981,#059669)",
                boxShadow: "0 4px 14px rgba(16,185,129,0.3)",
              }}
            >
              <Check className="h-4 w-4" />
            </div>
            <div className="flex-1 rounded-[10px] border border-dashed border-[#86EFAC] bg-[#F0FDF4] px-3.5 py-2.5">
              <div
                className="text-[13px] font-bold text-[#15803d]"
                style={{ fontFamily: fontDisplay }}
              >
                Sequence complete
              </div>
              <div
                className="mt-0.5 text-[11px] text-[#15803d]/80"
                style={{ fontFamily: fontBody }}
              >
                Replies route to inbox · contacts move to "Pending follow-up" stage when sending ships.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyTimeline({
  onAddFirst,
}: {
  onAddFirst: (kind: ChannelKind) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[12px] border-2 border-dashed border-slate-200 bg-white px-6 py-10 text-center">
      <div
        className="text-sm font-bold text-[#0F172A]"
        style={{ fontFamily: fontDisplay }}
      >
        Start the sequence
      </div>
      <div
        className="max-w-md text-xs text-slate-500"
        style={{ fontFamily: fontBody }}
      >
        Add the first step. Email is the most common opener; LinkedIn invites and call tasks
        are saved as manual tasks for your reps.
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onAddFirst("email")}
          className="rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
          style={{ fontFamily: fontDisplay }}
        >
          Add email
        </button>
        <button
          type="button"
          onClick={() => onAddFirst("linkedin_invite")}
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold text-slate-700"
          style={{ fontFamily: fontDisplay }}
        >
          Add LinkedIn invite
        </button>
        <button
          type="button"
          onClick={() => onAddFirst("call")}
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold text-slate-700"
          style={{ fontFamily: fontDisplay }}
        >
          Add call task
        </button>
      </div>
    </div>
  );
}

// Compute the cumulative day each step lives on (1-indexed). Wait steps
// contribute their waitDays to the running tally; non-wait steps add their
// own delayDays. The first step is always Day 1 unless it explicitly has a
// non-zero delayDays.
export function computeDays(steps: BuilderStep[]): number[] {
  let day = 1;
  const out: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (i > 0) {
      // Apply gap from previous step or wait spec.
      if (s.kind === "wait") {
        day += Math.max(0, Number(s.waitDays || 0));
      } else {
        day += Math.max(0, Number(s.delayDays || 0));
      }
    } else {
      // First step: respect explicit delayDays only for non-wait.
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