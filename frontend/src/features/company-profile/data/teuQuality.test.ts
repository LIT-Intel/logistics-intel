import { describe,expect,it } from "vitest";
import {isSuspiciousTeu,auditMonthlyTeu} from "./teuQuality";
describe("monthly customs rollup TEU integrity",()=>{
 it("flags the documented Kronos March 2026 anomaly",()=>expect(isSuspiciousTeu(32,569782)).toBe(true));
 it("flags another Kronos historical anomalous month",()=>expect(isSuspiciousTeu(51,464594)).toBe(true));
 it("keeps a plausible multi-container BOL month visible",()=>expect(isSuspiciousTeu(57,891)).toBe(false));
 it("rejects TEU without any shipments",()=>expect(isSuspiciousTeu(0,200)).toBe(true));
 it("preserves missing TEU instead of calling it an error",()=>expect(isSuspiciousTeu(10,null)).toBe(false));
 it("flags the 12-month aggregate when one month is invalid",()=>expect(auditMonthlyTeu([{shipments:32,teu:569782},{shipments:57,teu:891}])).toEqual({valid:false,flaggedMonths:1}));
});
