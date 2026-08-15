"use client";

// ProspectListClient — ONE shared engine/UI for BOTH list lead magnets
// (Plan §21 "do not build two separate engines"):
//   * Top 25 Shippers            (/top-shippers)
//   * Free Freight Prospect List (/free-freight-prospects)
//
// The pages differ only in copy (passed via `copy`). Everything else — the
// filter form, the call to the public `lead-magnet-list` edge fn, the typed
// result states, the 5-visible / 20-locked reveal, the email gate, and the
// context-preserving signup CTA — is shared here.
//
// Every call goes to the public edge fn (verify_jwt=false), which records
// funnel events server-side and reads ONLY the cached lit_company_directory
// (0 provider credits for anonymous visitors). No branch renders a raw error —
// every state is typed with a clear next step (§62).

import { useCallback, useMemo, useState } from "react";
import { getAnonId } from "@/lib/anonId";
import { APP_URL } from "@/lib/app-urls";
import {
  PROSPECT_INDUSTRIES,
  PROSPECT_ORIGIN_COUNTRIES,
  PROSPECT_REGIONS,
  PROSPECT_MODES,
  PROSPECT_VOLUME_RANGES,
} from "@/lib/prospectFilters";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const FN_URL = `${SUPABASE_URL}/functions/v1/lead-magnet-list`;

// ---- filter option lists (§14) — none required ----
// Driven from the shared prospectFilters module so UI == DB (Bug 1 fix): the
// industry values are the REAL lit_company_directory.industry values, and the
// origin/region options are soft lane-text refinements the edge fn applies
// without ever zeroing the result set.
const INDUSTRIES = PROSPECT_INDUSTRIES;
const ORIGIN_COUNTRIES = PROSPECT_ORIGIN_COUNTRIES;
const REGIONS = PROSPECT_REGIONS;
const MODES = PROSPECT_MODES;
const VOLUME_RANGES = PROSPECT_VOLUME_RANGES;

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export type MagnetCopy = {
  slug: "top-shippers" | "free-freight-prospects";
  ctaLabel: string; // primary unlock CTA text
  emailGateTitle: string;
  emailGateBody: string;
};

type VisibleRow = {
  rank: number;
  company_name: string;
  industry: string | null;
  region: string | null;
  shipments_12m: number | null;
  shipments_12m_label: string;
  teu: number | null;
  teu_label: string;
  growth_trend: "accelerating" | "steady" | "cooling";
  top_lane: string | null;
  opportunity_score: number;
};

type LockedRow = { rank: number; name_teaser: string; industry: string | null; locked: true };

type ListState =
  | { state: "idle" }
  | { state: "loading" }
  | {
      state: "list";
      email_captured: boolean;
      visible: VisibleRow[];
      locked: LockedRow[];
      locked_count: number;
      total_count: number;
      saved_query: Record<string, unknown>;
      data_freshness: string;
    }
  | { state: "no_results"; message: string; email_captured: boolean }
  | { state: "rate_limited"; message: string }
  | { state: "error"; message: string };

type Filters = {
  industry: string;
  origin_country: string;
  region: string;
  destination_port: string;
  mode: string;
  volume_range: string;
};

const EMPTY_FILTERS: Filters = {
  industry: "",
  origin_country: "",
  region: "",
  destination_port: "",
  mode: "",
  volume_range: "",
};

// ---------------------------------------------------------------------------

async function callFn(slug: string, payload: Record<string, unknown>): Promise<any> {
  const anonymous_id = getAnonId();
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ANON_KEY ? { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } : {}),
    },
    body: JSON.stringify({
      ...payload,
      magnet_slug: slug,
      anonymous_id,
      landing_page: typeof window !== "undefined" ? window.location.pathname : undefined,
      referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
    }),
  });
  return res.json().catch(() => ({ state: "error", message: "" }));
}

function fmtInt(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(n)));
}

// Build the edge-fn `filters` payload from the form (only non-empty fields).
function toPayloadFilters(f: Filters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.industry) out.industry = f.industry;
  if (f.origin_country) out.origin_country = f.origin_country;
  if (f.region) out.region = f.region;
  if (f.destination_port) out.destination_port = f.destination_port;
  if (f.mode) out.mode = f.mode;
  if (f.volume_range) out.volume_range = f.volume_range;
  return out;
}

export function ProspectListClient({ copy }: { copy: MagnetCopy }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [state, setState] = useState<ListState>({ state: "idle" });
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const configured = Boolean(SUPABASE_URL);

  const setField = useCallback((k: keyof Filters, v: string) => {
    setFilters((prev) => ({ ...prev, [k]: v }));
  }, []);

  const run = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setState({ state: "loading" });
      setEmailError(null);
      try {
        const r = await callFn(copy.slug, { filters: toPayloadFilters(filters) });
        applyResult(r);
      } catch {
        setState({ state: "error", message: "We couldn't reach the list service. Please try again." });
      }
    },
    [filters, copy.slug],
  );

  function applyResult(r: any) {
    if (r?.state === "list" && Array.isArray(r.visible)) {
      setState({
        state: "list",
        email_captured: Boolean(r.email_captured),
        visible: r.visible,
        locked: Array.isArray(r.locked) ? r.locked : [],
        locked_count: Number(r.locked_count ?? 0),
        total_count: Number(r.total_count ?? 0),
        saved_query: r.saved_query ?? {},
        data_freshness: r.data_freshness || "cached directory",
      });
    } else if (r?.state === "no_results") {
      setState({
        state: "no_results",
        message: r.message || "No companies match those filters yet — try widening them.",
        email_captured: Boolean(r.email_captured),
      });
    } else if (r?.state === "rate_limited") {
      setState({ state: "rate_limited", message: r.message || "You've hit today's free lookup limit." });
    } else {
      setState({ state: "error", message: r?.message || "We couldn't build that list. Please try again." });
    }
  }

  const onSubmitEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setEmailError(null);
      const em = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setEmailError("Enter a valid email so we can send you the full list.");
        return;
      }
      try {
        const r = await callFn(copy.slug, {
          filters: toPayloadFilters(filters),
          email: em,
          first_name: firstName.trim() || undefined,
        });
        if (r?.state === "rate_limited") {
          setState({ state: "rate_limited", message: r.message || "Too many submissions for that email today." });
          return;
        }
        applyResult(r);
      } catch {
        setEmailError("We couldn't submit that just now. Please try again.");
      }
    },
    [email, firstName, filters, copy.slug],
  );

  // Signup deep-link (§14/§15/§21): preserve the query so the app opens the
  // generated search in the Explorer, not a generic dashboard. The anon id
  // rides the shared lit_anon_id cookie; we also pass saved_search=1 + a
  // compact `explore` param the app can drop straight into useExploreState.
  const trialHref = useMemo(() => {
    const params = new URLSearchParams({ magnet: copy.slug, saved_search: "1" });
    if (state.state === "list") {
      const ef = (state.saved_query as any)?.explorer_filters;
      if (ef && Object.keys(ef).length) {
        params.set("explore", encodeURIComponent(JSON.stringify({ filters: ef })));
      }
    }
    return `${APP_URL.replace(/\/$/, "")}/signup?${params.toString()}`;
  }, [state, copy.slug]);

  function trackTrialClick() {
    void callFn(copy.slug, {
      filters: toPayloadFilters(filters),
    }).catch(() => {});
  }

  return (
    <div id="start" className="mx-auto w-full max-w-4xl">
      {/* ---------- filter form (mobile-first §93) ---------- */}
      <form
        onSubmit={run}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      >
        <Select label="Industry" value={filters.industry} onChange={(v) => setField("industry", v)} options={INDUSTRIES} />
        <Select
          label="Origin country"
          value={filters.origin_country}
          onChange={(v) => setField("origin_country", v)}
          options={ORIGIN_COUNTRIES}
        />
        <Select
          label="Destination region"
          value={filters.region}
          onChange={(v) => setField("region", v)}
          options={REGIONS}
        />
        <Select label="Mode" value={filters.mode} onChange={(v) => setField("mode", v)} options={MODES} />
        <Select
          label="Volume range"
          value={filters.volume_range}
          onChange={(v) => setField("volume_range", v)}
          options={VOLUME_RANGES}
          allowEmptyOnly
        />
        <div className="flex items-end">
          <button
            type="submit"
            disabled={state.state === "loading"}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue-700 disabled:opacity-60"
          >
            {state.state === "loading" ? "Building list…" : "Build my list →"}
          </button>
        </div>
      </form>

      <p className="mt-3 text-center text-xs text-ink-200">
        All filters optional. We rank the best-fit companies from cached, aggregated customs intelligence.
      </p>

      {!configured && (
        <p className="mt-3 text-center text-sm text-amber-600">
          List lookups aren&apos;t configured in this environment yet.
        </p>
      )}

      {/* ---------- result states ---------- */}
      <div className="mt-8">
        {state.state === "loading" && (
          <div className="animate-pulse rounded-2xl border border-ink-100 bg-white p-8 text-center text-ink-500 shadow-sm">
            Ranking the best-fit companies…
          </div>
        )}

        {state.state === "no_results" && (
          <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-ink-900">No companies match — widen your filters</p>
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
              Create your free account →
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

        {state.state === "list" && (
          <ListResult
            visible={state.visible}
            locked={state.locked}
            lockedCount={state.locked_count}
            totalCount={state.total_count}
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
            copy={copy}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// filter select
// ---------------------------------------------------------------------------

function Select({
  label,
  value,
  onChange,
  options,
  allowEmptyOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  allowEmptyOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-200">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-ink-150 bg-white px-3 text-sm text-ink-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      >
        {!allowEmptyOnly && <option value="">Any {label.toLowerCase()}</option>}
        {options.map((o) => {
          const val = typeof o === "string" ? o : o.value;
          const lbl = typeof o === "string" ? o : o.label;
          return (
            <option key={val || "any"} value={val}>
              {lbl}
            </option>
          );
        })}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// result: 5 visible ranked rows + 20 locked teasers + email gate + CTA
// ---------------------------------------------------------------------------

function TrendBadge({ trend }: { trend: VisibleRow["growth_trend"] }) {
  const map = {
    accelerating: { label: "Accelerating", cls: "bg-emerald-50 text-emerald-700" },
    steady: { label: "Steady", cls: "bg-blue-50 text-blue-700" },
    cooling: { label: "Cooling", cls: "bg-amber-50 text-amber-700" },
  } as const;
  const m = map[trend];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}

function ListResult(props: {
  visible: VisibleRow[];
  locked: LockedRow[];
  lockedCount: number;
  totalCount: number;
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
  copy: MagnetCopy;
}) {
  const { visible, locked, copy } = props;
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 bg-gradient-to-br from-ink-25 to-blue-50/40 px-6 py-5">
        <h3 className="font-display text-xl font-bold text-ink-900">
          Your top {props.totalCount} prospects
        </h3>
        <span className="text-xs font-medium text-ink-200">{props.dataFreshness}</span>
      </div>

      {/* VISIBLE 5 — full ranked detail */}
      <ul className="divide-y divide-ink-100">
        {visible.map((r) => (
          <li key={r.rank} className="px-6 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">
                    {r.rank}
                  </span>
                  <span className="truncate text-base font-semibold text-ink-900">{r.company_name}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                  {r.industry && <span>{r.industry}</span>}
                  {r.region && <span>· {r.region}</span>}
                  {r.top_lane && <span>· Lane: {r.top_lane}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <TrendBadge trend={r.growth_trend} />
                <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  Score {r.opportunity_score}
                </span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
              <div className="rounded-lg bg-ink-25 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-200">Shipments (12mo)</div>
                <div className="text-sm font-bold text-ink-900">
                  {fmtInt(r.shipments_12m)}{" "}
                  <span className="text-[10px] font-medium uppercase text-blue-600">est.</span>
                </div>
              </div>
              <div className="rounded-lg bg-ink-25 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-200">TEU (12mo)</div>
                <div className="text-sm font-bold text-ink-900">
                  {fmtInt(r.teu)}{" "}
                  <span className="text-[10px] font-medium uppercase text-blue-600">modeled</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* EMAIL GATE — value shown, email to keep going (§11) */}
      {!props.emailCaptured && (
        <div className="border-t border-ink-100 bg-section-soft-blue px-6 py-6">
          <p className="text-base font-semibold text-ink-900">{copy.emailGateTitle}</p>
          <p className="mt-1 text-sm text-ink-500">{copy.emailGateBody}</p>
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
              Continue →
            </button>
          </form>
          {props.emailError && <p className="mt-2 text-sm text-red-500">{props.emailError}</p>}
          <p className="mt-2 text-xs text-ink-200">Work email preferred — no spam, unsubscribe anytime.</p>
        </div>
      )}

      {/* LOCKED — blurred teasers, count only (§14/§67) */}
      <div className="border-t border-ink-100 px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">
            {props.lockedCount} more prospects — locked
          </div>
        </div>
        <div className="relative mt-3">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {locked.map((r) => (
              <li
                key={r.rank}
                className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-4 py-3 blur-[2px] select-none"
                aria-hidden
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-500">
                  {r.rank}
                </span>
                <span className="truncate text-sm font-semibold text-ink-700">{r.name_teaser}</span>
                {r.industry && <span className="ml-auto truncate text-xs text-ink-200">{r.industry}</span>}
              </li>
            ))}
          </ul>
          {/* overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center rounded-2xl bg-gradient-to-t from-white via-white/70 to-transparent pb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-150 bg-white px-3 py-1 text-xs font-semibold text-ink-700 shadow-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5V10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              Locked — unlock with a free account
            </span>
          </div>
        </div>

        {/* PRIMARY CTA — deep-links into the app preserving the query (§15) */}
        <a
          href={props.trialHref}
          onClick={props.onTrialClick}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-ink-900 px-6 py-4 text-base font-semibold text-white shadow-lg transition hover:bg-ink-950"
        >
          {copy.ctaLabel}
        </a>
        <p className="mt-2 text-center text-xs text-ink-200">
          No credit card. We&apos;ll reopen this exact search in your workspace.
        </p>
      </div>
    </div>
  );
}
