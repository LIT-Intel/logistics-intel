import { defineField, defineType } from "sanity";
import { BookOpen } from "lucide-react";

/**
 * Trade + GTM glossary entry. Long-tail SEO + LLM citation magnet.
 * Each entry ranks for "what is [term]", "[term] meaning", "[term] vs [related]".
 */
export const glossaryTerm = defineType({
  name: "glossaryTerm",
  title: "Glossary term",
  type: "document",
  icon: BookOpen,
  fields: [
    defineField({ name: "term", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "term", maxLength: 96 },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "category",
      type: "string",
      options: {
        list: [
          { title: "Trade & Logistics", value: "trade" },
          { title: "Sales & GTM", value: "sales" },
          { title: "Data & Intelligence", value: "data" },
          { title: "Compliance", value: "compliance" },
        ],
      },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "shortDefinition",
      type: "text",
      rows: 2,
      description: "One-sentence definition. Used in cards + AI assistants. Optimize for snippet capture.",
      validation: (R) => R.required().max(300),
    }),
    defineField({
      name: "longDefinition",
      type: "contentBlock",
      description: "Full long-form explanation, examples, history. 600-1500 words.",
    }),
    defineField({
      name: "abbreviation",
      type: "string",
      description: "e.g. 'TEU' for 'Twenty-foot Equivalent Unit'",
    }),
    defineField({
      name: "alsoKnownAs",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
    }),
    defineField({
      name: "relatedTerms",
      type: "array",
      of: [{ type: "reference", to: [{ type: "glossaryTerm" }] }],
    }),
    defineField({
      name: "relatedPosts",
      type: "array",
      of: [{ type: "reference", to: [{ type: "blogPost" }] }],
    }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
  preview: {
    select: { title: "term", subtitle: "shortDefinition" },
  },
});
