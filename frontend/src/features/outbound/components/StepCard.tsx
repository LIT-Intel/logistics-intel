import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CHANNEL, fontDisplay, fontBody, fontMono } from "../tokens";
import type { ChannelKind } from "../tokens";
import { ChannelIcon } from "./ChannelChip";
import type { BuilderStep } from "../types";

const ADD_OPTIONS: ChannelKind[] = [
  "email",
  "linkedin_invite",
  "linkedin_message",
  "call",
  "wait",
];

function summaryFor(step: BuilderStep): string {
  if (step.kind === "email") {
    return step.subject?.trim() || "(no subject)";
  }
  if (step.kind === "wait") {
    return `Wait ${step.waitDays} day${step.waitDays === 1 ? "" : "s"}`;
  }
  return step.title?.trim() || `${CHANNEL[step.kind].label} task`;
}

export function StepCard({
  step,
  index,
  isLast,
  selected,
  day,
  onSelect,
  onAddBelow,
  onDelete,
}: {
  step: BuilderStep;
  index: number;
  isLast: boolean;
  selected: boolean;
  day: number;
  onSelect: () => void;
  onAddBelow: (kind: ChannelKind) => void;
  onDelete: () => void;
}) {
  const meta = CHANNEL[step.kind];
  const [adderOpen, setAdderOpen] = useState(false);
  const isWait = step.kind === "wait";

  if (isWait) {
    return (
      <div className="relative flex items-center gap-3.5 py-2.5">
        <div className="flex w-12 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={onSelect}
            className="flex h-6 w-6 items-center justify-center rounded-md border bg-white"
            style={{ borderColor: selected ? meta.color : "#E5E7EB" }}
          >
            <ChannelIcon kind="wait" size={11} />
          </button>
        </div>
        <div
          className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"
          style={{ fontFamily: fontBody }}
        >
          Wait{" "}
          <span
            className="font-semibold text-[#0F172A]"
            style={{ fontFamily: fontMono }}
          >
            {step.waitDays} {step.waitDays === 1 ? "day" : "days"}
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          aria-label="Delete wait step"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        {!isLast ? <Adder open={adderOpen} setOpen={setAdderOpen} onAdd={onAddBelow} /> : null}
      </div>
    );
  }

  return (
    <div className="relative flex items-start gap-3.5 py-2">
      {/* Day node */}
      <div className="flex w-12 shrink-0 flex-col items-center">
        <button
          type="button"
          onClick={onSelect}
          className="flex h-12 w-12 items-center justify-center rounded-full transition"
          style={{
            background: meta.bg,
            border: `2px solid ${selected ? meta.color : "#fff"}`,
            boxShadow: selected
              ? `0 0 0 3px ${meta.color}33, 0 4px 12px rgba(15,23,42,0.06)`
              : `0 0 0 3px ${meta.border}, 0 4px 12px rgba(15,23,42,0.06)`,
          }}
          aria-label={`Select step ${index + 1}`}
        >
          <ChannelIcon kind={step.kind} size={18} />
        </button>
        <span
          className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.04em] text-slate-400"
          style={{ fontFamily: fontDisplay }}
        >
          DAY {day}
        </span>
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 cursor-pointer flex-col rounded-xl bg-white px-3.5 py-3 text-left transition"
        style={{
          border: `1px solid ${selected ? meta.color : "#E5E7EB"}`,
          boxShadow: selected
            ? `0 4px 16px ${meta.color}20`
            : "0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
            style={{
              color: meta.color,
              background: meta.bg,
              border: `1px solid ${meta.border}`,
              fontFamily: fontDisplay,
            }}
          >
            <ChannelIcon kind={step.kind} size={10} />
            {meta.label}
          </span>
          <div
            className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            {summaryFor(step)}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Delete step"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        {step.kind === "email" && step.body ? (
          <div
            className="mt-2 rounded-md border border-dashed border-slate-200 bg-[#FAFBFC] px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-500 line-clamp-2"
            style={{ fontFamily: fontBody }}
          >
            {step.body}
          </div>
        ) : step.kind !== "email" && step.description ? (
          <div
            className="mt-2 rounded-md border border-dashed border-slate-200 bg-[#FAFBFC] px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-500 line-clamp-2"
            style={{ fontFamily: fontBody }}
          >
            {step.description}
          </div>
        ) : null}
      </button>

      {!isLast ? <Adder open={adderOpen} setOpen={setAdderOpen} onAdd={onAddBelow} /> : null}
    </div>
  );
}

function Adder({
  open,
  setOpen,
  onAdd,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  onAdd: (kind: ChannelKind) => void;
}) {
  return (
    <div className="absolute left-[34px] -bottom-3 z-[2] w-7">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-dashed border-slate-300 bg-white text-slate-500 transition hover:border-solid hover:border-[#3B82F6] hover:text-[#3B82F6]"
        aria-label="Add step below"
      >
        <Plus className="h-3 w-3" />
      </button>
      {open ? (
        <div className="absolute left-[30px] -top-1 z-[5] flex w-44 flex-col gap-0.5 rounded-[10px] border border-slate-200 bg-white p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          {ADD_OPTIONS.map((k) => {
            const v = CHANNEL[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onAdd(k);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[#0F172A] hover:bg-slate-100"
                style={{ fontFamily: fontBody }}
              >
                <span
                  className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md"
                  style={{ background: v.bg, border: `1px solid ${v.border}` }}
                >
                  <ChannelIcon kind={k} size={11} />
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