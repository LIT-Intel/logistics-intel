import { defineField, defineType } from "sanity";
import { Folder } from "lucide-react";

export const category = defineType({
  name: "category",
  title: "Category",
  type: "document",
  icon: Folder,
  fields: [
    defineField({ name: "title", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (R) => R.required(),
    }),
    defineField({ name: "description", type: "text", rows: 3 }),
    defineField({
      name: "color",
      type: "string",
      description: "Hex color for the category tag pill on cards. e.g. #3b82f6",
      validation: (R) => R.regex(/^#[0-9a-fA-F]{6}$/, { name: "hex color" }).warning(),
    }),
    defineField({ name: "seo", type: "seoFields" }),
  ],
});
