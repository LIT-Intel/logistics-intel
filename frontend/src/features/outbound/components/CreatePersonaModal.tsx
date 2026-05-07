import React, { useState } from "react";
import { X, Loader2, AlertCircle, UserPlus } from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

// Inline persona create modal. Writes a single row into lit_personas
// scoped to the caller's org so the new persona becomes immediately
// usable for the current campaign and any future ones in the workspace.
//
// Captures the minimum useful surface: name + default_cta + optional
// chips for target_titles / pain_points / value_props. Heavier authoring
// (objections, multi-CTA, persona templates) lives on a future
// /app/personas page; not in scope here.

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
};

function parseChips(blob: string): string[] {
  return blob
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function CreatePersonaModal({ open, onClose, onCreated }: Props) {
  const { orgId } = useAuth();
  const [name, setName] = useState("");
  const [titlesBlob, setTitlesBlob] = useState("");
  const [painBlob, setPainBlob] = useState("");
  const [valueBlob, setValueBlob] = useState("");
  const [defaultCta, setDefaultCta] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setTitlesBlob("");
    setPainBlob("");
    setValueBlob("");
    setDefaultCta("");
    setError(null);
    setSaving(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Persona name is required.");
      return;
    }
    if (!orgId) {
      setError("No workspace context. Sign out and back in.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data, error: insErr } = await supabase
        .from("lit_personas")
        .insert({
          org_id: orgId,
          name: trimmed,
          target_titles: parseChips(titlesBlob),
          pain_points: parseChips(painBlob),
          value_props: parseChips(valueBlob),
          default_cta: defaultCta.trim() || null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const newId = (data as any)?.id as string | undefined;
      if (!newId) throw new Error("Insert succeeded but no id returned.");
      onCreated(newId);
      reset();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Couldn't create persona.");
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.5)]"
        onClick={() => !saving && onClose()}
        aria-hidden
      />
      <div className="fixed inset-x-2 inset-y-6 z-50 mx-auto flex max-w-[520px] flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.35)] sm:inset-x-4 sm:inset-y-10">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-200 px-5 py-4">
          <UserPlus className="h-4 w-4 text-[#3B82F6]" />
          <div>
            <div className="text-[14px] font-bold text-[#0F172A]" style={{ fontFamily: fontDisplay }}>
              New persona
            </div>
            <div className="text-[11px] text-slate-500" style={{ fontFamily: fontBody }}>
              Saved to your workspace. Available across every campaign.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-4 px-5 py-4">
            <Field label="Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VP Logistics · mid-market importer"
                maxLength={120}
                disabled={saving}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
                style={{ fontFamily: fontBody }}
              />
            </Field>

            <Field
              label="Target titles"
              hint="One per line, or comma-separated. Up to 12."
            >
              <textarea
                value={titlesBlob}
                onChange={(e) => setTitlesBlob(e.target.value)}
                placeholder={"VP Logistics\nDirector of Supply Chain\nHead of Procurement"}
                rows={3}
                disabled={saving}
                className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
                style={{ fontFamily: fontMono }}
              />
            </Field>

            <Field label="Pain points" hint="The problems this persona owns.">
              <textarea
                value={painBlob}
                onChange={(e) => setPainBlob(e.target.value)}
                placeholder={"Unpredictable transit times on VN→US lanes\nCarrier capacity volatility"}
                rows={3}
                disabled={saving}
                className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
                style={{ fontFamily: fontBody }}
              />
            </Field>

            <Field label="Value props" hint="Why your offer matters to them.">
              <textarea
                value={valueBlob}
                onChange={(e) => setValueBlob(e.target.value)}
                placeholder={"Lane benchmarking against the top 1% of importers\nCarrier-mix variance alerts"}
                rows={3}
                disabled={saving}
                className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
                style={{ fontFamily: fontBody }}
              />
            </Field>

            <Field label="Default CTA" hint="The ask you'll usually close with.">
              <input
                value={defaultCta}
                onChange={(e) => setDefaultCta(e.target.value)}
                placeholder="15-min comparison vs. your current routing"
                maxLength={200}
                disabled={saving}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
                style={{ fontFamily: fontBody }}
              />
            </Field>

            {error && (
              <div
                className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
                style={{ fontFamily: fontBody }}
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              disabled={saving}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              style={{ fontFamily: fontDisplay }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)] disabled:opacity-50"
              style={{ fontFamily: fontDisplay }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Create persona"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500"
        style={{ fontFamily: fontDisplay }}
      >
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
      </label>
      {hint ? (
        <div className="mt-0.5 text-[10.5px] text-slate-400" style={{ fontFamily: fontBody }}>
          {hint}
        </div>
      ) : null}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
