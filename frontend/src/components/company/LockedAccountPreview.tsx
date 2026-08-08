import { Link } from "react-router-dom";
import { Lock, TrendingUp, Ship, Users, CalendarRange, X } from "lucide-react";

/**
 * Locked-account preview — replaces the generic quota banner when a trial
 * user hits their company_profile_view cap. Instead of a flat "limit
 * reached" message, the user sees a premium-looking blurred skeleton of the
 * intelligence that exists behind the gate (lanes, carrier mix, cadence,
 * contacts) with the upgrade CTA framed as unlocking THIS account.
 *
 * Deliberately renders skeleton bars rather than fabricated numbers — we
 * haven't paid for this account's data yet, so we tease the shape of the
 * intelligence, never fake values.
 */

const TEASER_ROWS = [
  { icon: Ship, label: "Trade lanes & volumes", w1: "w-40", w2: "w-24" },
  { icon: TrendingUp, label: "Carrier & container mix", w1: "w-32", w2: "w-28" },
  { icon: CalendarRange, label: "12-month shipping cadence", w1: "w-44", w2: "w-20" },
  { icon: Users, label: "Verified decision-maker contacts", w1: "w-36", w2: "w-24" },
];

export default function LockedAccountPreview({
  companyName,
  used,
  limit,
  upgradeUrl,
  onDismiss,
}: {
  companyName?: string | null;
  used?: number | null;
  limit?: number | null;
  upgradeUrl?: string | null;
  onDismiss: () => void;
}) {
  const name = (companyName || "This account").trim();
  return (
    <div className="relative mx-4 mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:mx-6">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="absolute right-3 top-3 z-20 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr]">
        {/* Left — the pitch, anchored to THIS account. */}
        <div className="p-6 md:p-7">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1">
            <Lock className="h-3 w-3 text-amber-600" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
              {typeof used === "number" && typeof limit === "number"
                ? `${used} of ${limit} free unlocks used`
                : "Free unlocks used"}
            </span>
          </div>
          <h3 className="font-display mt-3 text-[19px] font-bold leading-snug text-slate-900">
            {name}&rsquo;s full intelligence is one upgrade away.
          </h3>
          <p className="font-body mt-2 text-[13.5px] leading-relaxed text-slate-600">
            You&rsquo;ve used your free deep unlocks — which usually means the
            data is working. Searching stays free. Upgrading unlocks this
            account&rsquo;s live shipment history, lane economics, and the
            people who buy freight here.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              to={upgradeUrl || "/app/billing"}
              className="font-display inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Lock className="h-3.5 w-3.5" />
              Unlock this account
            </Link>
            <span className="font-body text-[12px] text-slate-500">
              Plans from $99/mo · cancel anytime
            </span>
          </div>
        </div>

        {/* Right — blurred skeleton of what's behind the gate. */}
        <div
          className="relative select-none border-t border-slate-100 bg-slate-50/70 p-6 md:border-l md:border-t-0"
          aria-hidden
        >
          <div className="pointer-events-none space-y-3 blur-[3px]">
            {TEASER_ROWS.map(({ icon: Icon, label, w1, w2 }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-blue-500" />
                <div className="min-w-0 flex-1">
                  <div className={`h-2.5 rounded bg-slate-300 ${w1}`} />
                  <div className={`mt-1.5 h-2 rounded bg-slate-200 ${w2}`} />
                </div>
                <div className="h-2.5 w-10 shrink-0 rounded bg-blue-200" />
              </div>
            ))}
          </div>
          {/* Un-blurred labels floating above the skeleton so the user
              knows exactly what each blurred row IS. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-[26px] p-6 pt-7">
            {TEASER_ROWS.map(({ label }) => (
              <span
                key={label}
                className="font-display ml-10 text-[11px] font-semibold text-slate-500"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
