/**
 * Sanity schema registry — every content type the marketing site uses.
 * Order here controls the default order in the Studio sidebar; the
 * `structure.ts` file overrides this with logical groupings.
 */
import { siteSettings } from "./siteSettings";
import { author } from "./author";
import { category } from "./category";
import { tag } from "./tag";
import { blogPost } from "./blogPost";
import { glossaryTerm } from "./glossaryTerm";
import { caseStudy } from "./caseStudy";
import { customerLogo } from "./customerLogo";
import { tradeLane } from "./tradeLane";
import { port } from "./port";
import { hsCode } from "./hsCode";
import { industry } from "./industry";
import { useCase } from "./useCase";
import { comparison } from "./comparison";
import { integration } from "./integration";
import { freeTool } from "./freeTool";
import { page } from "./page";
import { testimonial } from "./testimonial";
import { feature } from "./feature";
import { faq } from "./faq";
import { seoFields } from "./objects/seoFields";
import { kpi } from "./objects/kpi";
import { faqItem } from "./objects/faqItem";
import { contentBlock } from "./objects/contentBlock";
import { demoRequest } from "./demoRequest";
import { partnerApplication } from "./partnerApplication";
import { alternative } from "./alternative";
import { bestList } from "./bestList";
import { landingPage } from "./landingPage";

export const schemaTypes = [
  // singletons
  siteSettings,
  // taxonomy
  author,
  category,
  tag,
  // editorial
  blogPost,
  glossaryTerm,
  caseStudy,
  customerLogo,
  testimonial,
  // platform
  feature,
  faq,
  // programmatic
  tradeLane,
  port,
  hsCode,
  industry,
  useCase,
  comparison,
  integration,
  freeTool,
  // generic
  page,
  // programmatic SEO (MCP-managed in production — local files mirror the
  // deployed shape so `npx sanity dev` shows the same fields)
  alternative,
  bestList,
  landingPage,
  // inbox
  demoRequest,
  partnerApplication,
  // reusable objects
  seoFields,
  kpi,
  faqItem,
  contentBlock,
];
