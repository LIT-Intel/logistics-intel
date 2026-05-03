import { defineField, defineType } from "sanity";
import { Plug } from "lucide-react";

export const integration = defineType({
  name: "integration",
  title: "Integration",
  type: "document",
  icon: Plug,
  fields: [
    defineField({ name: "name", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "name", maxLength: 64 },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "category",
      type: "string",
      options: {
        list: [
          "CRM",
          "Email + Sequencer",
          "Messaging",
          "Data warehouse",
          "Enrichment",
          "TMS / ERP",
          "Analytics",
          "Automation",
          "Identity",
          "Billing",
        ],
      },
      validation: (R) => R.required(),
    }),
    defineField({ name: "logo", type: "image", description: "SVG preferred. Falls back to logo.dev when empty." }),
    defineField({ name: "domain", type: "string", description: "For logo.dev fallback." }),
    defineField({ name: "tagline", type: "string", description: "1-line description for the directory card." }),
    defineField({ name: "description", type: "contentBlock" }),
    defineField({ name: "twoWaySync", type: "boolean", initialValue: false }),
    defineField({ name: "oauth", type: "boolean", initialValue: true }),
    defineField({
      name: "status",
      type: "string",
      options: { list: ["live", "beta", "coming_soon"] },
      initialValue: "live",
    }),
    defineField({ name: "deepLink", type: "url", description: "Direct connect URL inside the LIT app." }),
    defineField({ name: "displayOrder", type: "number", initialValue: 100 }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  orderings: [
    { title: "Category, then order", name: "catOrder", by: [{ field: "category", direction: "asc" }, { field: "displayOrder", direction: "asc" }] },
  ],
  preview: { select: { title: "name", subtitle: "category", media: "logo" } },
});
