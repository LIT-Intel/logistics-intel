import { defineField, defineType } from "sanity";
import { Anchor } from "lucide-react";

/**
 * Programmatic port page. URL: /ports/<unlocode>
 * Top inbound + outbound shippers, top lanes, carrier mix, monthly volume.
 * The TradeLane Refresher agent (Phase 4) keeps these fresh.
 */
export const port = defineType({
  name: "port",
  title: "Port",
  type: "document",
  icon: Anchor,
  fields: [
    defineField({
      name: "name",
      type: "string",
      description: "Display name. e.g. 'Port of Long Beach'",
      validation: (R) => R.required(),
    }),
    defineField({
      name: "unlocode",
      title: "UN/LOCODE",
      type: "string",
      description: "5-character UN/LOCODE. e.g. 'USLGB' for Long Beach.",
      validation: (R) => R.required().length(5),
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "unlocode", maxLength: 10 },
      validation: (R) => R.required(),
    }),
    defineField({ name: "country", type: "string" }),
    defineField({ name: "lat", type: "number" }),
    defineField({ name: "lng", type: "number" }),
    defineField({
      name: "type",
      type: "string",
      options: { list: ["sea", "air", "rail", "truck"] },
      initialValue: "sea",
    }),
    defineField({
      name: "summary",
      type: "text",
      rows: 4,
      description: "AI-generated; refreshed weekly. Above-the-fold paragraph.",
    }),
    defineField({
      name: "kpis",
      type: "array",
      of: [{ type: "kpi" }],
      validation: (R) => R.max(4),
      description: "Trailing 12-month TEU, shipment count, top lane share, YoY change.",
    }),
    defineField({
      name: "topInboundShippers",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "rank", type: "number" },
            { name: "name", type: "string" },
            { name: "domain", type: "string" },
            { name: "industry", type: "string" },
            { name: "teu12m", type: "number" },
            { name: "shipments12m", type: "number" },
          ],
        },
      ],
      validation: (R) => R.max(20),
    }),
    defineField({
      name: "topOutboundShippers",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "rank", type: "number" },
            { name: "name", type: "string" },
            { name: "domain", type: "string" },
            { name: "industry", type: "string" },
            { name: "teu12m", type: "number" },
            { name: "shipments12m", type: "number" },
          ],
        },
      ],
      validation: (R) => R.max(20),
    }),
    defineField({
      name: "topLanes",
      type: "array",
      of: [{ type: "reference", to: [{ type: "tradeLane" }] }],
      validation: (R) => R.max(10),
    }),
    defineField({ name: "lastRefreshedAt", type: "datetime", readOnly: true }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: {
    select: { name: "name", code: "unlocode", type: "type" },
    prepare: ({ name, code, type }) => ({
      title: name || "Port",
      subtitle: [code, type].filter(Boolean).join(" · "),
    }),
  },
});
