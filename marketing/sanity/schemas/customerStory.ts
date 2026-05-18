import { defineField, defineType } from "sanity";
import { Award } from "lucide-react";

/**
 * Customer story — long-form social-proof page at /customers/{slug}.
 * Anonymized by default; we display role + industry rather than a real
 * company name unless the customer opts in.
 *
 * MIRRORS the MCP-deployed schema for this type. DO NOT run
 * `sanity schema deploy` to push this file — the MCP-managed workspace
 * is the source of truth. This local file exists only so `npx sanity dev`
 * (Studio preview) renders the same editors content authors see in prod.
 */
export const customerStory = defineType({
  name: "customerStory",
  title: "Customer story",
  type: "document",
  icon: Award,
  groups: [
    { name: "content", title: "Content" },
    { name: "outcomes", title: "Outcomes + proof" },
    { name: "meta", title: "Meta + SEO" },
  ],
  fields: [
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "customerName", maxLength: 96 },
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({
      name: "customerName",
      type: "string",
      description:
        "e.g. 'Top-25 freight forwarder, NA'. Use a description rather than a real brand when anonymized.",
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({
      name: "industry",
      type: "string",
      description: "e.g. 'Freight Forwarder', 'NVOCC', '3PL', 'Freight Broker'.",
      group: "content",
    }),
    defineField({
      name: "roleAtCustomer",
      type: "string",
      description: "e.g. 'VP Growth', 'Director of Sales'.",
      group: "content",
    }),
    defineField({
      name: "anonymized",
      type: "boolean",
      description:
        "If true, show the role + industry but not a real company name.",
      initialValue: true,
      group: "content",
    }),
    defineField({ name: "eyebrow", type: "string", group: "content" }),
    defineField({
      name: "headline",
      type: "string",
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({ name: "subhead", type: "text", rows: 3, group: "content" }),
    defineField({
      name: "tldr",
      type: "text",
      rows: 4,
      description: "Top-of-page summary in 2-4 sentences.",
      group: "content",
    }),
    defineField({
      name: "heroOutcome",
      type: "object",
      description: "Big 3-up stat shown on the hero preview.",
      group: "outcomes",
      fields: [
        { name: "metric", type: "string" },
        { name: "label", type: "string" },
        { name: "detail", type: "string" },
      ],
    }),
    defineField({
      name: "outcomes",
      type: "array",
      description: "OutcomesBand items — quantified results, with optional citation.",
      group: "outcomes",
      of: [
        {
          type: "object",
          name: "outcomeItem",
          fields: [
            { name: "num", type: "string" },
            { name: "label", type: "string" },
            { name: "body", type: "text", rows: 2 },
            { name: "cite", type: "string" },
          ],
          preview: {
            select: { num: "num", label: "label" },
            prepare: ({ num, label }) => ({ title: `${num ?? "—"} — ${label ?? ""}` }),
          },
        },
      ],
    }),
    defineField({
      name: "quote",
      type: "object",
      group: "outcomes",
      fields: [
        { name: "text", type: "text", rows: 3 },
        { name: "name", type: "string" },
        { name: "roleTitle", type: "string" },
        { name: "company", type: "string" },
      ],
    }),
    defineField({ name: "body", type: "contentBlock", group: "content" }),
    defineField({
      name: "beforeAfter",
      type: "object",
      group: "outcomes",
      fields: [
        {
          name: "challengeBullets",
          type: "array",
          of: [{ type: "string" }],
        },
        {
          name: "solutionBullets",
          type: "array",
          of: [{ type: "string" }],
        },
      ],
    }),
    defineField({
      name: "faq",
      type: "array",
      group: "content",
      of: [
        {
          type: "object",
          name: "faqEntry",
          fields: [
            { name: "question", type: "string" },
            { name: "answer", type: "text", rows: 4 },
          ],
          preview: { select: { title: "question" } },
        },
      ],
    }),
    defineField({
      name: "aliases",
      type: "array",
      of: [{ type: "string" }],
      description: "Old URLs that should 308 to this page. Must begin with '/'.",
      group: "meta",
    }),
    defineField({ name: "publishedAt", type: "datetime", group: "meta" }),
    defineField({ name: "lastReviewedAt", type: "datetime", group: "meta" }),
    defineField({ name: "seo", type: "seoFields", group: "meta" }),
  ],
  preview: {
    select: { headline: "headline", customerName: "customerName" },
    prepare: ({ headline, customerName }) => ({
      title: headline || customerName || "Customer story",
      subtitle: customerName,
    }),
  },
});
