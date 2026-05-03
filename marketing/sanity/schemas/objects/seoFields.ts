import { defineField, defineType } from "sanity";

/**
 * Reusable SEO field group — used on every document that gets its own URL.
 * Title + description + canonical + OG image + noindex toggle covers the
 * Google + Twitter + OpenGraph trifecta. ogImage falls back to a templated
 * Vercel OG generation when not set.
 */
export const seoFields = defineType({
  name: "seoFields",
  title: "SEO",
  type: "object",
  fieldsets: [
    { name: "primary", title: "Page metadata", options: { collapsible: false } },
    { name: "advanced", title: "Advanced", options: { collapsible: true, collapsed: true } },
  ],
  fields: [
    defineField({
      name: "title",
      title: "SEO title",
      type: "string",
      description: "55-60 characters. Falls back to the page title.",
      validation: (Rule) =>
        Rule.max(70).warning("Titles longer than 70 characters get truncated in search results."),
      fieldset: "primary",
    }),
    defineField({
      name: "description",
      title: "Meta description",
      type: "text",
      rows: 3,
      description: "150-160 characters. The blurb shown under the link in Google.",
      validation: (Rule) =>
        Rule.max(170).warning("Descriptions longer than 170 chars get truncated."),
      fieldset: "primary",
    }),
    defineField({
      name: "ogImage",
      title: "Social share image",
      type: "image",
      description:
        "1200×630. Auto-generated from the page title when not set.",
      options: { hotspot: true },
      fieldset: "primary",
    }),
    defineField({
      name: "canonicalUrl",
      title: "Canonical URL",
      type: "url",
      description: "Override only if this page is duplicated content elsewhere.",
      fieldset: "advanced",
    }),
    defineField({
      name: "noIndex",
      title: "Hide from search engines",
      type: "boolean",
      initialValue: false,
      description:
        "Adds noindex meta tag. Use sparingly — only for legal pages, drafts, or duplicate variants.",
      fieldset: "advanced",
    }),
    defineField({
      name: "keywords",
      title: "Keywords",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
      description:
        "Topical keywords for internal linking + AI agent context. Not used for meta keywords (Google ignores those).",
      fieldset: "advanced",
    }),
  ],
});
