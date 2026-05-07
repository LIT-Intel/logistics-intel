import { defineField, defineType } from "sanity";
import { Settings } from "lucide-react";

/**
 * Site-wide singleton — the marketing team edits global nav, footer,
 * default OG, and partner-program copy here exactly once. Every page
 * pulls these values via the same query so the Studio is the source of
 * truth (not React code).
 */
export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site settings",
  type: "document",
  icon: Settings,
  fields: [
    defineField({
      name: "siteName",
      title: "Site name",
      type: "string",
      initialValue: "LIT — Logistic Intel",
      validation: (R) => R.required(),
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
      initialValue: "Market intelligence and revenue execution, in one platform.",
    }),
    defineField({
      name: "primaryNav",
      title: "Primary navigation",
      type: "array",
      of: [
        {
          type: "object",
          name: "navGroup",
          fields: [
            { name: "label", type: "string", validation: (R) => R.required() },
            {
              name: "columns",
              type: "array",
              of: [
                {
                  type: "object",
                  fields: [
                    { name: "title", type: "string" },
                    {
                      name: "items",
                      type: "array",
                      of: [
                        {
                          type: "object",
                          fields: [
                            { name: "label", type: "string", validation: (R) => R.required() },
                            { name: "description", type: "string" },
                            { name: "icon", type: "string", description: "Lucide icon name" },
                            { name: "href", type: "string", validation: (R) => R.required() },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: "topLinks",
              type: "array",
              of: [
                {
                  type: "object",
                  fields: [
                    { name: "label", type: "string" },
                    { name: "href", type: "string" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
    defineField({
      name: "footerColumns",
      title: "Footer columns",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "heading", type: "string", validation: (R) => R.required() },
            {
              name: "links",
              type: "array",
              of: [
                {
                  type: "object",
                  fields: [
                    { name: "label", type: "string" },
                    { name: "href", type: "string" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
    defineField({
      name: "social",
      title: "Social links",
      type: "object",
      fields: [
        { name: "twitter", type: "url" },
        { name: "linkedin", type: "url" },
        { name: "github", type: "url" },
        { name: "youtube", type: "url" },
      ],
    }),
    defineField({
      name: "defaultOgImage",
      title: "Default OG image",
      type: "image",
      description: "Fallback when a page has no SEO image. 1200×630.",
    }),
    defineField({
      name: "homepageHero",
      title: "Homepage hero",
      type: "object",
      fields: [
        { name: "pillText", type: "string", initialValue: "New · Pulse is live — natural-language intelligence" },
        { name: "headline", type: "text", rows: 2 },
        { name: "headlineHighlight", type: "string", description: "The phrase wrapped in the gradient effect." },
        { name: "subhead", type: "text", rows: 3 },
        {
          name: "noteBelow",
          title: "Sub-note below subhead",
          type: "text",
          rows: 2,
          description: "Smaller secondary line under the subhead. Optional.",
        },
        {
          name: "badges",
          title: "Trust badges",
          description: "Small colored pills below the subhead. Three is the sweet spot.",
          type: "array",
          of: [
            {
              type: "object",
              name: "heroBadge",
              fields: [
                { name: "label", type: "string", validation: (R) => R.required() },
                {
                  name: "tone",
                  type: "string",
                  options: {
                    list: [
                      { title: "Cyan", value: "cyan" },
                      { title: "Blue", value: "blue" },
                      { title: "Emerald", value: "emerald" },
                      { title: "Violet", value: "violet" },
                      { title: "Amber", value: "amber" },
                    ],
                  },
                  initialValue: "cyan",
                },
                {
                  name: "icon",
                  type: "string",
                  description: "Lucide icon name. Examples: MapPin, RefreshCcw, ShieldCheck.",
                },
              ],
              preview: { select: { title: "label", subtitle: "tone" } },
            },
          ],
          validation: (R) => R.max(4),
        },
        {
          name: "kpis",
          type: "array",
          of: [{ type: "kpi" }],
          validation: (R) => R.max(4),
        },
        {
          name: "trialNote",
          title: "Trial reassurance microcopy",
          type: "string",
          description: 'Below the CTAs. Defaults to "14-day free trial · Full feature access · Cancel anytime".',
        },
      ],
    }),
    defineField({
      name: "newsCallouts",
      title: "News callouts (auto)",
      description: "Populated by the News-Watcher agent. Last 5 retained, FIFO.",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "title", type: "string" },
            { name: "link", type: "url" },
            { name: "insight", type: "text", rows: 2 },
            { name: "tag", type: "string" },
            { name: "addedAt", type: "datetime" },
          ],
        },
      ],
    }),
    defineField({
      name: "pressCitations",
      title: "Press citations (auto)",
      description: "Populated by the Press Citation Watcher agent.",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "publication", type: "string" },
            { name: "title", type: "string" },
            { name: "url", type: "url" },
            { name: "foundAt", type: "datetime" },
          ],
        },
      ],
    }),
    defineField({
      name: "seoAuditFindings",
      title: "SEO audit findings (auto)",
      description: "Populated by the SEO Health Auditor agent.",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "id", type: "string" },
            { name: "type", type: "string" },
            { name: "title", type: "string" },
            { name: "warning", type: "string" },
          ],
        },
      ],
    }),
    defineField({ name: "seoAuditRunAt", type: "datetime", readOnly: true }),
    defineField({
      name: "ctaCopy",
      title: "Final CTA section",
      type: "object",
      fields: [
        { name: "eyebrow", type: "string", initialValue: "Ready when you are" },
        { name: "headline", type: "string" },
        { name: "headlineHighlight", type: "string" },
        { name: "body", type: "text", rows: 3 },
        { name: "primaryLabel", type: "string", initialValue: "Book a demo" },
        { name: "primaryHref", type: "string", initialValue: "/demo" },
        { name: "secondaryLabel", type: "string", initialValue: "Start free" },
        { name: "secondaryHref", type: "string", initialValue: "https://app.logisticintel.com/signup" },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Site settings" }),
  },
});
