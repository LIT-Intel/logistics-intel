import React from "react";
import {
  ArrowRight,
  Filter,
  Layers,
  Plus,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import type { Persona, PersonasResult } from "../types";
import type { SavedCompanyLite } from "../hooks/useSavedCompanies";

interface PersonaPanelProps {
  audienceCount: number;
  totalSavedCompanies: number;
  selectedCompanies: SavedCompanyLite[];
  personasResult: PersonasResult | null;
  selectedPersonaId: string | null;
  onSelectPersona: (id: string | null) => void;
  onOpenAudiencePicker: () => void;
  onOpenTemplates: () => void;
  onCreatePersona?: () => void;
}

export function PersonaPanel({
  audienceCount,
  totalSavedCompanies,
  selectedCompanies,
  personasResult,
  selectedPersonaId,
  onSelectPersona,
  onOpenAudiencePicker,
  onOpenTemplates,
  onCreatePersona,
}: PersonaPanelProps) {
  const sample = selectedCompanies.slice(0, 6);

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3.5">
        <Target className="h-3.5 w-3.5 text-[#0F172A]" />
        <div
          className="text-sm font-bold text-[#0F172A]"
          style={{ fontFamily: fontDisplay }}
        >
          Audience
        </div>
        <button
          type="button"
          onClick={onOpenAudiencePicker}
          className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
          style={{ fontFamily: fontDisplay }}
        >
          Edit
        </button>
      </div>

      {/* Audience query / picker card */}
      <div
        className="relative m-3.5 overflow-hidden rounded-[10px] p-3 text-white"
        style={{
          background: "linear-gradient(160deg,#0F172A,#1E293B)",
        }}
      >
        <div
          className="pointer-events-none absolute -top-8 -right-8 h-[100px] w-[100px] rounded-full"
          style={{
            background:
              "radial-gradient(circle,rgba(0,240,255,0.2),transparent 70%)",
          }}
        />
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#00F0FF]"
          style={{ fontFamily: fontDisplay }}
        >
          <Sparkles className="h-2.5 w-2.5" />
          Saved companies · audience
        </div>
        <div
          className="mt-2 text-xs leading-relaxed text-slate-200"
          style={{ fontFamily: fontMono }}
        >
          <span className="text-slate-400">"</span>
          {audienceCount > 0
            ? `${audienceCount} saved companies selected for this campaign`
            : "Pick saved companies from your Command Center as the recipient set"}
          <span className="text-slate-400">"</span>
        </div>
        <div
          className="mt-3 flex items-baseline gap-1.5 border-t border-white/10 pt-2.5"
          style={{ fontFamily: fontDisplay }}
        >
          <span className="text-2xl font-bold text-white">
            {audienceCount}
          </span>
          <span
            className="text-[11px] text-slate-400"
            style={{ fontFamily: fontBody }}
          >
            of {totalSavedCompanies} saved
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenAudiencePicker}
          className="mt-2.5 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
          style={{ fontFamily: fontDisplay }}
        >
          <Filter className="h-2.5 w-2.5" />
          {audienceCount > 0 ? "Refine selection" : "Pick recipients"}
        </button>
      </div>

      {/* Persona selector */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between">
          <div
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            Persona
          </div>
          {onCreatePersona && (
            <button
              type="button"
              onClick={onCreatePersona}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-[#3B82F6] transition hover:bg-blue-50"
              style={{ fontFamily: fontDisplay }}
              title="Create a new persona for your workspace"
            >
              <Plus className="h-2.5 w-2.5" />
              New
            </button>
          )}
        </div>
        <PersonaSelector
          personasResult={personasResult}
          selectedPersonaId={selectedPersonaId}
          onSelectPersona={onSelectPersona}
          onCreatePersona={onCreatePersona}
        />
      </div>

      {/* Sample contacts header */}
      <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 pt-3 pb-1">
        <div
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400"
          style={{ fontFamily: fontDisplay }}
        >
          Sample · selected
        </div>
        {audienceCount > sample.length ? (
          <button
            type="button"
            onClick={onOpenAudiencePicker}
            className="text-[10px] font-semibold text-[#3B82F6]"
            style={{ fontFamily: fontDisplay }}
          >
            View all {audienceCount} →
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {sample.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center">
            <Users className="mx-auto mb-2 h-4 w-4 text-slate-400" />
            <div
              className="text-[11px] font-semibold text-slate-700"
              style={{ fontFamily: fontDisplay }}
            >
              No recipients selected yet
            </div>
            <div
              className="mt-1 text-[11px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              Pick saved companies — sequence sends to associated contacts.
            </div>
            <button
              type="button"
              onClick={onOpenAudiencePicker}
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
              style={{ fontFamily: fontDisplay }}
            >
              Pick recipients
              <ArrowRight className="h-2.5 w-2.5" />
            </button>
          </div>
        ) : (
          <div>
            {sample.map((c, i) => (
              <div
                key={c.saved_id ?? c.company_id ?? i}
                className="flex items-center gap-2.5 px-1 py-2"
                style={{
                  borderBottom:
                    i < sample.length - 1 ? "1px solid #F8FAFC" : "none",
                }}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{
                    background: "#3B82F6",
                    fontFamily: fontDisplay,
                  }}
                >
                  {c.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-xs font-semibold text-[#0F172A]"
                    style={{ fontFamily: fontDisplay }}
                  >
                    {c.name}
                  </div>
                  <div
                    className="truncate text-[10px] text-slate-500"
                    style={{ fontFamily: fontBody }}
                  >
                    {[c.domain, c.location, c.stage]
                      .filter(Boolean)
                      .join(" · ") || "No metadata yet"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 p-3">
        <button
          type="button"
          onClick={onOpenTemplates}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          style={{ fontFamily: fontDisplay }}
        >
          <Layers className="h-3 w-3" />
          Browse template library
        </button>
      </div>
    </div>
  );
}

function PersonaSelector({
  personasResult,
  selectedPersonaId,
  onSelectPersona,
  onCreatePersona,
}: {
  personasResult: PersonasResult | null;
  selectedPersonaId: string | null;
  onSelectPersona: (id: string | null) => void;
  onCreatePersona?: () => void;
}) {
  if (!personasResult) {
    return (
      <div className="mt-1.5 h-8 animate-pulse rounded-md bg-slate-100" />
    );
  }
  if (personasResult.state === "blocked") {
    return (
      <div
        className="mt-1.5 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-[#B45309]"
        style={{ fontFamily: fontBody }}
      >
        {personasResult.reason}
      </div>
    );
  }
  if (personasResult.state === "empty") {
    return (
      <div
        className="mt-1.5 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500"
        style={{ fontFamily: fontBody }}
      >
        No personas defined yet.
        {onCreatePersona && (
          <button
            type="button"
            onClick={onCreatePersona}
            className="ml-1 font-semibold text-[#3B82F6] underline"
            style={{ fontFamily: fontDisplay }}
          >
            Create the first one
          </button>
        )}
      </div>
    );
  }
  return (
    <select
      value={selectedPersonaId ?? ""}
      onChange={(e) => onSelectPersona(e.target.value || null)}
      className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
      style={{ fontFamily: fontBody }}
    >
      <option value="">No persona — generic outreach</option>
      {personasResult.rows.map((p: Persona) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}