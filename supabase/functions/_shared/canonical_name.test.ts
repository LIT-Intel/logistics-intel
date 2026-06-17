// supabase/functions/_shared/canonical_name.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalizeName } from "./canonical_name.ts";

Deno.test("strips legal suffixes", () => {
  assertEquals(canonicalizeName("Acme Foods, Inc."), "acme foods");
  assertEquals(canonicalizeName("ACME Foods LLC"), "acme foods");
  assertEquals(canonicalizeName("Acme Foods Corp."), "acme foods");
  assertEquals(canonicalizeName("Acme Foods GmbH"), "acme foods");
});

Deno.test("collapses whitespace and punctuation", () => {
  assertEquals(canonicalizeName("  Acme  Foods!  "), "acme foods");
});

Deno.test("handles empty / null safely", () => {
  assertEquals(canonicalizeName(""), "");
  assertEquals(canonicalizeName(null as unknown as string), "");
});
