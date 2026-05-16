import { defineField, defineType } from "sanity";
import { Award } from "lucide-react";

/**
 * "Best of {topic}" ranked listicle — long-form SEO page at /best/{slug}.
 *
 * MIRRORS the MCP-deployed schema. DO NOT run `sanity schema deploy` —
 * MCP workspace owns the deployed schema. Local file exists for Studio
 * preview parity (`npx sanity dev`).
 */
export const bestList = defineType({
  name: "bestList",
  title: "Best list",
  type: "document",
  icon: Award,
  groups: [
    { name: "content", title: "Content" },
    { name: "list", title: "Ranked items" },
    { name: "meta", title: "Meta + SEO" },
  ],
  fields: [
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "topic", maxLength: 96 },
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({
      name: "topic",
      type: "string",
      description: "e.g. 'BOL data providers'. Drives the H1 + breadcrumb.",
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({ name: "headline", type: "string", group: "content" }),
    defineField({ name: "subhead", type: "text", rows: 3, group: "content" }),
    defineField({ name: "tldr", type: "text", rows: 4, group: "content" }),
    defineField({
      name: "criteria",
      type: "array",
      of: [{ type: "string" }],
      description: "The criteria you applied to rank entries.",
      group: "content",
    }),
    defineField({
      name: "items",
      type: "array",
      group: "list",
      of: [
        {
          type: "object",
          name: "bestListItem",
          fields: [
            { name: "rank", type: "number" },
            { name: "name", type: "string" },
            { name: "url", type: "url" },
            { name: "category", type: "string" },
            { name: "oneLineSummary", type: "text", rows: 2 },
            { name: "idealFor", type: "text", rows: 2 },
            { name: "priceBand", type: "string" },
            { name: "strengths", type: "array", of: [{ type: "string" }] },
            { name: "weaknesses", type: "array", of: [{ type: "string" }] },
          ],
          preview: {
            select: { rank: "rank", name: "name", category: "category" },
            prepare: ({ rank, name, category }) => ({
              title: `${rank ?? "?"}. ${name || "—"}`,
              subtitle: category,
            }),
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
      group: "meta",
    }),
    defineField({ name: "publishedAt", type: "datetime", group: "meta" }),
    defineField({ name: "lastReviewedAt", type: "datetime", group: "meta" }),
    defineField({ name: "seo", type: "seoFields", group: "meta" }),
  ],
  preview: {
    select: { topic: "topic", headline: "headline" },
    prepare: ({ topic, headline }) => ({
      title: `Best ${topic}`,
      subtitle: headline,
    }),
  },
});
