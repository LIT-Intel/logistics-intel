// LitMarketingAdmin — super-admin-only console for the LIT-owned marketing
// subsystem (Resend). Strictly separated from the user-campaign builder
// at /app/campaigns. All reads/writes route through admin-marketing-api;
// the underlying lit_marketing_* tables are RLS-locked to service role.
//
// Routes (declared in App.jsx under RequireSuperAdmin):
//   /admin/marketing                        → Campaigns list
//   /admin/marketing/campaigns/new          → New draft
//   /admin/marketing/campaigns/:id          → Detail / edit / queue
//   /admin/marketing/audience               → Browse audience segments
//   /admin/marketing/analytics              → Roll-up KPIs
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Mail,
  MousePointer,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Users,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type AdminAction =
  | { action: "personas.list" }
  | { action: "audience.segments" }
  | { action: "audience.contacts"; segment?: string | null; only_email_ready?: boolean; limit?: number; offset?: number }
  | { action: "campaigns.list" }
  | { action: "campaigns.get"; id: string }
  | { action: "campaigns.create"; name: string; subject: string; body_html?: string | null; body_text?: string | null; sender_persona_key?: string; daily_send_cap?: number; segment_filter?: Record<string, unknown> }
  | { action: "campaigns.update"; id: string; name?: string; subject?: string; body_html?: string | null; body_text?: string | null; sender_persona_key?: string; daily_send_cap?: number; segment_filter?: Record<string, unknown>; status?: "draft" | "scheduled" | "active" | "paused" | "completed" }
  | { action: "recipients.list"; campaign_id: string; limit?: number; offset?: number }
  | { action: "recipients.add_from_segment"; campaign_id: string; segment?: string; limit?: number }
  | { action: "recipients.add_emails"; campaign_id: string; emails: Array<{ email: string; first_name?: string; last_name?: string; company_name?: string }> }
  | { action: "events.summary"; campaign_id: string };

async function admin<T = any>(payload: AdminAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-marketing-api", { body: payload });
  if (error) throw new Error(error.message || "admin_call_failed");
  if ((data as any)?.ok === false) throw new Error((data as any)?.error || "admin_call_failed");
  return (data as any)?.data as T;
}

const ACCENT = "#7C3AED"; // distinct from user-campaign blue

export default function LitMarketingAdmin() {
  return (
    <Routes>
      <Route index element={<CampaignsListPage />} />
      <Route path="campaigns/new" element={<CampaignEditorPage />} />
      <Route path="campaigns/:id" element={<CampaignDetailPage />} />
      <Route path="audience" element={<AudiencePage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
    </Routes>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function AdminShell({ children, title, subtitle, action }: { children: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  const location = useLocation();
  const tabs = [
    { to: "/admin/marketing", label: "Campaigns", match: /^\/admin\/marketing\/?$|^\/admin\/marketing\/campaigns/ },
    { to: "/admin/marketing/audience", label: "Audience", match: /^\/admin\/marketing\/audience/ },
    { to: "/admin/marketing/analytics", label: "Analytics", match: /^\/admin\/marketing\/analytics/ },
  ];
  return (
    <div className="min-h-full bg-[#FAFAFB]">
      <div className="border-b border-purple-200 bg-gradient-to-b from-[#F5F3FF] to-white">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 px-4 py-4 md:px-6">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-purple-700">
            <Sparkles className="h-3 w-3" />
            Admin · LIT Marketing (Resend)
          </div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[18px] font-bold text-[#0F172A]">{title}</div>
              {subtitle ? <div className="text-[12px] text-slate-500">{subtitle}</div> : null}
            </div>
            {action}
          </div>
          <nav className="mt-2 flex items-center gap-1 border-b border-transparent">
            {tabs.map((t) => {
              const active = t.match.test(location.pathname);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={[
                    "rounded-t-md px-3 py-1.5 text-[12px] font-semibold",
                    active ? "border border-purple-200 border-b-white bg-white text-purple-800" : "text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-6">{children}</div>
    </div>
  );
}

// ─── Campaigns list ──────────────────────────────────────────────────────────

function CampaignsListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await admin<any[]>({ action: "campaigns.list" });
      setRows(data || []);
    } catch (e: any) { setError(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <AdminShell
      title="Campaigns"
      subtitle="LIT-owned marketing sends through Resend. Separate from user campaigns."
      action={
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <Link to="/admin/marketing/campaigns/new" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm" style={{ background: ACCENT }}>
            <Plus className="h-3 w-3" /> New campaign
          </Link>
        </div>
      }
    >
      {error ? (
        <ErrorBox message={error} />
      ) : loading ? (
        <LoadingBox />
      ) : rows.length === 0 ? (
        <EmptyBox onCreate={() => navigate("/admin/marketing/campaigns/new")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[920px] text-left text-[12.5px]">
            <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Campaign</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Persona</th>
                <th className="px-3 py-2 text-right font-semibold">Cap/day</th>
                <th className="px-3 py-2 text-right font-semibold">Queued</th>
                <th className="px-3 py-2 text-right font-semibold">Sent</th>
                <th className="px-3 py-2 text-right font-semibold">Opens</th>
                <th className="px-3 py-2 text-right font-semibold">Clicks</th>
                <th className="px-3 py-2 text-right font-semibold">Bounces</th>
                <th className="px-3 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t border-slate-100 hover:bg-purple-50/40" onClick={() => navigate(`/admin/marketing/campaigns/${c.id}`)}>
                  <td className="px-3 py-2 font-semibold text-[#0F172A]">{c.name}</td>
                  <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                  <td className="px-3 py-2 text-slate-600">{c.sender_persona_key || "lit_team"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{c.daily_send_cap}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{c.counts?.queued ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-purple-700">{c.counts?.sent ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{c.counts?.opens ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-violet-700">{c.counts?.clicks ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-700">{c.counts?.bounces ?? 0}</td>
                  <td className="px-3 py-2 text-[10.5px] text-slate-500">{new Date(c.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

// ─── Editor (new + edit) ─────────────────────────────────────────────────────

function CampaignEditorPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [persona, setPersona] = useState("lit_team");
  const [cap, setCap] = useState(50);
  const [segment, setSegment] = useState<string>("");
  const [personas, setPersonas] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      admin<any[]>({ action: "personas.list" }).then(setPersonas).catch(() => {}),
      admin<any[]>({ action: "audience.segments" }).then(setSegments).catch(() => {}),
    ]);
  }, []);

  async function save() {
    if (!name.trim() || !subject.trim()) { setError("Name and subject are required."); return; }
    setSaving(true); setError(null);
    try {
      const data = await admin<{ id: string }>({
        action: "campaigns.create",
        name: name.trim(),
        subject: subject.trim(),
        body_html: bodyHtml || null,
        body_text: bodyText || null,
        sender_persona_key: persona,
        daily_send_cap: cap,
        segment_filter: segment ? { target_segment: segment } : {},
      });
      navigate(`/admin/marketing/campaigns/${data.id}`);
    } catch (e: any) { setError(e?.message || "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <AdminShell title="New campaign" subtitle="Draft a marketing send. Status starts as Draft; flip to Active to enable the dispatcher.">
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Field label="Campaign name (internal)">
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Q2 freight-forwarder welcome" />
          </Field>
          <Field label="Subject (recipient sees)">
            <input className={fieldClass} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="A 5-minute look at logistic intel data" />
          </Field>
          <Field label="HTML body" hint="Use {{first_name}}, {{last_name}}, {{company_name}}, {{email}} for merge.">
            <textarea className={`${fieldClass} h-44 font-mono text-[12px]`} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} placeholder="<p>Hi {{first_name}},</p>…" />
          </Field>
          <Field label="Plain-text fallback" hint="Optional. Auto-derived from HTML if blank.">
            <textarea className={`${fieldClass} h-24 font-mono text-[12px]`} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Sender persona">
            <select className={fieldClass} value={persona} onChange={(e) => setPersona(e.target.value)}>
              {personas.map((p) => (
                <option key={p.persona_key} value={p.persona_key}>{p.display_name} — {p.from_email}</option>
              ))}
            </select>
          </Field>
          <Field label="Daily send cap" hint="Hard cap per UTC day. Start small.">
            <input type="number" min={1} max={2000} className={fieldClass} value={cap} onChange={(e) => setCap(Number(e.target.value || 0))} />
          </Field>
          <Field label="Audience segment" hint="Used by 'Add from segment' on the campaign page.">
            <select className={fieldClass} value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option value="">— pick later —</option>
              {segments.map((s: any) => (
                <option key={s.segment} value={s.segment}>{s.segment} — {s.email_ready} email-ready</option>
              ))}
            </select>
          </Field>
          <button onClick={save} disabled={saving} className="w-full rounded-md px-3 py-2 text-[12.5px] font-semibold text-white shadow-sm disabled:opacity-50" style={{ background: ACCENT }}>
            {saving ? "Saving…" : "Create draft"}
          </button>
          <Link to="/admin/marketing" className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Campaign detail ─────────────────────────────────────────────────────────

function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any | null>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [segments, setSegments] = useState<any[]>([]);
  const [segmentToAdd, setSegmentToAdd] = useState<string>("");
  const [addLimit, setAddLimit] = useState<number>(25);
  const [emailListText, setEmailListText] = useState("");
  const [triggerResult, setTriggerResult] = useState<any | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const [c, recRes, evRes, segRes] = await Promise.all([
        admin<any>({ action: "campaigns.get", id }),
        supabase.functions.invoke("admin-marketing-api", { body: { action: "recipients.list", campaign_id: id, limit: 100 } }),
        admin<any[]>({ action: "events.summary", campaign_id: id }),
        admin<any[]>({ action: "audience.segments" }),
      ]);
      setCampaign(c);
      const rec = (recRes.data as any) || {};
      setRecipients(rec?.data ?? []);
      setRecipientCount(rec?.count ?? 0);
      setEvents(evRes || []);
      setSegments(segRes || []);
      const filterSeg = (c?.segment_filter && (c.segment_filter as any).target_segment) || "";
      if (filterSeg) setSegmentToAdd(filterSeg);
    } catch (e: any) { setError(e?.message || "Load failed"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!id) return null;

  async function setStatus(next: "draft" | "active" | "paused" | "completed") {
    setBusy("status");
    try {
      await admin({ action: "campaigns.update", id: id!, status: next });
      await refresh();
    } catch (e: any) { setError(e?.message || "Update failed"); }
    finally { setBusy(null); }
  }

  async function addFromSegment() {
    if (!segmentToAdd) { setError("Pick a segment first."); return; }
    setBusy("add_segment"); setError(null);
    try {
      const res = await admin<{ added: number; skipped: number }>({ action: "recipients.add_from_segment", campaign_id: id!, segment: segmentToAdd, limit: addLimit });
      setBusy(null);
      setTriggerResult({ kind: "added", added: res.added, skipped: res.skipped });
      await refresh();
    } catch (e: any) { setError(e?.message || "Add failed"); setBusy(null); }
  }

  async function addEmails() {
    const list = emailListText.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
    const rows = list
      .map((entry) => {
        const m = entry.match(/^(.+?)\s*<\s*([^>]+)\s*>$/);
        if (m) return { email: m[2].trim().toLowerCase(), first_name: m[1].trim() };
        return { email: entry.toLowerCase() };
      })
      .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
    if (rows.length === 0) { setError("No valid emails detected."); return; }
    setBusy("add_emails"); setError(null);
    try {
      const res = await admin<{ added: number }>({ action: "recipients.add_emails", campaign_id: id!, emails: rows });
      setEmailListText("");
      setTriggerResult({ kind: "added", added: res.added, skipped: rows.length - res.added });
      await refresh();
    } catch (e: any) { setError(e?.message || "Add failed"); }
    finally { setBusy(null); }
  }

  async function triggerOnce() {
    if (!confirm("Send the next batch now? This sends to live email addresses.")) return;
    setBusy("trigger"); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-lit-marketing-email", { body: { campaign_id: id } });
      if (error) throw new Error(error.message || "trigger_failed");
      setTriggerResult({ kind: "trigger", summary: (data as any)?.summary, errors: (data as any)?.errors });
      await refresh();
    } catch (e: any) { setError(e?.message || "Trigger failed"); }
    finally { setBusy(null); }
  }

  const counts = useMemo(() => {
    const c = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };
    for (const e of events) {
      const t = e.event_type as string;
      if (t in c) (c as any)[t] += 1;
    }
    return c;
  }, [events]);

  return (
    <AdminShell title={campaign?.name || "Campaign"} subtitle={campaign?.subject} action={
      <button onClick={() => navigate("/admin/marketing")} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
        <ArrowLeft className="h-3 w-3" /> Back
      </button>
    }>
      {error ? <ErrorBox message={error} /> : null}
      {loading || !campaign ? <LoadingBox /> : (
        <div className="grid gap-4 md:grid-cols-[1fr_360px]">
          <section className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <StatusPill status={campaign.status} />
                <span className="text-[11px] text-slate-500">Sender: {campaign.sender_persona_key} · Cap {campaign.daily_send_cap}/day</span>
              </div>
              <div className="text-[13px] font-semibold text-[#0F172A]">{campaign.subject}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Preview label="HTML preview" html={campaign.body_html || "<p style='color:#94A3B8'>(empty)</p>"} />
                <Preview label="Plain-text preview" html={`<pre style='white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;'>${escapeHtml(campaign.body_text || "(empty)")}</pre>`} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Recipients</div>
                <div className="text-[11px] text-slate-500">{recipientCount} total</div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {recipients.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[12px] text-slate-500">No recipients yet — add from a segment or paste emails on the right.</div>
                ) : (
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Email</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Last sent</th>
                        <th className="px-3 py-2 font-semibold">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 font-mono text-[11.5px]">{r.email}</td>
                          <td className="px-3 py-1.5"><StatusPill status={r.status} /></td>
                          <td className="px-3 py-1.5 text-[10.5px] text-slate-500">{r.last_sent_at ? new Date(r.last_sent_at).toLocaleString() : "—"}</td>
                          <td className="px-3 py-1.5 text-[10.5px] text-rose-700">{r.last_error || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            {/* Status controls */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Lifecycle</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["draft", "active", "paused", "completed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    disabled={busy === "status" || campaign.status === s}
                    className={[
                      "rounded-md border px-2.5 py-1 text-[11.5px] font-semibold",
                      campaign.status === s ? "border-purple-300 bg-purple-50 text-purple-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10.5px] text-slate-500">Dispatcher only sends when status is <strong>active</strong>.</div>
            </div>

            {/* Add from segment */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Add recipients from segment</div>
              <div className="mt-2 space-y-2">
                <select className={fieldClass} value={segmentToAdd} onChange={(e) => setSegmentToAdd(e.target.value)}>
                  <option value="">— pick segment —</option>
                  {segments.map((s: any) => (
                    <option key={s.segment} value={s.segment}>{s.segment} — {s.email_ready} email-ready</option>
                  ))}
                </select>
                <input type="number" min={1} max={1000} className={fieldClass} value={addLimit} onChange={(e) => setAddLimit(Number(e.target.value || 0))} />
                <button onClick={addFromSegment} disabled={busy === "add_segment" || !segmentToAdd} className="w-full rounded-md px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm disabled:opacity-50" style={{ background: ACCENT }}>
                  {busy === "add_segment" ? "Adding…" : `Add up to ${addLimit}`}
                </button>
              </div>
            </div>

            {/* Add explicit emails */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Add specific emails</div>
              <textarea className={`${fieldClass} mt-2 h-20 font-mono text-[11.5px]`} value={emailListText} onChange={(e) => setEmailListText(e.target.value)} placeholder={"alice@example.com\nBob Smith <bob@example.com>"} />
              <button onClick={addEmails} disabled={busy === "add_emails" || !emailListText.trim()} className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {busy === "add_emails" ? "Adding…" : "Add emails"}
              </button>
            </div>

            {/* Trigger */}
            <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Send next batch now</div>
              <div className="mt-1 text-[11px] text-purple-900">Sends up to 25 queued recipients. Status must be <strong>active</strong> and within today's cap.</div>
              <button onClick={triggerOnce} disabled={busy === "trigger" || campaign.status !== "active"} className="mt-2 w-full rounded-md px-3 py-2 text-[12.5px] font-semibold text-white shadow-sm disabled:opacity-50" style={{ background: ACCENT }}>
                {busy === "trigger" ? "Sending…" : "Trigger send"}
              </button>
              {triggerResult ? (
                <div className="mt-2 rounded-md border border-purple-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
                  {triggerResult.kind === "trigger"
                    ? `picked ${triggerResult.summary?.picked} · sent ${triggerResult.summary?.sent} · failed ${triggerResult.summary?.failed} · throttled ${triggerResult.summary?.throttled}${(triggerResult.errors?.length ?? 0) > 0 ? ` · errors: ${triggerResult.errors.slice(0, 2).join("; ")}` : ""}`
                    : `Added ${triggerResult.added}, skipped ${triggerResult.skipped}.`}
                </div>
              ) : null}
            </div>

            {/* KPIs */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Engagement</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11.5px]">
                <KpiSm label="Sent" value={counts.sent} tone="#1d4ed8" Icon={Send} />
                <KpiSm label="Opened" value={counts.opened} tone="#15803d" Icon={Mail} />
                <KpiSm label="Clicked" value={counts.clicked} tone="#7c3aed" Icon={MousePointer} />
                <KpiSm label="Replied" value={counts.replied} tone="#b45309" Icon={Mail} />
                <KpiSm label="Bounced" value={counts.bounced} tone="#991b1b" Icon={AlertTriangle} />
                <KpiSm label="Failed" value={counts.failed} tone="#991b1b" Icon={AlertTriangle} />
              </div>
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

// ─── Audience ────────────────────────────────────────────────────────────────

function AudiencePage() {
  const [segments, setSegments] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [segment, setSegment] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const segRes = await admin<any[]>({ action: "audience.segments" });
        setSegments(segRes || []);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await supabase.functions.invoke("admin-marketing-api", { body: { action: "audience.contacts", segment: segment || null, only_email_ready: true, limit: 50 } });
        if ((res.data as any)?.ok) {
          setContacts((res.data as any).data || []);
          setCount((res.data as any).count || 0);
        }
      } catch {}
    })();
  }, [segment]);

  return (
    <AdminShell title="Audience" subtitle="Read-only view of lit_marketing_audience_*. Add to a campaign from its detail page.">
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Segments</div>
          {loading ? <LoadingBox /> : segments.map((s: any) => (
            <button
              key={s.segment}
              onClick={() => setSegment(s.segment === segment ? "" : s.segment)}
              className={[
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-[12px]",
                segment === s.segment ? "border-purple-300 bg-purple-50" : "border-slate-200 bg-white hover:bg-slate-50",
              ].join(" ")}
            >
              <span className="font-semibold text-[#0F172A]">{s.segment}</span>
              <span className="text-[10.5px] text-slate-500">{s.email_ready}/{s.contacts}</span>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{segment || "All segments"} — email-ready</div>
            <div className="text-[11px] text-slate-500">{count} contacts</div>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {contacts.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-slate-500">No email-ready contacts in this scope.</div>
            ) : (
              <table className="w-full text-left text-[12px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Title</th>
                    <th className="px-3 py-2 font-semibold">Company</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Segment</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c: any) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.contact_name || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-600">{c.title || ""}</td>
                      <td className="px-3 py-1.5 text-slate-700">{c.company_name || ""}</td>
                      <td className="px-3 py-1.5 font-mono text-[11.5px]">{c.email}</td>
                      <td className="px-3 py-1.5 text-[10.5px] text-slate-500">{c.target_segment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Analytics ───────────────────────────────────────────────────────────────

function AnalyticsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { setRows(await admin<any[]>({ action: "campaigns.list" })); }
      catch {} finally { setLoading(false); }
    })();
  }, []);
  const totals = useMemo(() => {
    const t = { sent: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 };
    for (const r of rows) {
      t.sent += r.counts?.sent ?? 0;
      t.opens += r.counts?.opens ?? 0;
      t.clicks += r.counts?.clicks ?? 0;
      t.replies += r.counts?.replies ?? 0;
      t.bounces += r.counts?.bounces ?? 0;
    }
    return t;
  }, [rows]);
  return (
    <AdminShell title="Analytics" subtitle="LIT marketing engagement rollup (Resend webhooks + dispatcher events).">
      {loading ? <LoadingBox /> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <KpiSm label="Sent" value={totals.sent} tone="#1d4ed8" Icon={Send} />
            <KpiSm label="Opens" value={totals.opens} tone="#15803d" Icon={Mail} />
            <KpiSm label="Clicks" value={totals.clicks} tone="#7c3aed" Icon={MousePointer} />
            <KpiSm label="Replies" value={totals.replies} tone="#b45309" Icon={Mail} />
            <KpiSm label="Bounces" value={totals.bounces} tone="#991b1b" Icon={AlertTriangle} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Campaign</th>
                  <th className="px-3 py-2 text-right font-semibold">Sent</th>
                  <th className="px-3 py-2 text-right font-semibold">Open%</th>
                  <th className="px-3 py-2 text-right font-semibold">Click%</th>
                  <th className="px-3 py-2 text-right font-semibold">Reply%</th>
                  <th className="px-3 py-2 text-right font-semibold">Bounce%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const sent = r.counts?.sent ?? 0;
                  const pct = (n: number) => sent > 0 ? Math.round((n / sent) * 1000) / 10 : 0;
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-[#0F172A]">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{sent}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(r.counts?.opens ?? 0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(r.counts?.clicks ?? 0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(r.counts?.replies ?? 0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(r.counts?.bounces ?? 0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

const fieldClass = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-[#0F172A] outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</label>
      {children}
      {hint ? <div className="mt-1 text-[10.5px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    draft: { bg: "#F1F5F9", fg: "#475569", label: "Draft" },
    active: { bg: "#DCFCE7", fg: "#166534", label: "Active" },
    paused: { bg: "#FEF3C7", fg: "#92400E", label: "Paused" },
    completed: { bg: "#E0E7FF", fg: "#4338CA", label: "Completed" },
    queued: { bg: "#DBEAFE", fg: "#1d4ed8", label: "Queued" },
    sent: { bg: "#DBEAFE", fg: "#1d4ed8", label: "Sent" },
    delivered: { bg: "#DCFCE7", fg: "#166534", label: "Delivered" },
    opened: { bg: "#DCFCE7", fg: "#166534", label: "Opened" },
    clicked: { bg: "#EDE9FE", fg: "#5B21B6", label: "Clicked" },
    replied: { bg: "#FEF3C7", fg: "#92400E", label: "Replied" },
    failed: { bg: "#FECACA", fg: "#991B1B", label: "Failed" },
    bounced: { bg: "#FECACA", fg: "#991B1B", label: "Bounced" },
    suppressed: { bg: "#F1F5F9", fg: "#475569", label: "Suppressed" },
  };
  const s = map[status] || { bg: "#F1F5F9", fg: "#475569", label: status };
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

function KpiSm({ label, value, tone, Icon }: { label: string; value: number; tone: string; Icon: any }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-500"><Icon className="h-3 w-3" style={{ color: tone }} />{label}</div>
      <div className="mt-1 text-[16px] font-bold" style={{ color: tone }}>{value.toLocaleString()}</div>
    </div>
  );
}

function Preview({ label, html }: { label: string; html: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</div>
      <div className="rounded-md border border-slate-200 bg-[#FAFAFB] p-3 text-[12px] text-[#0F172A]" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
function LoadingBox() {
  return (
    <div className="flex items-center justify-center rounded-md border border-slate-200 bg-white py-10">
      <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
    </div>
  );
}
function EmptyBox({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-700"><Send className="h-5 w-5" /></div>
      <div className="text-[14px] font-bold text-[#0F172A]">No marketing campaigns yet</div>
      <div className="mt-1 text-[12px] text-slate-500">Create a draft, add a few recipients, and send the first batch by hand.</div>
      <button onClick={onCreate} className="mt-3 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm" style={{ background: ACCENT }}>
        <Plus className="h-3 w-3" /> New campaign
      </button>
    </div>
  );
}

function escapeHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
