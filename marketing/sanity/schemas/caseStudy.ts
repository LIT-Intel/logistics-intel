import { defineField, defineType } from "sanity";
import { Trophy } from "lucide-react";

export const caseStudy = defineType({
  name: "caseStudy",
  title: "Case study",
  type: "document",
  icon: Trophy,
  fields: [
    defineField({ name: "customer", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "customer", maxLength: 96 },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "logo",
      type: "image",
      description: "Customer logo. SVG preferred. Falls back to logo.dev when empty.",
    }),
    defineField({ name: "industry", type: "reference", to: [{ type: "industry" }] }),
    defineField({
      name: "size",
      type: "string",
      options: { list: ["Startup", "SMB", "Mid-market", "Enterprise"] },
    }),
    defineField({
      name: "headline",
      type: "string",
      description: "Pull-quote-style title. e.g. 'Atlas Global tripled lane prospecting in Q1.'",
      validation: (R) => R.required(),
    }),
    defineField({ name: "subhead", type: "text", rows: 3 }),
    defineField({
      name: "kpis",
      type: "array",
      of: [{ type: "kpi" }],
      validation: (R) => R.min(2).max(4),
      description: "Headline numbers shown on the case-study card and detail hero.",
    }),
    defineField({
      name: "challenge",
      type: "contentBlock",
      description: "What weren't they able to do before LIT?",
    }),
    defineField({
      name: "solution",
      type: "contentBlock",
      description: "What did they implement? Which LIT features?",
    }),
    defineField({
      name: "results",
      type: "contentBlock",
      description: "Outcomes — numbers, qualitative wins, executive quote.",
    }),
    defineField({
      name: "quote",
      type: "object",
      fields: [
        { name: "text", type: "text", rows: 4 },
        { name: "name", type: "string" },
        { name: "role", type: "string" },
        { name: "avatar", type: "image" },
      ],
    }),
    defineField({
      name: "featuredOnHomepage",
      type: "boolean",
      initialValue: false,
    }),
    defineField({ name: "publishedAt", type: "datetime", initialValue: () => new Date().toISOString() }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: { select: { title: "customer", subtitle: "headline", media: "logo" } },
});
