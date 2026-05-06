// LitMarketingAdmin v2 — super-admin-only console for the LIT-owned
// marketing subsystem (Resend). Visual language mirrors /app/campaigns
// so admins don't context-switch into a different design system. The
// only deliberate difference is a top "ADMIN · LIT MARKETING (Resend)"
// strip + a purple-tinted accent so it's impossible to confuse this
// surface with the user-campaign builder.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Image as ImageIcon,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  MousePointer,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fontDisplay, fontBody, fontMono } from "@/features/outbound/tokens";
import { SectorIllustration } from "@/pages/landing/SectorIllustration";
import type { Sector, SectorId } from "@/pages/landing/sectors";

type AdminAction =
  | { action: "personas.list" }
  | { action: "audience.segments" }
  | { action: "audience.contacts"; segment?: string | null; only_email_ready?: boolean; limit?: number; offset?: number }
  | { action: "campaigns.list" }
  | { action: "campaigns.get"; id: string }
  | { action: "campaigns.create"; name: string; subject: string; body_html?: string | null; body_text?: string | null; sender_persona_key?: string; daily_send_cap?: number; segment_filter?: Record<string, unknown>; hero_animation?: string | null }
  | { action: "campaigns.update"; id: string; name?: string; subject?: string; body_html?: string | null; body_text?: string | null; sender_persona_key?: string; daily_send_cap?: number; segment_filter?: Record<string, unknown>; status?: "draft" | "scheduled" | "active" | "paused" | "completed"; hero_animation?: string | null }
  | { action: "campaigns.delete"; id: string }
  | { action: "campaigns.send_test"; id: string; to_email: string }
  | { action: "recipients.list"; campaign_id: string; limit?: number; offset?: number }
  | { action: "recipients.add_from_segment"; campaign_id: string; segment?: string; limit?: number }
  | { action: "recipients.add_emails"; campaign_id: string; emails: Array<{ email: string; first_name?: string; last_name?: string; company_name?: string }> }
  | { action: "events.summary"; campaign_id: string }
  | { action: "templates.list"; sector?: string | null };

async function admin<T = any>(payload: AdminAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-marketing-api", { body: payload });
  if (error) throw new Error(error.message || "admin_call_failed");
  if ((data as any)?.ok === false) throw new Error((data as any)?.error || "admin_call_failed");
  return (data as any)?.data as T;
}

// Hero kinds match the SectorIllustration component + the static SVGs the
// dispatcher prepends to body_html on send.
type HeroKind = "stack" | "broker" | "customs" | "nvocc" | "dashboard";
const HERO_OPTIONS: Array<{ id: HeroKind; label: string; sector: SectorId; accent: string; accentSoft: string }> = [
  { id: "stack",     label: "Container stack",     sector: "freight-forwarders",     accent: "#0EA5E9", accentSoft: "#E0F2FE" },
  { id: "broker",    label: "Broker network",      sector: "freight-brokers",        accent: "#3B82F6", accentSoft: "#DBEAFE" },
  { id: "customs",   label: "Customs clearance",   sector: "customs-brokers",        accent: "#7C3AED", accentSoft: "#EDE9FE" },
  { id: "nvocc",     label: "NVOCC pipeline",      sector: "nvocc",                  accent: "#0F766E", accentSoft: "#CCFBF1" },
  { id: "dashboard", label: "Analytics dashboard", sector: "logistics-sales-teams",  accent: "#DC2626", accentSoft: "#FEE2E2" },
];

function sectorFromHero(kind: HeroKind | null): Sector | null {
  if (!kind) return null;
  const opt = HERO_OPTIONS.find((o) => o.id === kind);
  if (!opt) return null;
  // Stub a minimal Sector that satisfies SectorIllustration's prop shape.
  return {
    id: opt.sector, illustration: kind, accent: opt.accent, accentSoft: opt.accentSoft,
    eyebrow: "", headline: "", subheadline: "",
    metrics: [], benefits: [], closing: { title: "", body: "" },
  } as Sector;
}

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

// ─── Shell — matches /app/campaigns visual language ──────────────────────────

function AdminShell({ children, title, subtitle, action }: { children: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  const location = useLocation();
  const tabs = [
    { to: "/admin/marketing", label: "Campaigns", match: /^\/admin\/marketing\/?$|^\/admin\/marketing\/campaigns/ },
    { to: "/admin/marketing/audience", label: "Audience", match: /^\/admin\/marketing\/audience/ },
    { to: "/admin/marketing/analytics", label: "Analytics", match: /^\/admin\/marketing\/analytics/ },
  ];
  return (
    <div className="min-h-full bg-[#F8FAFC]">
      {/* Admin distinction strip — single horizontal line so the surface
          inherits the campaign builder's chrome but admins always know
          they're in a different system. */}
      <div className="border-b border-[#DDD6FE] bg-gradient-to-r from-[#F5F3FF] via-white to-[#F5F3FF]">
        <div className="mx-auto flex w-full max-w-[1500px] items-center gap-2 px-3 py-1.5 md:px-5">
          <span
            className="inline-flex items-center gap-1 rounded-full border border-[#DDD6FE] bg-white px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#7C3AED]"
            style={{ fontFamily: fontDisplay }}
          >
            <Sparkles className="h-2.5 w-2.5" />
            ADMIN · LIT MARKETING (RESEND)
          </span>
          <span className="text-[10.5px] text-slate-500" style={{ fontFamily: fontBody }}>
            Separate from <Link to="/app/campaigns" className="font-semibold text-[#0F172A] hover:underline">user campaigns</Link> — never uses your Gmail/Outlook mailbox.
          </span>
        </div>
      </div>

      {/* Top bar — same shape, density and tokens as CampaignBuilder. */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-2 px-3 py-2 md:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1
                className="m-0 truncate text-[15px] font-bold leading-tight tracking-tight text-[#0F172A]"
                style={{ fontFamily: fontDisplay }}
              >
                {title}
              </h1>
            </div>
            {subtitle ? (
              <div
                className="mt-0.5 truncate text-[10.5px] text-slate-500"
                style={{ fontFamily: fontBody }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1">{action}</div>
        </div>
        <nav className="mx-auto flex w-full max-w-[1500px] items-center gap-1 px-3 md:px-5">
          {tabs.map((t) => {
            const active = t.match.test(location.pathname);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={[
                  "-mb-px border-b-2 px-3 py-1.5 text-[11.5px] font-semibold transition",
                  active ? "border-[#7C3AED] text-[#7C3AED]" : "border-transparent text-slate-500 hover:text-slate-800",
                ].join(" ")}
                style={{ fontFamily: fontDisplay }}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto w-full max-w-[1500px] px-3 py-4 md:px-5 md:py-5">{children}</div>
    </div>
  );
}

// ─── Reusable bits sized to match Campaigns.jsx ──────────────────────────────

const accentBtn = "inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-[#A78BFA] to-[#7C3AED] px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(124,58,237,0.3)] disabled:opacity-50";
const ghostBtn = "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";
const dangerBtn = "inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50";
const fieldClass = "w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-[#0F172A] outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-purple-100";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; border: string; label: string }> = {
    draft: { bg: "#F1F5F9", fg: "#475569", border: "#E2E8F0", label: "Draft" },
    active: { bg: "#F0FDF4", fg: "#15803d", border: "#BBF7D0", label: "Active" },
    paused: { bg: "#FFFBEB", fg: "#B45309", border: "#FDE68A", label: "Paused" },
    completed: { bg: "#EFF6FF", fg: "#1d4ed8", border: "#BFDBFE", label: "Completed" },
    queued: { bg: "#EFF6FF", fg: "#1d4ed8", border: "#BFDBFE", label: "Queued" },
    sent: { bg: "#EFF6FF", fg: "#1d4ed8", border: "#BFDBFE", label: "Sent" },
    delivered: { bg: "#F0FDF4", fg: "#15803d", border: "#BBF7D0", label: "Delivered" },
    opened: { bg: "#F0FDF4", fg: "#15803d", border: "#BBF7D0", label: "Opened" },
    clicked: { bg: "#F5F3FF", fg: "#5B21B6", border: "#DDD6FE", label: "Clicked" },
    replied: { bg: "#FFFBEB", fg: "#B45309", border: "#FDE68A", label: "Replied" },
    bounced: { bg: "#FEF2F2", fg: "#991B1B", border: "#FECACA", label: "Bounced" },
    failed: { bg: "#FEF2F2", fg: "#991B1B", border: "#FECACA", label: "Failed" },
    suppressed: { bg: "#F1F5F9", fg: "#475569", border: "#E2E8F0", label: "Suppressed" },
  };
  const s = map[status] || map.draft;
  return (
    <span
      className="inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase tracking-[0.04em]"
      style={{ background: s.bg, color: s.fg, borderColor: s.border, fontFamily: fontDisplay }}
    >
      {s.label}
    </span>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col px-3 py-2" style={{ borderRight: "1px solid #F1F5F9", borderBottom: "1px solid #F1F5F9" }}>
      <div
        className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
        style={{ fontFamily: fontDisplay }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-[15px] font-bold leading-tight tracking-tight text-[#0F172A]"
        style={{ fontFamily: fontMono }}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[10px] text-slate-400" style={{ fontFamily: fontBody }}>
          {sub}
        </div>
      ) : null}
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
    try { setRows((await admin<any[]>({ action: "campaigns.list" })) || []); }
    catch (e: any) { setError(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const totals = useMemo(() => {
    const t = { active: 0, draft: 0, sent: 0, opens: 0, clicks: 0, replies: 0 };
    for (const r of rows) {
      if (r.status === "active") t.active += 1;
      if (r.status === "draft") t.draft += 1;
      t.sent += r.counts?.sent ?? 0;
      t.opens += r.counts?.opens ?? 0;
      t.clicks += r.counts?.clicks ?? 0;
      t.replies += r.counts?.replies ?? 0;
    }
    return t;
  }, [rows]);

  return (
    <AdminShell
      title="Marketing campaigns"
      subtitle="LIT-owned sends through Resend. Pick a starter template, queue a batch, send."
      action={
        <>
          <button onClick={refresh} disabled={loading} className={ghostBtn} style={{ fontFamily: fontDisplay }}>
            <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <Link to="/admin/marketing/campaigns/new" className={accentBtn} style={{ fontFamily: fontDisplay }}>
            <Plus className="h-2.5 w-2.5" /> New campaign
          </Link>
        </>
      }
    >
      {/* KPI strip — same density as /app/campaigns PulseBar */}
      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-[#FAFBFC]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
          <KpiTile label="Active" value={totals.active} sub={`${totals.draft} drafts`} />
          <KpiTile label="Sent" value={totals.sent.toLocaleString()} sub="all campaigns" />
          <KpiTile label="Opens" value={totals.opens.toLocaleString()} sub={totals.sent ? `${Math.round((totals.opens/totals.sent)*100)}%` : "—"} />
          <KpiTile label="Clicks" value={totals.clicks.toLocaleString()} sub={totals.sent ? `${Math.round((totals.clicks/totals.sent)*100)}%` : "—"} />
          <KpiTile label="Replies" value={totals.replies.toLocaleString()} sub={totals.sent ? `${Math.round((totals.replies/totals.sent)*100)}%` : "—"} />
          <KpiTile label="Campaigns" value={rows.length} sub="total" />
        </div>
      </div>

      {error ? <ErrorBox message={error} /> : null}

      {loading ? (
        <LoadingBox />
      ) : rows.length === 0 ? (
        <EmptyBox onCreate={() => navigate("/admin/marketing/campaigns/new")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[920px] text-left text-[12px]" style={{ fontFamily: fontBody }}>
            <thead className="border-b border-slate-100 bg-[#FAFBFC]">
              <tr className="text-[9px] uppercase tracking-[0.08em] text-slate-400" style={{ fontFamily: fontDisplay }}>
                <th className="px-3 py-2 font-bold">Campaign</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Persona</th>
                <th className="px-3 py-2 text-right font-bold">Cap/day</th>
                <th className="px-3 py-2 text-right font-bold">Queued</th>
                <th className="px-3 py-2 text-right font-bold">Sent</th>
                <th className="px-3 py-2 text-right font-bold">Opens</th>
                <th className="px-3 py-2 text-right font-bold">Clicks</th>
                <th className="px-3 py-2 text-right font-bold">Bounces</th>
                <th className="px-3 py-2 text-right font-bold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t border-slate-100 hover:bg-purple-50/30" onClick={() => navigate(`/admin/marketing/campaigns/${c.id}`)}>
                  <td className="px-3 py-2 font-semibold text-[#0F172A]">{c.name}</td>
                  <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                  <td className="px-3 py-2 text-slate-600">{c.sender_persona_key || "lit_team"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600" style={{ fontFamily: fontMono }}>{c.daily_send_cap}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700" style={{ fontFamily: fontMono }}>{c.counts?.queued ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#7C3AED]" style={{ fontFamily: fontMono }}>{c.counts?.sent ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700" style={{ fontFamily: fontMono }}>{c.counts?.opens ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-violet-700" style={{ fontFamily: fontMono }}>{c.counts?.clicks ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-700" style={{ fontFamily: fontMono }}>{c.counts?.bounces ?? 0}</td>
                  <td className="px-3 py-2 text-right text-[10.5px] text-slate-400" style={{ fontFamily: fontMono }}>{new Date(c.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function CampaignEditorPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [persona, setPersona] = useState("lit_team");
  const [cap, setCap] = useState(50);
  const [segment, setSegment] = useState<string>("");
  const [hero, setHero] = useState<HeroKind | "">("");
  const [personas, setPersonas] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [appliedTemplateKey, setAppliedTemplateKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      admin<any[]>({ action: "personas.list" }).then(setPersonas).catch(() => {}),
      admin<any[]>({ action: "audience.segments" }).then(setSegments).catch(() => {}),
      admin<any[]>({ action: "templates.list" }).then(setTemplates).catch(() => {}),
    ]);
  }, []);

  function applyTemplate(t: any) {
    setName((prev) => prev || t.name);
    setSubject(t.subject || "");
    setBodyHtml(t.body_html || "");
    setBodyText(t.body_text || "");
    if (t.persona_key) setPersona(t.persona_key);
    if (t.hero_animation) setHero(t.hero_animation as HeroKind);
    if (t.sector && t.sector !== "general") setSegment((cur) => cur || mapSectorToSegment(t.sector));
    setAppliedTemplateKey(t.template_key);
  }

  async function save() {
    if (!name.trim() || !subject.trim()) { setError("Name and subject are required."); return; }
    setSaving(true); setError(null);
    try {
      const data = await admin<{ id: string }>({
        action: "campaigns.create",
        name: name.trim(), subject: subject.trim(),
        body_html: bodyHtml || null, body_text: bodyText || null,
        sender_persona_key: persona, daily_send_cap: cap,
        segment_filter: segment ? { target_segment: segment } : {},
        hero_animation: hero || null,
      });
      navigate(`/admin/marketing/campaigns/${data.id}`);
    } catch (e: any) { setError(e?.message || "Save failed"); }
    finally { setSaving(false); }
  }

  const heroSector = sectorFromHero(hero || null);

  return (
    <AdminShell
      title="New campaign"
      subtitle="Pick a starter template or compose from scratch. Status starts as Draft; flip to Active to enable the dispatcher."
      action={
        <>
          <Link to="/admin/marketing" className={ghostBtn} style={{ fontFamily: fontDisplay }}>
            <ArrowLeft className="h-2.5 w-2.5" /> Cancel
          </Link>
          <button onClick={save} disabled={saving} className={accentBtn} style={{ fontFamily: fontDisplay }}>
            <Save className="h-2.5 w-2.5" />
            {saving ? "Saving…" : "Create draft"}
          </button>
        </>
      }
    >
      {error ? <ErrorBox message={error} /> : null}

      {/* Template gallery */}
      {templates.length > 0 ? (
        <section className="mb-3 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>
              Starter templates
            </div>
            <div className="text-[10px] text-slate-400" style={{ fontFamily: fontBody }}>
              Click to apply. Everything stays editable.
            </div>
          </div>
          <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t: any) => {
              const tHeroSector = t.hero_animation ? sectorFromHero(t.hero_animation as HeroKind) : null;
              const isApplied = appliedTemplateKey === t.template_key;
              return (
                <button
                  key={t.template_key}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className={[
                    "flex flex-col rounded-md border p-2 text-left transition",
                    isApplied ? "border-[#A78BFA] ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-300",
                  ].join(" ")}
                >
                  {tHeroSector ? (
                    <div className="mb-1.5 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                      <SectorIllustration sector={tHeroSector} />
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-1">
                    <span className="rounded-full bg-slate-100 px-1.5 py-0 text-[8.5px] font-bold uppercase tracking-[0.04em] text-slate-600" style={{ fontFamily: fontDisplay }}>{t.sector}</span>
                    <span className="text-[9px] text-slate-400" style={{ fontFamily: fontBody }}>{t.use_case}</span>
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-[#0F172A]" style={{ fontFamily: fontDisplay }}>{t.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[10.5px] text-slate-600" style={{ fontFamily: fontBody }}>{t.subject}</div>
                  {isApplied ? (
                    <div className="mt-1.5 inline-flex items-center gap-1 self-start rounded-full bg-[#7C3AED] px-1.5 py-0 text-[9px] font-bold uppercase tracking-[0.06em] text-white" style={{ fontFamily: fontDisplay }}>
                      <CheckCircle2 className="h-2.5 w-2.5" /> Applied
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Field label="Campaign name (internal)">
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Q2 NVOCC competitor radar" />
          </Field>
          <Field label="Subject (recipient sees)">
            <input className={fieldClass} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Three competitors saved {{company_name}} to their target list last week" />
          </Field>
          <Field label="Hero illustration (optional)" hint="Prepended to the email body when sending. Mirrors the /l/<sector> landing pages so click-throughs feel cohesive.">
            <HeroPicker value={hero || ""} onChange={(v) => setHero(v as any)} />
          </Field>
          <Field label="HTML body" hint="Use {{first_name}}, {{last_name}}, {{company_name}}, {{email}} for merge.">
            <textarea className={`${fieldClass} h-44 font-mono text-[11.5px]`} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} placeholder="<p>Hi {{first_name}},</p>…" />
          </Field>
          <Field label="Plain-text fallback" hint="Optional. Auto-derived from HTML if blank.">
            <textarea className={`${fieldClass} h-20 font-mono text-[11.5px]`} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3">
          {/* Live preview using the actual hero SVG */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>Preview</div>
            {heroSector ? (
              <div className="mb-2 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                <SectorIllustration sector={heroSector} />
              </div>
            ) : null}
            <div className="text-[12px] font-semibold text-[#0F172A]" style={{ fontFamily: fontDisplay }}>{subject || "(subject preview)"}</div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-100 bg-[#FAFBFC] p-2 text-[11.5px] leading-relaxed text-slate-700" style={{ fontFamily: fontBody }} dangerouslySetInnerHTML={{ __html: bodyHtml || "<em style='color:#94A3B8'>Empty body</em>" }} />
          </div>
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
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any | null>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [events, setEvents] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [segmentToAdd, setSegmentToAdd] = useState<string>("");
  const [addLimit, setAddLimit] = useState<number>(25);
  const [emailListText, setEmailListText] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "info" | "danger"; text: string } | null>(null);

  // Editor state — mirrors the user-campaign builder so admins can edit
  // a draft inline rather than recreating it.
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [persona, setPersona] = useState("lit_team");
  const [cap, setCap] = useState(50);
  const [hero, setHero] = useState<HeroKind | "">("");
  const [personas, setPersonas] = useState<any[]>([]);
  const [dirty, setDirty] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const [c, recRes, evRes, segRes, perRes] = await Promise.all([
        admin<any>({ action: "campaigns.get", id }),
        supabase.functions.invoke("admin-marketing-api", { body: { action: "recipients.list", campaign_id: id, limit: 100 } }),
        admin<any[]>({ action: "events.summary", campaign_id: id }),
        admin<any[]>({ action: "audience.segments" }),
        admin<any[]>({ action: "personas.list" }),
      ]);
      setCampaign(c);
      setName(c.name); setSubject(c.subject);
      setBodyHtml(c.body_html || ""); setBodyText(c.body_text || "");
      setPersona(c.sender_persona_key || "lit_team");
      setCap(c.daily_send_cap || 50);
      setHero((c.hero_animation as HeroKind | null) || "");
      setDirty(false);
      const rec = (recRes.data as any) || {};
      setRecipients(rec?.data ?? []); setRecipientCount(rec?.count ?? 0);
      setEvents(evRes || []);
      setSegments(segRes || []);
      setPersonas(perRes || []);
      const filterSeg = (c?.segment_filter && (c.segment_filter as any).target_segment) || "";
      if (filterSeg) setSegmentToAdd(filterSeg);
    } catch (e: any) { setError(e?.message || "Load failed"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!id) return null;

  function showFeedback(kind: "success" | "info" | "danger", text: string) {
    setFeedback({ kind, text });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function setStatus(next: "draft" | "active" | "paused" | "completed") {
    setBusy("status");
    try {
      await admin({ action: "campaigns.update", id: id!, status: next });
      await refresh();
      showFeedback("success", `Status → ${next}`);
    } catch (e: any) { setError(e?.message || "Update failed"); }
    finally { setBusy(null); }
  }

  async function saveEdits() {
    setBusy("save"); setError(null);
    try {
      await admin({
        action: "campaigns.update", id: id!,
        name: name.trim(), subject: subject.trim(),
        body_html: bodyHtml || null, body_text: bodyText || null,
        sender_persona_key: persona, daily_send_cap: cap,
        hero_animation: hero || null,
      });
      await refresh(); setDirty(false);
      showFeedback("success", "Saved.");
    } catch (e: any) { setError(e?.message || "Save failed"); }
    finally { setBusy(null); }
  }

  async function deleteCampaign() {
    if (!confirm(`Permanently delete "${campaign?.name}"? Recipients and events will also be removed. This cannot be undone.`)) return;
    setBusy("delete");
    try {
      await admin({ action: "campaigns.delete", id: id! });
      navigate("/admin/marketing");
    } catch (e: any) { setError(e?.message || "Delete failed"); setBusy(null); }
  }

  async function sendTest() {
    if (!testEmail.trim()) { setError("Enter a test email."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) { setError("Invalid email."); return; }
    setBusy("test"); setError(null);
    try {
      const res = await admin<{ message_id: string; to: string; from: string }>({ action: "campaigns.send_test", id: id!, to_email: testEmail.trim().toLowerCase() });
      showFeedback("success", `Test sent to ${res.to} from ${res.from}.`);
    } catch (e: any) { setError(e?.message || "Test send failed"); }
    finally { setBusy(null); }
  }

  async function addFromSegment() {
    if (!segmentToAdd) { setError("Pick a segment first."); return; }
    setBusy("add_segment"); setError(null);
    try {
      const res = await admin<{ added: number; skipped: number }>({ action: "recipients.add_from_segment", campaign_id: id!, segment: segmentToAdd, limit: addLimit });
      showFeedback("info", `Added ${res.added}, skipped ${res.skipped}.`);
      await refresh();
    } catch (e: any) { setError(e?.message || "Add failed"); }
    finally { setBusy(null); }
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
      setEmailListText(""); showFeedback("info", `Added ${res.added} of ${rows.length}.`);
      await refresh();
    } catch (e: any) { setError(e?.message || "Add failed"); }
    finally { setBusy(null); }
  }

  async function triggerOnce() {
    if (!confirm("Send the next batch (up to 25) to live email addresses?")) return;
    setBusy("trigger"); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-lit-marketing-email", { body: { campaign_id: id } });
      if (error) throw new Error(error.message || "trigger_failed");
      const sum = (data as any)?.summary;
      showFeedback("success", `picked ${sum?.picked ?? 0} · sent ${sum?.sent ?? 0} · failed ${sum?.failed ?? 0} · throttled ${sum?.throttled ?? 0}`);
      await refresh();
    } catch (e: any) { setError(e?.message || "Trigger failed"); }
    finally { setBusy(null); }
  }

  const counts = useMemo(() => {
    const c = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };
    for (const e of events) { const t = e.event_type as string; if (t in c) (c as any)[t] += 1; }
    return c;
  }, [events]);

  const heroSector = sectorFromHero((hero || null) as HeroKind | null);
  const isActive = campaign?.status === "active";

  return (
    <AdminShell
      title={campaign?.name || "Campaign"}
      subtitle={campaign ? `${campaign.subject}` : undefined}
      action={
        <>
          <Link to="/admin/marketing" className={ghostBtn} style={{ fontFamily: fontDisplay }}>
            <ArrowLeft className="h-2.5 w-2.5" /> Back
          </Link>
          <button onClick={deleteCampaign} disabled={busy === "delete"} className={dangerBtn} style={{ fontFamily: fontDisplay }}>
            <Trash2 className="h-2.5 w-2.5" /> Delete
          </button>
          <button onClick={saveEdits} disabled={!dirty || busy === "save"} className={ghostBtn} style={{ fontFamily: fontDisplay }}>
            <Save className="h-2.5 w-2.5" /> {busy === "save" ? "Saving…" : "Save changes"}
          </button>
          <button onClick={triggerOnce} disabled={!isActive || busy === "trigger"} className={accentBtn} style={{ fontFamily: fontDisplay }} title={!isActive ? "Status must be active" : undefined}>
            <Rocket className="h-2.5 w-2.5" /> {busy === "trigger" ? "Sending…" : "Trigger send"}
          </button>
        </>
      }
    >
      {error ? <ErrorBox message={error} /> : null}
      {feedback ? (
        <div
          className={[
            "mb-3 flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11.5px]",
            feedback.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : feedback.kind === "info" ? "border-purple-200 bg-purple-50 text-purple-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          ].join(" ")}
          style={{ fontFamily: fontBody }}
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" /> {feedback.text}
        </div>
      ) : null}

      {loading || !campaign ? <LoadingBox /> : (
        <div className="grid gap-3 md:grid-cols-[1fr_360px]">
          {/* Left: editor + preview + recipients */}
          <section className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <StatusPill status={campaign.status} />
                <span className="text-[10.5px] text-slate-500" style={{ fontFamily: fontBody }}>
                  Sender: {campaign.sender_persona_key} · Cap {campaign.daily_send_cap}/day
                </span>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Name">
                  <input className={fieldClass} value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
                </Field>
                <Field label="Subject">
                  <input className={fieldClass} value={subject} onChange={(e) => { setSubject(e.target.value); setDirty(true); }} />
                </Field>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_220px]">
                <Field label="HTML body">
                  <textarea className={`${fieldClass} h-40 font-mono text-[11.5px]`} value={bodyHtml} onChange={(e) => { setBodyHtml(e.target.value); setDirty(true); }} />
                </Field>
                <Field label="Hero illustration">
                  <HeroPicker value={hero || ""} onChange={(v) => { setHero(v as any); setDirty(true); }} compact />
                </Field>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <Field label="Sender persona">
                  <select className={fieldClass} value={persona} onChange={(e) => { setPersona(e.target.value); setDirty(true); }}>
                    {personas.map((p) => (
                      <option key={p.persona_key} value={p.persona_key}>{p.display_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Daily cap">
                  <input type="number" min={1} max={2000} className={fieldClass} value={cap} onChange={(e) => { setCap(Number(e.target.value || 0)); setDirty(true); }} />
                </Field>
                <Field label="Plain-text fallback">
                  <textarea className={`${fieldClass} h-9 font-mono text-[11px]`} value={bodyText} onChange={(e) => { setBodyText(e.target.value); setDirty(true); }} />
                </Field>
              </div>
            </div>

            {/* Email preview */}
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>
                  Preview as recipient
                </div>
                <div className="text-[10px] text-slate-400" style={{ fontFamily: fontBody }}>{subject}</div>
              </div>
              <div className="p-3">
                {heroSector ? (
                  <div className="mb-2 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                    <SectorIllustration sector={heroSector} />
                  </div>
                ) : null}
                <div className="rounded-md border border-slate-100 bg-[#FAFBFC] p-3 text-[12.5px] leading-relaxed text-slate-700" style={{ fontFamily: fontBody }} dangerouslySetInnerHTML={{ __html: bodyHtml || "<em style='color:#94A3B8'>Empty body</em>" }} />
              </div>
            </div>

            {/* Recipients table */}
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>Recipients</div>
                <div className="text-[10px] text-slate-400" style={{ fontFamily: fontBody }}>{recipientCount} total</div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recipients.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11.5px] text-slate-500" style={{ fontFamily: fontBody }}>
                    No recipients yet. Add from a segment or paste emails on the right.
                  </div>
                ) : (
                  <table className="w-full text-left text-[11.5px]" style={{ fontFamily: fontBody }}>
                    <thead className="border-b border-slate-100 bg-[#FAFBFC]">
                      <tr className="text-[9px] uppercase tracking-[0.08em] text-slate-400" style={{ fontFamily: fontDisplay }}>
                        <th className="px-3 py-1.5 font-bold">Email</th>
                        <th className="px-3 py-1.5 font-bold">Status</th>
                        <th className="px-3 py-1.5 font-bold">Last sent</th>
                        <th className="px-3 py-1.5 font-bold">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-3 py-1 font-mono text-[11px]" style={{ fontFamily: fontMono }}>{r.email}</td>
                          <td className="px-3 py-1"><StatusPill status={r.status} /></td>
                          <td className="px-3 py-1 text-[10px] text-slate-500" style={{ fontFamily: fontMono }}>{r.last_sent_at ? new Date(r.last_sent_at).toLocaleString() : "—"}</td>
                          <td className="px-3 py-1 text-[10px] text-rose-700">{r.last_error || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>

          {/* Right column: actions */}
          <section className="space-y-3">
            {/* Test send — analogous to the user-campaign Test send. */}
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <FlaskConical className="h-3 w-3 text-[#7C3AED]" />
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>
                  Send test
                </div>
              </div>
              <div className="text-[10.5px] text-slate-500" style={{ fontFamily: fontBody }}>
                Sends one rendered email to the address you specify. Does NOT touch the recipient roster.
              </div>
              <input
                className={`${fieldClass} mt-1.5`}
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="vraymond@sparkfusiondigital.com"
              />
              <button onClick={sendTest} disabled={busy === "test"} className={`mt-1.5 w-full ${ghostBtn}`} style={{ fontFamily: fontDisplay }}>
                <Send className="h-2.5 w-2.5" /> {busy === "test" ? "Sending…" : "Send test"}
              </button>
            </div>

            {/* Lifecycle */}
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>Lifecycle</div>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {(["draft","active","paused","completed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    disabled={busy === "status" || campaign.status === s}
                    className={[
                      "rounded-md border px-2 py-1 text-[11px] font-semibold capitalize",
                      campaign.status === s ? "border-[#A78BFA] bg-purple-50 text-[#7C3AED]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                    style={{ fontFamily: fontDisplay }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-slate-500" style={{ fontFamily: fontBody }}>
                Dispatcher sends only when status is <strong className="text-emerald-700">active</strong>.
              </div>
            </div>

            {/* Add from segment */}
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>Add from segment</div>
              <div className="mt-1.5 space-y-1.5">
                <select className={fieldClass} value={segmentToAdd} onChange={(e) => setSegmentToAdd(e.target.value)}>
                  <option value="">— pick segment —</option>
                  {segments.map((s: any) => (
                    <option key={s.segment} value={s.segment}>{s.segment} — {s.email_ready} email-ready</option>
                  ))}
                </select>
                <input type="number" min={1} max={1000} className={fieldClass} value={addLimit} onChange={(e) => setAddLimit(Number(e.target.value || 0))} />
                <button onClick={addFromSegment} disabled={busy === "add_segment" || !segmentToAdd} className={`w-full ${ghostBtn}`} style={{ fontFamily: fontDisplay }}>
                  <Users className="h-2.5 w-2.5" /> {busy === "add_segment" ? "Adding…" : `Add up to ${addLimit}`}
                </button>
              </div>
            </div>

            {/* Add specific emails */}
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>Add specific emails</div>
              <textarea className={`${fieldClass} mt-1.5 h-16 font-mono text-[11px]`} value={emailListText} onChange={(e) => setEmailListText(e.target.value)} placeholder={"alice@example.com\nBob Smith <bob@example.com>"} />
              <button onClick={addEmails} disabled={busy === "add_emails" || !emailListText.trim()} className={`mt-1.5 w-full ${ghostBtn}`} style={{ fontFamily: fontDisplay }}>
                <Mail className="h-2.5 w-2.5" /> {busy === "add_emails" ? "Adding…" : "Add emails"}
              </button>
            </div>

            {/* KPI tiles */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-[#FAFBFC]">
              <div className="grid grid-cols-3">
                <KpiTile label="Sent" value={counts.sent} />
                <KpiTile label="Opens" value={counts.opened} />
                <KpiTile label="Clicks" value={counts.clicked} />
                <KpiTile label="Replies" value={counts.replied} />
                <KpiTile label="Bounces" value={counts.bounced} />
                <KpiTile label="Failed" value={counts.failed} />
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
      try { setSegments(await admin<any[]>({ action: "audience.segments" })); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await supabase.functions.invoke("admin-marketing-api", { body: { action: "audience.contacts", segment: segment || null, only_email_ready: true, limit: 50 } });
        if ((res.data as any)?.ok) {
          setContacts((res.data as any).data || []); setCount((res.data as any).count || 0);
        }
      } catch {}
    })();
  }, [segment]);

  return (
    <AdminShell title="Audience" subtitle="Read-only view of lit_marketing_audience_*. Add to a campaign from its detail page.">
      <div className="grid gap-3 md:grid-cols-[280px_1fr]">
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>Segments</div>
          {loading ? <LoadingBox /> : segments.map((s: any) => (
            <button
              key={s.segment}
              onClick={() => setSegment(s.segment === segment ? "" : s.segment)}
              className={[
                "flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-[11.5px]",
                segment === s.segment ? "border-[#A78BFA] bg-purple-50" : "border-slate-200 bg-white hover:bg-slate-50",
              ].join(" ")}
              style={{ fontFamily: fontBody }}
            >
              <span className="font-semibold text-[#0F172A]">{s.segment}</span>
              <span className="text-[10px] text-slate-500" style={{ fontFamily: fontMono }}>{s.email_ready}/{s.contacts}</span>
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: fontDisplay }}>{segment || "All segments"} — email-ready</div>
            <div className="text-[10.5px] text-slate-500" style={{ fontFamily: fontMono }}>{count} contacts</div>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {contacts.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11.5px] text-slate-500" style={{ fontFamily: fontBody }}>No email-ready contacts in this scope.</div>
            ) : (
              <table className="w-full text-left text-[11.5px]" style={{ fontFamily: fontBody }}>
                <thead className="border-b border-slate-100 bg-[#FAFBFC]">
                  <tr className="text-[9px] uppercase tracking-[0.08em] text-slate-400" style={{ fontFamily: fontDisplay }}>
                    <th className="px-3 py-1.5 font-bold">Name</th>
                    <th className="px-3 py-1.5 font-bold">Title</th>
                    <th className="px-3 py-1.5 font-bold">Company</th>
                    <th className="px-3 py-1.5 font-bold">Email</th>
                    <th className="px-3 py-1.5 font-bold">Segment</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c: any) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-3 py-1">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.contact_name || "—"}</td>
                      <td className="px-3 py-1 text-slate-600">{c.title || ""}</td>
                      <td className="px-3 py-1 text-slate-700">{c.company_name || ""}</td>
                      <td className="px-3 py-1 font-mono text-[11px]" style={{ fontFamily: fontMono }}>{c.email}</td>
                      <td className="px-3 py-1 text-[10px] text-slate-500">{c.target_segment}</td>
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
          <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-[#FAFBFC]">
            <div className="grid grid-cols-2 sm:grid-cols-5">
              <KpiTile label="Sent" value={totals.sent.toLocaleString()} />
              <KpiTile label="Opens" value={totals.opens.toLocaleString()} sub={totals.sent ? `${Math.round((totals.opens/totals.sent)*100)}%` : "—"} />
              <KpiTile label="Clicks" value={totals.clicks.toLocaleString()} sub={totals.sent ? `${Math.round((totals.clicks/totals.sent)*100)}%` : "—"} />
              <KpiTile label="Replies" value={totals.replies.toLocaleString()} sub={totals.sent ? `${Math.round((totals.replies/totals.sent)*100)}%` : "—"} />
              <KpiTile label="Bounces" value={totals.bounces.toLocaleString()} sub={totals.sent ? `${Math.round((totals.bounces/totals.sent)*100)}%` : "—"} />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-[12px]" style={{ fontFamily: fontBody }}>
              <thead className="border-b border-slate-100 bg-[#FAFBFC]">
                <tr className="text-[9px] uppercase tracking-[0.08em] text-slate-400" style={{ fontFamily: fontDisplay }}>
                  <th className="px-3 py-2 font-bold">Campaign</th>
                  <th className="px-3 py-2 text-right font-bold">Sent</th>
                  <th className="px-3 py-2 text-right font-bold">Open%</th>
                  <th className="px-3 py-2 text-right font-bold">Click%</th>
                  <th className="px-3 py-2 text-right font-bold">Reply%</th>
                  <th className="px-3 py-2 text-right font-bold">Bounce%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const sent = r.counts?.sent ?? 0;
                  const pct = (n: number) => sent > 0 ? Math.round((n / sent) * 1000) / 10 : 0;
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-[#0F172A]">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: fontMono }}>{sent}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: fontMono }}>{pct(r.counts?.opens ?? 0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: fontMono }}>{pct(r.counts?.clicks ?? 0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: fontMono }}>{pct(r.counts?.replies ?? 0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: fontMono }}>{pct(r.counts?.bounces ?? 0)}%</td>
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

// ─── Hero picker ─────────────────────────────────────────────────────────────

function HeroPicker({ value, onChange, compact = false }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  return (
    <div className={`grid gap-1.5 ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
      <button
        type="button"
        onClick={() => onChange("")}
        className={[
          "flex h-12 items-center justify-center rounded-md border text-[10px] font-semibold uppercase tracking-[0.06em]",
          !value ? "border-[#A78BFA] bg-purple-50 text-[#7C3AED]" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
        ].join(" ")}
        style={{ fontFamily: fontDisplay }}
      >
        None
      </button>
      {HERO_OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            title={opt.label}
            className={[
              "flex h-12 items-center justify-center overflow-hidden rounded-md border",
              active ? "border-[#A78BFA] ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-300",
            ].join(" ")}
            style={{ background: opt.accentSoft }}
          >
            <ImageIcon className="h-4 w-4" style={{ color: opt.accent }} />
          </button>
        );
      })}
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="mb-0.5 block text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500"
        style={{ fontFamily: fontDisplay }}
      >
        {label}
      </label>
      {children}
      {hint ? (
        <div className="mt-0.5 text-[10px] text-slate-500" style={{ fontFamily: fontBody }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700" style={{ fontFamily: fontBody }}>
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
function LoadingBox() {
  return (
    <div className="flex items-center justify-center rounded-md border border-slate-200 bg-white py-10">
      <Loader2 className="h-4 w-4 animate-spin text-[#7C3AED]" />
    </div>
  );
}
function EmptyBox({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-purple-50 text-[#7C3AED]"><Send className="h-5 w-5" /></div>
      <div className="text-[14px] font-bold text-[#0F172A]" style={{ fontFamily: fontDisplay }}>No marketing campaigns yet</div>
      <div className="mt-1 text-[12px] text-slate-500" style={{ fontFamily: fontBody }}>Create a draft, add a few recipients, and send the first batch by hand.</div>
      <button onClick={onCreate} className={`mt-3 ${accentBtn}`} style={{ fontFamily: fontDisplay }}>
        <Plus className="h-2.5 w-2.5" /> New campaign
      </button>
    </div>
  );
}

// Map template sector slug → audience segment key.
function mapSectorToSegment(sector: string): string {
  switch (sector) {
    case "nvocc": return "nvoccs";
    case "freight-forwarders": return "freight_forwarders";
    case "air-ocean-forwarders": return "air_ocean_forwarders";
    case "customs-brokers": return "customs_brokers";
    default: return "";
  }
}
