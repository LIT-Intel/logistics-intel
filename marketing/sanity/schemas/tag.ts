import { defineField, defineType } from "sanity";
import { Tag } from "lucide-react";

export const tag = defineType({
  name: "tag",
  title: "Tag",
  type: "document",
  icon: Tag,
  fields: [
    defineField({ name: "title", type: "string", validation: (R) => R.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 64 },
      validation: (R) => R.required(),
    }),
  ],
});
