import { describe, expect, it } from "vitest";
import { validateResearchPlan } from "../../../../supabase/functions/_shared/harvey_intent_planner.ts";

const base = {
 version: "harvey_intent_v1", intent: "shipment_mode", shipping_mode: "lcl",
 geography: "East Coast", company: null, requested_metric: null,
 answerable_by: "verified_shipment_tool_required",
 explanation: "You want companies with LCL shipment activity.",
 next_question: "Should I narrow this to a particular state?",
};
describe("Harvey general intent safety contract", () => {
 it("accepts non-provider freight search as a plan without inventing results", () => {
  expect(validateResearchPlan(base)).toMatchObject({
   intent: "shipment_mode", shipping_mode:"lcl",
   answerable_by:"verified_shipment_tool_required",
  });
 });
 it("rejects unknown tool routes and unknown intents", () => {
  expect(validateResearchPlan({...base,answerable_by:"execute_sql"})).toBeNull();
  expect(validateResearchPlan({...base,intent:"send_anything"})).toBeNull();
 });
 it("rejects malformed or missing explanatory answers", () => {
  expect(validateResearchPlan({...base,explanation:""})).toBeNull();
  expect(validateResearchPlan(null)).toBeNull();
 });
});
