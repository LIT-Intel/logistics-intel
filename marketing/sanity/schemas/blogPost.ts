import { defineField, defineType } from "sanity";
import { FileText } from "lucide-react";

export const blogPost = defineType({
  name: "blogPost",
  title: "Blog post",
  type: "document",
  icon: FileText,
  groups: [
    { name: "content", title: "Content" },
    { name: "meta", title: "Meta + SEO" },
    { name: "related", title: "Related" },
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
      name: "excerpt",
      type: "text",
      rows: 3,
      description: "1-2 sentence preview shown on the index + meta description fallback.",
      group: "content",
      validation: (R) => R.max(220),
    }),
    defineField({
      name: "heroImage",
      type: "image",
      options: { hotspot: true },
      fields: [{ name: "alt", type: "string", validation: (R) => R.required() }],
      group: "content",
    }),
    defineField({
      name: "heroImageUrl",
      title: "Hero image URL (fallback)",
      type: "url",
      description:
        "Optional external URL for the hero image (e.g. Unsplash). Used when no Sanity heroImage is uploaded.",
      group: "content",
    }),
    defineField({
      name: "heroImageAlt",
      type: "string",
      description: "Alt text for the external hero image URL.",
      group: "content",
    }),
    defineField({ name: "body", type: "contentBlock", group: "content" }),
    defineField({
      name: "author",
      type: "reference",
      to: [{ type: "author" }],
      validation: (R) => R.required(),
      group: "meta",
    }),
    defineField({
      name: "categories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "category" }] }],
      validation: (R) => R.min(1).max(2),
      group: "meta",
    }),
    defineField({
      name: "tags",
      type: "array",
      of: [{ type: "reference", to: [{ type: "tag" }] }],
      group: "meta",
    }),
    defineField({
      name: "publishedAt",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
      validation: (R) => R.required(),
      group: "meta",
    }),
    defineField({
      name: "readingTime",
      title: "Reading time (minutes)",
      type: "number",
      group: "meta",
      description: "Auto-calculated by the agent fleet but can be overridden.",
    }),
    defineField({ name: "featured", type: "boolean", initialValue: false, group: "meta" }),
    defineField({ name: "seo", type: "seoFields", group: "meta" }),
    defineField({
      name: "relatedPosts",
      type: "array",
      of: [{ type: "reference", to: [{ type: "blogPost" }] }],
      validation: (R) => R.max(3),
      group: "related",
    }),
    defineField({
      name: "relatedGlossary",
      title: "Related glossary terms",
      type: "array",
      of: [{ type: "reference", to: [{ type: "glossaryTerm" }] }],
      group: "related",
    }),
    defineField({
      name: "agentMetadata",
      title: "Agent metadata",
      type: "object",
      group: "related",
      description: "Set by the AI Blog Drafter agent. Read-only for humans.",
      fields: [
        { name: "draftedBy", type: "string" },
        { name: "draftedAt", type: "datetime" },
        { name: "modelVersion", type: "string" },
        { name: "sourcePrompt", type: "text" },
      ],
    }),
  ],
  orderings: [
    { title: "Newest first", name: "publishedDesc", by: [{ field: "publishedAt", direction: "desc" }] },
    { title: "Featured first", name: "featuredFirst", by: [{ field: "featured", direction: "desc" }] },
  ],
  preview: {
    select: { title: "title", subtitle: "publishedAt", media: "heroImage" },
    prepare: ({ title, subtitle, media }) => ({
      title,
      subtitle: subtitle ? new Date(subtitle).toLocaleDateString() : "Draft",
      media,
    }),
  },
});
