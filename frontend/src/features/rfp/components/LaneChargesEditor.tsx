import type { ReactNode } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import {
  CHARGE_BASES,
  CHARGE_BASIS_LABELS,
  computeLaneAllIn,
  defaultOceanCharges,
  emptyCharge,
  type RfpCharge,
  type RfpChargeBasis,
  type RfpLane,
} from "@/api/rfp";

/**
 * RFP-native rate-breakdown editor. Builds a lane's All-In price from named
 * charges (Base Ocean + BAF/CAF/THC/GRI/PSS/Doc …) the way a forwarder quotes.
 * Self-contained inside the RFP feature — deliberately does NOT depend on the
 * separate quoting subsystem (RFP and quotes are distinct functions).
 */

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const LBS_PER_KG = 2.2046226218;
const cellInput =
  "h-8 w-full rounded-[7px] border border-slate-200 bg-white px-2 text-[11.5px] text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10";

export default function LaneChargesEditor({
  lane,
  onPatch,
}: {
  lane: RfpLane;
  onPatch: (patch: Partial<RfpLane>) => void;
}) {
  const charges = lane.charges ?? [];
  const setCharges = (next: RfpCharge[]) => onPatch({ charges: next });
  const updateCharge = (id: string, patch: Partial<RfpCharge>) =>
    setCharges(charges.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const qty = (c: RfpCharge) =>
    c.basis === "per_kg" ? Math.max(0, (Number(lane.weight_lbs) || 0) / LBS_PER_KG) : 1;
  const allIn = computeLaneAllIn(lane);
  const unit = lane.equipment?.trim() || "shipment";

  return (
    <div className="rounded-[10px] border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="font-display text-[11.5px] font-bold uppercase tracking-[0.06em] text-slate-500">
          Rate Breakdown
        </div>
        <div className="flex items-center gap-2">
          {!charges.length && (
            <button
              type="button"
              onClick={() => setCharges(defaultOceanCharges())}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Sparkles className="h-3.5 w-3.5" /> Seed standard ocean charges
            </button>
          )}
          <button
            type="button"
            onClick={() => setCharges([...charges, emptyCharge()])}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add charge
          </button>
        </div>
      </div>
      {charges.length ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FAFBFC]">
              <Th className="w-[84px]">Code</Th>
              <Th>Charge Name</Th>
              <Th className="w-[130px]">Basis</Th>
              <Th className="w-[110px] text-right">Amount</Th>
              <Th className="w-[80px] text-right">Qty</Th>
              <Th className="w-[120px] text-right">Extended</Th>
              <Th className="w-[40px]" />
            </tr>
          </thead>
          <tbody>
            {charges.map((c) => {
              const ext = (Number(c.amount) || 0) * qty(c);
              return (
                <tr key={c.id} className="border-b border-slate-50">
                  <Td>
                    <input
                      value={c.code}
                      onChange={(e) => updateCharge(c.id, { code: e.target.value })}
                      placeholder="BAF"
                      className={cellInput + " uppercase"}
                    />
                  </Td>
                  <Td>
                    <input
                      value={c.name}
                      onChange={(e) => updateCharge(c.id, { name: e.target.value })}
                      placeholder="Bunker Adjustment Factor"
                      className={cellInput}
                    />
                  </Td>
                  <Td>
                    <select
                      value={c.basis}
                      onChange={(e) => updateCharge(c.id, { basis: e.target.value as RfpChargeBasis })}
                      className={cellInput}
                    >
                      {CHARGE_BASES.map((b) => (
                        <option key={b} value={b}>
                          {CHARGE_BASIS_LABELS[b]}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <input
                      type="number"
                      min="0"
                      value={c.amount || ""}
                      onChange={(e) => updateCharge(c.id, { amount: Number(e.target.value) || 0 })}
                      className={cellInput + " text-right font-mono"}
                    />
                  </Td>
                  <Td className="text-right font-mono text-[11px] text-slate-500">
                    {c.basis === "per_kg" ? qty(c).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "1"}
                  </Td>
                  <Td className="text-right font-mono text-[11.5px] font-semibold text-slate-800">
                    {money.format(ext)}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setCharges(charges.filter((x) => x.id !== c.id))}
                      className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove charge"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-blue-50/60">
              <td colSpan={5} className="px-2 py-2 text-right font-display text-[11px] font-bold uppercase tracking-[0.06em] text-blue-700">
                All-In per {unit}
              </td>
              <td className="px-2 py-2 text-right font-mono text-[13px] font-bold text-blue-700">
                {money.format(allIn)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className="px-3 py-6 text-center text-[11.5px] text-slate-400">
          No rate lines yet. Seed standard ocean charges or add charges to build the All-In rate.
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`border-b border-slate-100 px-2 py-2 text-left text-[9px] font-bold uppercase tracking-[0.07em] text-slate-400 ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 ${className}`}>{children}</td>;
}
