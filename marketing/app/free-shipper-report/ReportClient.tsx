"use client";

// Free Shipper Intelligence Report — interactive widget.
//
// Single company-name input (NOT the full app search UI, §9) → resolves a
// cached, snapshot-backed importer → renders a LIMITED report with clearly
// labeled estimates (§10) → email gate to "see the full picture" (§11) →
// locked teasers with overlays → primary trial CTA that deep-links into the
// app PRESERVING the company (§12).
//
// Every call goes to the public edge fn `lead-magnet-report`, which records
// all funnel events server-side and reads ONLY the cached snapshot (0 provider
// credits for anonymous visitors). We never render a raw "Something went
// wrong" — every branch is a typed state with a clear next step (§62).

import { useCallback, useMemo, useRef, useState } from "react";
import { getAnonId } from "@/lib/anonId";
import { APP_URL } from "@/lib/app-urls";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const FN_URL = `${SUPABASE_URL}/functions/v1/lead-magnet-report`;
const MAGNET = "free-shipper-report";

type Company = { key: string; name: string; country: string | null };

type TrendPoint = { month: string; shipments: number };

type VisibleReport = {
  company_key: string;
  company_name: string;
  country: string | null;
  shipments_last_12m: number;
  shipments_last_12m_label: string;
  total_teu: number;
  total_teu_label: string;
  last_shipment_date: string | null;
  top_origin_countries: string[];
  top_destination_ports: string[];
  lead_trade_lane: string | null;
  trend: TrendPoint[];
};

type LockedReport = {
  lanes_count: number;
  suppliers_count: number;
  shipment_records_count: number;
  contacts_count_estimate: number;
  decision_makers: boolean;
  pulse_monitoring: boolean;
  company_alerts: boolean;
  opportunity_score: boolean;
};

type ReportState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "matched"; company: Company }
  | {
      state: "report";
      email_captured: boolean;
      visible: VisibleReport;
      locked: LockedReport;
      data_freshness: string;
    }
  | { state: "no_data"; message: string }
  | { state: "rate_limited"; message: string }
  | { state: "error"; message: string };

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
      anonymous_id,
      magnet: MAGNET,
      landing_page: typeof window !== "undefined" ? window.location.pathname : undefined,
      referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
    }),
  });
  // The fn returns typed states with HTTP 200 for expected conditions.
  return res.json().catch(() => ({ state: "error", message: "" }));
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(n)));
}

function Sparkline({ trend }: { trend: TrendPoint[] }) {
  const points = trend.length ? trend : [];
  const max = Math.max(1, ...points.map((p) => p.shipments));
  const w = 320;
  const h = 64;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - (p.shipments / max) * (h - 6) - 3;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" role="img" aria-label="12-month shipment trend">
      {path && (
        <>
          <path d={`${path} L${w},${h} L0,${h} Z`} fill="rgba(59,130,246,0.10)" />
          <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function Estimate({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
      {children}
    </span>
  );
}

export function ReportClient() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ReportState>({ state: "idle" });
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const activeCompany = useRef<Company | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const configured = Boolean(SUPABASE_URL && ANON_KEY);

  const onSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setState({ state: "loading" });
    setEmailError(null);
    try {
      const r = await callFn({ action: "search", q });
      if (r?.state === "matched" && r.company?.key) {
        activeCompany.current = r.company;
        // Immediately fetch the (email-less) limited report — value first (§11).
        const rep = await callFn({ action: "report", company_key: r.company.key, q });
        applyReport(rep);
      } else if (r?.state === "no_data") {
        setState({ state: "no_data", message: r.message || "We're still building this importer's profile. Try another company name." });
      } else if (r?.state === "rate_limited") {
        setState({ state: "rate_limited", message: r.message || "You've hit today's free lookup limit." });
      } else {
        setState({ state: "error", message: r?.message || "We couldn't run that search. Please try again." });
      }
    } catch {
      setState({ state: "error", message: "We couldn't reach the report service. Please try again." });
    }
  }, [query]);

  function applyReport(rep: any) {
    if (rep?.state === "report" && rep.visible) {
      setState({
        state: "report",
        email_captured: Boolean(rep.email_captured),
        visible: rep.visible,
        locked: rep.locked,
        data_freshness: rep.data_freshness || "cached snapshot",
      });
    } else if (rep?.state === "no_data") {
      setState({ state: "no_data", message: rep.message || "We're still building this importer's profile. Try another company name." });
    } else if (rep?.state === "rate_limited") {
      setState({ state: "rate_limited", message: rep.message || "You've hit today's free lookup limit." });
    } else {
      setState({ state: "error", message: rep?.message || "We couldn't load this report right now. Please try again." });
    }
  }

  const onSubmitEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    const key = activeCompany.current?.key;
    if (!key) return;
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setEmailError("Enter a valid email so we can send you the full picture.");
      return;
    }
    try {
      const rep = await callFn({
        action: "report",
        company_key: key,
        email: em,
        first_name: firstName.trim() || undefined,
      });
      if (rep?.state === "rate_limited") {
        setState({ state: "rate_limited", message: rep.message || "Too many submissions for that email today." });
        return;
      }
      applyReport(rep);
    } catch {
      setEmailError("We couldn't submit that just now. Please try again.");
    }
  }, [email, firstName]);

  const trialHref = useMemo(() => {
    const key = activeCompany.current?.key || (state.state === "report" ? state.visible.company_key : "");
    const params = new URLSearchParams({ magnet: MAGNET });
    if (key) params.set("company", key);
    return `${APP_URL.replace(/\/$/, "")}/signup?${params.toString()}`;
  }, [state]);

  function trackTrialClick() {
    // Records lead_trial_cta_clicked + lead_signup_started server-side. Fire-
    // and-forget; navigation continues regardless.
    void callFn({ action: "cta", company_key: activeCompany.current?.key }).catch(() => {});
  }

  return (
    <div id="start" className="mx-auto w-full max-w-3xl">
      {/* Search input — single field, NOT the full app search UI (§9). */}
      <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a U.S. importer, e.g. Home Depot"
          aria-label="Company name"
          className="h-14 w-full rounded-xl border border-ink-150 bg-white px-4 text-base text-ink-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
        <button
          type="submit"
          disabled={!query.trim() || state.state === "loading"}
          className="inline-flex h-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 px-7 text-base font-semibold text-white shadow-glow-blue transition hover:bg-blue-700 disabled:opacity-60"
        >
          {state.state === "loading" ? "Searching…" : "Get the report →"}
        </button>
      </form>

      {!configured && (
        <p className="mt-3 text-sm text-amber-600">
          Report lookups aren&apos;t configured in this environment yet.
        </p>
      )}

      {/* ---------- result states ---------- */}
      <div className="mt-8">
        {state.state === "loading" && (
          <div className="animate-pulse rounded-2xl border border-ink-100 bg-white p-8 text-center text-ink-500 shadow-sm">
            Pulling cached shipment intelligence…
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
              href={trialHref}
              onClick={trackTrialClick}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue-700"
            >
              Start your 7-day trial →
            </a>
          </div>
        )}

        {state.state === "error" && (
          <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-ink-900">Let&apos;s try that again</p>
            <p className="mt-2 text-sm text-ink-500">{state.message}</p>
            <button
              onClick={() => onSearch()}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-ink-150 bg-white px-6 text-sm font-semibold text-ink-900 transition hover:bg-ink-50"
            >
              Retry
            </button>
          </div>
        )}

        {state.state === "report" && (
          <ReportCard
            visible={state.visible}
            locked={state.locked}
            dataFreshness={state.data_freshness}
            emailCaptured={state.email_captured}
            email={email}
            firstName={firstName}
            emailError={emailError}
            onEmail={setEmail}
            onFirstName={setFirstName}
            onSubmitEmail={onSubmitEmail}
            trialHref={trialHref}
            onTrialClick={trackTrialClick}
          />
        )}
      </div>
    </div>
  );
}

function LockOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[3px]">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-150 bg-white px-3 py-1 text-xs font-semibold text-ink-700 shadow-sm">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5V10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        {label}
      </span>
    </div>
  );
}

function ReportCard(props: {
  visible: VisibleReport;
  locked: LockedReport;
  dataFreshness: string;
  emailCaptured: boolean;
  email: string;
  firstName: string;
  emailError: string | null;
  onEmail: (v: string) => void;
  onFirstName: (v: string) => void;
  onSubmitEmail: (e: React.FormEvent) => void;
  trialHref: string;
  onTrialClick: () => void;
}) {
  const { visible: v, locked: l } = props;
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

      {/* VISIBLE metrics — clearly labeled estimates (§10) */}
      <div className="grid grid-cols-1 gap-px bg-ink-100 sm:grid-cols-2">
        <div className="bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Shipments (12 mo)</div>
          <div className="mt-1 flex items-center text-3xl font-bold text-ink-900">
            {fmtInt(v.shipments_last_12m)}
            <Estimate>est.</Estimate>
          </div>
          <div className="mt-1 text-xs text-ink-200">{v.shipments_last_12m_label}</div>
        </div>
        <div className="bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Total TEU (12 mo)</div>
          <div className="mt-1 flex items-center text-3xl font-bold text-ink-900">
            {fmtInt(v.total_teu)}
            <Estimate>modeled</Estimate>
          </div>
          <div className="mt-1 text-xs text-ink-200">{v.total_teu_label}</div>
        </div>
      </div>

      {/* trend + lanes/ports */}
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">12-month shipment trend</div>
          <div className="mt-2"><Sparkline trend={v.trend} /></div>
          {v.last_shipment_date && (
            <div className="mt-1 text-xs text-ink-200">Most recent shipment: {v.last_shipment_date}</div>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Top origin countries</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {v.top_origin_countries.length
                ? v.top_origin_countries.map((c) => (
                    <span key={c} className="rounded-full bg-ink-50 px-3 py-1 text-sm text-ink-700">{c}</span>
                  ))
                : <span className="text-sm text-ink-200">—</span>}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Top U.S. destination ports</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {v.top_destination_ports.length
                ? v.top_destination_ports.map((c) => (
                    <span key={c} className="rounded-full bg-ink-50 px-3 py-1 text-sm text-ink-700">{c}</span>
                  ))
                : <span className="text-sm text-ink-200">—</span>}
            </div>
          </div>
          {v.lead_trade_lane && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Lead trade lane</div>
              <div className="mt-2 rounded-lg border border-ink-100 bg-ink-25 px-3 py-2 text-sm font-medium text-ink-900">
                {v.lead_trade_lane}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EMAIL GATE — value already shown; email to unlock the full picture (§11) */}
      {!props.emailCaptured && (
        <div className="border-t border-ink-100 bg-section-soft-blue px-6 py-6">
          <p className="text-base font-semibold text-ink-900">See the full picture</p>
          <p className="mt-1 text-sm text-ink-500">
            Get the complete lane history, active suppliers, and shipment detail for {v.company_name}.
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

      {/* LOCKED teasers — counts only, data stays locked until trial (§11/§67) */}
      <div className="border-t border-ink-100 px-6 py-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">Locked — unlock with a free trial</div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LockedTeaser title="Full trade-lane history" value={`${l.lanes_count} lanes`} sub="Every origin→destination lane with volumes" />
          <LockedTeaser title="Active suppliers" value={`${l.suppliers_count} suppliers`} sub="Who they buy from, by shipment share" />
          <LockedTeaser title="Contacts & decision-makers" value={`~${l.contacts_count_estimate} contacts`} sub="Verified people to reach out to" />
          <LockedTeaser title="Shipment (BOL) records" value={`${l.shipment_records_count}+ records`} sub="Bill-of-lading level detail" />
          <LockedTeaser title="Pulse monitoring & alerts" value="Live" sub="Get notified when their shipping changes" />
          <LockedTeaser title="Opportunity score" value="Ranked" sub="How winnable this account is" />
        </div>

        {/* PRIMARY CTA — deep-links into the app preserving the company (§12) */}
        <a
          href={props.trialHref}
          onClick={props.onTrialClick}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-ink-900 px-6 py-4 text-base font-semibold text-white shadow-lg transition hover:bg-ink-950"
        >
          Unlock the full company profile with your 7-day Logistics Intel trial →
        </a>
        <p className="mt-2 text-center text-xs text-ink-200">No credit card. Lands you straight in {v.company_name}&apos;s profile.</p>
      </div>
    </div>
  );
}

function LockedTeaser({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-5">
      <div className="text-sm font-semibold text-ink-900">{title}</div>
      <div className="mt-1 text-2xl font-bold text-ink-900">{value}</div>
      <div className="mt-0.5 text-xs text-ink-500">{sub}</div>
      <LockOverlay label="Locked" />
    </div>
  );
}
