import { defineField, defineType } from "sanity";
import { Quote } from "lucide-react";

/**
 * Reusable testimonial. Used on case studies, /vs/* comparison pages,
 * and the customer-stories teaser on /resources. Linked back to a
 * caseStudy when one exists so the quote click-throughs to the long form.
 */
export const testimonial = defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "document",
  icon: Quote,
  fields: [
    defineField({
      name: "quote",
      type: "text",
      rows: 3,
      validation: (R) => R.required(),
    }),
    defineField({
      name: "personName",
      title: "Person name",
      type: "string",
      validation: (R) => R.required(),
    }),
    defineField({ name: "personRole", title: "Title / role", type: "string" }),
    defineField({ name: "company", type: "string" }),
    defineField({
      name: "avatar",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "linkedCaseStudy",
      title: "Linked case study",
      type: "reference",
      to: [{ type: "caseStudy" }],
      description: "Click-through to the full story when one exists.",
    }),
    defineField({
      name: "displayInComparisonHub",
      title: "Show on /vs comparison hub",
      type: "boolean",
      initialValue: false,
    }),
  ],
  preview: {
    select: { title: "personName", subtitle: "company", media: "avatar" },
  },
});
