// supabase/functions/_shared/icp-scorer.test.ts
// Run: deno test supabase/functions/_shared/icp-scorer.test.ts

/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scoreContact, type ScoreInput } from "./icp-scorer.ts";

const baseInput: ScoreInput = {
  authorityType: "broker",
  authorityYears: 5,
  employeeCount: 50,
  titleTier: "director",
  emailDeliverable: true,
};

Deno.test("hot when all four signals pass", () => {
  const out = scoreContact(baseInput);
  assertEquals(out.tier, "hot");
});

Deno.test("cold when title is ops but everything else passes", () => {
  const out = scoreContact({ ...baseInput, titleTier: "ops" });
  assertEquals(out.tier, "cold");
});

Deno.test("exclude when authority age < 2", () => {
  const out = scoreContact({ ...baseInput, authorityYears: 1 });
  assertEquals(out.tier, "exclude");
  assertEquals(out.reasons.includes("authority_too_new"), true);
});

Deno.test("exclude when authority age > 15", () => {
  const out = scoreContact({ ...baseInput, authorityYears: 20 });
  assertEquals(out.tier, "exclude");
  assertEquals(out.reasons.includes("authority_too_old"), true);
});

Deno.test("exclude when employee count < 10", () => {
  const out = scoreContact({ ...baseInput, employeeCount: 5 });
  assertEquals(out.tier, "exclude");
  assertEquals(out.reasons.includes("too_small"), true);
});

Deno.test("exclude when employee count > 200", () => {
  const out = scoreContact({ ...baseInput, employeeCount: 500 });
  assertEquals(out.tier, "exclude");
  assertEquals(out.reasons.includes("too_large"), true);
});

Deno.test("exclude when email not deliverable", () => {
  const out = scoreContact({ ...baseInput, emailDeliverable: false });
  assertEquals(out.tier, "exclude");
  assertEquals(out.reasons.includes("no_deliverable_email"), true);
});

Deno.test("exclude when motor-carrier-only authority", () => {
  const out = scoreContact({ ...baseInput, authorityType: "carrier" });
  assertEquals(out.tier, "exclude");
  assertEquals(out.reasons.includes("wrong_authority_type"), true);
});

Deno.test("cold when employee count is 10-19 (below hot band)", () => {
  const out = scoreContact({ ...baseInput, employeeCount: 15 });
  assertEquals(out.tier, "cold");
});

Deno.test("cold when employee count is 101-200 (above hot band)", () => {
  const out = scoreContact({ ...baseInput, employeeCount: 150 });
  assertEquals(out.tier, "cold");
});

Deno.test("cold when title is unknown but otherwise eligible", () => {
  const out = scoreContact({ ...baseInput, titleTier: "unknown" });
  assertEquals(out.tier, "cold");
});

Deno.test("exclude when title is junior or ic", () => {
  assertEquals(scoreContact({ ...baseInput, titleTier: "junior" }).tier, "exclude");
  assertEquals(scoreContact({ ...baseInput, titleTier: "ic" }).tier, "exclude");
});
