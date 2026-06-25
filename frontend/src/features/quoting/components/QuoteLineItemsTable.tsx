/**
 * QuoteLineItemsTable — editable line items + accessorials.
 *
 * Renders two visual groups inside one table: regular charges and accessorials
 * (rows where `is_accessorial` is true get a tinted background and sort below).
 * Emits the full `QuoteLineItem[]` up to the builder on every edit so the live
 * totals preview stays in sync. Server is authoritative on save.
 */
import { Plus, X } from "lucide-react";
import type { QuoteLineItem } from "@/api/quoting";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function newRow(is_accessorial: boolean): QuoteLineItem {
  return {
    name: "",
    quantity: 1,
    unit_cost: 0,
    unit_sell: 0,
    is_accessorial,
  };
}

const num = (v: string): number => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export default function QuoteLineItemsTable({
  items,
  onChange,
}: {
  items: QuoteLineItem[];
  onChange: (items: QuoteLineItem[]) => void;
}) {
  const patch = (idx: number, p: Partial<QuoteLineItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = (is_accessorial: boolean) => onChange([...items, newRow(is_accessorial)]);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse">
          <thead>
            <tr>
              <Th className="w-[34%]">Charge</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Unit Cost</Th>
              <Th align="right">Unit Sell</Th>
              <Th align="right">Total Sell</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-[12.5px] text-slate-400">
                  No line items yet. Add a charge to start pricing.
                </td>
              </tr>
            )}
            {items.map((it, idx) => {
              const total = (Number(it.quantity) || 0) * (Number(it.unit_sell) || 0);
              return (
                <tr
                  key={idx}
                  className={
                    "border-b border-slate-50 " + (it.is_accessorial ? "bg-[#fcfcfd]" : "")
                  }
                >
                  <td className="px-2 py-1.5">
                    <input
                      value={it.name ?? ""}
                      onChange={(e) => patch(idx, { name: e.target.value })}
                      placeholder={it.is_accessorial ? "Accessorial name" : "Charge name"}
                      className={cellInput}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      value={it.quantity ?? ""}
                      onChange={(e) => patch(idx, { quantity: num(e.target.value) })}
                      inputMode="decimal"
                      className={cellInputMonoRight}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      value={it.unit_cost ?? ""}
                      onChange={(e) => patch(idx, { unit_cost: num(e.target.value) })}
                      inputMode="decimal"
                      className={cellInputMonoRight}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      value={it.unit_sell ?? ""}
                      onChange={(e) => patch(idx, { unit_sell: num(e.target.value) })}
                      inputMode="decimal"
                      className={cellInputMonoRight}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[12.5px] font-semibold text-slate-900 whitespace-nowrap">
                    {money.format(total)}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      aria-label="Remove line item"
                      title="Remove"
                      onClick={() => remove(idx)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-transparent text-slate-300 transition hover:border-slate-200 hover:bg-slate-50 hover:text-rose-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 px-2 pb-1 pt-3">
        <button
          type="button"
          onClick={() => add(false)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2 font-display text-[11.5px] font-semibold text-blue-600 transition hover:bg-blue-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Line Item
        </button>
        <button
          type="button"
          onClick={() => add(true)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-dashed border-violet-200 bg-violet-50 px-3 py-2 font-display text-[11.5px] font-semibold text-violet-700 transition hover:bg-violet-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Accessorial
        </button>
      </div>
    </div>
  );
}

const cellInput =
  "w-full h-8 rounded-[7px] border border-transparent bg-transparent px-2 text-[12.5px] text-slate-900 outline-none transition hover:bg-slate-50 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/12";
const cellInputMonoRight = cellInput + " text-right font-mono font-semibold";

function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={
        "border-b border-slate-100 px-2 py-2 font-display text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400 " +
        (align === "right" ? "text-right " : "text-left ") +
        className
      }
    >
      {children}
    </th>
  );
}
