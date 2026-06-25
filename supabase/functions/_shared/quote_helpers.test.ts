import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeTotals } from "./quote_helpers.ts";

Deno.test("totals: fuel on sell, accessorials in sell, margin", () => {
  const t = computeTotals(
    [{ name: "Ocean", quantity: 3, unit_cost: 2150, unit_sell: 2680 },
     { name: "Chassis", quantity: 9, unit_cost: 35, unit_sell: 45, is_accessorial: true }],
    18.5,
  );
  assertEquals(t.subtotal_sell, 8445);
  assertEquals(t.subtotal_cost, 6765);
  assertEquals(t.accessorial_total, 405);
  assertEquals(t.total_cost, 6765);
  // fuel = 8445 * 0.185 = 1562.325 -> 1562.33 (computed authority)
  assertEquals(t.fuel_surcharge_amount, 1562.33);
  // total_sell = subtotal_sell + fuel = 8445 + 1562.33
  assertEquals(t.total_sell, 10007.33);
  // gp = total_sell - total_cost = 10007.33 - 6765
  assertEquals(t.gross_profit, 3242.33);
  // margin = gp / total_sell * 100
  assertEquals(t.gross_margin_pct, 32.4);
});

Deno.test("totals: div-by-zero safe", () => {
  const t = computeTotals([], null);
  assertEquals(t.total_sell, 0);
  assertEquals(t.gross_margin_pct, 0);
});
