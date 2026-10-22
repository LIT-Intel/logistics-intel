import { describe, expect, it } from "vitest";
import { localExtractFilters } from "./pulse-explore-parse";

describe("market-search natural-language locations", () => {
  it.each([
    ["manufacturing companies in chicago", "chicago"],
    ["manufacturing companies in Chicago, IL", "chicago"],
    ["Find manufacturing companies near Chicago.", "chicago"],
    ["Find manufacturing companies in Atlanta, GA", "atlanta"],
    ["manufacturers around New York City, NY", "new york"],
  ])("preserves a city for %s", (query, city) => {
    const parsed = localExtractFilters(query);
    expect(parsed.geo?.cities?.map(c => c.toLowerCase())).toContain(city);
  });
  it("keeps manufacturing as an industry, not a nationwide replacement for a city", () => {
    const parsed = localExtractFilters("manufacturing companies in Chicago, IL");
    expect(parsed.geo?.cities?.length).toBeGreaterThan(0);
    expect(parsed.industry?.length).toBeGreaterThan(0);
  });
});
