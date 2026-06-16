// Tests for normalizeV6Row + canonicalize against the actual V6 column schema.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalize, normalizeV6Row } from "./ingest-v6-csv.ts";

Deno.test("canonicalize strips legal suffixes + punctuation", () => {
  assertEquals(canonicalize("Acme Foods, Inc."), "acme foods");
  assertEquals(canonicalize("ACME Foods LLC"), "acme foods");
  assertEquals(canonicalize("  Acme  Foods!  "), "acme foods");
});

Deno.test("normalizeV6Row maps actual V6 columns", () => {
  const input: Record<string, string> = {
    "Company Name": "034Motorsport",
    "Street Address": "42968 Osgood Rd Ste I",
    "City": "Fremont",
    "State": "California",
    "Zip Code": "94539",
    "Country": "United States",
    "Latitude": "37.521727",
    "Longitude": "-121.946814",
    "Industry": "Consumer Services",
    "Vertical": "Automotive Service & Collision Repair",
    "Company Website": "https://034motorsport.com",
    "Estimated Headcount": "33",
    "Total Ocean Manifest Shipments": "12",
    "Total TEU": "1",
    "Total LCL Shipments": "11",
    "Estimated Annual Revenue": "9.59",
    "Top Forwarder One": "PROCON EXPRESS LINES",
    "Top Forwarder One TEU": "0.948168",
    "Top Forwarder One Percent": "94.54",
    "Top OceanTradeLanes One": "Southampton - Los Angeles",
    "Top OceanTradeLanes One TEU": "0.83443",
    "Top OceanTradeLanes One Percent": "83.2",
  };
  const out = normalizeV6Row(input);
  assertEquals(out?.company_name, "034Motorsport");
  assertEquals(out?.canonical_name, "034motorsport");
  assertEquals(out?.city, "Fremont");
  assertEquals(out?.state, "California");
  assertEquals(out?.country, "United States");
  assertEquals(out?.latitude, 37.521727);
  assertEquals(out?.longitude, -121.946814);
  assertEquals(out?.vertical, "Automotive Service & Collision Repair");
  assertEquals(out?.teu, 1);
  assertEquals(out?.lcl, 11);
  assertEquals(out?.shipments, 12);
  assertEquals(out?.top_forwarders, [{
    name: "PROCON EXPRESS LINES",
    teu: 0.948168,
    percent: 94.54,
  }]);
  assertEquals(out?.top_dimensions, [{
    lane: "Southampton - Los Angeles",
    teu: 0.83443,
    percent: 83.2,
  }]);
});

Deno.test("normalizeV6Row drops rows missing Company Name", () => {
  assertEquals(normalizeV6Row({ "City": "Atlanta" }), null);
});

Deno.test("normalizeV6Row handles all-optional-empty rows gracefully", () => {
  const out = normalizeV6Row({ "Company Name": "Solo" });
  assertEquals(out?.company_name, "Solo");
  assertEquals(out?.top_forwarders, null);
  assertEquals(out?.top_dimensions, null);
  assertEquals(out?.latitude, null);
});
