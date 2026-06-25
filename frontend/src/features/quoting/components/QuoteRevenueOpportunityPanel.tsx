/**
 * QuoteRevenueOpportunityPanel — annualized revenue-opportunity estimate.
 *
 * Honest-data rule: an estimate is shown ONLY when the attached company carries
 * real shipment volume (`shipments_12m` from ImportYeti). The number is derived
 * from that real volume × the quoted average sell per shipment — and is always
 * labelled "Estimated · Confidence: …", never guaranteed revenue. With no
 * volume data we show the "Not enough data" state. We never fabricate volume.
 */
import { TrendingUp, SignalHigh, Shield, Info } from "lucide-react";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function compact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return money.format(n);
}

export default function QuoteRevenueOpportunityPanel({
  shipments12m,
  totalSell,
  lineItemCount,
}: {
  /** Real 12-month shipment count on the attached company, if known. */
  shipments12m?: number | null;
  /** Current quote total sell (one shipment's worth). */
  totalSell: number;
  /** Number of priced line items — used to gate the estimate honestly. */
  lineItemCount: number;
}) {
  const hasVolume = shipments12m != null && shipments12m > 0;
  const hasPrice = totalSell > 0 && lineItemCount > 0;
  const canEstimate = hasVolume && hasPrice;

  // Annualized = real shipments/12M × this quote's sell (treated as per-shipment).
  const estimate = canEstimate ? (shipments12m as number) * totalSell : 0;
  // Confidence reflects how much real signal backs the estimate.
  const confidence =
    (shipments12m as number) >= 500 ? "High" : (shipments12m as number) >= 50 ? "Medium" : "Low";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-emerald-50 text-emerald-700">
          <TrendingUp className="h-3.5 w-3.5" />
        </span>
        <h3 className="font-display text-[13px] font-semibold text-slate-900">
          Revenue Opportunity
        </h3>
      </div>
      <div className="p-4">
        {canEstimate ? (
          <>
            <div className="font-mono text-[22px] font-bold tracking-[-0.5px] text-slate-900">
              {compact(estimate)}
              <span className="text-[13px] font-medium text-slate-400"> / yr est.</span>
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
              <SignalHigh className="h-3 w-3" />
              Estimated · Confidence: {confidence}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-500">
              Estimated from this company&apos;s {(shipments12m as number).toLocaleString()}{" "}
              shipments (12M) at the quoted sell rate. An estimate, not guaranteed revenue.
            </p>
            <div className="mt-2.5 flex items-start gap-1.5 text-[10.5px] text-slate-400">
              <Shield className="mt-0.5 h-3 w-3 flex-shrink-0" />
              Derived from real shipment data. No fabricated rates.
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2.5 rounded-[10px] border border-slate-200 bg-slate-50 p-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <div>
              <div className="text-[12.5px] font-semibold text-slate-700">
                Not enough data to estimate opportunity
              </div>
              <div className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
                {hasVolume
                  ? "Add priced line items to estimate annualized revenue."
                  : "Attach a company with shipment history to estimate annualized revenue."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
