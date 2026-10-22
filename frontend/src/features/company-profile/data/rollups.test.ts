import { describe, expect, it } from "vitest";
import { assembleDataset, blendedMonth, normalizeRollups } from "./rollups";
import type { TsMonthlyDbRow } from "./rollups";
import type { RecentBolInput } from "./normalizeShipments";

// Regression fixtures encode the production totals observed in October 2026.
// No production credentials or private shipment documents are embedded.
function monthlyRows(totalShipments: number, totalTeu: number): TsMonthlyDbRow[] {
  const shipments = Array.from({ length: 12 }, () => Math.floor(totalShipments / 12));
  const teu = Array.from({ length: 12 }, () => Math.floor(totalTeu / 12));
  shipments[11] += totalShipments - shipments.reduce((a, b) => a + b, 0);
  teu[11] += totalTeu - teu.reduce((a, b) => a + b, 0);
  return shipments.map((value, i) => {
    const m = 10 + i; // Nov 2025 through October 2026.
    return { year: 2025 + Math.floor(m / 12), month: (m % 12) + 1, shipments: value, teu: teu[i] };
  });
}

const observedNow = new Date("2026-10-21T12:00:00Z");
const bolSample: RecentBolInput[] = Array.from({ length: 50 }, (_, i) => ({
  bolNumber: `sample-${i}`,
  date: "2026-10-10",
  teu: 2,
  containersCount: 1,
  supplier: "Sample Supplier",
}));

describe("Company Profile full-history reconciliation", () => {
  it.each([
    ["Mitsubishi Turbocharger and Engine America", 186, 392],
    ["Sunset Healthcare Solutions", 399, 783],
  ])("%s keeps the 12-month shipment rollup separate from 50 sampled BOLs", (_name, shipments, teu) => {
    const ds = assembleDataset(
      { bolRows: [], tsRows: monthlyRows(shipments, teu), laneRows: [] },
      bolSample,
      observedNow,
    );
    expect(ds).not.toBeNull();
    expect(ds!.rows).toHaveLength(50);
    expect(ds!.rollup?.totalShipments).toBe(shipments);
    expect(ds!.rollup?.totalTeu).toBe(teu);
    const recentMonths = monthlyRows(shipments, teu);
    const month = recentMonths[11];
    const mi = (month.year - ds!.firstYear) * 12 + month.month - 1;
    expect(blendedMonth(ds!, "full", [], mi, undefined).shipments).toBe(month.shipments);
  });

  it("shows monthly rollup even if detailed BOL documents are unavailable", () => {
    const ds = assembleDataset(
      { bolRows: [], tsRows: monthlyRows(186, 392), laneRows: [] },
      [],
      observedNow,
    );
    expect(ds).not.toBeNull();
    expect(ds!.rows).toHaveLength(0);
    expect(ds!.rollup?.totalShipments).toBe(186);
  });

  it("does not manufacture missing history from a 50-row document sample", () => {
    const ds = assembleDataset(
      { bolRows: [], tsRows: [], laneRows: [] },
      bolSample,
      observedNow,
    );
    expect(ds?.rollup).toBeNull();
    expect(ds?.rows).toHaveLength(50);
  });

  it("merges saved historical months without double counting sampled documents", () => {
    const tsRows = monthlyRows(399, 783);
    const rollup = normalizeRollups(tsRows, [], 2025, 21);
    expect(rollup?.totalShipments).toBe(399);
    expect(rollup?.totalTeu).toBe(783);
  });
});
