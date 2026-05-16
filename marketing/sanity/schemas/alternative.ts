import { defineField, defineType } from "sanity";
import { ArrowLeftRight } from "lucide-react";

/**
 * "{competitorName} alternatives" — long-form SEO page at /alternatives/{slug}.
 *
 * MIRRORS the MCP-deployed schema for this type. DO NOT run
 * `sanity schema deploy` to push this file — the MCP-managed workspace
 * is the source of truth. This local file exists only so `npx sanity dev`
 * (Studio preview) renders the same editors content authors see in prod.
 */
export const alternative = defineType({
  name: "alternative",
  title: "Alternative",
  type: "document",
  icon: ArrowLeftRight,
  groups: [
    { name: "content", title: "Content" },
    { name: "list", title: "Ranked alternatives" },
    { name: "meta", title: "Meta + SEO" },
  ],
  fields: [
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "competitorName", maxLength: 96 },
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({
      name: "competitorName",
      type: "string",
      description: "e.g. 'ImportYeti'. Used in the H1 + breadcrumb.",
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({ name: "headline", type: "string", group: "content" }),
    defineField({ name: "subhead", type: "text", rows: 3, group: "content" }),
    defineField({
      name: "tldr",
      type: "text",
      rows: 4,
      description: "Top-of-page summary in 2-4 sentences.",
      group: "content",
    }),
    defineField({
      name: "alternatives",
      type: "array",
      group: "list",
      of: [
        {
          type: "object",
          name: "alternativeItem",
          fields: [
            { name: "rank", type: "number" },
            { name: "name", type: "string" },
            { name: "url", type: "url" },
            { name: "oneLineSummary", type: "text", rows: 2 },
            { name: "idealFor", type: "text", rows: 2 },
            { name: "priceBand", type: "string" },
            { name: "primaryLimitation", type: "text", rows: 2 },
          ],
          preview: {
            select: { rank: "rank", name: "name" },
            prepare: ({ rank, name }) => ({ title: `${rank ?? "?"}. ${name || "—"}` }),
          },
        },
      ],
    }),
    defineField({
      name: "cta",
      type: "object",
      group: "content",
      fields: [
        { name: "headline", type: "string" },
        { name: "primaryCtaLabel", type: "string" },
        { name: "primaryCtaUrl", type: "string" },
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
            { name: "answer", type: "array", of: [{ type: "block" }] },
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
    select: { competitorName: "competitorName", headline: "headline" },
    prepare: ({ competitorName, headline }) => ({
      title: `${competitorName} alternatives`,
      subtitle: headline,
    }),
  },
});
