import { defineField, defineType } from "sanity";
import { File } from "lucide-react";

/**
 * Generic page — for landing pages that don't fit any specific schema
 * (e.g. /about, /partners, /security, ad-hoc campaigns). The marketing
 * team can compose these from a section library without engineering.
 */
export const page = defineType({
  name: "page",
  title: "Page",
  type: "document",
  icon: File,
  groups: [
    { name: "content", title: "Content" },
    { name: "meta", title: "Meta + SEO" },
  ],
  fields: [
    defineField({ name: "title", type: "string", validation: (R) => R.required(), group: "content" }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({
      name: "kind",
      type: "string",
      options: { list: ["legal", "company", "product", "campaign", "other"] },
      initialValue: "other",
      group: "meta",
    }),
    defineField({
      name: "sections",
      type: "array",
      group: "content",
      of: [
        { type: "object", name: "hero", fields: [
          { name: "eyebrow", type: "string" },
          { name: "headline", type: "string" },
          { name: "headlineHighlight", type: "string" },
          { name: "subhead", type: "text", rows: 3 },
          { name: "primaryCtaLabel", type: "string" },
          { name: "primaryCtaHref", type: "string" },
          { name: "secondaryCtaLabel", type: "string" },
          { name: "secondaryCtaHref", type: "string" },
        ] },
        { type: "object", name: "richText", fields: [
          { name: "title", type: "string" },
          { name: "body", type: "contentBlock" },
        ] },
        { type: "object", name: "featureGrid", fields: [
          { name: "title", type: "string" },
          { name: "subtitle", type: "string" },
          { name: "columns", type: "number", initialValue: 3 },
          { name: "cards", type: "array", of: [
            { type: "object", fields: [
              { name: "icon", type: "string" },
              { name: "title", type: "string" },
              { name: "body", type: "text" },
              { name: "color", type: "string" },
            ] }
          ] },
        ] },
        { type: "object", name: "kpiStrip", fields: [
          { name: "title", type: "string" },
          { name: "kpis", type: "array", of: [{ type: "kpi" }] },
        ] },
        { type: "object", name: "logoRail", fields: [
          { name: "title", type: "string" },
          { name: "logos", type: "array", of: [{ type: "reference", to: [{ type: "customerLogo" }] }] },
        ] },
        { type: "object", name: "faqSection", fields: [
          { name: "title", type: "string" },
          { name: "items", type: "array", of: [{ type: "faqItem" }] },
        ] },
        { type: "object", name: "ctaBanner", fields: [
          { name: "headline", type: "string" },
          { name: "headlineHighlight", type: "string" },
          { name: "subhead", type: "text" },
          { name: "primaryCtaLabel", type: "string" },
          { name: "primaryCtaHref", type: "string" },
          { name: "secondaryCtaLabel", type: "string" },
          { name: "secondaryCtaHref", type: "string" },
        ] },
      ],
    }),
    defineField({ name: "seo", type: "seoFields", group: "meta" }),
  ],
  preview: { select: { title: "title", subtitle: "kind" } },
});
