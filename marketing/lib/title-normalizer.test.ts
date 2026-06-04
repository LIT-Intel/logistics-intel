import { describe, it, expect } from "vitest";
import { classifyTitle } from "./title-normalizer";

describe("classifyTitle", () => {
  it("recognizes owner-class titles", () => {
    expect(classifyTitle("President").tier).toBe("owner");
    expect(classifyTitle("CEO").tier).toBe("owner");
    expect(classifyTitle("Owner").tier).toBe("owner");
    expect(classifyTitle("Founder").tier).toBe("owner");
    expect(classifyTitle("Managing Partner").tier).toBe("owner");
  });

  it("recognizes VP-class sales titles", () => {
    expect(classifyTitle("VP Sales").tier).toBe("vp");
    expect(classifyTitle("VP of Business Development").tier).toBe("vp");
    expect(classifyTitle("Vice President Operations").tier).toBe("vp");
  });

  it("recognizes Director-class titles", () => {
    expect(classifyTitle("Director of Sales").tier).toBe("director");
    expect(classifyTitle("Director, Business Development").tier).toBe("director");
    expect(classifyTitle("Director of Logistics").tier).toBe("director");
  });

  it("recognizes Sales-Manager-class titles (Hot eligible)", () => {
    expect(classifyTitle("Sales Manager").tier).toBe("sales-manager");
    expect(classifyTitle("Business Development Manager").tier).toBe("sales-manager");
    expect(classifyTitle("Sales Operations Manager").tier).toBe("sales-manager");
    expect(classifyTitle("Regional Sales Manager").tier).toBe("sales-manager");
  });

  it("classifies Operations Manager as ops (Cold eligible only)", () => {
    expect(classifyTitle("Operations Manager").tier).toBe("ops");
    expect(classifyTitle("Logistics Manager").tier).toBe("ops");
    expect(classifyTitle("Dispatch Manager").tier).toBe("ops");
  });

  it("rejects junior/IC titles", () => {
    expect(classifyTitle("Account Executive").tier).toBe("ic");
    expect(classifyTitle("SDR").tier).toBe("ic");
    expect(classifyTitle("Sales Development Representative").tier).toBe("ic");
    expect(classifyTitle("Coordinator").tier).toBe("junior");
    expect(classifyTitle("Sales Assistant").tier).toBe("junior");
    expect(classifyTitle("Sales Floor Manager").tier).toBe("junior");
    expect(classifyTitle("Sales Assistant Manager").tier).toBe("junior");
  });

  it("returns unknown for empty/null inputs", () => {
    expect(classifyTitle("").tier).toBe("unknown");
    expect(classifyTitle("   ").tier).toBe("unknown");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(classifyTitle("  director of sales  ").tier).toBe("director");
    expect(classifyTitle("VP SALES").tier).toBe("vp");
  });
});
