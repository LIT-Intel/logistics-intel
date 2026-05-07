import { defineField, defineType } from "sanity";
import { HelpCircle } from "lucide-react";

/**
 * Addressable FAQ entry. Distinct from the inline `faqItem` object —
 * faq documents are queried and grouped by category to power /faq,
 * the footer link, and FAQPage JSON-LD on the /faq page.
 *
 * The 2026 redesign moves FAQs off the home page entirely; they now
 * live behind a footer link and on dedicated FAQ destinations only.
 */
export const faq = defineType({
  name: "faq",
  title: "FAQ",
  type: "document",
  icon: HelpCircle,
  fields: [
    defineField({
      name: "question",
      type: "string",
      validation: (R) => R.required().min(8),
    }),
    defineField({
      name: "answer",
      type: "array",
      of: [{ type: "block" }],
      validation: (R) => R.required(),
    }),
    defineField({
      name: "category",
      type: "string",
      options: {
        list: [
          { title: "Platform", value: "platform" },
          { title: "Data sources", value: "data" },
          { title: "Integrations", value: "integrations" },
          { title: "Pricing", value: "pricing" },
          { title: "Security & compliance", value: "security" },
          { title: "Comparisons", value: "comparisons" },
          { title: "Onboarding", value: "onboarding" },
        ],
      },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "displayOrder",
      type: "number",
      description: "Lower = earlier within its category.",
    }),
    defineField({
      name: "lastReviewedAt",
      type: "datetime",
      description: "Used for editorial freshness signals.",
    }),
  ],
  orderings: [
    {
      title: "Category, then order",
      name: "categoryThenOrder",
      by: [
        { field: "category", direction: "asc" },
        { field: "displayOrder", direction: "asc" },
      ],
    },
  ],
  preview: { select: { title: "question", subtitle: "category" } },
});
