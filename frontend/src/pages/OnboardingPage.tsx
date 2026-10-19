import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const teams = ["Sales", "Marketing", "Sales Leadership", "Product", "Operations", "Other"];
const services = ["Ocean FCL", "Ocean LCL", "Air freight", "Customs brokerage", "Cross-border trucking", "Drayage", "Domestic trucking", "Other"];

export default function OnboardingPage() {
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [team, setTeam] = useState("");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [countries, setCountries] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const next = params.get("next") || "";
  const destination = /^\/app(?:\/|$|\?)/.test(next) ? next : "/app/search";
  const valid = step === 1 ? Boolean(team && title.trim().length >= 2) : step === 2 ? selected.length > 0 : true;
  async function finish() {
    if (saving || !team || title.trim().length < 2 || !selected.length) return;
    setSaving(true); setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("lit_complete_onboarding_v2", {
        p_team: team, p_title: title.trim(), p_services: selected,
        p_geographies: [...new Set(countries.split(",").map(v => v.trim()).filter(Boolean))],
      });
      if (rpcError || !data?.ok) throw new Error(rpcError?.message || "We couldn't save your preferences. Please try again.");
      window.location.assign(destination);
    } catch (e: any) { setError(e.message); setSaving(false); }
  }
  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <section className="w-full max-w-xl rounded-2xl border bg-white p-8 shadow-sm" aria-label="Set up your workspace">
      <p className="text-sm text-slate-500 mb-3">Logistics Intel · Step {step} of 3</p>
      <h1 className="text-2xl font-semibold mb-6">{step === 1 ? "What team are you on?" : step === 2 ? "What services do you sell?" : "Where do you sell?"}</h1>
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      {step === 1 && <>
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Team">
          {teams.map(value => <button type="button" key={value} aria-pressed={team === value} onClick={() => setTeam(value)} className={"rounded-lg border p-3 text-left " + (team === value ? "border-blue-600 bg-blue-50" : "border-slate-200")}>{value}</button>)}
        </div>
        <label className="block mt-6">Your title<input className="mt-2 w-full rounded-lg border p-3" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Sales Manager" autoComplete="organization-title" /></label>
      </>}
      {step === 2 && <div className="grid grid-cols-2 gap-3" role="group" aria-label="Services">
        {services.map(value => <label key={value} className="flex items-center gap-2 rounded-lg border p-3"><input type="checkbox" checked={selected.includes(value)} onChange={() => setSelected(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])} />{value}</label>)}
      </div>}
      {step === 3 && <label className="block">Sales countries (optional)<input className="mt-2 w-full rounded-lg border p-3" value={countries} maxLength={1000} onChange={e => setCountries(e.target.value)} placeholder="United States, Canada, Mexico" /><span className="mt-2 block text-sm text-slate-500">Separate countries with commas, or leave blank to explore all markets.</span></label>}
      <div className="mt-8 flex gap-3">
        {step > 1 && <button type="button" disabled={saving} className="rounded-lg border px-4 py-3" onClick={() => {setStep(step - 1);setError("");}}>Back</button>}
        <button type="button" disabled={!valid || saving} className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50" onClick={() => step < 3 ? setStep(step + 1) : void finish()}>{saving ? "Saving…" : step < 3 ? "Continue" : "Start exploring"}</button>
      </div>
    </section>
  </main>;
}
