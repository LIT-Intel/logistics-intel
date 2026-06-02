import { useMemo } from "react";
import { Sparkles, TrendingUp, Compass, Truck, Package } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import {
  computeBuyingIntent,
  type BuyingIntentSignal,
  type SignalKey,
} from "@/lib/buyingIntent/compute";

/**
 * Buying Intent tile — surfaces the 4 signals derived from ImportYeti BOL
 * data (YoY growth, new lanes 90d, forwarder switch, HS expansion).
 *
 * Hides itself entirely when `hasAnySignal === false` (Finding 4.1 in
 * /plan-eng-review). When at least one signal fires, renders only the
 * non-null signals — keeps the tile dense without noise.
 *
 * Strength color mapping is brand-aligned:
 *   high   → emerald (decisive sales-conversation signal)
 *   medium → amber  (worth a glance)
 *   low    → slate  (rare; thresholds tuned so this is uncommon)
 */

const SIGNAL_ICONS: Record<SignalKey, React.ElementType> = {
  yoy_growth: TrendingUp,
  new_lanes: Compass,
  forwarder_switch: Truck,
  hs_expansion: Package,
};

const STRENGTH_STYLES = {
  high: {
    dot: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "Strong",
  },
  medium: {
    dot: "bg-amber-500",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    label: "Moderate",
  },
  low: {
    dot: "bg-slate-400",
    chip: "border-slate-200 bg-slate-50 text-slate-600",
    label: "Watching",
  },
} as const;

export type BuyingIntentTileProps = {
  profile: any;
  recentBols: any[];
  /** Override for tests / Storybook. Defaults to new Date() at call time. */
  now?: Date;
  className?: string;
};

export default function BuyingIntentTile({
  profile,
  recentBols,
  now,
  className,
}: BuyingIntentTileProps) {
  const intent = useMemo(
    () => computeBuyingIntent(profile, recentBols, now ?? new Date()),
    [profile, recentBols, now],
  );

  // Hide the tile entirely when nothing is interesting.
  if (!intent.hasAnySignal) return null;

  const activeSignals = intent.signals.filter((s) => s.strength !== null);
  const headerSummary =
    intent.highStrengthCount > 0
      ? `${intent.highStrengthCount} strong signal${intent.highStrengthCount === 1 ? "" : "s"}`
      : `${activeSignals.length} active signal${activeSignals.length === 1 ? "" : "s"}`;

  return (
    <LitSectionCard
      title="Buying Intent"
      sub={headerSummary}
      action={<Sparkles className="h-3.5 w-3.5 text-blue-500" />}
      className={className}
      padded={false}
    >
      <ul className="divide-y divide-slate-100">
        {activeSignals.map((signal) => (
          <SignalRow key={signal.key} signal={signal} />
        ))}
      </ul>
    </LitSectionCard>
  );
}

function SignalRow({ signal }: { signal: BuyingIntentSignal }) {
  const Icon = SIGNAL_ICONS[signal.key];
  const style = STRENGTH_STYLES[signal.strength ?? "low"];
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display truncate text-[12.5px] font-semibold text-slate-900">
            {signal.label}
          </span>
          <span
            className={[
              "font-mono inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em]",
              style.chip,
            ].join(" ")}
          >
            <span className={["inline-block h-1.5 w-1.5 rounded-full", style.dot].join(" ")} aria-hidden />
            {style.label}
          </span>
        </div>
        <p className="font-body mt-0.5 text-[11.5px] leading-snug text-slate-500">
          {signal.detail}
        </p>
      </div>
    </li>
  );
}
