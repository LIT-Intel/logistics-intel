// Behavior tests for the Buying Intent aggregator. Per /plan-eng-review
// Finding 4.1: tile must hide when all 4 signals are null. These tests
// lock that behavior + cover sparse-history and new-account edge cases.
//
// Run: npm test --workspace frontend src/lib/buyingIntent

import { describe, it, expect } from "vitest";
import {
  computeBuyingIntent,
  computeYoyGrowth,
  computeNewLanes90d,
  computeForwarderSwitch,
  computeHsExpansion,
} from "../compute";

const NOW = new Date("2026-06-01T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

describe("computeYoyGrowth", () => {
  it("returns 'high' when last 12 mo is >= 25% above prior 12 mo", () => {
    const profile = {
      timeSeries: [
        ...Array.from({ length: 12 }, () => ({ shipments: 100 })),
        ...Array.from({ length: 12 }, () => ({ shipments: 150 })),
      ],
    };
    const signal = computeYoyGrowth(profile, NOW);
    expect(signal.strength).toBe("high");
    expect(signal.value).toBe(50);
  });

  it("returns 'medium' when 10-24% growth", () => {
    const profile = {
      timeSeries: [
        ...Array.from({ length: 12 }, () => ({ shipments: 100 })),
        ...Array.from({ length: 12 }, () => ({ shipments: 115 })),
      ],
    };
    const signal = computeYoyGrowth(profile, NOW);
    expect(signal.strength).toBe("medium");
    expect(signal.value).toBe(15);
  });

  it("returns null when growth is below +10% (not interesting)", () => {
    const profile = {
      timeSeries: [
        ...Array.from({ length: 12 }, () => ({ shipments: 100 })),
        ...Array.from({ length: 12 }, () => ({ shipments: 105 })),
      ],
    };
    const signal = computeYoyGrowth(profile, NOW);
    expect(signal.strength).toBeNull();
  });

  it("flags sharp decline (>= 30% drop) as medium — actionable sales signal", () => {
    const profile = {
      timeSeries: [
        ...Array.from({ length: 12 }, () => ({ shipments: 100 })),
        ...Array.from({ length: 12 }, () => ({ shipments: 60 })),
      ],
    };
    const signal = computeYoyGrowth(profile, NOW);
    expect(signal.strength).toBe("medium");
    expect(signal.value).toBe(-40);
  });

  it("returns 'medium' Newly active shipper when no prior baseline but recent volume", () => {
    const profile = {
      timeSeries: [
        ...Array.from({ length: 12 }, () => ({ shipments: 0 })),
        ...Array.from({ length: 12 }, () => ({ shipments: 5 })),
      ],
    };
    const signal = computeYoyGrowth(profile, NOW);
    expect(signal.strength).toBe("medium");
    expect(signal.label).toBe("Newly active shipper");
  });

  it("returns null when timeSeries has < 13 months", () => {
    const profile = {
      timeSeries: Array.from({ length: 8 }, () => ({ shipments: 100 })),
    };
    const signal = computeYoyGrowth(profile, NOW);
    expect(signal.strength).toBeNull();
    expect(signal.detail).toMatch(/not enough history/i);
  });
});

describe("computeNewLanes90d", () => {
  const bols = [
    // 30 days ago — CN -> US
    { shipment_date: daysAgoIso(30), origin_country: "CN", destination_country: "US" },
    // 60 days ago — VN -> US (new!)
    { shipment_date: daysAgoIso(60), origin_country: "VN", destination_country: "US" },
    // 120 days ago — CN -> US (already historical)
    { shipment_date: daysAgoIso(120), origin_country: "CN", destination_country: "US" },
    // 200 days ago — KR -> US
    { shipment_date: daysAgoIso(200), origin_country: "KR", destination_country: "US" },
  ];

  it("detects lanes active in last 90d that are NOT in 91-365d window", () => {
    const signal = computeNewLanes90d(bols, NOW);
    expect(signal.strength).not.toBeNull();
    expect(signal.value).toBe(1); // only VN->US is new
    expect(signal.detail).toMatch(/VN/);
  });

  it("returns null when last-90d lanes all appear in historical window", () => {
    const sameOnly = [
      { shipment_date: daysAgoIso(30), origin_country: "CN", destination_country: "US" },
      { shipment_date: daysAgoIso(120), origin_country: "CN", destination_country: "US" },
    ];
    const signal = computeNewLanes90d(sameOnly, NOW);
    expect(signal.strength).toBeNull();
  });

  it("returns 'high' when 3+ new lanes", () => {
    const lots = [
      { shipment_date: daysAgoIso(30), origin_country: "CN", destination_country: "US" },
      { shipment_date: daysAgoIso(40), origin_country: "VN", destination_country: "US" },
      { shipment_date: daysAgoIso(50), origin_country: "TH", destination_country: "US" },
      { shipment_date: daysAgoIso(60), origin_country: "ID", destination_country: "US" },
    ];
    const signal = computeNewLanes90d(lots, NOW);
    expect(signal.strength).toBe("high");
    expect(signal.value).toBe(4);
  });

  it("ignores BOLs with no parseable date", () => {
    const broken = [
      { shipment_date: null, origin_country: "CN", destination_country: "US" },
      { shipment_date: "not-a-date", origin_country: "VN", destination_country: "US" },
    ];
    const signal = computeNewLanes90d(broken, NOW);
    expect(signal.strength).toBeNull();
  });
});

describe("computeForwarderSwitch", () => {
  it("detects a switch when top carrier in 0-90d differs from 91-180d", () => {
    const bols = [
      ...Array.from({ length: 8 }, (_, i) => ({
        shipment_date: daysAgoIso(20 + i),
        carrier_name: "MAERSK",
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        shipment_date: daysAgoIso(100 + i),
        carrier_name: "MSC",
      })),
    ];
    const signal = computeForwarderSwitch(bols, NOW);
    expect(signal.strength).not.toBeNull();
    expect(signal.detail).toMatch(/MSC.*→.*MAERSK/);
  });

  it("returns null when same top carrier in both windows", () => {
    const bols = [
      ...Array.from({ length: 8 }, (_, i) => ({
        shipment_date: daysAgoIso(20 + i),
        carrier_name: "MAERSK",
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        shipment_date: daysAgoIso(100 + i),
        carrier_name: "MAERSK",
      })),
    ];
    const signal = computeForwarderSwitch(bols, NOW);
    expect(signal.strength).toBeNull();
  });

  it("returns null when no historical carrier data", () => {
    const bols = [
      { shipment_date: daysAgoIso(20), carrier_name: "MAERSK" },
    ];
    const signal = computeForwarderSwitch(bols, NOW);
    expect(signal.strength).toBeNull();
  });
});

describe("computeHsExpansion", () => {
  it("detects new HS chapters in last 90d that aren't in 91-365d window", () => {
    const bols = [
      // recent
      { shipment_date: daysAgoIso(30), hs_code: "870830" },
      { shipment_date: daysAgoIso(45), hs_code: "940360" }, // new
      // historical
      { shipment_date: daysAgoIso(120), hs_code: "870830" },
    ];
    const signal = computeHsExpansion(bols, NOW);
    expect(signal.strength).not.toBeNull();
    expect(signal.value).toBe(1);
    expect(signal.detail).toMatch(/HS 94/);
  });

  it("returns 'high' when 2+ new chapters", () => {
    const bols = [
      { shipment_date: daysAgoIso(30), hs_code: "870830" }, // historical match below
      { shipment_date: daysAgoIso(40), hs_code: "940360" }, // new
      { shipment_date: daysAgoIso(50), hs_code: "611020" }, // new
      { shipment_date: daysAgoIso(120), hs_code: "870830" },
    ];
    const signal = computeHsExpansion(bols, NOW);
    expect(signal.strength).toBe("high");
    expect(signal.value).toBe(2);
  });

  it("returns null when no new chapters", () => {
    const bols = [
      { shipment_date: daysAgoIso(30), hs_code: "870830" },
      { shipment_date: daysAgoIso(120), hs_code: "870830" },
    ];
    const signal = computeHsExpansion(bols, NOW);
    expect(signal.strength).toBeNull();
  });
});

describe("computeBuyingIntent (aggregator)", () => {
  it("hasAnySignal is false when every signal is null — UI hides the tile (Finding 4.1)", () => {
    const profile = {
      timeSeries: Array.from({ length: 12 }, () => ({ shipments: 0 })),
    };
    const out = computeBuyingIntent(profile, [], NOW);
    expect(out.hasAnySignal).toBe(false);
    expect(out.highStrengthCount).toBe(0);
    expect(out.signals).toHaveLength(4);
    expect(out.signals.every((s) => s.strength === null)).toBe(true);
  });

  it("hasAnySignal is true when at least one signal fires", () => {
    const profile = {
      timeSeries: [
        ...Array.from({ length: 12 }, () => ({ shipments: 100 })),
        ...Array.from({ length: 12 }, () => ({ shipments: 200 })), // 100% YoY = high
      ],
    };
    const out = computeBuyingIntent(profile, [], NOW);
    expect(out.hasAnySignal).toBe(true);
    expect(out.highStrengthCount).toBeGreaterThanOrEqual(1);
  });

  it("returns all 4 signals in stable order (yoy, lanes, carrier, hs)", () => {
    const out = computeBuyingIntent({}, [], NOW);
    expect(out.signals.map((s) => s.key)).toEqual([
      "yoy_growth",
      "new_lanes",
      "forwarder_switch",
      "hs_expansion",
    ]);
  });

  it("New-account edge: brand-new company with 0 history returns no signals", () => {
    const out = computeBuyingIntent({ timeSeries: [] }, [], NOW);
    expect(out.hasAnySignal).toBe(false);
  });

  it("Sparse-history edge: only 6 months of data still returns 4 null signals", () => {
    const profile = {
      timeSeries: Array.from({ length: 6 }, () => ({ shipments: 100 })),
    };
    const out = computeBuyingIntent(profile, [], NOW);
    expect(out.signals).toHaveLength(4);
    expect(out.hasAnySignal).toBe(false);
  });
});
