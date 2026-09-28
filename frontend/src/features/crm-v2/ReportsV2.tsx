/**
 * ReportsV2 — Command Center → Reports (handoff README §Reports).
 * Layout A (Forecast): forecast-by-close-month stacked columns (commit =
 * Negotiation-like, best = Quoted-like), stage conversion computed from
 * REAL lit_deal_activity stage_change history (card hidden when there are
 * no transitions), lost reasons from real lost_reason (hidden at zero).
 * Layout B (Pipeline health): source cards, aging heatmap, service win
 * rates — win rates render "Not enough closed deals yet" below 5 closed
 * deals in 90 days. The spec's quota-attainment card is NOT built (no
 * quota data exists) and nothing is rendered in its place.
 * Layout persisted in localStorage `lit-crm-layout-reports`.
 */
import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarClock,
  Download,
  Flag,
  Handshake,
  Megaphone,
  Percent,
  Timer,
  TrendingUp,
  Trophy,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatMoney } from "@/features/crm/crmFormat";
import { useCrmV2Data, getLayoutPref, setLayoutPref } from "./data/useCrmV2Data";
import {
  selectForecastByMonth,
  selectStageConversion,
  selectLostReasons,
  selectSourceCards,
  selectAgingMatrix,
  selectServiceWinRates,
  commitStageIds,
  quotedStageIds,
  isOpenDeal,
  AGING_BUCKETS,
  MIN_CLOSED_FOR_RATE,
} from "./data/computeCrm";
import {
  CARD,
  Crm2Style,
  F_BODY,
  F_DISPLAY,
  F_MONO,
  KpiCard,
  LayoutSwitcher,
  OwnerAvatars,
  SegRow,
  SectionLabel,
  ghostBtnStyle,
} from "./ui";

const LAYOUT_KEY = "lit-crm-layout-reports";
const DAY = 86_400_000;

const SOURCE_ICON: Record<string, { Icon: LucideIcon; color: string; bg: string }> = {
  signal: { Icon: Activity, color: "#0891b2", bg: "rgba(0,240,255,0.12)" },
  outbound: { Icon: Megaphone, color: "#7c3aed", bg: "rgba(139,92,246,0.12)" },
  manual: { Icon: User, color: "#64748b", bg: "#F1F5F9" },
};

export interface ReportsV2Props {
  viewAsUserId?: string;
}

export default function ReportsV2({ viewAsUserId = "" }: ReportsV2Props) {
  const { deals, stages, members, stageChanges, loading } = useCrmV2Data(viewAsUserId);
  const [layout, setLayout] = useState<"A" | "B">(() => getLayoutPref(LAYOUT_KEY, "A"));
  const [period, setPeriod] = useState("q");
  const [ownerFilter, setOwnerFilter] = useState("");

  const now = Date.now();
  const setLayoutBoth = (v: "A" | "B") => {
    setLayout(v);
    setLayoutPref(LAYOUT_KEY, v);
  };

  const mine = useMemo(
    () => (ownerFilter ? deals.filter((d) => d.owner_user_id === ownerFilter) : deals),
    [deals, ownerFilter],
  );

  const periodStart = useMemo(() => {
    const n = new Date(now);
    if (period === "90") return now - 90 * DAY;
    if (period === "ytd") return new Date(n.getFullYear(), 0, 1).getTime();
    return new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1).getTime(); // quarter
  }, [period, now]);

  // ── KPIs (all real; no quota, no invented benchmarks) ────────────────
  const kpis = useMemo(() => {
    const commitIds = commitStageIds(stages);
    const quotedIds = quotedStageIds(stages);
    const open = mine.filter(isOpenDeal);
    const won = mine.filter(
      (d) => d.status === "won" && d.closed_at && new Date(d.closed_at).getTime() >= periodStart,
    );
    const closed90 = mine.filter(
      (d) => (d.status === "won" || d.status === "lost") && d.closed_at && new Date(d.closed_at).getTime() >= now - 90 * DAY,
    );
    const wins90 = closed90.filter((d) => d.status === "won").length;
    const cycles = mine
      .filter((d) => d.status === "won" && d.closed_at && d.created_at)
      .map((d) => (new Date(d.closed_at!).getTime() - new Date(d.created_at).getTime()) / DAY)
      .filter((x) => Number.isFinite(x) && x >= 0);
    return {
      wonValue: won.reduce((s, d) => s + (Number(d.value_amount) || 0), 0),
      wonCount: won.length,
      commit: open.filter((d) => commitIds.has(d.stage_id)).reduce((s, d) => s + (Number(d.value_amount) || 0), 0),
      best: open
        .filter((d) => commitIds.has(d.stage_id) || quotedIds.has(d.stage_id))
        .reduce((s, d) => s + (Number(d.value_amount) || 0), 0),
      winRate: closed90.length >= MIN_CLOSED_FOR_RATE ? wins90 / closed90.length : null,
      closed90: closed90.length,
      cycleDays: cycles.length ? Math.round(cycles.reduce((s, x) => s + x, 0) / cycles.length) : null,
    };
  }, [mine, stages, periodStart, now]);

  const months = useMemo(() => selectForecastByMonth(mine, stages).filter((m) => m.key !== "none"), [mine, stages]);
  const conversion = useMemo(() => selectStageConversion(stageChanges, stages), [stageChanges, stages]);
  const lostReasons = useMemo(() => selectLostReasons(mine), [mine]);
  const sources = useMemo(() => selectSourceCards(mine, now), [mine, now]);
  const aging = useMemo(() => selectAgingMatrix(mine, stages, now), [mine, stages, now]);
  const services = useMemo(() => selectServiceWinRates(mine, now), [mine, now]);

  const monthMax = Math.max(1, ...months.map((m) => m.total));
  const lostMax = Math.max(1, ...lostReasons.map((l) => l.count));
  const agingMax = Math.max(1, ...aging.flatMap((r) => r.cells));

  const periodLabel = period === "90" ? "last 90 days" : period === "ytd" ? "year to date" : "this quarter";

  return (
    <div className="crm2-pad" style={{ paddingBottom: 96 }}>
      <Crm2Style />
      <div className="crm2-kpirow" style={{ marginTop: 20 }}>
        <KpiCard label={`Won · ${periodLabel}`} icon={Trophy} value={formatMoney(kpis.wonValue)} delta={String(kpis.wonCount)} deltaColor="#059669" sub="closed won" />
        <KpiCard label="Commit" icon={Handshake} value={formatMoney(kpis.commit)} sub="in Negotiation" />
        <KpiCard label="Best case" icon={TrendingUp} value={formatMoney(kpis.best)} sub="commit + quoted" />
        <KpiCard
          label="Win rate"
          icon={Percent}
          value={kpis.winRate != null ? `${Math.round(kpis.winRate * 100)}%` : "—"}
          delta={kpis.winRate != null ? String(kpis.closed90) : undefined}
          sub={kpis.winRate != null ? "closed in 90 days" : "Not enough closed deals yet"}
        />
        <KpiCard label="Sales cycle" icon={Timer} value={kpis.cycleDays != null ? `${kpis.cycleDays}d` : "—"} sub={kpis.cycleDays != null ? "created to won" : "no won deals yet"} />
      </div>

      <div className="crm2-toolbar" style={{ marginTop: 16, marginLeft: -32, marginRight: -32, paddingLeft: 32, paddingRight: 32 }}>
        <SegRow
          items={[
            ["q", "This quarter"],
            ["90", "Last 90 days"],
            ["ytd", "Year to date"],
          ]}
          value={period}
          onChange={setPeriod}
        />
        <OwnerAvatars members={members} active={ownerFilter} onPick={setOwnerFilter} />
        <span style={{ flex: 1 }} />
        <button type="button" disabled title="Coming soon" style={{ ...ghostBtnStyle(), color: "#94a3b8", cursor: "default" }}>
          <CalendarClock size={14} /> Schedule report
        </button>
        <button type="button" disabled title="Coming soon" style={{ ...ghostBtnStyle(), color: "#94a3b8", cursor: "default" }}>
          <Download size={14} /> Export
        </button>
        <LayoutSwitcher options={[["A", "Forecast"], ["B", "Pipeline health"]]} value={layout} onChange={setLayoutBoth} />
      </div>

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", font: `400 14px ${F_BODY}`, color: "#64748b" }}>Loading reports…</div>
      ) : layout === "A" ? (
        /* ── Layout A · Forecast ──────────────────────────────────────── */
        <div className="crm2-repgrid" style={{ marginTop: 16 }}>
          {/* Forecast by close month */}
          <div style={{ ...CARD, padding: 18 }}>
            <SectionLabel icon={BarChart3}>Forecast by close month</SectionLabel>
            {months.length === 0 ? (
              <div style={{ padding: "28px 0", font: `400 13px ${F_BODY}`, color: "#64748b" }}>
                No open deals with an expected close date yet.
              </div>
            ) : (
              <>
                <div className="crm2-scroll-x" style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 230, marginTop: 16, paddingBottom: 4 }}>
                  {months.map((m) => {
                    const h = (v: number) => `${((v / monthMax) * 82).toFixed(1)}%`;
                    return (
                      <div key={m.key} style={{ flex: "1 0 72px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", minWidth: 72 }}>
                        <div style={{ font: `600 12px ${F_MONO}`, color: "#0F172A", marginBottom: 6 }}>{formatMoney(m.total)}</div>
                        <div style={{ width: "100%", maxWidth: 64, display: "flex", flexDirection: "column-reverse", height: "82%", justifyContent: "flex-start" }}>
                          <div className="crm2-bar" title={`Commit ${formatMoney(m.commit)}`} style={{ width: "100%", height: h(m.commit), background: "#1d4ed8", borderRadius: m.best || m.pipeline ? 0 : "6px 6px 0 0" }} />
                          <div className="crm2-bar" title={`Best case ${formatMoney(m.best)}`} style={{ width: "100%", height: h(m.best), background: "#60a5fa" }} />
                          <div className="crm2-bar" title={`Pipeline ${formatMoney(m.pipeline)}`} style={{ width: "100%", height: h(m.pipeline), background: "#dbeafe", borderRadius: "6px 6px 0 0" }} />
                        </div>
                        <div style={{ font: `600 11px ${F_DISPLAY}`, color: "#0F172A", marginTop: 8, whiteSpace: "nowrap" }}>{m.label}</div>
                        <div style={{ font: `500 10px ${F_MONO}`, color: "#64748b", whiteSpace: "nowrap" }}>{formatMoney(m.commit)} commit</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                  {([["Commit", "#1d4ed8"], ["Best case", "#60a5fa"], ["Pipeline", "#dbeafe"]] as const).map(([l, c]) => (
                    <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6, font: `500 11px ${F_BODY}`, color: "#64748b" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} /> {l}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Stage conversion — hidden when no transitions recorded */}
          {conversion.length > 0 && (
            <div style={{ ...CARD, padding: 18 }}>
              <SectionLabel icon={TrendingUp}>Stage conversion · last 90 days</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {conversion.map((c) => (
                  <div key={c.label} style={{ display: "grid", gridTemplateColumns: "minmax(120px,170px) 1fr 50px 70px", gap: 10, alignItems: "center" }}>
                    <span style={{ font: `600 12px ${F_BODY}`, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                    <span style={{ height: 10, borderRadius: 5, background: "#F1F5F9", overflow: "hidden" }}>
                      <span className="crm2-bar" style={{ display: "block", height: "100%", width: `${Math.round(c.rate * 100)}%`, background: "#3b82f6", borderRadius: 5 }} />
                    </span>
                    <span style={{ font: `600 12px ${F_MONO}`, color: "#0F172A", textAlign: "right" }}>{Math.round(c.rate * 100)}%</span>
                    <span style={{ font: `500 11px ${F_MONO}`, color: "#64748b", textAlign: "right" }}>{c.avgDays != null ? `${c.avgDays}d avg` : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lost reasons — hidden when zero lost deals */}
          {lostReasons.length > 0 && (
            <div style={{ ...CARD, padding: 18 }}>
              <SectionLabel icon={Flag} color="#be123c">Lost reasons</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {lostReasons.map((l) => (
                  <div key={l.label} style={{ display: "grid", gridTemplateColumns: "minmax(120px,170px) 1fr 50px", gap: 10, alignItems: "center" }}>
                    <span style={{ font: `600 12px ${F_BODY}`, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.label}</span>
                    <span style={{ height: 10, borderRadius: 5, background: "#F1F5F9", overflow: "hidden" }}>
                      <span className="crm2-bar" style={{ display: "block", height: "100%", width: `${Math.round((l.count / lostMax) * 100)}%`, background: "#fb7185", borderRadius: 5 }} />
                    </span>
                    <span style={{ font: `600 12px ${F_MONO}`, color: "#0F172A", textAlign: "right" }}>{l.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Layout B · Pipeline health ───────────────────────────────── */
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          {/* Source cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            {sources.map((s) => {
              const si = SOURCE_ICON[s.source] ?? SOURCE_ICON.manual;
              return (
                <div key={s.source} style={{ ...CARD, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", background: si.bg }}>
                      <si.Icon size={14} color={si.color} />
                    </span>
                    <span style={{ font: `600 13px ${F_DISPLAY}`, color: "#0F172A" }}>{s.label}</span>
                  </div>
                  <div style={{ font: `600 30px/1 ${F_MONO}`, letterSpacing: "-0.04em", color: "#0F172A", marginTop: 12 }}>{formatMoney(s.openValue)}</div>
                  <div style={{ font: `500 11px ${F_MONO}`, color: "#64748b", marginTop: 5 }}>
                    {s.openCount} open deal{s.openCount === 1 ? "" : "s"}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    {s.winRate != null ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", font: `500 11px ${F_MONO}`, color: "#64748b" }}>
                          <span>90-day win rate</span>
                          <span style={{ color: "#0F172A", fontWeight: 600 }}>{Math.round(s.winRate * 100)}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "#F1F5F9", marginTop: 5, overflow: "hidden" }}>
                          <div className="crm2-bar" style={{ height: "100%", width: `${Math.min(100, (s.winRate / 0.5) * 100)}%`, background: si.color, borderRadius: 3 }} />
                        </div>
                      </>
                    ) : (
                      <div style={{ font: `400 11px ${F_BODY}`, color: "#94a3b8" }}>Not enough closed deals yet</div>
                    )}
                  </div>
                </div>
              );
            })}
            {sources.length === 0 && (
              <div style={{ ...CARD, padding: 28, font: `400 13px ${F_BODY}`, color: "#64748b" }}>No deals yet.</div>
            )}
          </div>

          {/* Aging heatmap */}
          <div style={{ ...CARD, padding: 18 }}>
            <SectionLabel icon={Timer}>Deal aging · days since last touch</SectionLabel>
            <div className="crm2-scroll-x" style={{ marginTop: 14 }}>
              <table style={{ borderCollapse: "separate", borderSpacing: 6, minWidth: 420 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 110 }} />
                    {AGING_BUCKETS.map((b) => (
                      <th key={b.label} style={{ font: `600 10px ${F_DISPLAY}`, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", padding: "0 4px", textAlign: "center" }}>
                        {b.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aging.map((row) => (
                    <tr key={row.stage.id}>
                      <td style={{ font: `600 12px ${F_BODY}`, color: row.stage.color, paddingRight: 8, whiteSpace: "nowrap" }}>{row.stage.name}</td>
                      {row.cells.map((n, bi) => {
                        const norm = n / agingMax;
                        const bg = !n
                          ? "#F8FAFC"
                          : bi >= 2
                            ? `rgba(244,63,94,${Math.min(0.9, 0.12 + 0.4 * norm)})`
                            : `rgba(59,130,246,${Math.min(0.9, 0.08 + 0.35 * norm)})`;
                        return (
                          <td key={bi} style={{ width: 40, height: 40, minWidth: 40, borderRadius: 8, background: bg, textAlign: "center", font: `600 12px ${F_MONO}`, color: bi >= 2 ? "#9f1239" : "#1e3a8a" }}>
                            {n || ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ font: `400 11px ${F_BODY}`, color: "#94a3b8", marginTop: 10 }}>
              Red cells break the 14-day rule and are flagged stale on the board.
            </div>
          </div>

          {/* Win rate by service */}
          {services.length > 0 && (
            <div style={{ ...CARD, padding: 18 }}>
              <SectionLabel icon={Percent}>Win rate by service · last 90 days</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {services.map((s) => (
                  <div key={s.bucket} style={{ display: "grid", gridTemplateColumns: "minmax(90px,140px) 1fr minmax(60px,160px)", gap: 10, alignItems: "center" }}>
                    <span style={{ font: `600 12px ${F_BODY}`, color: "#334155" }}>{s.bucket}</span>
                    <span style={{ height: 10, borderRadius: 5, background: "#F1F5F9", overflow: "hidden" }}>
                      {s.winRate != null && (
                        <span className="crm2-bar" style={{ display: "block", height: "100%", width: `${Math.min(100, (s.winRate / 0.5) * 100)}%`, background: "#00c8d4", borderRadius: 5 }} />
                      )}
                    </span>
                    <span style={{ font: s.winRate != null ? `600 12px ${F_MONO}` : `400 11px ${F_BODY}`, color: s.winRate != null ? "#0F172A" : "#94a3b8", textAlign: "right", whiteSpace: "nowrap" }}>
                      {s.winRate != null ? `${Math.round(s.winRate * 100)}%` : "Not enough closed deals yet"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
