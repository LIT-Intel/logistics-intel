// Mirror of supabase/functions/_shared/quote_helpers.ts computeTotals — keep in sync. Server is authoritative on save.
//
// Browser copy of the server totals math, used for live preview in the Quote
// Builder. Recomputes all quote financials from line items + fuel %. The server
// remains the source of truth: this preview is never persisted directly.
import type { QuoteLineItem } from "@/api/quoting";

export interface QuoteTotals {
  subtotal_cost: number;
  subtotal_sell: number;
  accessorial_total: number;
  fuel_surcharge_amount: number;
  total_cost: number;
  total_sell: number;
  gross_profit: number;
  gross_margin_pct: number;
}

/** Recompute all quote financials from line items + fuel %. Mirrors the server helper. */
export function computeTotals(
  items: QuoteLineItem[],
  fuelPct: number | null | undefined,
): QuoteTotals {
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  let subtotal_cost = 0,
    subtotal_sell = 0,
    accessorial_total = 0;
  for (const li of items) {
    const tc = num(li.quantity) * num(li.unit_cost);
    const ts = num(li.quantity) * num(li.unit_sell);
    subtotal_cost += tc;
    subtotal_sell += ts;
    if (li.is_accessorial) accessorial_total += ts;
  }
  const pct = num(fuelPct);
  const fuel_surcharge_amount = +(subtotal_sell * (pct / 100)).toFixed(2);
  const total_cost = +subtotal_cost.toFixed(2);
  const total_sell = +(subtotal_sell + fuel_surcharge_amount).toFixed(2);
  const gross_profit = +(total_sell - total_cost).toFixed(2);
  const gross_margin_pct = total_sell > 0 ? +((gross_profit / total_sell) * 100).toFixed(2) : 0;
  return {
    subtotal_cost: +subtotal_cost.toFixed(2),
    subtotal_sell: +subtotal_sell.toFixed(2),
    accessorial_total: +accessorial_total.toFixed(2),
    fuel_surcharge_amount,
    total_cost,
    total_sell,
    gross_profit,
    gross_margin_pct,
  };
}
