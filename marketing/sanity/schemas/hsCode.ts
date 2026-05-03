import { defineField, defineType } from "sanity";
import { Hash } from "lucide-react";

/**
 * Programmatic HS code page. URL: /hs/<code>
 * One per 4-digit (heading) and 6-digit (subheading) HS code we want
 * to rank for. The Glossary Expander agent (Phase 4) generates the
 * narrative summary; the TradeLane Refresher rolls top shippers.
 */
export const hsCode = defineType({
  name: "hsCode",
  title: "HS code",
  type: "document",
  icon: Hash,
  fields: [
    defineField({
      name: "code",
      type: "string",
      description: "4-, 6-, or 10-digit HS code. e.g. '8517' or '851712'",
      validation: (R) => R.required().min(2).max(10),
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "code", maxLength: 12 },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "title",
      type: "string",
      description: "Plain-English description. e.g. 'Telephones / smartphones / mobile devices'",
      validation: (R) => R.required(),
    }),
    defineField({
      name: "level",
      type: "string",
      options: { list: ["chapter", "heading", "subheading", "tariff"] },
      description: "2-digit chapter, 4-digit heading, 6-digit subheading, or 10-digit tariff line.",
    }),
    defineField({
      name: "shortDefinition",
      type: "text",
      rows: 3,
      description: "1-2 sentences for snippet results.",
    }),
    defineField({
      name: "summary",
      type: "text",
      rows: 5,
      description: "AI-generated; the lead paragraph.",
    }),
    defineField({
      name: "kpis",
      type: "array",
      of: [{ type: "kpi" }],
      validation: (R) => R.max(4),
    }),
    defineField({
      name: "topImporters",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "rank", type: "number" },
            { name: "name", type: "string" },
            { name: "domain", type: "string" },
            { name: "country", type: "string" },
            { name: "shipments12m", type: "number" },
          ],
        },
      ],
      validation: (R) => R.max(25),
    }),
    defineField({
      name: "topLanes",
      type: "array",
      of: [{ type: "reference", to: [{ type: "tradeLane" }] }],
      validation: (R) => R.max(10),
    }),
    defineField({
      name: "relatedIndustries",
      type: "array",
      of: [{ type: "reference", to: [{ type: "industry" }] }],
    }),
    defineField({ name: "lastRefreshedAt", type: "datetime", readOnly: true }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: {
    select: { code: "code", title: "title", level: "level" },
    prepare: ({ code, title, level }) => ({
      title: code ? `${code} — ${title}` : title,
      subtitle: level,
    }),
  },
});
