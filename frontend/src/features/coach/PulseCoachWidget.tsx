import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getPulseCoachNudges,
  askPulseCoach,
  type CoachNudge,
  type PulseCoachResult,
  type WorkspaceLane,
} from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useLocation } from "react-router-dom";
import {
  findTutorialForPath,
  pageKeyForPath,
  type TutorialConfig,
} from "@/lib/tutorials";
import {
  loadOnboardingState,
  markTutorialCompleted,
  markTutorialDismissed,
  shouldShowTutorial,
  type OnboardingMap,
} from "@/lib/onboardingState";

/**
 * Pulse Coach widget — proactive AI nudges grounded in the user's
 * workspace state. Two render modes share a single data source:
 *
 *   "floating"  — bottom-right pill that expands into a card. Mounted
 *                 globally in AppShell so it follows the user across
 *                 every page.
 *   "inline"    — full hero panel rendered on the Dashboard.
 *
 * The widget hits the `pulse-coach` edge function which returns LLM-
 * generated nudges + an aggregated workspace_lanes envelope used by
 * the WorkspaceLanesGlobe. Cached for 30 minutes per session.
 */

type Mode = "floating" | "inline";

type PulseCoachContextValue = {
  result: PulseCoachResult | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  highlightLane: (focus: { from: string | null; to: string | null } | null) => void;
  highlightedLane: { from: string | null; to: string | null } | null;
};

const PulseCoachContext = createContext<PulseCoachContextValue | null>(null);

// v2 of the cache key: now scoped per user id so logging out / switching
// accounts on the same browser does not leak the previous user's saved-
// account aggregations into the new session. Without this scoping, User
// A's workspace_lanes (and nudges referencing A's accounts) were visible
// to User B until the 30-min TTL expired. The unscoped v1 key is purged
// on mount below.
const CACHE_KEY_PREFIX = "lit.pulse_coach.cache.v2.";
const LEGACY_CACHE_KEYS = ["lit.pulse_coach.cache.v1"];
const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheRow = { at: number; result: PulseCoachResult };

function cacheKeyFor(userId: string | null | undefined): string {
  return `${CACHE_KEY_PREFIX}${userId || "anon"}`;
}

function readCacheFor(userId: string | null | undefined): CacheRow | null {
  try {
    const raw = window.localStorage.getItem(cacheKeyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRow;
    if (!parsed?.at || !parsed?.result) return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeCacheFor(
  userId: string | null | undefined,
  result: PulseCoachResult,
) {
  try {
    window.localStorage.setItem(
      cacheKeyFor(userId),
      JSON.stringify({ at: Date.now(), result }),
    );
  } catch (_) {
    // ignore quota / private mode
  }
}

function purgeLegacyCaches() {
  if (typeof window === "undefined") return;
  try {
    for (const k of LEGACY_CACHE_KEYS) window.localStorage.removeItem(k);
  } catch (_) {
    // ignore
  }
}

/**
 * Provider lives near the AppShell so the widget + the dashboard
 * hero panel share a single fetch + cache + lane-highlight state.
 */
export function PulseCoachProvider({
  pageContext,
  children,
}: {
  pageContext: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id || null;
  // Initial render: read cache for the current user only. If the user
  // is not yet known (auth still warming up) start empty — the userId
  // effect below kicks in once auth resolves.
  const [result, setResult] = useState<PulseCoachResult | null>(() => {
    if (typeof window === "undefined") return null;
    purgeLegacyCaches();
    return readCacheFor(userId)?.result ?? null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedLane, setHighlightedLane] = useState<
    { from: string | null; to: string | null } | null
  >(null);
  const inflight = useRef<Promise<void> | null>(null);

  const fetchNudges = useCallback(
    async (force = false) => {
      if (!force) {
        const cached = readCacheFor(userId);
        if (cached?.result) {
          setResult(cached.result);
          return;
        }
      }
      if (inflight.current) return inflight.current;
      const p = (async () => {
        setLoading(true);
        setError(null);
        try {
          const r = await getPulseCoachNudges(pageContext);
          // Stability guards on workspace_lanes so the trade-lane globe
          // and the workspace-lanes list don't reflow on every coach
          // refresh:
          //
          //   A. Zero-lane response while prev had lanes → keep prev.
          //      Prevents the globe blanking out if the LLM call drops
          //      the lanes block.
          //
          //   B. Same lane keys as before → reuse the prev array
          //      reference. Without this, every refresh produced a new
          //      array (same content, new identity) which forced the
          //      `sorted` / `globeLanes` useMemos to recompute and the
          //      GlobeCanvas three.js scene to rebuild — the visible
          //      "tabs disappear and reflow" symptom on dashboard.
          setResult((prev) => {
            if (!r.ok) return r;
            const newLanes = Array.isArray(r.workspace_lanes)
              ? r.workspace_lanes
              : [];
            const prevLanes = Array.isArray(prev?.workspace_lanes)
              ? prev!.workspace_lanes
              : [];

            // Guard A
            if (newLanes.length === 0 && prevLanes.length > 0) {
              return { ...r, workspace_lanes: prevLanes };
            }
            // Guard B
            if (
              newLanes.length > 0 &&
              prevLanes.length === newLanes.length &&
              prevLanes.every((x, i) => x.key === newLanes[i].key)
            ) {
              return { ...r, workspace_lanes: prevLanes };
            }
            return r;
          });
          writeCacheFor(userId, r);
          if (!r.ok && r.error) setError(r.error);
        } catch (err: any) {
          setError(err?.message || "Coach fetch failed");
        } finally {
          setLoading(false);
          inflight.current = null;
        }
      })();
      inflight.current = p;
      return p;
    },
    [pageContext, userId],
  );

  // When the logged-in user changes (sign-in, sign-out, account
  // switch), reset coach state and reload from THAT user's cache or
  // fetch fresh. Without this, the previous user's nudges + workspace
  // lanes would stick around in memory until a manual refresh.
  useEffect(() => {
    setResult(readCacheFor(userId)?.result ?? null);
    setError(null);
    setHighlightedLane(null);
    inflight.current = null;
    if (userId) fetchNudges(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Initial load on mount when cache is empty.
  useEffect(() => {
    if (!result) fetchNudges(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: PulseCoachContextValue = useMemo(
    () => ({
      result,
      loading,
      error,
      refresh: fetchNudges,
      highlightLane: setHighlightedLane,
      highlightedLane,
    }),
    [result, loading, error, fetchNudges, highlightedLane],
  );

  return (
    <PulseCoachContext.Provider value={value}>
      {children}
    </PulseCoachContext.Provider>
  );
}

export function usePulseCoach(): PulseCoachContextValue {
  const ctx = useContext(PulseCoachContext);
  if (!ctx) {
    // Fallback so consumers don't crash if mounted without a provider.
    return {
      result: null,
      loading: false,
      error: null,
      refresh: async () => {},
      highlightLane: () => {},
      highlightedLane: null,
    };
  }
  return ctx;
}

/* ── Action handler ──────────────────────────────────────────────── */

function useNudgeActionHandler() {
  const navigate = useNavigate();
  const { highlightLane } = usePulseCoach();
  return useCallback(
    (nudge: CoachNudge) => {
      switch (nudge.action) {
        case "lane.focus":
          highlightLane(nudge.lane_focus);
          return;
        case "company.open": {
          const key = nudge.account_keys?.[0];
          if (key) navigate(`/app/companies/${encodeURIComponent(key)}`);
          return;
        }
        case "campaign.create":
          navigate("/app/campaigns?new=1");
          return;
        case "campaign.add_contacts":
          navigate("/app/campaigns");
          return;
        case "contact.enrich": {
          const key = nudge.account_keys?.[0];
          if (key) navigate(`/app/companies/${encodeURIComponent(key)}?tab=contacts`);
          return;
        }
        case "pulse.generate": {
          const key = nudge.account_keys?.[0];
          if (key)
            navigate(`/app/companies/${encodeURIComponent(key)}?tab=research`);
          return;
        }
        case "none":
        case null:
          if (nudge.lane_focus) highlightLane(nudge.lane_focus);
          return;
        default:
          // v2 cards encode their CTA route as "route:/app/<path>".
          if (typeof nudge.action === "string" && nudge.action.startsWith("route:")) {
            navigate(nudge.action.slice("route:".length));
            return;
          }
          if (nudge.lane_focus) highlightLane(nudge.lane_focus);
          return;
      }
    },
    [navigate, highlightLane],
  );
}

/* ── Inline (dashboard hero) ─────────────────────────────────────── */

export function PulseCoachInline() {
  const { result, loading, error, refresh, highlightLane, highlightedLane } =
    usePulseCoach();
  const handleAction = useNudgeActionHandler();
  const nudges = result?.nudges || [];

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-xl border p-4 shadow-sm"
      style={{
        background:
          "linear-gradient(160deg, #0F172A 0%, #1E293B 60%, #102240 100%)",
        borderColor: "#1E293B",
        // Match the globe card's intrinsic height on lg+. The globe
        // renders ~404px tall (300 canvas + 88 header + 16 padding);
        // setting min-h here keeps the grid row stable when nudge
        // count changes.
        minHeight: 404,
      }}
    >
      {/* glow */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(0,240,255,0.18) 0%, transparent 65%)",
        }}
        aria-hidden
      />

      {/* header */}
      <div className="relative mb-3 flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md border"
          style={{
            background: "rgba(0,240,255,0.1)",
            borderColor: "rgba(0,240,255,0.3)",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" style={{ color: "#00F0FF" }} />
        </div>
        <div>
          <div
            className="font-display text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "#00F0FF" }}
          >
            Pulse Coach
          </div>
          <div className="font-body text-[11px] text-slate-400">
            What's on your plate today
          </div>
        </div>
        <button
          type="button"
          onClick={() => refresh(true)}
          disabled={loading}
          className="font-display ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50"
          aria-label="Refresh Pulse Coach"
          title="Refresh"
        >
          <RefreshCw className={["h-3 w-3", loading ? "animate-spin" : ""].join(" ")} />
          Refresh
        </button>
      </div>

      {/* body */}
      {loading && nudges.length === 0 ? (
        <div className="font-body relative px-1 py-6 text-center text-[12px] text-slate-400">
          Reading your workspace…
        </div>
      ) : error && nudges.length === 0 ? (
        <div className="font-body relative px-1 py-4 text-[12px] text-amber-300">
          Coach is offline — {error}
        </div>
      ) : nudges.length === 0 ? (
        <div className="font-body relative px-1 py-4 text-[12px] text-slate-400">
          No nudges right now. Try saving a company or enriching a contact —
          Coach lights up once there's signal to work with.
        </div>
      ) : (
        <>
          <div className="relative grid grid-cols-1 gap-2">
            {nudges.slice(0, 3).map((n) => (
              <NudgeCard
                key={n.id}
                nudge={n}
                variant="dark"
                onAction={() => handleAction(n)}
                isHighlighted={
                  highlightedLane != null &&
                  n.lane_focus != null &&
                  n.lane_focus.from === highlightedLane.from &&
                  n.lane_focus.to === highlightedLane.to
                }
                onHover={() => {
                  if (n.lane_focus) highlightLane(n.lane_focus);
                }}
                onLeave={() => highlightLane(null)}
              />
            ))}
          </div>
          {nudges.length > 3 && (
            <div className="relative mt-2 text-center">
              <span className="font-body text-[10.5px] text-slate-400">
                + {nudges.length - 3} more in the floating Coach pill (bottom-right)
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Plan + usage warning ───────────────────────────────────────── */

const PLAN_PULSE_LIMITS: Record<string, number> = {
  free_trial: 3,
  starter: 10,
  growth: 35,
  scale: 80,
  pro: 35,
  enterprise: Number.POSITIVE_INFINITY,
};

type UsageState = {
  plan: string;
  pulseUsed: number;
  pulseLimit: number;
  pulsePct: number;
  isSuperAdmin: boolean;
};

function usePulseUsage(): UsageState | null {
  const auth = useAuth();
  const userId = auth?.user?.id;
  const planRaw = String(auth?.plan || "free_trial").toLowerCase();
  const isSuperAdmin = Boolean(auth?.isSuperAdmin);
  const [usage, setUsage] = useState<UsageState | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setUsage(null);
      return;
    }
    if (isSuperAdmin) {
      setUsage({
        plan: planRaw,
        pulseUsed: 0,
        pulseLimit: Number.POSITIVE_INFINITY,
        pulsePct: 0,
        isSuperAdmin: true,
      });
      return;
    }
    const monthStartIso = (() => {
      const d = new Date();
      return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
      ).toISOString();
    })();
    (async () => {
      const { count } = await supabase
        .from("lit_pulse_ai_reports")
        .select("id", { count: "exact", head: true })
        .eq("generated_by_user_id", userId)
        .gte("created_at", monthStartIso);
      if (cancelled) return;
      const limit = PLAN_PULSE_LIMITS[planRaw] ?? PLAN_PULSE_LIMITS.free_trial;
      const used = Number(count) || 0;
      const pct =
        Number.isFinite(limit) && limit > 0
          ? Math.round((used / limit) * 100)
          : 0;
      setUsage({
        plan: planRaw,
        pulseUsed: used,
        pulseLimit: limit,
        pulsePct: pct,
        isSuperAdmin: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, planRaw, isSuperAdmin]);

  return usage;
}

function UsageBanner({ usage }: { usage: UsageState | null }) {
  if (!usage) return null;
  if (usage.isSuperAdmin) return null;
  if (!Number.isFinite(usage.pulseLimit)) return null; // enterprise
  const { pulseUsed, pulseLimit, pulsePct, plan } = usage;
  // Only show when user is approaching or past limit.
  if (pulsePct < 75) return null;
  const overLimit = pulseUsed >= pulseLimit;
  const tone = overLimit
    ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
    : "border-amber-500/40 bg-amber-500/15 text-amber-200";
  return (
    <div
      className={[
        "font-body relative mx-3.5 mt-2 mb-1 rounded-md border px-2.5 py-1.5 text-[10.5px] leading-snug",
        tone,
      ].join(" ")}
    >
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.06em]">
        {overLimit ? "Pulse limit reached" : "Running low on Pulse credits"}
      </div>
      <div className="mt-0.5">
        {pulseUsed} of {pulseLimit} Pulse briefs used this period on the{" "}
        <strong className="capitalize">{plan}</strong> plan.{" "}
        <a
          href="/app/billing"
          className="font-display font-semibold underline decoration-dotted underline-offset-2"
        >
          {overLimit ? "Upgrade to keep generating" : "Consider upgrading"}
        </a>
      </div>
    </div>
  );
}

/* ── Floating widget ─────────────────────────────────────────────── */

const FLOATING_COLLAPSED_KEY = "lit.pulse_coach.floating.collapsed";

export function PulseCoachFloating() {
  const { result, loading, refresh } = usePulseCoach();
  const handleAction = useNudgeActionHandler();
  const usage = usePulseUsage();
  // Default collapsed so the widget greets the user as a quiet pill
  // rather than a popped-open card every page load.
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(FLOATING_COLLAPSED_KEY) === "0";
  });
  const [tipIdx, setTipIdx] = useState(0);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FLOATING_COLLAPSED_KEY, open ? "0" : "1");
  }, [open]);

  // Auto-collapse after 8 seconds of no interaction. Resets when the
  // user paginates, hovers, refreshes, or any open-state change kicks
  // the timer over. Skipped while hovering so reading isn't cut off.
  useEffect(() => {
    if (!open) return;
    if (hovering) return;
    const timer = setTimeout(() => setOpen(false), 8000);
    return () => clearTimeout(timer);
  }, [open, tipIdx, hovering, loading]);

  const nudges = result?.nudges || [];
  const safeIdx = Math.min(tipIdx, Math.max(0, nudges.length - 1));
  const t = nudges[safeIdx];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.25)] transition hover:scale-105"
        style={{ background: "linear-gradient(135deg,#0F172A,#1E293B)" }}
        aria-label="Open Pulse Coach"
      >
        <Sparkles style={{ width: 20, height: 20, color: "#00F0FF" }} />
        {nudges.length > 0 && (
          <span
            className="font-mono absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: "#00F0FF", color: "#0F172A" }}
          >
            {nudges.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="fixed bottom-6 right-6 z-30 w-[340px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border shadow-[0_24px_60px_rgba(15,23,42,0.35)]"
      style={{
        background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      {t && (
        <div
          className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full"
          style={{
            background: `radial-gradient(circle, ${t.accent || "#3B82F6"}40, transparent 70%)`,
          }}
        />
      )}

      <div className="flex items-center gap-2 border-b border-white/5 px-3.5 py-3">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md border"
          style={{
            background: "rgba(0,240,255,0.1)",
            borderColor: "rgba(0,240,255,0.3)",
          }}
        >
          <Sparkles style={{ width: 12, height: 12, color: "#00F0FF" }} />
        </div>
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-slate-200">
          Pulse Coach
        </div>
        {nudges.length > 0 && (
          <span className="font-mono text-[10px] text-slate-500">
            {safeIdx + 1}/{nudges.length}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {nudges.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setTipIdx((i) => (i - 1 + nudges.length) % nudges.length)
                }
                className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-slate-400 hover:bg-white/5"
                aria-label="Previous nudge"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setTipIdx((i) => (i + 1) % nudges.length)
                }
                className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-slate-400 hover:bg-white/5"
                aria-label="Next nudge"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={loading}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-slate-400 hover:bg-white/5 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={["h-3 w-3", loading ? "animate-spin" : ""].join(" ")} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-slate-400 hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <UsageBanner usage={usage} />

      <div className="relative p-4">
        {!t ? (
          <div className="font-body text-[11px] text-slate-400">
            {loading
              ? "Reading your workspace…"
              : "All clear — nothing urgent on your plate today."}
          </div>
        ) : (
          <NudgeCard
            nudge={t}
            variant="dark-compact"
            onAction={() => handleAction(t)}
          />
        )}
      </div>

      <TutorialCard />
      <CoachComposer />
    </div>
  );
}

/* ── Tutorial card — page-aware onboarding ───────────────────────── */
function TutorialCard() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [onboardingMap, setOnboardingMap] = useState<OnboardingMap | null>(null);
  const [dismissingPending, setDismissingPending] = useState(false);

  const tutorial = useMemo(() => findTutorialForPath(pathname), [pathname]);

  useEffect(() => {
    let cancelled = false;
    if (!tutorial) {
      setOnboardingMap(null);
      return;
    }
    loadOnboardingState().then((map) => {
      if (!cancelled) setOnboardingMap(map);
    });
    return () => { cancelled = true; };
  }, [tutorial?.page_key]);

  if (!tutorial) return null;
  if (!onboardingMap) return null;
  if (!shouldShowTutorial(onboardingMap, tutorial.page_key)) return null;

  const handleDismiss = async () => {
    if (dismissingPending) return;
    setDismissingPending(true);
    await markTutorialDismissed(tutorial.page_key);
    // Optimistic local update so the card disappears immediately.
    setOnboardingMap((prev) => ({
      ...(prev ?? {}),
      [tutorial.page_key]: {
        page_key: tutorial.page_key,
        completed: false,
        completed_at: null,
        dismissed: true,
        dismissed_at: new Date().toISOString(),
      },
    }));
  };

  const handlePrimary = async () => {
    await markTutorialCompleted(tutorial.page_key);
    setOnboardingMap((prev) => ({
      ...(prev ?? {}),
      [tutorial.page_key]: {
        page_key: tutorial.page_key,
        completed: true,
        completed_at: new Date().toISOString(),
        dismissed: false,
        dismissed_at: null,
      },
    }));
    if (tutorial.first_action.route) navigate(tutorial.first_action.route);
  };

  return (
    <div className="border-t border-white/5 px-3.5 py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="inline-flex h-4 items-center rounded px-1.5 text-[9px] font-bold uppercase tracking-[0.06em]"
          style={{ background: "rgba(0,240,255,0.15)", color: "#67E8F9", border: "1px solid rgba(0,240,255,0.3)" }}
        >
          Tutorial · 30s
        </span>
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-auto text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
        >
          Dismiss
        </button>
      </div>
      <div className="font-display mb-1 text-[13px] font-semibold text-white">
        {tutorial.title}
      </div>
      <div className="font-body text-[11.5px] leading-relaxed text-slate-300">
        {tutorial.intro_md}
      </div>
      <ol className="mt-2 space-y-1.5 pl-3">
        {tutorial.steps.map((s, i) => (
          <li key={i} className="font-body text-[11px] leading-snug text-slate-300">
            <span className="font-mono mr-1.5 text-[9px] text-cyan-300">{String(i + 1).padStart(2, "0")}</span>
            <span className="font-semibold text-slate-100">{s.title}.</span>{" "}
            <span className="text-slate-400">{s.body}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={handlePrimary}
        className="font-display mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm"
        style={{ background: "linear-gradient(180deg,#06B6D4,#0891B2)" }}
      >
        <ArrowRight className="h-3 w-3" />
        {tutorial.first_action.label}
      </button>
    </div>
  );
}

/* ── Coach Composer — ask Pulse Coach anything ───────────────────── */
function CoachComposer() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ md: string; cta: { label: string; url: string } | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Resolve page-aware prompts. We always look at the full tutorial
  // map (active or not) so quick prompts surface even when the
  // tutorial card is suppressed.
  const tutorial = useMemo(() => findTutorialForPath(pathname), [pathname]);
  const quickPrompts = tutorial?.quick_prompts ?? [];

  const submit = useCallback(async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const trimmed = (override ?? q).trim();
    if (!trimmed || asking) return;
    if (override) setQ(override);
    setAsking(true);
    setErr(null);
    setAnswer(null);
    try {
      const resp = await askPulseCoach(trimmed);
      if (!resp.ok) {
        setErr(resp.error || resp.answer_md || "Coach couldn't answer that.");
        return;
      }
      setAnswer({ md: resp.answer_md, cta: resp.cta });
    } catch (err: any) {
      setErr(err?.message || "Coach failed");
    } finally {
      setAsking(false);
    }
  }, [q, asking]);

  return (
    <div className="border-t border-white/5 px-3.5 py-3">
      {quickPrompts.length > 0 && !answer ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickPrompts.slice(0, 4).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => submit(undefined, p)}
              disabled={asking}
              className="font-display rounded-full px-2.5 py-1 text-[10.5px] font-semibold text-cyan-200 disabled:opacity-50"
              style={{
                background: "rgba(0,240,255,0.08)",
                border: "1px solid rgba(0,240,255,0.25)",
              }}
              title="Send this prompt to Pulse Coach"
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}

      {answer ? (
        <div className="mb-2">
          <div className="font-body text-[12px] leading-relaxed text-slate-200" style={{ whiteSpace: "pre-wrap" }}>
            {answer.md}
          </div>
          {answer.cta ? (
            <button
              type="button"
              onClick={() => { navigate(answer.cta!.url); setAnswer(null); setQ(""); }}
              className="mt-2 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white"
              style={{ background: "rgba(0,240,255,0.15)", border: "1px solid rgba(0,240,255,0.4)" }}
            >
              {answer.cta.label} <ArrowRight className="h-3 w-3" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { setAnswer(null); setQ(""); }}
            className="ml-2 mt-2 inline-flex items-center text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
          >
            Ask another
          </button>
        </div>
      ) : null}

      {err ? <div className="mb-2 text-[11px] text-rose-300">{err}</div> : null}

      <form onSubmit={submit} className="flex items-center gap-1.5">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about LIT, your plan, replies, or how to..."
          className="flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
          disabled={asking}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={asking || !q.trim()}
          className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
          style={{ background: asking ? "rgba(0,240,255,0.1)" : "rgba(0,240,255,0.18)", border: "1px solid rgba(0,240,255,0.4)" }}
        >
          {asking ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}

/* ── Nudge card ──────────────────────────────────────────────────── */

function NudgeCard({
  nudge,
  variant,
  onAction,
  onHover,
  onLeave,
  isHighlighted,
}: {
  nudge: CoachNudge;
  variant: "dark" | "dark-compact";
  onAction: () => void;
  onHover?: () => void;
  onLeave?: () => void;
  isHighlighted?: boolean;
}) {
  // Lock the Coach card text to the same cyan-highlighted palette as the
  // header ("PULSE COACH" in #00F0FF) so no dark/black font ever lands on
  // the slate gradient. The per-nudge accent is still used for the icon
  // chip + the dark-compact button background, but every text run is
  // hardcoded bright via inline style — Tailwind purge / dark-mode
  // overrides can't override these.
  const accent = nudge.accent || "#00F0FF";
  const TITLE_COLOR = "#FFFFFF";
  const BODY_COLOR = "#CBD5E1";   // slate-300
  const CTA_COLOR = "#00F0FF";    // cyan — matches the PULSE COACH header

  if (variant === "dark-compact") {
    return (
      <div>
        <div
          className="font-display text-[13px] font-semibold leading-tight tracking-tight"
          style={{ color: TITLE_COLOR }}
        >
          {nudge.title}
        </div>
        <div
          className="font-body mt-1.5 text-[11.5px] leading-relaxed"
          style={{ color: BODY_COLOR }}
        >
          {nudge.body}
        </div>
        <button
          type="button"
          onClick={onAction}
          className="font-display mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold shadow-sm"
          style={{
            background: `linear-gradient(180deg, ${accent}, ${accent}cc)`,
            color: "#FFFFFF",
          }}
        >
          <ArrowRight className="h-3 w-3" />
          {nudge.cta || "Open"}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onAction}
      className={[
        "group relative flex flex-col rounded-lg border p-3 text-left transition",
        isHighlighted
          ? "border-cyan-300/40 bg-white/[0.07]"
          : "border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]",
      ].join(" ")}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded"
          style={{
            background: `${accent}25`,
            color: accent,
            border: `1px solid ${accent}55`,
          }}
        >
          <Sparkles className="h-2.5 w-2.5" />
        </span>
        {nudge.lane_focus?.from && nudge.lane_focus?.to && (
          <span
            className="font-mono inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em]"
            style={{
              borderColor: "rgba(0,240,255,0.3)",
              background: "rgba(0,240,255,0.08)",
              color: "#7DD3FC",
            }}
          >
            {nudge.lane_focus.from} → {nudge.lane_focus.to}
          </span>
        )}
      </div>
      <div
        className="font-display text-[12.5px] font-semibold leading-snug tracking-tight"
        style={{ color: TITLE_COLOR }}
      >
        {nudge.title}
      </div>
      <div
        className="font-body mt-1 text-[11px] leading-relaxed"
        style={{ color: BODY_COLOR }}
      >
        {nudge.body}
      </div>
      <span
        className="font-display mt-2 inline-flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: CTA_COLOR }}
      >
        <ArrowRight className="h-3 w-3" />
        {nudge.cta || "Open"}
      </span>
    </button>
  );
}

/* ── Re-export workspace lanes hook for the globe ────────────────── */

export function useWorkspaceLanes(): {
  lanes: WorkspaceLane[];
  loading: boolean;
} {
  const { result, loading } = usePulseCoach();
  return { lanes: result?.workspace_lanes || [], loading };
}
