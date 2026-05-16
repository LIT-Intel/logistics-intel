import { defineField, defineType } from "sanity";
import { LayoutTemplate } from "lucide-react";

/**
 * Top-level marketing landing page. Powers /freight-leads, /shipper-leads,
 * /freight-broker-leads and any future top-level money-page slug.
 *
 * MIRRORS the MCP-deployed schema. DO NOT run `sanity schema deploy` —
 * MCP workspace owns the deployed schema. Local file exists so Studio
 * preview (`npx sanity dev`) shows the same editors as production.
 */
export const landingPage = defineType({
  name: "landingPage",
  title: "Landing page",
  type: "document",
  icon: LayoutTemplate,
  groups: [
    { name: "content", title: "Hero + body" },
    { name: "social-proof", title: "Social proof + comparison" },
    { name: "meta", title: "Meta + SEO" },
  ],
  fields: [
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "h1", maxLength: 96 },
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({ name: "eyebrow", type: "string", group: "content" }),
    defineField({
      name: "h1",
      type: "string",
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({ name: "subhead", type: "text", rows: 3, group: "content" }),
    defineField({ name: "tldr", type: "text", rows: 4, group: "content" }),
    defineField({
      name: "targetKeyword",
      type: "string",
      description: "Primary SEO keyword the page targets.",
      group: "meta",
    }),
    defineField({
      name: "audience",
      type: "string",
      description: "Primary audience segment (e.g. 'mixed', 'forwarders', 'brokers', '3pl').",
      group: "meta",
    }),
    defineField({
      name: "proofPoints",
      type: "array",
      group: "social-proof",
      of: [
        {
          type: "object",
          name: "proofPoint",
          fields: [
            { name: "value", type: "string" },
            { name: "label", type: "string" },
            { name: "detail", type: "string" },
          ],
          preview: {
            select: { value: "value", label: "label" },
            prepare: ({ value, label }) => ({ title: `${value} — ${label}` }),
          },
        },
      ],
    }),
    defineField({
      name: "painPoints",
      type: "array",
      group: "content",
      of: [
        {
          type: "object",
          name: "painPoint",
          fields: [
            {
              name: "icon",
              type: "string",
              description:
                "Lucide icon name — Search, Users, Layers, Target, TrendingUp, Sparkles, Send, Building2, Globe2, Database, Filter.",
            },
            { name: "title", type: "string" },
            { name: "body", type: "text", rows: 3 },
          ],
          preview: { select: { title: "title", icon: "icon" } },
        },
      ],
    }),
    defineField({
      name: "productProof",
      type: "array",
      group: "content",
      of: [
        {
          type: "object",
          name: "productProofItem",
          fields: [
            { name: "title", type: "string" },
            { name: "body", type: "text", rows: 3 },
          ],
          preview: { select: { title: "title" } },
        },
      ],
    }),
    defineField({
      name: "comparisonTable",
      type: "array",
      group: "social-proof",
      of: [
        {
          type: "object",
          name: "comparisonRow",
          fields: [
            { name: "feature", type: "string" },
            { name: "litValue", type: "string" },
            { name: "alternativeLabel", type: "string" },
            { name: "alternativeValue", type: "string" },
          ],
          preview: {
            select: { feature: "feature", litValue: "litValue" },
            prepare: ({ feature, litValue }) => ({ title: feature, subtitle: litValue }),
          },
        },
      ],
    }),
    defineField({
      name: "customerQuote",
      type: "object",
      group: "social-proof",
      fields: [
        { name: "text", type: "text", rows: 3 },
        { name: "name", type: "string" },
        { name: "role", type: "string" },
        { name: "company", type: "string" },
      ],
    }),
    defineField({
      name: "cta",
      type: "object",
      group: "content",
      fields: [
        { name: "headline", type: "string" },
        { name: "body", type: "text", rows: 3 },
        { name: "primaryCtaLabel", type: "string" },
        { name: "primaryCtaUrl", type: "string" },
        { name: "secondaryCtaLabel", type: "string" },
        { name: "secondaryCtaUrl", type: "string" },
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
      group: "meta",
    }),
    defineField({ name: "publishedAt", type: "datetime", group: "meta" }),
    defineField({ name: "lastReviewedAt", type: "datetime", group: "meta" }),
    defineField({ name: "seo", type: "seoFields", group: "meta" }),
  ],
  preview: {
    select: { h1: "h1", slug: "slug.current" },
    prepare: ({ h1, slug }) => ({ title: h1, subtitle: slug ? `/${slug}` : "no slug" }),
  },
});
