import { defineField, defineType } from "sanity";
import { Building2 } from "lucide-react";

/**
 * Reusable customer logo entry. Two display modes — the trust-rail
 * scrolling logo wall, or named cards on the customers index. Logo
 * resolution prefers a hosted SVG; falls back to logo.dev (uses
 * domain to fetch a vector).
 */
export const customerLogo = defineType({
  name: "customerLogo",
  title: "Customer logo",
  type: "document",
  icon: Building2,
  fields: [
    defineField({ name: "name", type: "string", validation: (R) => R.required() }),
    defineField({ name: "domain", type: "string", description: "e.g. atlasglobal.com — used for logo.dev fallback." }),
    defineField({ name: "logo", type: "image", description: "Override logo (SVG preferred). Optional." }),
    defineField({ name: "url", type: "url", description: "Where the logo links to (case study or external site)." }),
    defineField({
      name: "displayInRail",
      title: "Show in trust rail",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "displayOnCustomersPage",
      title: "Show on /customers",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "industry",
      type: "reference",
      to: [{ type: "industry" }],
    }),
    defineField({
      name: "order",
      title: "Display order",
      type: "number",
      description: "Lower numbers show first.",
      initialValue: 100,
    }),
  ],
  orderings: [{ title: "Display order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
  preview: { select: { title: "name", subtitle: "domain", media: "logo" } },
});
