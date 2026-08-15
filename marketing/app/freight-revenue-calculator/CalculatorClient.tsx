"use client";

// Freight Account Revenue Calculator — MAGNET 4 (Plan §16-18, §84).
//
// The SIMPLEST, provider-cost-FREE magnet: pure CLIENT-SIDE math. The
// calculator itself is NEVER gated behind signup (§18 — "Do not make the
// calculator itself require signup initially"). Inputs → instant estimates,
// always labeled "estimates based on your inputs" (§18). After a result the
// visitor can OPTIONALLY email themselves the estimate (records a lead_magnet
// session + lead_captured event via the public edge fn's `capture` action —
// reuse, not a new fn) and is offered context-preserving CTAs into the app.
//
// 0 provider cost: no company data is fetched; the edge fn only records the
// session + funnel events. Every branch is a typed state (§62).

import { useCallback, useMemo, useRef, useState } from "react";
import { getAnonId } from "@/lib/anonId";
import { APP_URL } from "@/lib/app-urls";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const FN_URL = `${SUPABASE_URL}/functions/v1/lead-magnet-report`;
const MAGNET = "freight-revenue-calculator";

// ---- inputs (§16 — keep minimal, all optional) ----
type Inputs = {
  oceanContainers: string; // annual ocean containers
  oceanRevPerContainer: string; // avg ocean revenue per container ($)
  airPerMonth: string; // air shipments per month
  airRevPerShipment: string; // avg air revenue per shipment ($)
  grossMarginPct: string; // est. gross-margin %
  winProbabilityPct: string; // est. win probability %
};

const EMPTY: Inputs = {
  oceanContainers: "",
  oceanRevPerContainer: "",
  airPerMonth: "",
  airRevPerShipment: "",
  grossMarginPct: "",
  winProbabilityPct: "",
};

// ---- outputs (§17 — computed CLIENT-SIDE) ----
type Result = {
  annualRevenue: number; // estimated annual freight revenue
  annualGrossProfit: number; // estimated annual gross profit
  weightedOpportunity: number; // probability-adjusted (weighted) opportunity
  monthlyRevenue: number; // potential monthly revenue
};

function n(v: string): number {
  const x = Number((v || "").replace(/,/g, "").trim());
  return Number.isFinite(x) && x > 0 ? x : 0;
}

// Pure math (§17). Ocean is annual containers × rev/container; air is monthly
// shipments × 12 × rev/shipment. Margin & win-probability default sensibly when
// left blank so a partial input still yields a usable estimate.
function compute(i: Inputs): Result {
  const oceanAnnual = n(i.oceanContainers) * n(i.oceanRevPerContainer);
  const airAnnual = n(i.airPerMonth) * 12 * n(i.airRevPerShipment);
  const annualRevenue = oceanAnnual + airAnnual;

  const marginPct = n(i.grossMarginPct);
  const margin = marginPct > 0 ? Math.min(marginPct, 100) / 100 : 0.15; // 15% default
  const annualGrossProfit = annualRevenue * margin;

  const winPct = n(i.winProbabilityPct);
  const win = winPct > 0 ? Math.min(winPct, 100) / 100 : 0.25; // 25% default
  const weightedOpportunity = annualRevenue * win;

  const monthlyRevenue = annualRevenue / 12;

  return { annualRevenue, annualGrossProfit, weightedOpportunity, monthlyRevenue };
}

function fmtMoney(x: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(x)));
}

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

type EmailState = "idle" | "sending" | "sent" | "rate_limited" | "error";

export function CalculatorClient() {
  const [inputs, setInputs] = useState<Inputs>(EMPTY);
  const [result, setResult] = useState<Result | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [emailState, setEmailState] = useState<EmailState>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const viewedEmitted = useRef(false);
  const startedEmitted = useRef(false);

  const set = useCallback((k: keyof Inputs, v: string) => {
    // sanitize to numeric-ish input
    setInputs((prev) => ({ ...prev, [k]: v.replace(/[^0-9.]/g, "") }));
    if (!startedEmitted.current) {
      startedEmitted.current = true;
      // best-effort funnel breadcrumb (no PII); never blocks typing.
      void callFn({ action: "capture", event: "started" }).catch(() => {});
    }
  }, []);

  const hasAnyInput = useMemo(
    () => Object.values(inputs).some((v) => n(v) > 0),
    [inputs],
  );

  const onCalculate = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const r = compute(inputs);
      setResult(r);
      setEmailState("idle");
      setEmailError(null);
      if (!viewedEmitted.current) {
        viewedEmitted.current = true;
        void callFn({ action: "capture", event: "viewed" }).catch(() => {});
      }
      void callFn({
        action: "capture",
        event: "submitted",
        estimate: { ...r },
      }).catch(() => {});
    },
    [inputs],
  );

  const onSendEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setEmailError(null);
      const em = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setEmailError("Enter a valid email so we can send you the estimate.");
        return;
      }
      setEmailState("sending");
      try {
        const r = await callFn({
          action: "capture",
          email: em,
          first_name: firstName.trim() || undefined,
          estimate: result ? { ...result } : undefined,
        });
        if (r?.state === "captured") setEmailState("sent");
        else if (r?.state === "rate_limited") setEmailState("rate_limited");
        else {
          setEmailState("error");
          setEmailError(r?.message || "We couldn't send that just now. Please try again.");
        }
      } catch {
        setEmailState("error");
        setEmailError("We couldn't reach the service. Please try again.");
      }
    },
    [email, firstName, result],
  );

  // Context-preserving CTAs (§18). Primary: "Find companies with this shipping
  // profile." → the prospect-list magnet, prefilled with mode emphasis.
  // Secondary: "Build your prospect list in Logistics Intel." → app signup.
  const prospectHref = useMemo(() => {
    // Nudge the prospect-list magnet toward the dominant declared mode.
    const ocean = n(inputs.oceanContainers) * n(inputs.oceanRevPerContainer);
    const air = n(inputs.airPerMonth) * 12 * n(inputs.airRevPerShipment);
    const mode = air > ocean ? "Air" : "Ocean FCL";
    const params = new URLSearchParams({ from: MAGNET, mode });
    return `/free-freight-prospects?${params.toString()}`;
  }, [inputs]);

  const signupHref = useMemo(() => {
    const params = new URLSearchParams({ magnet: MAGNET });
    return `${APP_URL.replace(/\/$/, "")}/signup?${params.toString()}`;
  }, []);

  function trackSignupClick() {
    void callFn({ action: "cta" }).catch(() => {});
  }

  const configured = Boolean(SUPABASE_URL);

  return (
    <div id="start" className="mx-auto w-full max-w-3xl">
      {/* ---------- inputs (mobile-first §93; all optional §16) ---------- */}
      <form
        onSubmit={onCalculate}
        className="grid grid-cols-1 gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:grid-cols-2"
      >
        <Field
          label="Annual ocean containers"
          hint="Containers per year"
          value={inputs.oceanContainers}
          onChange={(v) => set("oceanContainers", v)}
          placeholder="e.g. 500"
        />
        <Field
          label="Avg ocean revenue / container"
          hint="Your all-in rate per container"
          prefix="$"
          value={inputs.oceanRevPerContainer}
          onChange={(v) => set("oceanRevPerContainer", v)}
          placeholder="e.g. 3,200"
        />
        <Field
          label="Air shipments / month"
          hint="Average monthly air shipments"
          value={inputs.airPerMonth}
          onChange={(v) => set("airPerMonth", v)}
          placeholder="e.g. 20"
        />
        <Field
          label="Avg air revenue / shipment"
          hint="Your all-in rate per air shipment"
          prefix="$"
          value={inputs.airRevPerShipment}
          onChange={(v) => set("airRevPerShipment", v)}
          placeholder="e.g. 1,800"
        />
        <Field
          label="Est. gross margin %"
          hint="Blank = 15% assumed"
          suffix="%"
          value={inputs.grossMarginPct}
          onChange={(v) => set("grossMarginPct", v)}
          placeholder="e.g. 18"
        />
        <Field
          label="Est. win probability %"
          hint="Blank = 25% assumed"
          suffix="%"
          value={inputs.winProbabilityPct}
          onChange={(v) => set("winProbabilityPct", v)}
          placeholder="e.g. 30"
        />

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={!hasAnyInput}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-glow-blue transition hover:bg-blue-700 disabled:opacity-60"
          >
            Calculate account revenue →
          </button>
        </div>
      </form>

      <p className="mt-3 text-center text-xs text-ink-200">
        All fields optional. Nothing here requires an account — the calculator is free to use.
      </p>

      {!configured && (
        <p className="mt-3 text-center text-sm text-amber-600">
          Emailing the estimate isn&apos;t configured in this environment — the calculator still works.
        </p>
      )}

      {/* ---------- result ---------- */}
      {result && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
          <div className="border-b border-ink-100 bg-gradient-to-br from-ink-25 to-blue-50/40 px-6 py-5">
            <h3 className="font-display text-2xl font-bold text-ink-900">Your account revenue estimate</h3>
            <p className="mt-1 text-xs text-ink-500">Estimates based on your inputs — not a quote or a guarantee.</p>
          </div>

          <div className="grid grid-cols-1 gap-px bg-ink-100 sm:grid-cols-2">
            <Metric label="Estimated annual freight revenue" value={fmtMoney(result.annualRevenue)} tag="est." />
            <Metric label="Estimated annual gross profit" value={fmtMoney(result.annualGrossProfit)} tag="est." />
            <Metric
              label="Probability-adjusted opportunity"
              value={fmtMoney(result.weightedOpportunity)}
              tag="weighted"
            />
            <Metric label="Potential monthly revenue" value={fmtMoney(result.monthlyRevenue)} tag="est." />
          </div>

          {/* email capture — OPTIONAL (§18: "Send this estimate to my email") */}
          <div className="border-t border-ink-100 bg-section-soft-blue px-6 py-6">
            {emailState === "sent" ? (
              <p className="text-sm font-semibold text-emerald-700">
                Sent — check your inbox. We&apos;ll send your estimate and a short breakdown.
              </p>
            ) : emailState === "rate_limited" ? (
              <p className="text-sm font-semibold text-ink-900">
                You&apos;ve emailed a few estimates today. Start a free trial to keep going.
              </p>
            ) : (
              <>
                <p className="text-base font-semibold text-ink-900">Send this estimate to my email</p>
                <p className="mt-1 text-sm text-ink-500">
                  We&apos;ll email you this estimate and a short breakdown. Optional — the numbers are already above.
                </p>
                <form onSubmit={onSendEmail} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    aria-label="First name"
                    className="h-12 rounded-xl border border-ink-150 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:w-40"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Work email"
                    aria-label="Email"
                    className="h-12 w-full rounded-xl border border-ink-150 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="submit"
                    disabled={emailState === "sending"}
                    className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {emailState === "sending" ? "Sending…" : "Email it to me →"}
                  </button>
                </form>
                {emailError && <p className="mt-2 text-sm text-red-500">{emailError}</p>}
                <p className="mt-2 text-xs text-ink-200">Work email preferred — no spam, unsubscribe anytime.</p>
              </>
            )}
          </div>

          {/* CTAs (§18) */}
          <div className="border-t border-ink-100 px-6 py-6">
            <a
              href={prospectHref}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink-900 px-6 py-4 text-base font-semibold text-white shadow-lg transition hover:bg-ink-950"
            >
              Find companies with this shipping profile →
            </a>
            <a
              href={signupHref}
              onClick={trackSignupClick}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-ink-150 bg-white px-6 py-4 text-base font-semibold text-ink-900 transition hover:bg-ink-50"
            >
              Build your prospect list in Logistics Intel →
            </a>
            <p className="mt-3 text-center text-xs text-ink-200">
              Estimates only, based on the inputs you provided. Actual revenue depends on rates, volume, and win rate.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-200">{label}</span>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">{prefix}</span>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`h-12 w-full rounded-xl border border-ink-150 bg-white text-sm text-ink-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
            prefix ? "pl-7 pr-3" : "px-3"
          } ${suffix ? "pr-8" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">{suffix}</span>
        )}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-ink-200">{hint}</span>}
    </label>
  );
}

function Metric({ label, value, tag }: { label: string; value: string; tag: string }) {
  return (
    <div className="bg-white p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">{label}</div>
      <div className="mt-1 flex items-center text-3xl font-bold text-ink-900">
        {value}
        <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
          {tag}
        </span>
      </div>
    </div>
  );
}
