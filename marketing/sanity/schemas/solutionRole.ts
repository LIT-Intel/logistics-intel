import { defineField, defineType } from "sanity";
import { Briefcase } from "lucide-react";

/**
 * Solution / role page — the per-audience money page at /solutions/{role}.
 * One document per role (forwarders, brokers, NVOCCs, 3PLs, sales leaders).
 *
 * MIRRORS the MCP-deployed schema for this type. DO NOT run
 * `sanity schema deploy` to push this file — the MCP-managed workspace
 * is the source of truth. This local file exists only so `npx sanity dev`
 * (Studio preview) renders the same editors content authors see in prod.
 */
export const solutionRole = defineType({
  name: "solutionRole",
  title: "Solution / role",
  type: "document",
  icon: Briefcase,
  groups: [
    { name: "content", title: "Hero + body" },
    { name: "playbook", title: "Playbook + live preview" },
    { name: "social-proof", title: "Social proof + outcomes" },
    { name: "meta", title: "Meta + SEO" },
  ],
  fields: [
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "role", maxLength: 96 },
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({
      name: "role",
      type: "string",
      description: "Audience segment this page targets.",
      options: {
        list: [
          { title: "Freight forwarders", value: "freight-forwarders" },
          { title: "Freight brokers", value: "freight-brokers" },
          { title: "NVOCCs", value: "nvoccs" },
          { title: "3PLs", value: "3pls" },
          { title: "Sales leaders", value: "sales-leaders" },
        ],
      },
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({ name: "eyebrow", type: "string", group: "content" }),
    defineField({
      name: "h1",
      type: "string",
      validation: (R) => R.required(),
      group: "content",
    }),
    defineField({ name: "subhead", type: "text", rows: 3, group: "content" }),
    defineField({ name: "tldr", type: "text", rows: 4, group: "content" }),
    defineField({
      name: "targetKeyword",
      type: "string",
      description: "Primary SEO keyword the page targets.",
      group: "meta",
    }),
    defineField({
      name: "audience",
      type: "string",
      description: "Primary audience segment (mirrors `role` but free-text).",
      group: "meta",
    }),
    defineField({
      name: "livePreviewLabel",
      type: "string",
      description: "e.g. 'Active shippers · TR→US · 20+ TEU/month'.",
      group: "playbook",
    }),
    defineField({
      name: "livePreviewPulseLabel",
      type: "string",
      description: "e.g. 'LIVE'.",
      group: "playbook",
    }),
    defineField({
      name: "livePreviewUrlBar",
      type: "string",
      description: "e.g. 'forwarder workspace · TR→US'.",
      group: "playbook",
    }),
    defineField({
      name: "livePreviewItems",
      type: "array",
      group: "playbook",
      of: [
        {
          type: "object",
          name: "livePreviewItem",
          fields: [
            { name: "initial", type: "string" },
            { name: "name", type: "string" },
            { name: "meta", type: "string" },
            { name: "pillLabel", type: "string" },
          ],
          preview: {
            select: { name: "name", meta: "meta" },
            prepare: ({ name, meta }) => ({ title: name || "—", subtitle: meta }),
          },
        },
      ],
    }),
    defineField({
      name: "playbookSteps",
      type: "array",
      group: "playbook",
      of: [
        {
          type: "object",
          name: "playbookStep",
          fields: [
            { name: "stepNumber", type: "number" },
            { name: "check", type: "string", description: "Label like 'Step 1'." },
            { name: "title", type: "string" },
            { name: "body", type: "text", rows: 3 },
          ],
          preview: {
            select: { stepNumber: "stepNumber", title: "title" },
            prepare: ({ stepNumber, title }) => ({
              title: `${stepNumber ?? "?"}. ${title || "—"}`,
            }),
          },
        },
      ],
    }),
    defineField({
      name: "proofPoints",
      type: "array",
      group: "social-proof",
      of: [
        {
          type: "object",
          name: "proofPoint",
          fields: [
            { name: "value", type: "string" },
            { name: "label", type: "string" },
            { name: "detail", type: "string" },
          ],
          preview: {
            select: { value: "value", label: "label" },
            prepare: ({ value, label }) => ({ title: `${value} — ${label}` }),
          },
        },
      ],
    }),
    defineField({
      name: "outcomes",
      type: "array",
      group: "social-proof",
      of: [
        {
          type: "object",
          name: "outcomeItem",
          fields: [
            { name: "num", type: "string" },
            { name: "label", type: "string" },
            { name: "body", type: "text", rows: 2 },
          ],
          preview: {
            select: { num: "num", label: "label" },
            prepare: ({ num, label }) => ({ title: `${num ?? "—"} — ${label ?? ""}` }),
          },
        },
      ],
    }),
    defineField({
      name: "cta",
      type: "object",
      group: "content",
      fields: [
        { name: "headline", type: "string" },
        { name: "body", type: "text", rows: 3 },
        { name: "primaryCtaLabel", type: "string" },
        { name: "primaryCtaUrl", type: "string" },
        { name: "secondaryCtaLabel", type: "string" },
        { name: "secondaryCtaUrl", type: "string" },
      ],
    }),
    defineField({
      name: "faq",
      type: "array",
      group: "content",
      of: [
        {
          type: "object",
          name: "faqEntry",
          fields: [
            { name: "question", type: "string" },
            { name: "answer", type: "text", rows: 4 },
          ],
          preview: { select: { title: "question" } },
        },
      ],
    }),
    defineField({
      name: "aliases",
      type: "array",
      of: [{ type: "string" }],
      description: "Old URLs that should 308 to this page. Must begin with '/'.",
      group: "meta",
    }),
    defineField({ name: "publishedAt", type: "datetime", group: "meta" }),
    defineField({ name: "lastReviewedAt", type: "datetime", group: "meta" }),
    defineField({ name: "seo", type: "seoFields", group: "meta" }),
  ],
  preview: {
    select: { h1: "h1", role: "role" },
    prepare: ({ h1, role }) => ({ title: h1 || role || "Solution / role", subtitle: role }),
  },
});
