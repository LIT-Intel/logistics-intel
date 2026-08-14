import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/sanity/lib/client";
import { AUGUST_14_ARTICLES } from "@/lib/content/august-14-authority-articles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ONE_TIME_KEY = "lit-20260814-bf7c08e7383a4d3f";

type Span = {
  _key: string;
  _type: "span";
  text: string;
  marks: string[];
};

type MarkDef = {
  _key: string;
  _type: "link";
  href: string;
};

function parseInline(text: string, blockKey: string) {
  const children: Span[] = [];
  const markDefs: MarkDef[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let part = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      children.push({
        _key: `${blockKey}-s${part++}`,
        _type: "span",
        text: text.slice(cursor, match.index),
        marks: [],
      });
    }
    const markKey = `${blockKey}-m${markDefs.length}`;
    markDefs.push({ _key: markKey, _type: "link", href: match[2] });
    children.push({
      _key: `${blockKey}-s${part++}`,
      _type: "span",
      text: match[1],
      marks: [markKey],
    });
    cursor = pattern.lastIndex;
  }

  if (cursor < text.length || children.length === 0) {
    children.push({
      _key: `${blockKey}-s${part}`,
      _type: "span",
      text: text.slice(cursor),
      marks: [],
    });
  }

  return { children, markDefs };
}

function portableText(markdown: string) {
  const blocks: any[] = [];
  const lines = markdown.trim().split("\n");
  let paragraph: string[] = [];
  let index = 0;

  const addBlock = (text: string, style = "normal", listItem?: "bullet" | "number") => {
    const key = `b${index++}`;
    const inline = parseInline(text, key);
    blocks.push({
      _key: key,
      _type: "block",
      style,
      ...(listItem ? { listItem, level: 1 } : {}),
      children: inline.children,
      markDefs: inline.markDefs,
    });
  };

  const flush = () => {
    if (paragraph.length) addBlock(paragraph.join(" "));
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      addBlock(line.slice(3), "h2");
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      addBlock(line.slice(4), "h3");
      continue;
    }
    if (/^•\s+/.test(line)) {
      flush();
      addBlock(line.replace(/^•\s+/, ""), "normal", "bullet");
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flush();
      addBlock(line.replace(/^\d+\.\s+/, ""), "normal", "number");
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("x-lit-publish-key") !== ONE_TIME_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return NextResponse.json({ error: "Sanity write token is unavailable" }, { status: 503 });
  }

  const publishedAt = new Date().toISOString();
  const results = [];

  for (const article of AUGUST_14_ARTICLES) {
    const document = {
      _id: article.id,
      _type: "blogPost",
      title: article.title,
      slug: { _type: "slug", current: article.slug },
      excerpt: article.excerpt,
      body: portableText(article.bodyMarkdown),
      author: { _type: "reference", _ref: article.authorId },
      categories: article.categoryIds.map((id, index) => ({
        _key: `category-${index}`,
        _type: "reference",
        _ref: id,
      })),
      publishedAt,
      readingTime: article.readingTime,
      featured: article.slug === "freight-market-update-august-2026",
      seo: {
        _type: "seoFields",
        title: article.seoTitle,
        description: article.seoDescription,
        canonicalUrl: `https://logisticintel.com/blog/${article.slug}`,
        noIndex: false,
        keywords: article.keywords,
      },
      internalLinks: article.internalLinkIds.map((id, index) => ({
        _key: `internal-${index}`,
        _type: "reference",
        _ref: id,
      })),
      cta: {
        _type: "object",
        headline: "Turn freight intelligence into your next conversation",
        body: "See how Logistics Intel helps freight sales teams identify accounts, understand shipment activity, and manage follow-up from one workspace.",
        primaryCtaLabel: "Start your 7-day trial",
        primaryCtaUrl: "https://app.logisticintel.com/signup",
        secondaryCtaLabel: "Book a demo",
        secondaryCtaUrl: "/demo",
        variant: "trial",
      },
      agentMetadata: {
        _type: "object",
        draftedBy: "Codex research workflow",
        draftedAt: publishedAt,
        modelVersion: "GPT-5.6",
        sourcePrompt: "Three authority articles for SEO and LinkedIn, published August 14, 2026",
      },
    };

    const result = await sanityWriteClient.createOrReplace(document);
    results.push({ id: result._id, slug: article.slug, title: article.title });
  }

  return NextResponse.json({ published: results.length, results });
}

