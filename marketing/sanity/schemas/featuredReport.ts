import { defineField, defineType } from "sanity";
import { FileBarChart } from "lucide-react";

/**
 * Singleton — the lead-magnet banner inserted between the first row of
 * blog cards and the rest of the grid. When `active` is `false` (or the
 * doc doesn't exist) the banner returns `null` and disappears.
 */
export const featuredReport = defineType({
  name: "featuredReport",
  title: "Featured report (blog banner)",
  type: "document",
  icon: FileBarChart,
  fields: [
    defineField({
      name: "headline",
      type: "string",
      validation: (R) => R.required().max(80),
    }),
    defineField({
      name: "body",
      type: "text",
      rows: 3,
      validation: (R) => R.max(200),
    }),
    defineField({
      name: "ctaLabel",
      type: "string",
      initialValue: "Download report",
    }),
    defineField({
      name: "ctaUrl",
      type: "url",
      validation: (R) => R.required(),
    }),
    defineField({
      name: "coverImage",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "active",
      type: "boolean",
      initialValue: false,
      description:
        "When false (or the doc is unpublished), the banner is hidden from /blog.",
    }),
  ],
  preview: {
    select: { title: "headline", subtitle: "active", media: "coverImage" },
    prepare: ({ title, subtitle, media }) => ({
      title: title || "Featured report",
      subtitle: subtitle ? "Active" : "Hidden",
      media,
    }),
  },
});
