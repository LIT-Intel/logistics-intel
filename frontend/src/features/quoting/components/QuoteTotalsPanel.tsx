/**
 * QuoteTotalsPanel — navy "Quote Summary" card.
 *
 * Pure presentation of a `QuoteTotals` result (from `computeTotals`, the local
 * preview) — the builder feeds it live values on every edit and swaps in the
 * server's authoritative numbers after a save.
 */
import type { QuoteTotals } from "@/lib/quoting/totals";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function QuoteTotalsPanel({
  totals,
  fuelPct,
}: {
  totals: QuoteTotals;
  fuelPct?: number | null;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-[18px] text-slate-300 shadow-[0_14px_40px_rgba(15,23,42,0.28)]"
      style={{ background: "linear-gradient(170deg,#0F172A,#16233c)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36"
        style={{
          background: "radial-gradient(circle,rgba(0,240,255,.22),transparent 70%)",
        }}
      />
      <h3 className="relative mb-3.5 font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-sky-300">
        Quote Summary
      </h3>

      <Row label="Subtotal (sell)" value={money.format(totals.subtotal_sell)} />
      <Row
        label={`Fuel surcharge${
          fuelPct != null && Number.isFinite(fuelPct) ? ` (${fuelPct}%)` : ""
        }`}
        value={money.format(totals.fuel_surcharge_amount)}
      />
      <Row label="Accessorials" value={money.format(totals.accessorial_total)} />

      <Row
        label="Total cost"
        value={money.format(totals.total_cost)}
        className="mt-1.5 border-t border-dashed border-white/10 pt-3"
      />

      <div className="mt-2 flex items-center justify-between border-t border-white/15 pt-3">
        <span className="font-display text-[14px] font-semibold text-white">Total Sell</span>
        <b className="font-mono text-[23px] font-semibold tracking-[-0.5px] text-white">
          {money.format(totals.total_sell)}
        </b>
      </div>

      <div className="relative mt-3.5 flex items-center justify-between rounded-[11px] border border-white/10 bg-white/5 px-3 py-3">
        <div>
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">
            Gross Profit
          </div>
          <div className="mt-0.5 font-mono text-[12px] font-semibold text-sky-300">
            {totals.gross_margin_pct.toFixed(1)}% margin
          </div>
        </div>
        <div className="font-mono text-[17px] font-bold text-emerald-400">
          {money.format(totals.gross_profit)}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={"flex items-center justify-between py-1.5 text-[13px] " + className}>
      <span className="text-slate-400">{label}</span>
      <b className="font-mono text-[13.5px] font-semibold text-slate-200">{value}</b>
    </div>
  );
}
