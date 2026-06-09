import { defineArrayMember, defineType } from "sanity";

/**
 * Rich-text content block reused across blogPost, caseStudy, glossaryTerm,
 * useCase, and any document with long-form body. Includes blockquote +
 * callout + image + code so the editorial team has a real toolkit.
 */
export const contentBlock = defineType({
  name: "contentBlock",
  title: "Content block",
  type: "array",
  of: [
    defineArrayMember({
      type: "block",
      styles: [
        { title: "Body", value: "normal" },
        { title: "H2", value: "h2" },
        { title: "H3", value: "h3" },
        { title: "H4", value: "h4" },
        { title: "Quote", value: "blockquote" },
      ],
      lists: [
        { title: "Bullet", value: "bullet" },
        { title: "Numbered", value: "number" },
      ],
      marks: {
        decorators: [
          { title: "Bold", value: "strong" },
          { title: "Italic", value: "em" },
          { title: "Code", value: "code" },
          { title: "Highlight", value: "highlight" },
        ],
        annotations: [
          {
            name: "link",
            type: "object",
            title: "Link",
            fields: [
              { name: "href", type: "url", title: "URL" },
              { name: "openInNewTab", type: "boolean", title: "Open in new tab", initialValue: false },
              { name: "rel", type: "string", title: "Rel attribute", description: "e.g. nofollow, sponsored" },
            ],
          },
          {
            name: "internalLink",
            type: "object",
            title: "Internal link",
            fields: [
              {
                name: "reference",
                type: "reference",
                to: [
                  { type: "blogPost" },
                  { type: "glossaryTerm" },
                  { type: "tradeLane" },
                  { type: "industry" },
                  { type: "useCase" },
                  { type: "comparison" },
                  { type: "caseStudy" },
                ],
              },
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      type: "image",
      options: { hotspot: true },
      fields: [
        { name: "alt", type: "string", title: "Alt text", validation: (R) => R.required() },
        { name: "caption", type: "string", title: "Caption" },
      ],
    }),
    defineArrayMember({
      type: "object",
      name: "callout",
      title: "Callout",
      fields: [
        {
          name: "tone",
          type: "string",
          options: { list: ["info", "tip", "warning", "premium"] },
          initialValue: "info",
        },
        { name: "title", type: "string" },
        { name: "body", type: "text", rows: 4 },
      ],
    }),
    defineArrayMember({
      type: "object",
      name: "codeBlock",
      title: "Code",
      fields: [
        {
          name: "language",
          type: "string",
          options: { list: ["bash", "ts", "tsx", "js", "json", "sql", "python"] },
          initialValue: "bash",
        },
        { name: "code", type: "text", rows: 8 },
        { name: "filename", type: "string" },
      ],
    }),
    defineArrayMember({
      type: "object",
      name: "embed",
      title: "Embed (video / Loom / YouTube)",
      fields: [
        { name: "url", type: "url", validation: (R) => R.required() },
        { name: "caption", type: "string" },
      ],
    }),
    defineArrayMember({
      type: "object",
      name: "dataTable",
      title: "Data table",
      fields: [
        { name: "caption", type: "string", title: "Caption (optional)" },
        {
          name: "headers",
          type: "array",
          title: "Column headers",
          of: [{ type: "string" }],
          validation: (R) => R.required().min(2),
        },
        {
          name: "rows",
          type: "array",
          title: "Rows",
          of: [
            {
              type: "object",
              name: "row",
              fields: [
                {
                  name: "cells",
                  type: "array",
                  of: [{ type: "text", rows: 2 }],
                  validation: (R) => R.required().min(2),
                },
              ],
              preview: {
                select: { cells: "cells" },
                prepare: ({ cells }) => ({ title: (cells || []).join(" | ").slice(0, 80) }),
              },
            },
          ],
          validation: (R) => R.required().min(1),
        },
      ],
      preview: {
        select: { caption: "caption", headers: "headers", rows: "rows" },
        prepare: ({ caption, headers, rows }) => ({
          title: caption || (headers || []).join(" | ").slice(0, 60) || "Data table",
          subtitle: `${(rows || []).length} rows × ${(headers || []).length} cols`,
        }),
      },
    }),
  ],
});
