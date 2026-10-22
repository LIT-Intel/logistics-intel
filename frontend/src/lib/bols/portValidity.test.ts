import { describe, expect, it } from "vitest";
import { isVerifiedDischargePort, normalizedDestination } from "./portValidity";

describe("ocean discharge port data integrity", () => {
 it.each(["United States of America","United States","USA","U.S.A.","Canada","Portugal","Unknown",""])("rejects country or unknown destination: %s",(v)=>{
  expect(normalizedDestination(v)).toBeNull();
  expect(isVerifiedDischargePort(v,"history")).toBe(false);
 });
 it.each(["Atlanta","Brookhaven","Conyers","Smyrna"])("does not present inland Georgia delivery destinations as ocean ports: %s",(v)=>{
  expect(isVerifiedDischargePort(v,"history")).toBe(false);
 });
 it("requires a detailed history source for an ocean gateway",()=>{
  expect(isVerifiedDischargePort("Savannah","snapshot")).toBe(false);
  expect(isVerifiedDischargePort("Savannah","history")).toBe(true);
 });
});
