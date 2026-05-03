import { defineField, defineType } from "sanity";
import { Layers } from "lucide-react";

/**
 * Programmatic industry vertical page. ~25 of these. URL: /industries/<slug>
 * Example: /industries/furniture-importers
 */
export const industry = defineType({
  name: "industry",
  title: "Industry",
  type: "document",
  icon: Layers,
  fields: [
    defineField({ name: "name", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "headline",
      type: "string",
      description: "H1 headline. e.g. 'Furniture importers — trade intelligence + revenue execution.'",
    }),
    defineField({ name: "subhead", type: "text", rows: 3 }),
    defineField({
      name: "summary",
      type: "contentBlock",
      description: "200-400 word industry context. AI-refreshed quarterly.",
    }),
    defineField({
      name: "kpis",
      type: "array",
      of: [{ type: "kpi" }],
      validation: (R) => R.max(4),
    }),
    defineField({
      name: "topShippers",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "name", type: "string" },
            { name: "domain", type: "string" },
            { name: "country", type: "string" },
            { name: "teu12m", type: "number" },
          ],
        },
      ],
      validation: (R) => R.max(50),
    }),
    defineField({
      name: "topHsCodes",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "code", type: "string" },
            { name: "description", type: "string" },
            { name: "share", type: "number" },
          ],
        },
      ],
    }),
    defineField({
      name: "topLanes",
      type: "array",
      of: [{ type: "reference", to: [{ type: "tradeLane" }] }],
    }),
    defineField({ name: "lastRefreshedAt", type: "datetime", readOnly: true }),
    defineField({
      name: "relatedPosts",
      type: "array",
      of: [{ type: "reference", to: [{ type: "blogPost" }] }],
    }),
    defineField({
      name: "relatedCaseStudies",
      type: "array",
      of: [{ type: "reference", to: [{ type: "caseStudy" }] }],
    }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: { select: { title: "name", subtitle: "headline" } },
});
