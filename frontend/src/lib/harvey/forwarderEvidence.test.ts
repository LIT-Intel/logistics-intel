import { describe, expect, it } from "vitest";
import { classifyProviderName, normalizeDirectoryForwarders } from "./forwarderEvidence";

describe("ImportYeti directory provider provenance", () => {
  it.each(["BCO (Direct)", "BCO - Direct to Carrier"])("recognizes provider-labeled direct booking %s", name => {
    expect(classifyProviderName(name).role).toBe("direct_to_carrier");
  });
  it.each([
    ["HAPAG LLOYD A G", "ocean_carrier"],
    ["OCEAN NETWORK EXPRESS PTE LTD", "ocean_carrier"],
    ["ORIENT OVERSEAS CONTAINER LINE LTD", "ocean_carrier"],
    ["EXPEDITORS INTERNATIONAL OF WASHINGTON INC", "freight_intermediary"],
    ["DSV AIR & SEA INC. DBA. DSV OCEAN TRANSPORT", "freight_intermediary"],
    ["KUEHNE + NAGEL (BLUE ANCHOR AMERICA LINE (BLUE ANCHOR LINE))", "freight_intermediary"],
    ["BCO - Direct to Carrier", "direct_to_carrier"],
    ["MYSTERY SHIPPING SERVICES LLC", "unclassified"],
  ] as const)("does not conflate company role %s", (name, expected) => {
    expect(classifyProviderName(name).role).toBe(expected);
  });
  it("marks historical TEU and percentage as unverified and not lane-specific", () => {
    const r=normalizeDirectoryForwarders([{name:"EXPEDITORS INTERNATIONAL OF WASHINGTON INC",teu:128,percent:7.36}]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({reportedTeu:128,reportedPercent:7.36,metricQuality:"provider_reported_unverified",laneVerified:false,windowVerified:false,relationshipScope:"company_history_unspecified"});
  });
  it("rejects invalid shape and impossible metrics", () => {
    expect(normalizeDirectoryForwarders(null)).toEqual([]);
    const rows=normalizeDirectoryForwarders([{name:"Unknown Company",teu:-100,percent:190},{name:"",teu:6}]);
    expect(rows).toHaveLength(1);
    expect(rows[0].reportedTeu).toBeNull();
    expect(rows[0].reportedPercent).toBeNull();
  });
});
