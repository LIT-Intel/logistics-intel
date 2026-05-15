// supabase/functions/_shared/materialize_bols.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseConsigneeAddress } from "./materialize_bols.ts";

Deno.test("parseConsigneeAddress — US format", () => {
  assertEquals(parseConsigneeAddress("123 Main St, Chicago, IL 60601, USA"),
    { city: "Chicago", state: "IL", zip: "60601" });
});
Deno.test("parseConsigneeAddress — US format with ZIP+4", () => {
  assertEquals(parseConsigneeAddress("410 Terry Ave N 9, Seattle, Wa 98109-1234, Us"),
    { city: "Seattle", state: "WA", zip: "98109-1234" });
});
Deno.test("parseConsigneeAddress — no state", () => {
  assertEquals(parseConsigneeAddress("Shanghai, China"), { city: null, state: null, zip: null });
});
Deno.test("parseConsigneeAddress — empty", () => {
  assertEquals(parseConsigneeAddress(null), { city: null, state: null, zip: null });
  assertEquals(parseConsigneeAddress(""), { city: null, state: null, zip: null });
});
