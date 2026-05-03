import { defineField, defineType } from "sanity";

/** Reusable "stat block" — used on case studies, industry pages, lane pages. */
export const kpi = defineType({
  name: "kpi",
  title: "KPI",
  type: "object",
  fields: [
    defineField({ name: "value", title: "Value", type: "string", validation: (R) => R.required() }),
    defineField({ name: "label", title: "Label", type: "string", validation: (R) => R.required() }),
    defineField({ name: "trend", title: "Trend (optional)", type: "string", description: "e.g. +12% vs prior period" }),
    defineField({
      name: "tone",
      title: "Tone",
      type: "string",
      options: { list: ["neutral", "positive", "warning", "negative"] },
      initialValue: "neutral",
    }),
  ],
});
