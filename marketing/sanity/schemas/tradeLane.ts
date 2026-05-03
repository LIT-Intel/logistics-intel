import { defineField, defineType } from "sanity";
import { Route } from "lucide-react";

/**
 * Programmatic trade-lane page. ~500 of these will exist (every
 * meaningful origin × destination combo). The TradeLane Refresher
 * agent updates KPIs daily from `lit_company_search_results`.
 *
 * URL: /lanes/<originPort.code>-to-<destinationPort.code>
 * Example: /lanes/shanghai-to-los-angeles
 */
export const tradeLane = defineType({
  name: "tradeLane",
  title: "Trade lane",
  type: "document",
  icon: Route,
  fields: [
    defineField({
      name: "title",
      type: "string",
      description: "Auto-generated. e.g. 'Shanghai to Los Angeles trade lane'",
      validation: (R) => R.required(),
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "originPort",
      type: "object",
      fields: [
        { name: "code", type: "string", description: "UN/LOCODE e.g. CNSHA" },
        { name: "name", type: "string", description: "e.g. Shanghai" },
        { name: "country", type: "string" },
        { name: "lat", type: "number" },
        { name: "lng", type: "number" },
      ],
    }),
    defineField({
      name: "destinationPort",
      type: "object",
      fields: [
        { name: "code", type: "string" },
        { name: "name", type: "string" },
        { name: "country", type: "string" },
        { name: "lat", type: "number" },
        { name: "lng", type: "number" },
      ],
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
      description: "Trailing 12-month TEU, shipment count, top carrier share, YoY change.",
    }),
    defineField({
      name: "topShippers",
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
            { name: "trend", type: "string" },
          ],
        },
      ],
      validation: (R) => R.max(25),
      description: "Top 25 shippers on this lane. Refreshed daily by the TradeLane Refresher agent.",
    }),
    defineField({
      name: "carrierMix",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "carrier", type: "string" },
            { name: "scac", type: "string" },
            { name: "share", type: "number", description: "0-1 fraction" },
          ],
        },
      ],
    }),
    defineField({
      name: "monthlyTrend",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "month", type: "string", description: "YYYY-MM" },
            { name: "teu", type: "number" },
            { name: "shipments", type: "number" },
          ],
        },
      ],
    }),
    defineField({ name: "lastRefreshedAt", type: "datetime", readOnly: true }),
    defineField({
      name: "relatedLanes",
      type: "array",
      of: [{ type: "reference", to: [{ type: "tradeLane" }] }],
    }),
    defineField({
      name: "relatedIndustries",
      type: "array",
      of: [{ type: "reference", to: [{ type: "industry" }] }],
    }),
    defineField({
      name: "relatedPosts",
      type: "array",
      of: [{ type: "reference", to: [{ type: "blogPost" }] }],
    }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: {
    select: {
      origin: "originPort.name",
      dest: "destinationPort.name",
      teu: "kpis.0.value",
    },
    prepare: ({ origin, dest, teu }) => ({
      title: origin && dest ? `${origin} → ${dest}` : "Trade lane",
      subtitle: teu ? `${teu} TEU 12m` : "—",
    }),
  },
});
