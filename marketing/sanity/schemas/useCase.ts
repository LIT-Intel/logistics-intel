import { defineField, defineType } from "sanity";
import { Target } from "lucide-react";

/**
 * Persona-fit landing page. URL: /use-cases/<slug>
 * Examples: freight-forwarders, sales-teams, saas-gtm, agencies, operators.
 */
export const useCase = defineType({
  name: "useCase",
  title: "Use case",
  type: "document",
  icon: Target,
  fields: [
    defineField({ name: "persona", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "persona", maxLength: 96 },
      validation: (R) => R.required(),
    }),
    defineField({ name: "headline", type: "string", validation: (R) => R.required() }),
    defineField({ name: "headlineHighlight", type: "string" }),
    defineField({ name: "subhead", type: "text", rows: 3 }),
    defineField({
      name: "kpis",
      type: "array",
      of: [{ type: "kpi" }],
      validation: (R) => R.max(3),
    }),
    defineField({
      name: "painPoints",
      title: "Pain points",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "icon", type: "string" },
            { name: "title", type: "string" },
            { name: "body", type: "text", rows: 2 },
          ],
        },
      ],
    }),
    defineField({
      name: "plays",
      title: "Plays we power",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "icon", type: "string" },
            { name: "title", type: "string" },
            { name: "body", type: "text", rows: 4 },
            { name: "tags", type: "array", of: [{ type: "string" }] },
          ],
        },
      ],
    }),
    defineField({
      name: "featuredCaseStudy",
      type: "reference",
      to: [{ type: "caseStudy" }],
    }),
    defineField({
      name: "logos",
      type: "array",
      of: [{ type: "reference", to: [{ type: "customerLogo" }] }],
      description: "Customer logos to show on this persona page.",
    }),
    defineField({
      name: "faq",
      type: "array",
      of: [{ type: "faqItem" }],
    }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: { select: { title: "persona", subtitle: "headline" } },
});
