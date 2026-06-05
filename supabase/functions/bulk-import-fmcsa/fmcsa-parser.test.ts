// supabase/functions/bulk-import-fmcsa/fmcsa-parser.test.ts
// Run: deno test supabase/functions/bulk-import-fmcsa/fmcsa-parser.test.ts
/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseFmcsaCsv, normalizeAuthority } from "./fmcsa-parser.ts";

const SAMPLE_CSV = `LEGAL_NAME,DBA_NAME,DOT_NUMBER,MC_NUMBER,AUTHORITY_TYPE,EFFECTIVE_DATE,PHONE,STATE,STATUS
"ACME LOGISTICS LLC","ACME","1234567","MC-987654","Broker","2018-03-15","555-1234","TX","ACTIVE"
"FAST FORWARDERS INC","","2345678","MC-876543","Freight Forwarder","2020-06-01","555-2345","CA","ACTIVE"
"OLD BROKER CO","","3456789","MC-765432","Broker","2005-01-10","555-3456","NY","ACTIVE"
"NEW BROKER CO","","4567890","MC-654321","Broker","2025-08-01","555-4567","FL","ACTIVE"
"REVOKED BROKER","","5678901","MC-543210","Broker","2018-04-20","555-5678","WA","REVOKED"
"TRUCK FLEET INC","","6789012","MC-432109","Motor Carrier","2018-05-15","555-6789","OH","ACTIVE"`;

Deno.test("parses CSV into structured rows", () => {
  const rows = parseFmcsaCsv(SAMPLE_CSV);
  assertEquals(rows.length, 6);
  assertEquals(rows[0].legalName, "ACME LOGISTICS LLC");
  assertEquals(rows[0].dbaName, "ACME");
  assertEquals(rows[0].mcNumber, "MC-987654");
});

Deno.test("normalizes broker authority correctly", () => {
  const rows = parseFmcsaCsv(SAMPLE_CSV);
  const acme = normalizeAuthority(rows[0], new Date("2026-06-03"));
  assertEquals(acme.authorityType, "broker");
  assertEquals(acme.authorityYears, 8);
  assertEquals(acme.status, "active");
});

Deno.test("normalizes freight forwarder authority", () => {
  const rows = parseFmcsaCsv(SAMPLE_CSV);
  const fast = normalizeAuthority(rows[1], new Date("2026-06-03"));
  assertEquals(fast.authorityType, "forwarder");
});

Deno.test("classifies motor carrier as 'carrier' (will be excluded by icp-scorer)", () => {
  const rows = parseFmcsaCsv(SAMPLE_CSV);
  const truck = normalizeAuthority(rows[5], new Date("2026-06-03"));
  assertEquals(truck.authorityType, "carrier");
});

Deno.test("marks revoked authorities as inactive", () => {
  const rows = parseFmcsaCsv(SAMPLE_CSV);
  const revoked = normalizeAuthority(rows[4], new Date("2026-06-03"));
  assertEquals(revoked.status, "inactive");
});

Deno.test("handles quoted CSV fields with commas inside", () => {
  const csv = `LEGAL_NAME,DBA_NAME,DOT_NUMBER,MC_NUMBER,AUTHORITY_TYPE,EFFECTIVE_DATE,PHONE,STATE,STATUS
"SMITH, JONES & CO","","1111111","MC-111111","Broker","2018-01-01","","TX","ACTIVE"`;
  const rows = parseFmcsaCsv(csv);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].legalName, "SMITH, JONES & CO");
});

Deno.test("skips empty lines", () => {
  const csv = `LEGAL_NAME,DBA_NAME,DOT_NUMBER,MC_NUMBER,AUTHORITY_TYPE,EFFECTIVE_DATE,PHONE,STATE,STATUS

"FOO","","1","MC-1","Broker","2020-01-01","","","ACTIVE"

`;
  const rows = parseFmcsaCsv(csv);
  assertEquals(rows.length, 1);
});
