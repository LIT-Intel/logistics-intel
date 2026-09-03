import { describe, expect, it } from "vitest";
import {
  normalizePayload,
  summarizePayload,
} from "../supabase/functions/_shared/rfp_helpers";

describe("RFP workspace payload contract", () => {
  it("normalizes untrusted lane inputs and calculates annual opportunity", () => {
    const payload = normalizePayload({
      summary: { currency: "usd", service_requirements: "  Net 30  " },
      lanes: [
        {
          id: "lane-1",
          origin: " Shanghai ",
          destination: " Savannah ",
          mode: "OCEAN",
          annual_volume: "24",
          buy_rate: "1800",
          sell_rate: "2250",
          accessorials: ["Chassis", 42, ""],
        },
      ],
    });

    expect(payload.summary.currency).toBe("USD");
    expect(payload.summary.service_requirements).toBe("Net 30");
    expect(payload.lanes[0]).toMatchObject({
      origin: "Shanghai",
      destination: "Savannah",
      mode: "ocean",
      annual_volume: 24,
      buy_rate: 1800,
      sell_rate: 2250,
      accessorials: ["Chassis"],
    });
    expect(summarizePayload(payload)).toEqual({
      laneCount: 1,
      estimatedAnnualValue: 54_000,
      primaryMode: "ocean",
    });
  });

  it("marks a mixed-mode tender as multimodal", () => {
    const payload = normalizePayload({
      lanes: [
        { origin: "ATL", destination: "LAX", mode: "air", annual_volume: 3, sell_rate: 1000 },
        { origin: "LAX", destination: "PHX", mode: "ftl", annual_volume: 5, sell_rate: 800 },
      ],
    });
    expect(summarizePayload(payload)).toMatchObject({
      laneCount: 2,
      estimatedAnnualValue: 7000,
      primaryMode: "multimodal",
    });
  });

  it("caps a payload at 500 lanes", () => {
    const payload = normalizePayload({
      lanes: Array.from({ length: 700 }, (_, index) => ({
        origin: `O${index}`,
        destination: `D${index}`,
      })),
    });
    expect(payload.lanes).toHaveLength(500);
  });
});
