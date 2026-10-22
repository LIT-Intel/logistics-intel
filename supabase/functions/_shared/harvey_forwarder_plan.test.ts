import { describe,expect,it } from "vitest";
import {planForwarderLookup,validateForwarderSearchPlan} from "./harvey_forwarder_plan.ts";
describe("Harvey v2 historical forwarder directory planner",()=>{
 it("parses provider and geography with no free SQL",()=>{
  const x=planForwarderLookup("Find 25 companies in Georgia using DSV; exclude freight forwarders");
  expect(x.plan).toMatchObject({providerName:"DSV AIR & SEA INC. DBA. DSV OCEAN TRANSPORT",state:"Georgia",limit:25,excludeLogisticsCompanies:true});
  expect(x.plan?.dataScope).toBe("historical_company_wide_not_lane_specific");
 });
 it("rejects trade lane and time questions beyond historical source coverage",()=>{
  for(const q of ["Show DSV accounts shipping from German ports","Who is their current incumbent forwarder?","Rank by TEU in the last year"]){
   expect(planForwarderLookup(q).plan).toBeNull();
  }
 });
 it("fails closed on unfamiliar providers instead of hallucinating",()=>{
  expect(planForwarderLookup("Find NVOCC-managed accounts in Chicago").plan).toBeNull();
 });
 it("caps result size and refuses manual unsafe plan fields",()=>{
  const x=planForwarderLookup("List 999 DSV companies in Georgia");
  expect(x.plan?.limit).toBe(100);
  expect(validateForwarderSearchPlan({...x.plan,sortBy:"teu"})).toBeNull();
  expect(validateForwarderSearchPlan({...x.plan,providerName:"%"})).toBeNull();
 });
});
