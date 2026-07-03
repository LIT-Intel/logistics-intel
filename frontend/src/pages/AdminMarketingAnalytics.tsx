import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, BriefcaseBusiness, Download, Linkedin, MailCheck, MailOpen, MousePointerClick, RefreshCw, Send, Sparkles, Target, UsersRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchRecentEmailEvents, computeKpis, computeDailyVolume, type EmailEvent } from "@/api/marketingAnalytics";
import { fetchLinkedInAnalytics, fetchLinkedInLeadCount, type LinkedInAnalyticsResponse } from "@/api/linkedinAnalytics";
import { fontBody, fontDisplay, fontMono } from "@/features/admin/AdminShared";

type RangeKey = "7d" | "30d" | "90d";
type AcquisitionStage = "lead" | "engaged" | "reply" | "meeting_booked" | "demo_completed" | "opportunity" | "customer" | "lost";

type OpportunityRow = {
  id: string;
  email: string | null;
  contact_name: string | null;
  company_name: string | null;
  title: string | null;
  stage: AcquisitionStage;
  source_provider: string | null;
  stage_changed_at: string;
  created_at: string;
};

type LemlistCampaignRow = {
  id: string;
  name: string;
  status: string;
  audience_segment: string;
  lemlist_campaign_id: string | null;
  last_synced_at: string | null;
  stats: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type EnrichmentJobRow = {
  id: string;
  provider: string;
  status: string;
  source_context: string;
  workflows: string[] | null;
  created_at: string;
  submitted_at: string | null;
};

const RANGE_OPTS: Array<{ id: RangeKey; label: string; days: number }> = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

const STAGES: Array<{ key: AcquisitionStage; label: string }> = [
  { key: "lead", label: "Leads" },
  { key: "engaged", label: "Engaged" },
  { key: "reply", label: "Replies" },
  { key: "meeting_booked", label: "Meetings" },
  { key: "opportunity", label: "Pipeline" },
  { key: "customer", label: "Customers" },
];

function fmtPct(n: number): string {
  if (!isFinite(n) || n === 0) return "0%";
  if (n >= 0.1) return `${(n * 100).toFixed(1)}%`;
  return `${(n * 100).toFixed(2)}%`;
}
function fmtInt(n: number): string { return Math.round(n).toLocaleString(); }
function fmtRelative(iso?: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminMarketingAnalytics() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [lemlistCampaigns, setLemlistCampaigns] = useState<LemlistCampaignRow[]>([]);
  const [enrichmentJobs, setEnrichmentJobs] = useState<EnrichmentJobRow[]>([]);
  const [li, setLi] = useState<LinkedInAnalyticsResponse | null>(null);
  const [liLeadCount, setLiLeadCount] = useState<number | null>(null);
  const [liNotConfigured, setLiNotConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const days = RANGE_OPTS.find((r) => r.id === range)?.days ?? 30;
  const since = useMemo(() => new Date(Date.now() - days * 86400000).toISOString(), [days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setLiNotConfigured(false);

    async function load() {
      try {
        const [emailRows, liAnalytics, linkedInLeads, oppRes, campaignRes, jobRes] = await Promise.all([
          fetchRecentEmailEvents(since, 10000),
          fetchLinkedInAnalytics(days).catch(() => null),
          fetchLinkedInLeadCount(days).catch(() => 0),
          supabase.from("lit_acquisition_opportunities").select("id,email,contact_name,company_name,title,stage,source_provider,stage_changed_at,created_at").gte("created_at", since).order("stage_changed_at", { ascending: false }).limit(500),
          supabase.from("lit_lemlist_campaigns").select("id,name,status,audience_segment,lemlist_campaign_id,last_synced_at,stats,metadata,created_at").order("created_at", { ascending: false }).limit(20),
          supabase.from("lit_contact_enrichment_jobs").select("id,provider,status,source_context,workflows,created_at,submitted_at").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
        ]);
        if (cancelled) return;
        if (oppRes.error) throw new Error(oppRes.error.message);
        if (campaignRes.error) throw new Error(campaignRes.error.message);
        if (jobRes.error) throw new Error(jobRes.error.message);
        setEvents(emailRows);
        setLi(liAnalytics);
        setLiNotConfigured(liAnalytics === null);
        setLiLeadCount(linkedInLeads);
        setOpportunities((oppRes.data || []) as OpportunityRow[]);
        setLemlistCampaigns((campaignRes.data || []) as LemlistCampaignRow[]);
        setEnrichmentJobs((jobRes.data || []) as EnrichmentJobRow[]);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load marketing analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [days, since, refreshKey]);

  const kpis = useMemo(() => computeKpis(events), [events]);
  const daily = useMemo(() => computeDailyVolume(events), [events]);
  const stageCounts = useMemo(() => {
    const out = new Map<AcquisitionStage, number>();
    opportunities.forEach((o) => out.set(o.stage, (out.get(o.stage) || 0) + 1));
    return out;
  }, [opportunities]);
  const lemlistEvents = opportunities.filter((o) => o.source_provider === "lemlist").length;
  const latestCampaign = lemlistCampaigns[0] || null;

  return (
    <div className="min-h-screen bg-[#F4F6FB]" style={{ fontFamily: fontBody }}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-600"><BarChart3 className="h-4 w-4" /><span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: fontDisplay }}>Admin marketing analytics</span></div>
            <h1 className="mt-1.5 text-[28px] font-bold tracking-[-0.02em] text-slate-950" style={{ fontFamily: fontDisplay }}>Customer acquisition command center</h1>
            <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-slate-500">A unified view of marketing email, LinkedIn, LIT enrichment, and the opportunity funnel. This page is admin-only.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              {RANGE_OPTS.map((r) => <button key={r.id} type="button" onClick={() => setRange(r.id)} className={`h-7 rounded-md px-3 text-[12.5px] font-semibold transition ${r.id === range ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`} style={{ fontFamily: fontDisplay }}>{r.label}</button>)}
            </div>
            <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60" style={{ fontFamily: fontDisplay }}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button>
          </div>
        </header>

        {err && <ErrorBanner message={err} />}

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="p-6">
              <div className="flex items-center gap-2 text-cyan-200"><Target className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Opportunity flow</span></div>
              <h2 className="mt-2 text-2xl font-bold" style={{ fontFamily: fontDisplay }}>From prospect to customer</h2>
              <p className="mt-1 text-sm text-slate-300">Outbound campaign engagement and LIT enrichment activity roll into one acquisition pipeline.</p>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
                {STAGES.map((stage) => <FunnelTile key={stage.key} label={stage.label} value={stageCounts.get(stage.key) || 0} />)}
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/5 p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-2 text-cyan-200"><Sparkles className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">LIT enrichment</span></div>
              <div className="mt-3 text-3xl font-bold tabular-nums">{fmtInt(lemlistEvents)}</div>
              <p className="mt-1 text-sm text-slate-300">Enrichment-sourced opportunities in this window</p>
              <div className="mt-4 rounded-lg border border-white/10 bg-white/10 p-3 text-sm">
                <div className="font-semibold">{latestCampaign?.name || "No acquisition campaign found"}</div>
                {latestCampaign && <div className="mt-1 text-slate-300">Status: {latestCampaign.status} · Last sync {fmtRelative(latestCampaign.last_synced_at)}</div>}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Sent" value={fmtInt(kpis.sent)} icon={Send} tone="slate" />
          <KpiCard label="Delivered" value={fmtInt(kpis.delivered)} sub={`${fmtPct(kpis.sent ? kpis.delivered / kpis.sent : 0)} of sent`} icon={MailCheck} tone="blue" />
          <KpiCard label="Open rate" value={fmtPct(kpis.openRate)} sub={`${fmtInt(kpis.uniqueOpens)} opens`} icon={MailOpen} tone="emerald" />
          <KpiCard label="Click rate" value={fmtPct(kpis.clickRate)} sub={`${fmtInt(kpis.uniqueClicks)} clicks`} icon={MousePointerClick} tone="indigo" />
          <KpiCard label="LinkedIn leads" value={fmtInt(liLeadCount || 0)} sub={liNotConfigured ? "Windsor not configured" : `${days}d attribution`} icon={Linkedin} tone="blue" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Recent opportunities" subtitle="Latest stage changes across acquisition sources">
              <Table rows={opportunities.slice(0, 12)} />
            </Card>
            <Card title="Daily email activity" subtitle="Unique sent, opened, and clicked events">
              <DailyBars data={daily} loading={loading} />
            </Card>
          </div>
          <div className="space-y-6">
            <Card title="Enrichment jobs" subtitle="LIT enrichment activity">
              <JobList jobs={enrichmentJobs} />
            </Card>
            <Card title="LinkedIn performance" subtitle={`Last ${days} days`}>
              <LinkedInSummary data={li} notConfigured={liNotConfigured} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="mt-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4" />{message}</div>;
}

function FunnelTile({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-white/10 bg-white/10 p-3"><div className="text-2xl font-bold tabular-nums">{fmtInt(value)}</div><div className="mt-1 text-[11px] uppercase tracking-wide text-slate-300">{label}</div></div>;
}

function KpiCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }>; tone: "slate" | "blue" | "emerald" | "indigo" }) {
  const colors = { slate: "text-slate-600 bg-slate-100", blue: "text-blue-700 bg-blue-50", emerald: "text-emerald-700 bg-emerald-50", indigo: "text-indigo-700 bg-indigo-50" };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><div className={`flex h-6 w-6 items-center justify-center rounded-md ${colors[tone]}`}><Icon className="h-3.5 w-3.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500" style={{ fontFamily: fontDisplay }}>{label}</span></div><div className="mt-2 text-[26px] font-bold text-slate-950" style={{ fontFamily: fontDisplay }}>{value}</div>{sub && <div className="text-[11.5px] text-slate-400">{sub}</div>}</div>;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 px-5 py-4"><h2 className="text-[14.5px] font-bold text-slate-900" style={{ fontFamily: fontDisplay }}>{title}</h2>{subtitle && <p className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>}</header>{children}</section>;
}

function Table({ rows }: { rows: OpportunityRow[] }) {
  if (!rows.length) return <Empty title="No opportunities yet" text="Events will appear here as prospects engage, reply, book meetings, and convert." />;
  return <div className="overflow-x-auto"><table className="w-full"><thead><tr><Th>Contact</Th><Th>Company</Th><Th>Stage</Th><Th>Source</Th><Th align="right">Updated</Th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50"><Td><div className="font-semibold text-slate-900">{row.contact_name || row.email || "Unknown"}</div><div className="text-xs text-slate-500">{row.title || row.email}</div></Td><Td>{row.company_name || "-"}</Td><Td><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold capitalize text-blue-700">{row.stage.replace(/_/g, " ")}</span></Td><Td>{row.source_provider ? "LIT" : "Direct"}</Td><Td align="right">{fmtRelative(row.stage_changed_at)}</Td></tr>)}</tbody></table></div>;
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className={`px-4 py-3 text-[13px] text-slate-700 ${align === "right" ? "text-right tabular-nums" : ""}`}>{children}</td>;
}

function DailyBars({ data, loading }: { data: Array<{ day: string; sent: number; opened: number; clicked: number }>; loading: boolean }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.sent, d.opened, d.clicked)));
  if (loading && !data.length) return <div className="p-8 text-center text-sm text-slate-400">Loading...</div>;
  if (!data.length) return <Empty title="No email activity" text="Resend webhook events populate this chart." />;
  return <div className="px-4 pb-5 pt-4"><div className="flex h-40 items-end gap-1">{data.map((d) => <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${d.day}: ${d.sent} sent, ${d.opened} opened, ${d.clicked} clicked`}><div className="w-full max-w-[14px] rounded-t bg-slate-300" style={{ height: `${(d.sent / max) * 100}%` }} /><div className="w-full max-w-[14px] rounded-t bg-emerald-400" style={{ height: `${(d.opened / max) * 100}%` }} /><div className="w-full max-w-[14px] rounded-t bg-indigo-500" style={{ height: `${(d.clicked / max) * 100}%` }} /></div>)}</div><div className="mt-4 flex justify-center gap-4 text-xs text-slate-500"><span>Sent</span><span>Opened</span><span>Clicked</span></div></div>;
}

function JobList({ jobs }: { jobs: EnrichmentJobRow[] }) {
  if (!jobs.length) return <Empty title="No enrichment jobs" text="LIT enrichment submissions will appear here." />;
  return <ul className="divide-y divide-slate-100">{jobs.map((job) => <li key={job.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">LIT enrichment</div><div className="text-xs text-slate-500">{job.source_context} · {(job.workflows || []).join(", ")}</div></div><div className="text-right"><div className="text-xs font-semibold capitalize text-slate-700">{job.status}</div><div className="text-[11px] text-slate-400" style={{ fontFamily: fontMono }}>{fmtRelative(job.created_at)}</div></div></div></li>)}</ul>;
}

function LinkedInSummary({ data, notConfigured }: { data: LinkedInAnalyticsResponse | null; notConfigured: boolean }) {
  if (notConfigured) return <Empty title="LinkedIn analytics not configured" text="Set Windsor.ai to pull LinkedIn Ads and Organic data." />;
  if (!data) return <Empty title="No LinkedIn data" text="No LinkedIn response was available for this range." />;
  return <div className="grid grid-cols-2 gap-3 p-5"><SmallMetric label="Ad spend" value={`$${Math.round(data.ads.spend).toLocaleString()}`} /><SmallMetric label="Ad clicks" value={fmtInt(data.ads.clicks)} /><SmallMetric label="Followers" value={fmtInt(data.organic.followers)} /><SmallMetric label="Post impressions" value={fmtInt(data.organic.post_impressions)} /></div>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-950">{value}</div></div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="px-5 py-10 text-center"><BriefcaseBusiness className="mx-auto mb-3 h-9 w-9 text-slate-300" /><div className="text-sm font-semibold text-slate-900">{title}</div><div className="mx-auto mt-1 max-w-md text-xs text-slate-500">{text}</div></div>;
}
