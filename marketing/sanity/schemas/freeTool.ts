import { defineField, defineType } from "sanity";
import { Wrench } from "lucide-react";

/**
 * Free tool surface. URL: /tools/<slug>
 * Currently planned: hs-code-lookup, lane-visualizer, free-shipper-search
 */
export const freeTool = defineType({
  name: "freeTool",
  title: "Free tool",
  type: "document",
  icon: Wrench,
  fields: [
    defineField({ name: "name", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (R) => R.required(),
    }),
    defineField({ name: "headline", type: "string" }),
    defineField({ name: "subhead", type: "text", rows: 3 }),
    defineField({
      name: "componentId",
      type: "string",
      description:
        "React component identifier rendered on the page. Add new tools by registering in /lib/freeTools.tsx.",
      validation: (R) => R.required(),
    }),
    defineField({
      name: "leadGated",
      type: "boolean",
      initialValue: false,
      description: "Require email before showing results.",
    }),
    defineField({ name: "description", type: "contentBlock" }),
    defineField({ name: "faq", type: "array", of: [{ type: "faqItem" }] }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: { select: { title: "name", subtitle: "headline" } },
});
