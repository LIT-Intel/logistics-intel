import { defineField, defineType } from "sanity";
import { Handshake } from "lucide-react";

/**
 * Inbound affiliate / partner application — captured by /partners.
 * Each row is one hand-raised partnership inquiry. The partnerships team
 * reviews in Studio under "Inbox → Partner applications" and triages.
 */
export const partnerApplication = defineType({
  name: "partnerApplication",
  title: "Partner application",
  type: "document",
  icon: Handshake,
  fields: [
    defineField({ name: "name", type: "string", validation: (R) => R.required() }),
    defineField({ name: "email", type: "string", validation: (R) => R.required().email() }),
    defineField({ name: "companyOrBrand", type: "string" }),
    defineField({ name: "websiteOrSocial", type: "string", description: "Website, YouTube, LinkedIn, Twitter, podcast URL, etc." }),
    defineField({
      name: "audienceType",
      type: "string",
      options: {
        list: [
          { title: "Freight creator (YouTube / TikTok / Reels)", value: "creator" },
          { title: "Logistics newsletter", value: "newsletter" },
          { title: "Podcast host", value: "podcast" },
          { title: "Consultant", value: "consultant" },
          { title: "Freight sales coach", value: "coach" },
          { title: "Marketing agency (logistics vertical)", value: "agency" },
          { title: "SaaS / referral partner", value: "saas" },
          { title: "Other", value: "other" },
        ],
      },
    }),
    defineField({
      name: "estimatedAudienceSize",
      type: "string",
      options: {
        list: [
          { title: "Under 1,000", value: "<1k" },
          { title: "1,000 – 10,000", value: "1k-10k" },
          { title: "10,000 – 50,000", value: "10k-50k" },
          { title: "50,000 – 250,000", value: "50k-250k" },
          { title: "250,000+", value: "250k+" },
        ],
      },
    }),
    defineField({ name: "promotionPlan", type: "text", rows: 4, description: "How they plan to promote LIT." }),
    defineField({ name: "payoutEmail", type: "string", description: "Optional. Stripe / PayPal email for commission payouts." }),
    defineField({ name: "notes", type: "text", rows: 4 }),
    defineField({ name: "source", type: "string", description: "Referrer / UTM source." }),
    defineField({ name: "userAgent", type: "string", readOnly: true }),
    defineField({ name: "submittedAt", type: "datetime", readOnly: true }),
    defineField({
      name: "status",
      type: "string",
      options: {
        list: [
          { title: "New", value: "new" },
          { title: "Reviewing", value: "reviewing" },
          { title: "Approved", value: "approved" },
          { title: "Declined", value: "declined" },
        ],
      },
      initialValue: "new",
    }),
    defineField({ name: "partnerCode", type: "string", description: "Assigned ref code once approved. Sets the ?ref= value." }),
    defineField({ name: "reviewNotes", type: "text", rows: 4 }),
    // Bridge state — set by /api/admin/partner-invite when partnerships
    // team fires the LIT invite email via the Supabase pipeline. Readonly
    // for human editors; only the bridge endpoint writes here.
    defineField({
      name: "inviteSent",
      title: "Invite sent",
      type: "boolean",
      readOnly: true,
      initialValue: false,
      description: "Set to true once the LIT invite has been dispatched via the bridge.",
    }),
    defineField({
      name: "inviteId",
      title: "Supabase invite ID",
      type: "string",
      readOnly: true,
      description: "Foreign key to affiliate_invites.id in Supabase.",
    }),
    defineField({
      name: "inviteSentAt",
      title: "Invite sent at",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "inviteEmailLog",
      title: "Invite email log",
      type: "text",
      rows: 3,
      readOnly: true,
      description: "Bridge response payload — useful for audit / retry.",
    }),
  ],
  preview: {
    select: { name: "name", company: "companyOrBrand", audience: "audienceType", status: "status" },
    prepare: ({ name, company, audience, status }) => ({
      title: `${name}${company ? ` · ${company}` : ""}`,
      subtitle: [audience, status].filter(Boolean).join(" · "),
    }),
  },
});
