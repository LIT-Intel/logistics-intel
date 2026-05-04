import { groq } from "next-sanity";

/** Site-wide singleton — nav, footer, default OG, hero copy, CTA copy. */
export const SITE_SETTINGS_QUERY = groq`*[_type == "siteSettings"][0]{
  siteName, tagline, primaryNav, footerColumns, social,
  defaultOgImage, homepageHero, ctaCopy
}`;

/** All blog posts for the index, newest first. */
export const BLOG_INDEX_QUERY = groq`*[_type == "blogPost" && defined(publishedAt)] | order(publishedAt desc){
  _id, title, slug, excerpt, heroImage, publishedAt, readingTime, featured,
  "author": author->{name, slug, avatar, role},
  "categories": categories[]->{title, slug, color}
}`;

/** Single blog post by slug. */
export const BLOG_POST_QUERY = groq`*[_type == "blogPost" && slug.current == $slug][0]{
  _id, title, slug, excerpt, heroImage, publishedAt, readingTime, body,
  "author": author->{name, slug, avatar, role, bio, expertise, socialLinks, isAiAgent},
  "categories": categories[]->{title, slug, color},
  "tags": tags[]->{title, slug},
  "relatedPosts": relatedPosts[]->{title, slug, excerpt, heroImage, "author": author->{name}, "categories": categories[]->{title, color}},
  "relatedGlossary": relatedGlossary[]->{term, slug, shortDefinition},
  seo
}`;

/** Glossary index — alphabetical, grouped by first letter on the page. */
export const GLOSSARY_INDEX_QUERY = groq`*[_type == "glossaryTerm"] | order(term asc){
  _id, term, slug, abbreviation, shortDefinition, category
}`;

export const GLOSSARY_TERM_QUERY = groq`*[_type == "glossaryTerm" && slug.current == $slug][0]{
  ...,
  "relatedTerms": relatedTerms[]->{term, slug, shortDefinition},
  "relatedPosts": relatedPosts[]->{title, slug, excerpt, "author": author->{name}}
}`;

/** Customers index — case studies + logo rail. */
export const CUSTOMERS_INDEX_QUERY = groq`{
  "caseStudies": *[_type == "caseStudy" && defined(publishedAt)] | order(featuredOnHomepage desc, publishedAt desc){
    _id, customer, slug, logo, headline, subhead, kpis, quote,
    "industry": industry->{name, slug}
  },
  "logos": *[_type == "customerLogo" && displayOnCustomersPage == true] | order(order asc){
    _id, name, domain, logo, url
  }
}`;

export const CASE_STUDY_QUERY = groq`*[_type == "caseStudy" && slug.current == $slug][0]{
  ..., "industry": industry->{name, slug}
}`;

/** Trade lane (programmatic) — single page. */
export const TRADE_LANE_QUERY = groq`*[_type == "tradeLane" && slug.current == $slug][0]{
  ...,
  "relatedLanes": relatedLanes[]->{title, slug, kpis},
  "relatedIndustries": relatedIndustries[]->{name, slug},
  "relatedPosts": relatedPosts[]->{title, slug, excerpt, "author": author->{name}}
}`;

export const ALL_TRADE_LANE_SLUGS = groq`*[_type == "tradeLane" && defined(slug.current)]{ "slug": slug.current }`;

export const INDUSTRY_QUERY = groq`*[_type == "industry" && slug.current == $slug][0]{
  ...,
  "topLanes": topLanes[]->{title, slug, kpis},
  "relatedPosts": relatedPosts[]->{title, slug, excerpt, "author": author->{name}},
  "relatedCaseStudies": relatedCaseStudies[]->{customer, slug, headline, kpis, logo}
}`;

export const ALL_INDUSTRY_SLUGS = groq`*[_type == "industry" && defined(slug.current)]{ "slug": slug.current }`;

export const USE_CASE_QUERY = groq`*[_type == "useCase" && slug.current == $slug][0]{
  ...,
  "featuredCaseStudy": featuredCaseStudy->{customer, slug, headline, kpis, quote, logo, domain},
  "logos": logos[]->{name, domain, logo, url}
}`;

export const ALL_USE_CASE_SLUGS = groq`*[_type == "useCase" && defined(slug.current)]{ "slug": slug.current }`;

export const COMPARISON_QUERY = groq`*[_type == "comparison" && slug.current == $slug][0]`;

/** Port — programmatic single page. */
export const PORT_QUERY = groq`*[_type == "port" && slug.current == $slug][0]{
  ...,
  "topLanes": topLanes[]->{ title, slug, kpis, originPort, destinationPort }
}`;

export const ALL_PORT_SLUGS = groq`*[_type == "port" && defined(slug.current)]{ "slug": slug.current }`;

export const PORTS_INDEX_QUERY = groq`*[_type == "port"] | order(name asc){
  _id, name, unlocode, slug, country, type, kpis
}`;

/** HS code — programmatic single page. */
export const HS_CODE_QUERY = groq`*[_type == "hsCode" && slug.current == $slug][0]{
  ...,
  "topLanes": topLanes[]->{ title, slug, kpis, originPort, destinationPort },
  "relatedIndustries": relatedIndustries[]->{ name, slug }
}`;

export const ALL_HS_CODE_SLUGS = groq`*[_type == "hsCode" && defined(slug.current)]{ "slug": slug.current }`;

export const HS_INDEX_QUERY = groq`*[_type == "hsCode"] | order(code asc){
  _id, code, slug, title, level, shortDefinition
}`;

export const ALL_COMPARISON_SLUGS = groq`*[_type == "comparison" && defined(slug.current)]{ "slug": slug.current }`;

export const INTEGRATIONS_INDEX_QUERY = groq`*[_type == "integration"] | order(category asc, displayOrder asc){
  _id, name, slug, category, logo, domain, tagline, twoWaySync, status
}`;

export const FREE_TOOL_QUERY = groq`*[_type == "freeTool" && slug.current == $slug][0]`;

export const ALL_FREE_TOOL_SLUGS = groq`*[_type == "freeTool" && defined(slug.current)]{ "slug": slug.current }`;

export const PAGE_QUERY = groq`*[_type == "page" && slug.current == $slug][0]`;

export const ALL_PAGE_SLUGS = groq`*[_type == "page" && defined(slug.current) && kind != "draft"]{ "slug": slug.current }`;

/** Homepage feature data — pulled together in one round-trip. */
export const HOMEPAGE_QUERY = groq`{
  "settings": *[_type == "siteSettings"][0]{ homepageHero, ctaCopy },
  "featuredCaseStudies": *[_type == "caseStudy" && featuredOnHomepage == true] | order(_updatedAt desc)[0...3]{
    customer, slug, headline, kpis, logo, "industry": industry->{name}
  },
  "logoRail": *[_type == "customerLogo" && displayInRail == true] | order(order asc)[0...12]{
    name, domain, logo, url
  },
  "recentPosts": *[_type == "blogPost"] | order(publishedAt desc)[0...3]{
    title, slug, excerpt, heroImage, publishedAt,
    "author": author->{name, avatar},
    "categories": categories[]->{title, color}
  },
  "topLanes": *[_type == "tradeLane"] | order(_updatedAt desc)[0...4]{
    title, slug, kpis, originPort, destinationPort
  }
}`;

/** Sitemap.xml generator — yanks all slugs in a single query. */
export const SITEMAP_QUERY = groq`{
  "blogPosts": *[_type == "blogPost" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "glossary": *[_type == "glossaryTerm" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "caseStudies": *[_type == "caseStudy" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "tradeLanes": *[_type == "tradeLane" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "industries": *[_type == "industry" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "useCases": *[_type == "useCase" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "comparisons": *[_type == "comparison" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "ports": *[_type == "port" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "hsCodes": *[_type == "hsCode" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "freeTools": *[_type == "freeTool" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt },
  "pages": *[_type == "page" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt }
}`;
