/**
 * Phase 4 — Revenue Opportunity tab.
 *
 * Quantitative companion to the Pulse AI tab. Pulse AI produces qualitative
 * narrative ("why now", "buying signals"); this tab produces the dollar
 * opportunity sized across six service lines (Ocean, Customs, Drayage, Air,
 * Warehousing, Trucking) with confidence indicators and win-rate scenarios.
 *
 * Math lives in `frontend/src/lib/revenueOpportunity.ts`. This file is just
 * the rendering layer + an empty state for companies without enough data.
 */
import { useMemo } from "react";
import {
  Anchor,
  CheckCircle2,
  FileSearch,
  Info,
  Plane,
  TrendingUp,
  Truck,
  AlertTriangle,
  Lightbulb,
  Building2,
} from "lucide-react";
import {
  buildRevenueOpportunity,
  formatUsdShort,
  type ConfidenceLevel,
  type RevenueOpportunityInputs,
  type RevenueOpportunityReport,
  type ServiceLineEstimate,
} from "@/lib/revenueOpportunity";
import type { FreightLane } from "@/lib/freightRateBenchmark";

type Props = {
  companyName: string | null;
  shipments12m: number | null;
  teu12m: number | null;
  fclShipments12m: number | null;
  lclShipments12m: number | null;
  topRoutes: any[] | null;
  benchmarkLanes: FreightLane[];
  hsProfile?: any[] | null;
  carrierMix?: any[] | null;
  importerSelfReportedSpend12m?: number | null;
};

const SERVICE_LINE_ICONS: Record<string, any> = {
  Ocean: Anchor,
  Customs: FileSearch,
  Drayage: Truck,
  Air: Plane,
  Trucking: Truck,
};

const CONFIDENCE_TONE: Record<
  ConfidenceLevel,
  { label: string; bg: string; text: string; border: string }
> = {
  high: {
    label: "High confidence",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  medium: {
    label: "Medium confidence",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  low: {
    label: "Low confidence",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  insufficient_data: {
    label: "Insufficient data",
    bg: "bg-slate-50",
    text: "text-slate-500",
    border: "border-slate-200",
  },
};

function ServiceLineCard({
  line,
  shortKey,
}: {
  line: ServiceLineEstimate;
  shortKey: keyof typeof SERVICE_LINE_ICONS;
}) {
  const Icon = SERVICE_LINE_ICONS[shortKey] ?? Building2;
  const tone = CONFIDENCE_TONE[line.confidence];
  const isUsable = line.value != null && line.value > 0;

  return (
    <div
      className={[
        "rounded-xl border bg-white p-4 transition",
        isUsable ? "border-slate-200" : "border-slate-100 opacity-80",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={[
              "flex h-8 w-8 items-center justify-center rounded-md",
              isUsable ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[12.5px] font-bold text-[#0F172A]">
              {line.serviceLine}
            </div>
          </div>
        </div>
        <div
          className={[
            "rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide whitespace-nowrap",
            tone.bg,
            tone.text,
            tone.border,
          ].join(" ")}
        >
          {tone.label}
        </div>
      </div>
      <div className="mb-2">
        {isUsable ? (
          <div className="text-[22px] font-bold text-[#0F172A] tabular-nums leading-tight">
            {formatUsdShort(line.value)}
          </div>
        ) : (
          <div className="text-[14px] font-semibold text-slate-400 leading-tight">
            Not enough data
          </div>
        )}
        <div className="text-[10.5px] text-slate-500 leading-tight">
          per year, addressable
        </div>
      </div>
      <div className="text-[11px] text-slate-600 leading-snug">
        {line.reason}
      </div>
      {line.inputs.length > 0 ? (
        <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-1">
          {line.inputs.map((input) => (
            <div key={input.label} className="text-[10px] leading-tight">
              <div className="text-slate-500">{input.label}</div>
              <div className="font-semibold text-slate-800 truncate">
                {input.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CrossSellCard({
  signal,
}: {
  signal: RevenueOpportunityReport["crossSellSignals"][number];
}) {
  const styles = {
    info: { bg: "bg-blue-50", text: "text-blue-900", border: "border-blue-200", Icon: Info },
    buy: { bg: "bg-emerald-50", text: "text-emerald-900", border: "border-emerald-200", Icon: Lightbulb },
    risk: { bg: "bg-amber-50", text: "text-amber-900", border: "border-amber-200", Icon: AlertTriangle },
  }[signal.tone];
  const I = styles.Icon;
  return (
    <div className={["rounded-lg border p-3", styles.bg, styles.border].join(" ")}>
      <div className="flex items-start gap-2">
        <I className={["h-3.5 w-3.5 flex-shrink-0 mt-0.5", styles.text].join(" ")} />
        <div className="min-w-0">
          <div className={["text-[12.5px] font-bold leading-tight", styles.text].join(" ")}>
            {signal.title}
          </div>
          <div className={["text-[11.5px] leading-snug mt-0.5", styles.text].join(" ")}>
            {signal.body}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CDPRevenueOpportunity(props: Props) {
  const inputs: RevenueOpportunityInputs = useMemo(
    () => ({
      companyName: props.companyName,
      shipments12m: props.shipments12m,
      teu12m: props.teu12m,
      fclShipments12m: props.fclShipments12m,
      lclShipments12m: props.lclShipments12m,
      topRoutes: props.topRoutes,
      benchmarkLanes: props.benchmarkLanes,
      hsProfile: props.hsProfile,
      carrierMix: props.carrierMix,
      importerSelfReportedSpend12m: props.importerSelfReportedSpend12m,
    }),
    [props],
  );

  const report = useMemo(() => buildRevenueOpportunity(inputs), [inputs]);

  if (!report.hasUsableData) {
    return (
      <div className="px-6 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <TrendingUp className="mx-auto h-7 w-7 text-slate-400 mb-3" />
          <div className="text-[15px] font-bold text-[#0F172A] mb-1.5">
            Revenue opportunity needs more data
          </div>
          <div className="text-[13px] text-slate-600 leading-snug max-w-md mx-auto">
            We size opportunity from shipment volume, FCL/LCL split, top
            routes, and current FBX benchmark rates. Refresh this company's
            intelligence — once shipment data is loaded the opportunity will
            populate here.
          </div>
        </div>
      </div>
    );
  }

  const { serviceLines, crossSellSignals, totalAddressableSpend, scenarios, benchmarkAsOf } =
    report;

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Hero — total addressable spend + win-rate scenarios */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 text-white overflow-hidden">
        <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-5 items-center">
          <div>
            <div className="text-[10.5px] uppercase tracking-wide font-semibold text-blue-200 mb-1">
              Total addressable freight spend, 12-month
            </div>
            <div className="text-[36px] font-bold tabular-nums leading-none mb-1">
              {formatUsdShort(totalAddressableSpend)}
            </div>
            <div className="text-[12px] text-blue-100 leading-snug max-w-xl">
              Sum of every service line below. {props.companyName ? `${props.companyName}'s` : "This account's"} entire freight wallet — what you could win if you displaced the whole stack.
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            {scenarios.map((s) => (
              <div
                key={s.label}
                className="rounded-lg bg-white/10 backdrop-blur px-3 py-2 text-center min-w-[88px]"
              >
                <div className="text-[9.5px] uppercase tracking-wide font-semibold text-blue-200">
                  {s.label.split(" ")[0]}
                </div>
                <div className="text-[16px] font-bold tabular-nums leading-tight">
                  {formatUsdShort(s.value)}
                </div>
                <div className="text-[9.5px] text-blue-200">
                  win rate {Math.round(s.rate * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Service-line grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <div>
            <div className="text-[13px] font-bold text-[#0F172A]">
              Opportunity by service line
            </div>
            <div className="text-[11px] text-slate-500">
              Each line sized from actual shipment data + industry-standard
              per-unit fees. Cards in slate are flagged as "insufficient data" — never fabricated.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <ServiceLineCard line={serviceLines.ocean} shortKey="Ocean" />
          <ServiceLineCard line={serviceLines.customs} shortKey="Customs" />
          <ServiceLineCard line={serviceLines.drayage} shortKey="Drayage" />
          <ServiceLineCard line={serviceLines.air} shortKey="Air" />
          <ServiceLineCard line={serviceLines.trucking} shortKey="Trucking" />
        </div>
      </div>

      {/* Cross-sell signals */}
      {crossSellSignals.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-600" />
            <div>
              <div className="text-[13px] font-bold text-[#0F172A]">
                Cross-sell signals
              </div>
              <div className="text-[11px] text-slate-500">
                Patterns in the data that hint at specific plays — what a senior account manager would notice in 30 seconds.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {crossSellSignals.map((s) => (
              <CrossSellCard key={s.id} signal={s} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Methodology footer */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] leading-snug text-slate-600">
            <span className="font-semibold text-slate-700">Methodology:</span>{" "}
            Ocean uses lane-matched FBX rates (LCL-bounded TEU split). Customs
            uses per-entry brokerage fees ($150 FCL / $200 LCL). Drayage uses
            blended US East/West coast pulls (~$450). Air uses HS-derived
            air-likely share with a 5% conversion factor + $2.80/kg general
            cargo rate. Trucking uses 60% of FCL × $1,200 post-port FTL.
            {benchmarkAsOf
              ? ` Benchmark snapshot as of ${benchmarkAsOf}.`
              : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
