import { useEffect, useState } from "react";
import { Bell, Pause, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AlertPreferencesPanel() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from("lit_user_alert_prefs").select("*").eq("user_id", user.id).maybeSingle();
    setPrefs(data || {
      user_id: user.id, volume_alerts: true, shipment_alerts: true,
      lane_alerts: true, benchmark_alerts: false, paused_until: null,
    });
    setLoading(false);
  }

  async function save(updates) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const merged = { ...prefs, ...updates, user_id: user.id, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("lit_user_alert_prefs").upsert(merged, { onConflict: "user_id" });
    if (!error) setPrefs(merged);
    setSaving(false);
  }

  async function openPreview() {
    setPreviewOpen(true);
    setPreviewHtml("<p style='padding:24px;text-align:center;color:#64748B;'>Loading preview…</p>");
    const { data } = await supabase.functions.invoke("pulse-digest-preview", { body: {} });
    setPreviewHtml(data?.html || "<p style='padding:24px;text-align:center;'>No alerts to preview.</p>");
  }

  if (loading) return null;

  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-blue-600" />
        <h2 className="font-display text-[14px] font-bold text-slate-900">Alert preferences</h2>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <ToggleRow label="Volume changes" desc="≥20% or ≥5 new shipments" checked={prefs.volume_alerts} onChange={(v) => save({ volume_alerts: v })} disabled={saving} />
        <ToggleRow label="New shipments" desc="Fresh BOLs since last refresh" checked={prefs.shipment_alerts} onChange={(v) => save({ shipment_alerts: v })} disabled={saving} />
        <ToggleRow label="Trade lanes" desc="New routes or surges" checked={prefs.lane_alerts} onChange={(v) => save({ lane_alerts: v })} disabled={saving} />
        <ToggleRow label="Benchmark rate movers" desc="FBX lane shifts ≥10% WoW" checked={prefs.benchmark_alerts} onChange={(v) => save({ benchmark_alerts: v })} disabled={saving} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={openPreview}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Eye className="h-3 w-3" /> Preview my next digest
        </button>
        <PauseControl prefs={prefs} onSave={save} />
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="relative max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
            <iframe srcDoc={previewHtml} className="h-[800px] w-full border-0" />
            <button onClick={() => setPreviewOpen(false)} className="absolute right-2 top-2 rounded-md bg-white px-2 py-1 text-sm shadow">Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, disabled }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="font-display text-[12.5px] font-semibold text-slate-900">{label}</div>
        <div className="font-body text-[11px] text-slate-500">{desc}</div>
      </div>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-blue-600"
      />
    </label>
  );
}

function PauseControl({ prefs, onSave }) {
  const paused = prefs.paused_until && new Date(prefs.paused_until) > new Date();
  return (
    <button
      type="button"
      onClick={() => {
        if (paused) onSave({ paused_until: null });
        else {
          const oneWeek = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
          onSave({ paused_until: oneWeek });
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-700 hover:bg-amber-100"
    >
      <Pause className="h-3 w-3" />
      {paused ? `Paused until ${new Date(prefs.paused_until).toLocaleDateString()} — Resume` : "Pause all for 7 days"}
    </button>
  );
}
