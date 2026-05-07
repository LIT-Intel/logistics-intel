import { defineField, defineType } from "sanity";
import { Sparkles } from "lucide-react";

/**
 * Reusable feature block — atomic unit of "thing the product does".
 * Surfaces in the /resources platform overview, /products page, and
 * as tags on case studies / lanes for related-content discovery.
 */
export const feature = defineType({
  name: "feature",
  title: "Feature",
  type: "document",
  icon: Sparkles,
  fields: [
    defineField({ name: "name", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "name", maxLength: 64 },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "tag",
      type: "string",
      description: "Verb tag — Discover · Enrich · Analyze · Track · Organize · Engage",
    }),
    defineField({
      name: "tone",
      type: "string",
      options: {
        list: [
          { title: "Blue", value: "blue" },
          { title: "Cyan", value: "cyan" },
          { title: "Violet", value: "violet" },
          { title: "Emerald", value: "emerald" },
          { title: "Amber", value: "amber" },
        ],
      },
      initialValue: "blue",
    }),
    defineField({ name: "headline", type: "string" }),
    defineField({ name: "body", type: "text", rows: 3 }),
    defineField({
      name: "icon",
      type: "string",
      description: "Lucide icon name (e.g. Search, Zap, ShieldCheck).",
    }),
    defineField({
      name: "href",
      type: "string",
      description: "Optional internal link — leave empty for non-clickable cards.",
    }),
    defineField({
      name: "displayOrder",
      type: "number",
      description: "Lower = earlier in the platform overview grid.",
    }),
  ],
  orderings: [
    {
      title: "Display order",
      name: "displayOrderAsc",
      by: [{ field: "displayOrder", direction: "asc" }],
    },
  ],
  preview: { select: { title: "name", subtitle: "tag" } },
});
