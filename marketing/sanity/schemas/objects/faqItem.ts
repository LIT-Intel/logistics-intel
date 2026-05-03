import { defineField, defineType } from "sanity";

/** Reusable FAQ entry — emits FAQPage schema markup when rendered. */
export const faqItem = defineType({
  name: "faqItem",
  title: "FAQ item",
  type: "object",
  fields: [
    defineField({
      name: "question",
      title: "Question",
      type: "string",
      validation: (R) => R.required().min(8),
    }),
    defineField({
      name: "answer",
      title: "Answer",
      type: "array",
      of: [{ type: "block", styles: [{ title: "Body", value: "normal" }] }],
      validation: (R) => R.required(),
    }),
  ],
});
