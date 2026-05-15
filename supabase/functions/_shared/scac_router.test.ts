import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeBySCAC, isSupportedSCAC } from "./scac_router.ts";

Deno.test("routeBySCAC", () => {
  assertEquals(routeBySCAC("MAEU"), "maersk");
  assertEquals(routeBySCAC("SUDU"), "maersk");
  assertEquals(routeBySCAC("SAFM"), "maersk");
  assertEquals(routeBySCAC("MCPU"), "maersk");
  assertEquals(routeBySCAC("HLCU"), "hapag");
  assertEquals(routeBySCAC("HLXU"), "hapag");
  assertEquals(routeBySCAC("MEDU"), null);
  assertEquals(routeBySCAC("CMDU"), null);
  assertEquals(routeBySCAC(""), null);
  assertEquals(routeBySCAC("maeu"), "maersk"); // case-insensitive
});

Deno.test("isSupportedSCAC", () => {
  assertEquals(isSupportedSCAC("MAEU"), true);
  assertEquals(isSupportedSCAC("MEDU"), false);
});
