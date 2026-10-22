import { describe, expect, it } from "vitest";
import { canonicalDirectoryName, normalizeHost } from "./companyForwarderEvidence";

describe("historical forwarder company matching", () => {
  it("normalizes legal company suffixes without fuzzy cross-company matching",()=>{
    expect(canonicalDirectoryName("East West Manufacturing, Inc.")).toBe("east west manufacturing");
    expect(canonicalDirectoryName("Kronos")).toBe("kronos");
    expect(canonicalDirectoryName("Kronos Bio")).not.toBe(canonicalDirectoryName("Kronos"));
  });
  it("recognizes exact company website regardless of scheme or www",()=>{
    expect(normalizeHost("https://www.kronosww.com/")).toBe("kronosww.com");
    expect(normalizeHost("kronosww.com")).toBe("kronosww.com");
  });
  it("rejects malformed inputs without throwing",()=>{
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost(null)).toBeNull();
  });
});
