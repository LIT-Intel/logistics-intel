import { defineField, defineType } from "sanity";
import { User } from "lucide-react";

export const author = defineType({
  name: "author",
  title: "Author",
  type: "document",
  icon: User,
  fields: [
    defineField({ name: "name", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (R) => R.required(),
    }),
    defineField({ name: "role", type: "string", description: "e.g. Head of Trade Intelligence · LIT" }),
    defineField({
      name: "avatar",
      type: "image",
      options: { hotspot: true },
      fields: [{ name: "alt", type: "string", initialValue: "" }],
    }),
    defineField({ name: "bio", type: "text", rows: 4 }),
    defineField({
      name: "socialLinks",
      type: "object",
      fields: [
        { name: "twitter", type: "url" },
        { name: "linkedin", type: "url" },
        { name: "website", type: "url" },
      ],
    }),
    // E-E-A-T signal — Google rewards real expertise on YMYL-adjacent content
    defineField({
      name: "expertise",
      title: "Areas of expertise",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
    }),
    defineField({ name: "isAiAgent", title: "AI agent author", type: "boolean", initialValue: false }),
  ],
  preview: { select: { title: "name", subtitle: "role", media: "avatar" } },
});
