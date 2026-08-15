"use client";

/**
 * Lead-CRM Phase 4 — Reports tab.
 *
 * Lifecycle reporting (funnel · by source · by rep · velocity · won/lost) plus
 * the HYGIENE surfaces (duplicate review + merge) and the ATTIO MIGRATION panel
 * (import an Attio export + the cutover toggle), all platform-admin-gated where
 * appropriate. Reuses the app's KPI/deck visual language (recharts, soft slate
 * cards) but self-contained so the standalone workspace never imports the admin
 * deck.
 *
 * asText() guards EVERY rendered dynamic value (React #31 safety) — sources,
 * rep names, reasons, audit rows, import counts all flow through it.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Users, TrendingUp, Timer, Trophy, GitMerge, RefreshCw, Loader2,
  UploadCloud, ShieldCheck, AlertTriangle, ClipboardList, Power,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip as ChartTooltip, CartesianGrid, Cell,
} from "recharts";
import { useLeadCrmAccess } from "@/hooks/useLeadCrmAccess";
import {
  reportFunnel, reportBySource, reportByRep, reportVelocity, reportWonLost, reportAudit,
  findDuplicates, mergeLeads, getAttioSyncStatus, setAttioSync, importAttio,
  type FunnelReport, type SourceRow, type RepRow, type VelocityReport, type WonLostReport,
  type AuditRow, type DuplicateGroup, type AttioSyncStatus,
} from "@/api/leadCrm";
import { asText, textOr, formatDate, formatRelative, kindLabel, FONT_HEAD, FONT_BODY } from "./leadCrmFormat";

type Days = 7 | 30 | 90;

const STAGE_COLORS = ["#94a3b8", "#38bdf8", "#818cf8", "#f59e0b", "#22c55e"];

export default function ReportsPage() {
  const { isPlatformAdmin } = useLeadCrmAccess();
  const [days, setDays] = useState<Days>(30);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "20px 22px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 800, color: "#0F172A" }}>Reports</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 2 }}>
            Lifecycle performance across the pipeline. Excludes internal &amp; suspended users.
          </div>
        </div>
        <DaysFilter days={days} onChange={setDays} />
      </div>

      <FunnelSection days={days} />
      <div style={{ height: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 18 }}>
        <SourceSection days={days} />
        <WonLostSection days={days} />
      </div>
      <div style={{ height: 18 }} />
      <VelocitySection days={days} />
      <div style={{ height: 18 }} />
      <RepSection days={days} />

      <div style={{ height: 30 }} />
      <SectionHeader icon={GitMerge} title="Hygiene" subtitle="Find and merge duplicate leads — merges are soft-deletes (no data loss)." />
      <DuplicatesSection />

      {isPlatformAdmin ? (
        <>
          <div style={{ height: 30 }} />
          <SectionHeader icon={UploadCloud} title="Attio migration" subtitle="Move your book of business off Attio, then flip off the push once satisfied." />
          <AttioMigrationSection />

          <div style={{ height: 30 }} />
          <SectionHeader icon={ClipboardList} title="Audit trail" subtitle="Every human action across all leads — the accountability layer." />
          <AuditSection days={days} />
        </>
      ) : null}
    </div>
  );
}

// ── Shared chrome ────────────────────────────────────────────────────────────

function DaysFilter({ days, onChange }: { days: Days; onChange: (d: Days) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, padding: 3 }}>
      {([7, 30, 90] as Days[]).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          style={{
            padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
            background: days === d ? "#0F172A" : "transparent",
            color: days === d ? "#FFFFFF" : "#64748b",
            fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700,
          }}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

function DeckCard({ title, subtitle, right, children }: {
  title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 16, padding: 18, boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 14.5, fontWeight: 700, color: "#0F172A" }}>{asText(title)}</div>
          {subtitle ? <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{asText(subtitle)}</div> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, hint, icon: Icon, tone = "blue" }: {
  label: string; value: React.ReactNode; hint?: string; icon: any; tone?: string;
}) {
  const tones: Record<string, string> = {
    blue: "#2563EB", cyan: "#0891B2", violet: "#7C3AED", amber: "#B45309", emerald: "#047857", rose: "#E11D48", slate: "#475569",
  };
  const c = tones[tone] ?? tones.blue;
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${c}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon style={{ width: 15, height: 15, color: c }} />
        </div>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {asText(label)}
        </span>
      </div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 800, color: "#0F172A", lineHeight: 1.1 }}>{value}</div>
      {hint ? <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: "#94a3b8", marginTop: 3 }}>{asText(hint)}</div> : null}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon style={{ width: 17, height: 17, color: "#FFFFFF" }} />
      </div>
      <div>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{asText(title)}</div>
        {subtitle ? <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8" }}>{asText(subtitle)}</div> : null}
      </div>
    </div>
  );
}

function Empty({ label = "No data for this period yet." }: { label?: string }) {
  return (
    <div style={{ padding: "28px 12px", textAlign: "center", fontFamily: FONT_BODY, fontSize: 13, color: "#94a3b8" }}>
      {asText(label)}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ padding: 28, display: "flex", justifyContent: "center" }}>
      <Loader2 style={{ width: 20, height: 20, color: "#94a3b8", animation: "spin 1s linear infinite" }} />
    </div>
  );
}

const pct = (v: number | null): string => (v == null ? "—" : `${asText(v)}%`);

// ── Funnel ───────────────────────────────────────────────────────────────────

function FunnelSection({ days }: { days: Days }) {
  const [data, setData] = useState<FunnelReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    reportFunnel(days).then((r) => { if (live) { setData(r); setLoading(false); } });
    return () => { live = false; };
  }, [days]);

  const chart = useMemo(() => (data?.steps ?? []).map((s) => ({ label: s.label, count: s.count })), [data]);
  const conv = data?.conversions;

  return (
    <DeckCard title="Lifecycle funnel" subtitle={`Leads → Subscriber over the last ${days} days`}>
      {loading ? <Spinner /> : (data && data.steps.length > 0) ? (
        <>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <ChartTooltip contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
                  {chart.map((_, i) => <Cell key={i} fill={STAGE_COLORS[i] ?? "#3B82F6"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginTop: 14 }}>
            <ConvChip label="Lead → Contacted" v={conv?.leads_to_contacted ?? null} />
            <ConvChip label="Contacted → Engaged" v={conv?.contacted_to_engaged ?? null} />
            <ConvChip label="Engaged → Trial" v={conv?.engaged_to_trial ?? null} />
            <ConvChip label="Trial → Subscriber" v={conv?.trial_to_subscriber ?? null} />
            <ConvChip label="Lead → Subscriber" v={conv?.leads_to_subscriber ?? null} strong />
          </div>
          <div style={{ marginTop: 10, fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8" }}>
            {asText(data.lost)} lost in period.
          </div>
        </>
      ) : <Empty />}
    </DeckCard>
  );
}

function ConvChip({ label, v, strong }: { label: string; v: number | null; strong?: boolean }) {
  return (
    <div style={{ background: strong ? "#ECFDF5" : "#F8FAFC", border: `1px solid ${strong ? "#A7F3D0" : "#E5E7EB"}`, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: "#64748b" }}>{asText(label)}</div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 800, color: strong ? "#047857" : "#0F172A" }}>{pct(v)}</div>
    </div>
  );
}

// ── By source ────────────────────────────────────────────────────────────────

function SourceSection({ days }: { days: Days }) {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true; setLoading(true);
    reportBySource(days).then((r) => { if (live) { setRows(r); setLoading(false); } });
    return () => { live = false; };
  }, [days]);

  return (
    <DeckCard title="By source" subtitle="Which channel produces subscribers">
      {loading ? <Spinner /> : rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_BODY, fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={thStyle}>Source</th><th style={thNum}>Leads</th><th style={thNum}>Trials</th><th style={thNum}>Subs</th><th style={thNum}>Conv</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                  <td style={tdStyle}>{textOr(r.source, "unknown")}</td>
                  <td style={tdNum}>{asText(r.leads)}</td>
                  <td style={tdNum}>{asText(r.trials)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: "#047857" }}>{asText(r.subscribers)}</td>
                  <td style={tdNum}>{pct(r.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty />}
    </DeckCard>
  );
}

// ── Won / Lost ───────────────────────────────────────────────────────────────

function WonLostSection({ days }: { days: Days }) {
  const [data, setData] = useState<WonLostReport | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true; setLoading(true);
    reportWonLost(days).then((r) => { if (live) { setData(r); setLoading(false); } });
    return () => { live = false; };
  }, [days]);

  return (
    <DeckCard title="Won vs lost" subtitle="Outcomes + why leads were lost">
      {loading ? <Spinner /> : data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <KpiCard label="Subscribers" value={asText(data.won)} icon={Trophy} tone="emerald" />
            <KpiCard label="Lost" value={asText(data.lost)} icon={AlertTriangle} tone="rose" />
          </div>
          {data.lost_reasons.length > 0 ? (
            <div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Lost reasons</div>
              {data.lost_reasons.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: i ? "1px solid #F1F5F9" : "none", fontFamily: FONT_BODY, fontSize: 12.5 }}>
                  <span style={{ color: "#334155" }}>{textOr(r.reason, "Unspecified")}</span>
                  <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, color: "#0F172A" }}>{asText(r.count)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8" }}>No lost reasons captured this period.</div>
          )}
        </>
      ) : <Empty />}
    </DeckCard>
  );
}

// ── Velocity ─────────────────────────────────────────────────────────────────

function VelocitySection({ days }: { days: Days }) {
  const [data, setData] = useState<VelocityReport | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true; setLoading(true);
    reportVelocity(days).then((r) => { if (live) { setData(r); setLoading(false); } });
    return () => { live = false; };
  }, [days]);

  const series = data?.series ?? [];
  const hasSeries = series.some((p) => p.created > 0 || p.converted > 0);

  return (
    <DeckCard title="Velocity" subtitle="Time-to-milestone + created vs converted over time">
      {loading ? <Spinner /> : data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
            <KpiCard
              label="Avg days lead → trial"
              value={data.avg_days_lead_to_trial == null ? "—" : asText(data.avg_days_lead_to_trial)}
              icon={Timer} tone="amber"
            />
            <KpiCard
              label="Avg days trial → subscriber"
              value={data.avg_days_trial_to_subscriber == null ? "—" : asText(data.avg_days_trial_to_subscriber)}
              icon={TrendingUp} tone="emerald"
            />
          </div>
          {hasSeries ? (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <ChartTooltip contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 12 }} />
                  <Line type="monotone" dataKey="created" stroke="#3B82F6" strokeWidth={2} dot={false} name="Created" />
                  <Line type="monotone" dataKey="converted" stroke="#22C55E" strokeWidth={2} dot={false} name="Converted" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty label="No leads created or converted in this window." />}
        </>
      ) : <Empty />}
    </DeckCard>
  );
}

// ── By rep ───────────────────────────────────────────────────────────────────

function RepSection({ days }: { days: Days }) {
  const [rows, setRows] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true; setLoading(true);
    reportByRep(days).then((r) => { if (live) { setRows(r); setLoading(false); } });
    return () => { live = false; };
  }, [days]);

  return (
    <DeckCard title="Team performance" subtitle="Per rep — assigned, worked, trials, subscribers, tasks">
      {loading ? <Spinner /> : rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_BODY, fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={thStyle}>Rep</th><th style={thNum}>Assigned</th><th style={thNum}>Worked</th>
                <th style={thNum}>Trials</th><th style={thNum}>Subs</th><th style={thNum}>Open</th><th style={thNum}>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={asText(r.user_id)} style={{ borderTop: "1px solid #F1F5F9" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: "#0F172A" }}>{textOr(r.name)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{textOr(r.email, "")}</div>
                  </td>
                  <td style={tdNum}>{asText(r.assigned)}</td>
                  <td style={tdNum}>{asText(r.worked)}</td>
                  <td style={tdNum}>{asText(r.trials)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: "#047857" }}>{asText(r.subscribers)}</td>
                  <td style={tdNum}>{asText(r.open_tasks)}</td>
                  <td style={{ ...tdNum, color: r.overdue_tasks > 0 ? "#E11D48" : "#94a3b8", fontWeight: r.overdue_tasks > 0 ? 700 : 400 }}>
                    {asText(r.overdue_tasks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty label="No team members with activity yet." />}
    </DeckCard>
  );
}

// ── Duplicates / merge ───────────────────────────────────────────────────────

function DuplicatesSection() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    findDuplicates().then((g) => { setGroups(g); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const doMerge = async (primaryId: string, dupId: string) => {
    setBusy(dupId); setMsg(null);
    try {
      const res = await mergeLeads(primaryId, dupId);
      if (res.ok) { setMsg("Merged. Activity, tasks and tags moved to the primary; the duplicate was soft-deleted."); load(); }
      else setMsg(`Could not merge: ${asText(res.reason ?? "unknown")}`);
    } catch (e: any) {
      setMsg(`Merge failed: ${asText(e?.message ?? "error")}`);
    } finally {
      setBusy(null);
    }
  };

  const keyLabel = (kind: string) =>
    kind === "email" ? "Same email" : kind === "company_id" ? "Same company" : kind === "company_name" ? "Same company name" : kind;

  return (
    <DeckCard
      title="Duplicate leads"
      subtitle="Leads sharing an email or company. Pick the primary to keep; the other is soft-deleted."
      right={<button onClick={load} style={ghostBtn}><RefreshCw style={{ width: 13, height: 13 }} /> Refresh</button>}
    >
      {msg ? (
        <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontFamily: FONT_BODY, fontSize: 12.5, color: "#0369A1" }}>
          {asText(msg)}
        </div>
      ) : null}
      {loading ? <Spinner /> : groups.length === 0 ? (
        <Empty label="No duplicates found. The book is clean." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g, gi) => {
            const primary = g.leads[0];
            return (
              <div key={gi} style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: 12, background: "#F8FAFC" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: "#7C3AED", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 999, padding: "2px 9px" }}>
                    {asText(keyLabel(g.key_kind))}
                  </span>
                  <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#64748b" }}>{textOr(g.key_val, "")} · {asText(g.count)} leads</span>
                </div>
                {g.leads.map((l, li) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 0", borderTop: li ? "1px solid #E5E7EB" : "none" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                        {textOr(l.full_name, textOr(l.company_name, "Lead"))}
                        {li === 0 ? <span style={{ marginLeft: 8, fontSize: 10.5, color: "#047857", fontWeight: 700 }}>PRIMARY</span> : null}
                      </div>
                      <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: "#94a3b8" }}>
                        {textOr(l.company_name, "")} · score {asText(l.lead_score ?? 0)} · last {formatRelative(l.last_activity_at)}
                      </div>
                    </div>
                    {li > 0 && primary ? (
                      <button
                        onClick={() => doMerge(primary.id, l.id)}
                        disabled={busy === l.id}
                        style={{ ...primaryBtn, opacity: busy === l.id ? 0.6 : 1 }}
                      >
                        {busy === l.id ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <GitMerge style={{ width: 13, height: 13 }} />}
                        Merge into primary
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </DeckCard>
  );
}

// ── Attio migration + cutover ────────────────────────────────────────────────

function AttioMigrationSection() {
  const [status, setStatus] = useState<AttioSyncStatus | null>(null);
  const [raw, setRaw] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => { getAttioSyncStatus().then(setStatus); }, []);

  const runImport = async () => {
    setResult(null);
    let records: unknown[];
    try {
      const parsed = JSON.parse(raw.trim());
      records = Array.isArray(parsed) ? parsed : (Array.isArray((parsed as any)?.data) ? (parsed as any).data : [parsed]);
    } catch {
      setResult("That doesn't look like valid JSON. Paste an Attio export — a JSON array of records.");
      return;
    }
    if (records.length === 0) { setResult("The array is empty — nothing to import."); return; }
    setImporting(true);
    try {
      const res = await importAttio({ records });
      if (res.ok) {
        setResult(`Imported ${asText(res.total ?? 0)} records — ${asText(res.created ?? 0)} created, ${asText(res.updated ?? 0)} updated, ${asText(res.skipped ?? 0)} skipped, ${asText(res.notes_added ?? 0)} notes.${(res.failed ?? 0) > 0 ? ` ${asText(res.failed)} failed.` : ""}`);
      } else {
        setResult(`Import failed: ${asText(res.error ?? "unknown error")}`);
      }
    } catch (e: any) {
      setResult(`Import failed: ${asText(e?.message ?? "error")}`);
    } finally {
      setImporting(false);
    }
  };

  const toggle = async () => {
    if (!status) return;
    const next = !status.enabled;
    if (next === false && !window.confirm("Turn OFF the push to Attio? LIT will stop syncing contacts, activity and stalled-deal tasks to Attio. You can turn it back on any time.")) return;
    setToggling(true);
    try {
      const res = await setAttioSync(next);
      setStatus((s) => (s ? { ...s, enabled: res.enabled } : s));
    } catch (e: any) {
      setResult(`Could not change the sync flag: ${asText(e?.message ?? "error")}`);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18 }}>
      <DeckCard title="Import from Attio" subtitle="Paste an Attio export (JSON array of people/companies/deals).">
        <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#64748b", marginBottom: 8, lineHeight: 1.6 }}>
          In Attio, export your People / Companies / Deals to JSON, then paste the array here. Each record maps to a lead —
          deduped on email then company. Notes import onto the lead timeline. Safe to re-run (idempotent).
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='[{ "email": "jane@acme.com", "name": "Jane Doe", "company": "Acme", "stage": "Trial Started", "notes": ["Called 3/4"] }]'
          rows={7}
          style={{ width: "100%", boxSizing: "border-box", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, padding: 10, border: "1px solid #E5E7EB", borderRadius: 10, resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={runImport} disabled={importing || !raw.trim()} style={{ ...primaryBtn, opacity: importing || !raw.trim() ? 0.6 : 1 }}>
            {importing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <UploadCloud style={{ width: 14, height: 14 }} />}
            Import
          </button>
        </div>
        {result ? (
          <div style={{ marginTop: 10, background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 10, padding: "8px 12px", fontFamily: FONT_BODY, fontSize: 12.5, color: "#334155" }}>
            {asText(result)}
          </div>
        ) : null}
      </DeckCard>

      <DeckCard title="Attio push (cutover)" subtitle="Once migrated, turn off LIT's push to Attio.">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: status?.enabled ? "#ECFDF5" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {status?.enabled ? <ShieldCheck style={{ width: 20, height: 20, color: "#047857" }} /> : <Power style={{ width: 20, height: 20, color: "#94a3b8" }} />}
          </div>
          <div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
              Attio sync is {status == null ? "…" : status.enabled ? "ON" : "OFF"}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#94a3b8" }}>
              {status?.updated_at ? `Changed ${formatDate(status.updated_at)}` : "Default — pushing to Attio"}
            </div>
          </div>
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#64748b", lineHeight: 1.6, marginBottom: 12 }}>
          When OFF, LIT stops pushing to Attio: contact/company sync, activity mirror, and the stalled-deal cron all no-op.
          The Attio functions still run but exit immediately — flip this back ON to resume.
        </div>
        <button onClick={toggle} disabled={toggling || status == null} style={{ ...(status?.enabled ? dangerBtn : primaryBtn), opacity: toggling || status == null ? 0.6 : 1 }}>
          {toggling ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Power style={{ width: 14, height: 14 }} />}
          {status?.enabled ? "Turn off Attio push" : "Turn Attio push back on"}
        </button>
      </DeckCard>
    </div>
  );
}

// ── Audit ────────────────────────────────────────────────────────────────────

function AuditSection({ days }: { days: Days }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true; setLoading(true);
    reportAudit(days, 200).then((r) => { if (live) { setRows(r); setLoading(false); } });
    return () => { live = false; };
  }, [days]);

  return (
    <DeckCard title="Recent actions" subtitle={`Who did what across all leads (last ${days} days)`}>
      {loading ? <Spinner /> : rows.length > 0 ? (
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid #F1F5F9" : "none" }}>
              <div style={{ minWidth: 96, fontFamily: FONT_BODY, fontSize: 11, color: "#94a3b8" }}>{formatRelative(r.occurred_at)}</div>
              <div style={{ flex: 1, minWidth: 0, fontFamily: FONT_BODY, fontSize: 12.5, color: "#334155" }}>
                <span style={{ fontWeight: 600, color: "#0F172A" }}>{textOr(r.actor_name, "Someone")}</span>
                {" "}
                <span>{asText(kindLabel(r.kind)).toLowerCase() || asText(r.kind)}</span>
                {" · "}
                <span style={{ color: "#64748b" }}>{textOr(r.lead_label, "a lead")}</span>
              </div>
              <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: "#64748b", background: "#F1F5F9", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase" }}>
                {textOr(r.source, "system")}
              </span>
            </div>
          ))}
        </div>
      ) : <Empty label="No actions recorded this period." />}
    </DeckCard>
  );
}

// ── Shared table cell styles ─────────────────────────────────────────────────

const thStyle: React.CSSProperties = { padding: "6px 8px", fontWeight: 700 };
const thNum: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "8px 8px", color: "#334155" };
const tdNum: React.CSSProperties = { ...tdStyle, textAlign: "right" };

const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 9,
  border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#475569",
  fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10,
  border: "none", background: "#0F172A", color: "#FFFFFF",
  fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
};
const dangerBtn: React.CSSProperties = {
  ...primaryBtn, background: "#E11D48",
};
