"use client";

// Import & Tariff Risk Scanner — MAGNET 5 (Plan §19-20, §85).
//
// Reuses the flagship's company lookup + CACHED snapshot via the public edge fn
// `lead-magnet-report` action:"risk" (0 provider credits — snapshot reads only,
// no live fetch). It surfaces NON-LEGAL concentration/trend INDICATORS only:
// primary sourcing countries, import concentration, port concentration, a
// 12-month trend, a country-concentration risk level, declared commodity/HS
// context, and a NON-LEGAL tariff/regulatory attention indicator (§19 CRITICAL
// — no legal conclusions, no duty determinations, everything labeled estimate).
//
// Gating (§85): concentration + trend shown; deeper supplier/lane/contact detail
// and monitoring locked behind signup. The CTA activates PULSE (§20): deep-links
// to signup with intent=pulse + company so the app saves the company and lands
// on its Pulse LIVE tab (monitor supply-chain changes), NOT the dashboard.

import { useCallback, useMemo, useRef, useState } from "react";
import { getAnonId } from "@/lib/anonId";
import { APP_URL } from "@/lib/app-urls";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const FN_URL = `${SUPABASE_URL}/functions/v1/lead-magnet-report`;
const MAGNET = "import-risk-scanner";

type RiskLevel = "Low" | "Moderate" | "High";

type SourcingShare = { name: string; share: number; count: number };

type Concentration = {
  top_country?: string | null;
  top_country_share?: number;
  top_port?: string | null;
  top_port_share?: number;
  distinct_countries?: number;
  distinct_ports?: number;
  level: RiskLevel;
  label: string;
};

type TrendPoint = { month: string; shipments: number };

type VisibleRisk = {
  company_key: string;
  company_name: string;
  country: string | null;
  shipments_last_12m: number;
  primary_sourcing_countries: SourcingShare[];
  import_concentration: Concentration;
  port_concentration: Concentration;
  trend_12mo: { direction: "accelerating" | "steady" | "cooling"; points: TrendPoint[] };
  commodity_exposure: {
    commodity: string | null;
    hs_code: string | null;
    origin_country: string | null;
    origin_matches_observed: boolean | null;
    note: string;
  };
  tariff_regulatory_indicator: { level: RiskLevel; basis: string; note: string };
};

type SupplyChainConcentration = {
  top_supplier_share?: number;
  distinct_suppliers?: number;
  level: RiskLevel;
  label: string;
};

type LockedRisk = {
  supply_chain_concentration: SupplyChainConcentration;
  shipment_records_count: number;
  suppliers_count: number;
  lanes_count: number;
  pulse_monitoring: boolean;
  change_alerts: boolean;
};

type ScanState =
  | { state: "idle" }
  | { state: "loading" }
  | {
      state: "risk";
      email_captured: boolean;
      visible: VisibleRisk;
      locked: LockedRisk;
      disclaimer: string;
      data_freshness: string;
    }
  | { state: "no_data"; message: string }
  | { state: "rate_limited"; message: string }
  | { state: "error"; message: string };

type Inputs = { company: string; commodity: string; hs_code: string; origin_country: string };

const ORIGIN_COUNTRIES = [
  "China", "Vietnam", "India", "Germany", "Mexico", "South Korea", "Japan", "Italy", "Taiwan", "Canada",
];

async function callFn(payload: Record<string, unknown>): Promise<any> {
  const anonymous_id = getAnonId();
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ANON_KEY ? { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } : {}),
    },
    body: JSON.stringify({
      ...payload,
      magnet_slug: MAGNET,
      anonymous_id,
      landing_page: typeof window !== "undefined" ? window.location.pathname : undefined,
      referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
    }),
  });
  return res.json().catch(() => ({ state: "error", message: "" }));
}

function fmtInt(x: number | null | undefined): string {
  if (x == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(x)));
}

const LEVEL_CLS: Record<RiskLevel, string> = {
  Low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Moderate: "bg-amber-50 text-amber-700 ring-amber-200",
  High: "bg-red-50 text-red-700 ring-red-200",
};

function LevelBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${LEVEL_CLS[level]}`}>
      {level}
    </span>
  );
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  const pts = points.length ? points : [];
  const max = Math.max(1, ...pts.map((p) => p.shipments));
  const w = 320;
  const h = 56;
  const step = pts.length > 1 ? w / (pts.length - 1) : w;
  const path = pts
    .map((p, i) => {
      const x = i * step;
      const y = h - (p.shipments / max) * (h - 6) - 3;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="12-month shipment trend">
      {path && (
        <>
          <path d={`${path} L${w},${h} L0,${h} Z`} fill="rgba(59,130,246,0.10)" />
          <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function RiskScannerClient() {
  const [inputs, setInputs] = useState<Inputs>({ company: "", commodity: "", hs_code: "", origin_country: "" });
  const [state, setState] = useState<ScanState>({ state: "idle" });
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const activeCompanyKey = useRef<string>("");

  const configured = Boolean(SUPABASE_URL);

  const set = useCallback((k: keyof Inputs, v: string) => {
    setInputs((prev) => ({ ...prev, [k]: v }));
  }, []);

  const run = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const company = inputs.company.trim();
      if (!company) return;
      setState({ state: "loading" });
      setEmailError(null);
      try {
        const r = await callFn({
          action: "risk",
          company,
          commodity: inputs.commodity.trim() || undefined,
          hs_code: inputs.hs_code.trim() || undefined,
          origin_country: inputs.origin_country || undefined,
        });
        apply(r);
      } catch {
        setState({ state: "error", message: "We couldn't reach the scanner. Please try again." });
      }
    },
    [inputs],
  );

  function apply(r: any) {
    if (r?.state === "risk" && r.visible) {
      activeCompanyKey.current = r.visible.company_key || "";
      setState({
        state: "risk",
        email_captured: Boolean(r.email_captured),
        visible: r.visible,
        locked: r.locked,
        disclaimer: r.disclaimer || "",
        data_freshness: r.data_freshness || "cached snapshot",
      });
    } else if (r?.state === "no_data") {
      setState({ state: "no_data", message: r.message || "We're still building this importer's profile. Try another company name." });
    } else if (r?.state === "rate_limited") {
      setState({ state: "rate_limited", message: r.message || "You've hit today's free lookup limit." });
    } else {
      setState({ state: "error", message: r?.message || "We couldn't run that scan. Please try again." });
    }
  }

  const onSubmitEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setEmailError(null);
      const key = activeCompanyKey.current;
      if (!key) return;
      const em = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setEmailError("Enter a valid email so we can send you the full scan.");
        return;
      }
      try {
        const r = await callFn({
          action: "risk",
          company_key: key,
          commodity: inputs.commodity.trim() || undefined,
          hs_code: inputs.hs_code.trim() || undefined,
          origin_country: inputs.origin_country || undefined,
          email: em,
          first_name: firstName.trim() || undefined,
        });
        if (r?.state === "rate_limited") {
          setState({ state: "rate_limited", message: r.message || "Too many submissions for that email today." });
          return;
        }
        apply(r);
      } catch {
        setEmailError("We couldn't submit that just now. Please try again.");
      }
    },
    [email, firstName, inputs],
  );

  // PULSE handoff (§20): deep-link to signup with intent=pulse + company so the
  // app saves the company and lands on its Pulse LIVE tab (not the dashboard).
  const pulseHref = useMemo(() => {
    const key = activeCompanyKey.current || (state.state === "risk" ? state.visible.company_key : "");
    const params = new URLSearchParams({ magnet: MAGNET, intent: "pulse" });
    if (key) params.set("company", key);
    return `${APP_URL.replace(/\/$/, "")}/signup?${params.toString()}`;
  }, [state]);

  function trackPulseClick() {
    void callFn({ action: "cta", company_key: activeCompanyKey.current }).catch(() => {});
  }

  return (
    <div id="start" className="mx-auto w-full max-w-3xl">
      {/* ---------- inputs (§19 — only company effectively required) ---------- */}
      <form
        onSubmit={run}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:grid-cols-2"
      >
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-200">Company (U.S. importer)</span>
          <input
            type="text"
            value={inputs.company}
            onChange={(e) => set("company", e.target.value)}
            placeholder="e.g. Home Depot"
            aria-label="Company"
            className="h-12 w-full rounded-xl border border-ink-150 bg-white px-4 text-sm text-ink-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-200">Commodity (optional)</span>
          <input
            type="text"
            value={inputs.commodity}
            onChange={(e) => set("commodity", e.target.value)}
            placeholder="e.g. Furniture"
            className="h-12 w-full rounded-xl border border-ink-150 bg-white px-4 text-sm text-ink-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-200">HS code (optional)</span>
          <input
            type="text"
            value={inputs.hs_code}
            onChange={(e) => set("hs_code", e.target.value)}
            placeholder="e.g. 9403"
            className="h-12 w-full rounded-xl border border-ink-150 bg-white px-4 text-sm text-ink-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-200">Origin country (optional)</span>
          <select
            value={inputs.origin_country}
            onChange={(e) => set("origin_country", e.target.value)}
            className="h-12 w-full rounded-xl border border-ink-150 bg-white px-3 text-sm text-ink-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Any origin</option>
            {ORIGIN_COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={!inputs.company.trim() || state.state === "loading"}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue-700 disabled:opacity-60"
          >
            {state.state === "loading" ? "Scanning…" : "Scan import profile →"}
          </button>
        </div>
      </form>

      <p className="mt-3 text-center text-xs text-ink-200">
        Only the company is needed. Indicators are estimates from public, aggregated customs records — not legal or tariff advice.
      </p>

      {!configured && (
        <p className="mt-3 text-center text-sm text-amber-600">
          The scanner isn&apos;t configured in this environment yet.
        </p>
      )}

      {/* ---------- result states ---------- */}
      <div className="mt-8">
        {state.state === "loading" && (
          <div className="animate-pulse rounded-2xl border border-ink-100 bg-white p-8 text-center text-ink-500 shadow-sm">
            Reading cached customs intelligence…
          </div>
        )}

        {state.state === "no_data" && (
          <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-ink-900">No profile yet</p>
            <p className="mt-2 text-sm text-ink-500">{state.message}</p>
          </div>
        )}

        {state.state === "rate_limited" && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-ink-900">You&apos;ve reached today&apos;s free limit</p>
            <p className="mt-2 text-sm text-ink-500">{state.message}</p>
            <a
              href={pulseHref}
              onClick={trackPulseClick}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue-700"
            >
              Start monitoring with a free account →
            </a>
          </div>
        )}

        {state.state === "error" && (
          <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-ink-900">Let&apos;s try that again</p>
            <p className="mt-2 text-sm text-ink-500">{state.message}</p>
            <button
              onClick={() => run()}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-ink-150 bg-white px-6 text-sm font-semibold text-ink-900 transition hover:bg-ink-50"
            >
              Retry
            </button>
          </div>
        )}

        {state.state === "risk" && (
          <RiskCard
            visible={state.visible}
            locked={state.locked}
            disclaimer={state.disclaimer}
            dataFreshness={state.data_freshness}
            emailCaptured={state.email_captured}
            email={email}
            firstName={firstName}
            emailError={emailError}
            onEmail={setEmail}
            onFirstName={setFirstName}
            onSubmitEmail={onSubmitEmail}
            pulseHref={pulseHref}
            onPulseClick={trackPulseClick}
          />
        )}
      </div>
    </div>
  );
}

function RiskCard(props: {
  visible: VisibleRisk;
  locked: LockedRisk;
  disclaimer: string;
  dataFreshness: string;
  emailCaptured: boolean;
  email: string;
  firstName: string;
  emailError: string | null;
  onEmail: (v: string) => void;
  onFirstName: (v: string) => void;
  onSubmitEmail: (e: React.FormEvent) => void;
  pulseHref: string;
  onPulseClick: () => void;
}) {
  const { visible: v, locked: l } = props;
  const dir = v.trend_12mo.direction;
  const dirLabel = dir === "accelerating" ? "Accelerating" : dir === "cooling" ? "Cooling" : "Steady";
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      {/* header */}
      <div className="border-b border-ink-100 bg-gradient-to-br from-ink-25 to-blue-50/40 px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-2xl font-bold text-ink-900">{v.company_name}</h3>
          <span className="text-xs font-medium text-ink-200">{props.dataFreshness}</span>
        </div>
        {v.country && <p className="mt-1 text-sm text-ink-500">{v.country}</p>}
      </div>

      {/* NON-LEGAL disclaimer banner (§19) */}
      <div className="border-b border-amber-100 bg-amber-50/60 px-6 py-3">
        <p className="text-xs leading-relaxed text-amber-800">
          <span className="font-semibold">Indicators, not advice.</span> {props.disclaimer}
        </p>
      </div>

      {/* concentration indicators (VISIBLE, §85) */}
      <div className="grid grid-cols-1 gap-px bg-ink-100 sm:grid-cols-2">
        <div className="bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Import concentration</div>
            <LevelBadge level={v.import_concentration.level} />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-900">
            {v.import_concentration.top_country_share ?? 0}%
            <span className="ml-2 text-sm font-medium text-ink-500">
              from {v.import_concentration.top_country || "—"}
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-200">
            {v.import_concentration.distinct_countries ?? 0} sourcing countries · {v.import_concentration.label}
          </div>
        </div>
        <div className="bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Port concentration</div>
            <LevelBadge level={v.port_concentration.level} />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-900">
            {v.port_concentration.top_port_share ?? 0}%
            <span className="ml-2 text-sm font-medium text-ink-500">
              via {v.port_concentration.top_port || "—"}
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-200">
            {v.port_concentration.distinct_ports ?? 0} destination ports · {v.port_concentration.label}
          </div>
        </div>
      </div>

      {/* sourcing countries + trend */}
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Primary sourcing countries</div>
          <ul className="mt-2 space-y-2">
            {v.primary_sourcing_countries.length ? (
              v.primary_sourcing_countries.map((c) => (
                <li key={c.name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-ink-700">{c.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span className="block h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, c.share)}%` }} />
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs font-semibold text-ink-500">{c.share}%</span>
                </li>
              ))
            ) : (
              <li className="text-sm text-ink-200">—</li>
            )}
          </ul>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">12-month shipment trend</div>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{dirLabel}</span>
          </div>
          <div className="mt-2"><Sparkline points={v.trend_12mo.points} /></div>
          <div className="mt-1 text-xs text-ink-200">{fmtInt(v.shipments_last_12m)} shipments (12mo, est.)</div>
        </div>
      </div>

      {/* commodity exposure + NON-LEGAL tariff indicator (§19) */}
      <div className="border-t border-ink-100 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-100 bg-ink-25 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Commodity exposure (declared)</div>
            <div className="mt-1 text-sm font-medium text-ink-900">
              {v.commodity_exposure.commodity || v.commodity_exposure.hs_code
                ? [v.commodity_exposure.commodity, v.commodity_exposure.hs_code].filter(Boolean).join(" · ")
                : "None declared"}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">{v.commodity_exposure.note}</p>
          </div>
          <div className="rounded-xl border border-ink-100 bg-ink-25 p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Tariff / regulatory indicator</div>
              <LevelBadge level={v.tariff_regulatory_indicator.level} />
            </div>
            <div className="mt-1 text-sm font-medium text-ink-900">
              Based on {v.tariff_regulatory_indicator.basis}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">{v.tariff_regulatory_indicator.note}</p>
          </div>
        </div>
      </div>

      {/* EMAIL GATE (§85) — value shown, email for the full scan */}
      {!props.emailCaptured && (
        <div className="border-t border-ink-100 bg-section-soft-blue px-6 py-6">
          <p className="text-base font-semibold text-ink-900">Get the full import-risk scan</p>
          <p className="mt-1 text-sm text-ink-500">
            Add your email for supplier-level concentration, lane detail, and a copy of {v.company_name}&apos;s scan.
          </p>
          <form onSubmit={props.onSubmitEmail} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={props.firstName}
              onChange={(e) => props.onFirstName(e.target.value)}
              placeholder="First name"
              aria-label="First name"
              className="h-12 rounded-xl border border-ink-150 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:w-40"
            />
            <input
              type="email"
              value={props.email}
              onChange={(e) => props.onEmail(e.target.value)}
              placeholder="Work email"
              aria-label="Email"
              className="h-12 w-full rounded-xl border border-ink-150 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue-700"
            >
              Unlock →
            </button>
          </form>
          {props.emailError && <p className="mt-2 text-sm text-red-500">{props.emailError}</p>}
          <p className="mt-2 text-xs text-ink-200">Work email preferred — no spam, unsubscribe anytime.</p>
        </div>
      )}

      {/* LOCKED — deeper detail + monitoring behind signup (§85) */}
      <div className="border-t border-ink-100 px-6 py-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Locked — unlock with a free account</div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LockedTeaser
            title="Supplier concentration"
            value={`Top supplier ${l.supply_chain_concentration.top_supplier_share ?? 0}%`}
            sub={`${l.suppliers_count} suppliers · dependency indicator`}
          />
          <LockedTeaser
            title="Full lane detail"
            value={`${l.lanes_count} lanes`}
            sub="Every origin→destination lane with volumes"
          />
          <LockedTeaser
            title="Shipment records"
            value={`${l.shipment_records_count}+ records`}
            sub="Bill-of-lading level detail"
          />
          <LockedTeaser
            title="Pulse monitoring & alerts"
            value="Live"
            sub="Get notified when their sourcing or lanes shift"
          />
        </div>

        {/* PRIMARY CTA — activates PULSE (§20) */}
        <a
          href={props.pulseHref}
          onClick={props.onPulseClick}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-ink-900 px-6 py-4 text-base font-semibold text-white shadow-lg transition hover:bg-ink-950"
        >
          Monitor this company&apos;s supply-chain changes with Logistics Intel Pulse →
        </a>
        <p className="mt-2 text-center text-xs text-ink-200">
          No credit card. We&apos;ll save {v.company_name} and open its live Pulse monitoring.
        </p>
      </div>
    </div>
  );
}

function LockedTeaser({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-5">
      <div className="text-sm font-semibold text-ink-900">{title}</div>
      <div className="mt-1 text-xl font-bold text-ink-900">{value}</div>
      <div className="mt-0.5 text-xs text-ink-500">{sub}</div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[3px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-150 bg-white px-3 py-1 text-xs font-semibold text-ink-700 shadow-sm">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5V10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          Locked
        </span>
      </div>
    </div>
  );
}
