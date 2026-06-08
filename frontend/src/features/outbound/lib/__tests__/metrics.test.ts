import { describe, expect, it } from "vitest";
import { deriveHealth, formatRate, formatCount } from "../metrics";
import type { CampaignFunnel } from "../../types";

function f(over: Partial<CampaignFunnel> = {}): CampaignFunnel {
  return {
    enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, suppressed: 0,
    openRate: null, clickRate: null, replyRate: null, bounceRate: null, lastEventAt: null,
    ...over,
  };
}

describe("deriveHealth", () => {
  it("returns null when no metrics", () => {
    expect(deriveHealth(null)).toBeNull();
  });
  it("returns null when sent === 0", () => {
    expect(deriveHealth(f({ sent: 0 }))).toBeNull();
  });
  it("returns 'attention' when bounceRate > 5", () => {
    expect(deriveHealth(f({ sent: 100, bounceRate: 7.5 }))).toBe("attention");
  });
  it("returns 'attention' when sent > 50 and replyRate === 0", () => {
    expect(deriveHealth(f({ sent: 60, replyRate: 0 }))).toBe("attention");
  });
  it("returns 'great' when replyRate > 5 AND openRate > 40", () => {
    expect(deriveHealth(f({ sent: 100, replyRate: 6, openRate: 45, bounceRate: 1 }))).toBe("great");
  });
  it("returns 'good' for the middle case", () => {
    expect(deriveHealth(f({ sent: 100, replyRate: 2, openRate: 30, bounceRate: 2 }))).toBe("good");
  });
});

describe("formatRate", () => {
  it("returns em-dash for null", () => { expect(formatRate(null)).toBe("—"); });
  it("rounds to 1 decimal with % suffix", () => { expect(formatRate(12.345)).toBe("12.3%"); });
  it("renders integer when value is a whole number", () => { expect(formatRate(50)).toBe("50%"); });
  it("renders 0 cleanly", () => { expect(formatRate(0)).toBe("0%"); });
});

describe("formatCount", () => {
  it("returns em-dash for null/undefined", () => { expect(formatCount(null)).toBe("—"); });
  it("returns plain integer for small numbers", () => { expect(formatCount(42)).toBe("42"); });
  it("returns Xk for >= 1000", () => { expect(formatCount(1234)).toBe("1.2k"); });
  it("returns XM for >= 1,000,000", () => { expect(formatCount(1500000)).toBe("1.5M"); });
});
