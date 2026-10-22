import { describe, expect, it } from "vitest";
import { canonicalDirectoryName, normalizeHost, selectDirectoryRow } from "./companyForwarderEvidence";

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

const row=(company_name:string,website:string|null)=>({
 id:company_name, company_name, canonical_name:canonicalDirectoryName(company_name),
 website,domain:null,source:"v6",source_file:"US Sales Data - V6.csv",
 updated_at:"2026-06-16T19:02:50Z",top_forwarders:[],
});
describe("provider identity match integrity",()=>{
 it("resolves exact website for a different profile display name",()=>{
  const result=selectDirectoryRow([row("Kronos","https://www.kronosww.com/")],"Kronos US","kronosww.com");
  expect(result?.row.company_name).toBe("Kronos");
  expect(result?.matchMethod).toBe("company_domain");
 });
 it("rejects names matched to a different registered website",()=>{
  expect(selectDirectoryRow([row("Kronos","https://www.kronosww.com/")],"Kronos","another-company.com")).toBeNull();
 });
 it("refuses to guess between same-name records",()=>{
  expect(selectDirectoryRow([row("Kronos",null),row("Kronos",null)],"Kronos")).toBeNull();
 });
});
