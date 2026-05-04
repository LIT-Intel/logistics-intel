import { defineField, defineType } from "sanity";
import { Inbox } from "lucide-react";

/**
 * Inbound demo request — captured by the /demo form. Each row represents
 * one hand-raised lead. Sales reviews these in Studio under "Inbox →
 * Demo requests" and triages from there.
 */
export const demoRequest = defineType({
  name: "demoRequest",
  title: "Demo request",
  type: "document",
  icon: Inbox,
  fields: [
    defineField({ name: "name", type: "string", validation: (R) => R.required() }),
    defineField({ name: "email", type: "string", validation: (R) => R.required().email() }),
    defineField({ name: "company", type: "string" }),
    defineField({ name: "domain", type: "string" }),
    defineField({ name: "phone", type: "string" }),
    defineField({
      name: "useCase",
      type: "string",
      options: {
        list: [
          { title: "Freight forwarder", value: "freight-forwarder" },
          { title: "Freight broker", value: "freight-broker" },
          { title: "3PL / project logistics", value: "3pl" },
          { title: "Importer / exporter", value: "importer" },
          { title: "Other", value: "other" },
        ],
      },
    }),
    defineField({
      name: "teamSize",
      type: "string",
      options: {
        list: [
          { title: "Just me", value: "1" },
          { title: "2–10", value: "2-10" },
          { title: "11–50", value: "11-50" },
          { title: "51–200", value: "51-200" },
          { title: "200+", value: "200+" },
        ],
      },
    }),
    defineField({ name: "primaryGoal", type: "text", rows: 3 }),
    defineField({ name: "source", type: "string", description: "Referrer / UTM source." }),
    defineField({ name: "userAgent", type: "string", readOnly: true }),
    defineField({ name: "submittedAt", type: "datetime", readOnly: true }),
    defineField({
      name: "status",
      type: "string",
      options: {
        list: [
          { title: "New", value: "new" },
          { title: "Contacted", value: "contacted" },
          { title: "Qualified", value: "qualified" },
          { title: "Disqualified", value: "disqualified" },
        ],
      },
      initialValue: "new",
    }),
    defineField({ name: "notes", type: "text", rows: 4 }),
  ],
  preview: {
    select: { name: "name", company: "company", useCase: "useCase", status: "status" },
    prepare: ({ name, company, useCase, status }) => ({
      title: `${name}${company ? ` · ${company}` : ""}`,
      subtitle: [useCase, status].filter(Boolean).join(" · "),
    }),
  },
});
