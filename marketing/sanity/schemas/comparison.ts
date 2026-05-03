import { defineField, defineType } from "sanity";
import { GitCompare } from "lucide-react";

/**
 * Bottom-funnel comparison page. URL: /vs/<competitor>
 * One per direct competitor: importyeti, zoominfo, apollo, panjiva, etc.
 */
export const comparison = defineType({
  name: "comparison",
  title: "Comparison page",
  type: "document",
  icon: GitCompare,
  fields: [
    defineField({ name: "competitorName", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "competitorName", maxLength: 64 },
      validation: (R) => R.required(),
    }),
    defineField({ name: "competitorLogo", type: "image" }),
    defineField({ name: "competitorUrl", type: "url" }),
    defineField({
      name: "headline",
      type: "string",
      validation: (R) => R.required(),
      description: "e.g. 'LIT vs ZoomInfo'",
    }),
    defineField({
      name: "subhead",
      type: "text",
      rows: 3,
      description: "Positioning angle. Why a buyer would pick LIT.",
    }),
    defineField({
      name: "tldr",
      title: "TL;DR",
      type: "text",
      rows: 4,
      description: "1-paragraph summary that AI assistants and rich snippets pick up.",
    }),
    defineField({
      name: "comparisonTable",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "section", type: "string", description: "Group header (Intelligence, Execution, etc.)" },
            {
              name: "rows",
              type: "array",
              of: [
                {
                  type: "object",
                  fields: [
                    { name: "feature", type: "string" },
                    { name: "litValue", type: "string" },
                    { name: "competitorValue", type: "string" },
                    {
                      name: "winner",
                      type: "string",
                      options: { list: ["lit", "competitor", "tie"] },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
    defineField({
      name: "whenToChooseLit",
      type: "array",
      of: [{ type: "string" }],
      description: "Bullet list — buying scenarios where LIT wins.",
    }),
    defineField({
      name: "whenToChooseCompetitor",
      type: "array",
      of: [{ type: "string" }],
      description:
        "Honest list of where the competitor wins. Counterintuitively, this is the strongest trust signal.",
    }),
    defineField({
      name: "customerQuote",
      type: "object",
      fields: [
        { name: "text", type: "text", rows: 4 },
        { name: "name", type: "string" },
        { name: "role", type: "string" },
      ],
    }),
    defineField({ name: "faq", type: "array", of: [{ type: "faqItem" }] }),
    defineField({ name: "lastReviewedAt", type: "datetime" }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: {
    select: { title: "competitorName", subtitle: "headline" },
    prepare: ({ title, subtitle }) => ({ title: `LIT vs ${title}`, subtitle }),
  },
});
