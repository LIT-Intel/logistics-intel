import { describe, it, expect } from "vitest";
import { planForwarderLookup, validateForwarderSearchPlan } from "../../../../supabase/functions/_shared/harvey_forwarder_plan";
describe("Harvey 2.0 provider query planner",()=>{
 it("parses DSV, Georgia and bounded result count",()=>{
  const result=planForwarderLookup("Find 25 companies in Georgia using DSV; exclude freight forwarders");
  expect(result.plan).toMatchObject({state:"Georgia",providerName:"DSV AIR & SEA INC. DBA. DSV OCEAN TRANSPORT",limit:25,excludeLogisticsCompanies:true});
 });
 it("denies unsupported origins, time windows, and unverified TEU rankings",()=>{
  expect(planForwarderLookup("Find DSV accounts importing from Germany").plan).toBeNull();
  expect(planForwarderLookup("Rank DSV accounts by TEU last year").plan).toBeNull();
  expect(planForwarderLookup("Find current DSV incumbent relationships").plan).toBeNull();
 });
 it("caps results and validates provider allowlist",()=>{
  const plan=planForwarderLookup("List 999 DSV accounts in Georgia").plan;
  expect(plan?.limit).toBe(100);
  expect(validateForwarderSearchPlan({...plan,providerName:"*"})).toBeNull();
  expect(validateForwarderSearchPlan({...plan,sortBy:"teu"})).toBeNull();
 });
});
