import Link from "next/link";
import Image from "next/image";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import { urlFor } from "@/sanity/lib/client";

/**
 * Branded Portable Text renderer for Sanity contentBlock arrays.
 * Headings, callouts, code blocks, embeds, internal links — all
 * styled in the LIT brand voice (slate body, cyan accents on code,
 * dark Pulse-Coach-style callouts for premium hooks).
 */
const components: PortableTextComponents = {
  block: {
    normal: ({ children }) => (
      <p className="font-body my-5 text-[17px] leading-[1.7] text-ink-700">{children}</p>
    ),
    h2: ({ children }) => (
      <h2 className="font-display mt-12 mb-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink-900">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-display mt-9 mb-2 text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ink-900">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="font-display mt-7 mb-2 text-[18px] font-semibold text-ink-900">{children}</h4>
    ),
    blockquote: ({ children }) => (
      <blockquote className="font-display relative my-10 rounded-2xl bg-dark-0 px-7 py-6 text-[20px] font-medium leading-[1.45] tracking-[-0.01em] text-white">
        <span aria-hidden className="absolute -top-2 left-7 text-4xl leading-none" style={{ color: "#00F0FF" }}>
          “
        </span>
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }) => <ul className="my-5 space-y-2 pl-5 text-[17px] text-ink-700 [&>li]:list-disc">{children}</ul>,
    number: ({ children }) => <ol className="my-5 space-y-2 pl-5 text-[17px] text-ink-700 [&>li]:list-decimal">{children}</ol>,
  },
  marks: {
    strong: ({ children }) => <strong className="font-semibold text-ink-900">{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    code: ({ children }) => (
      <code className="font-mono rounded bg-ink-50 px-1.5 py-0.5 text-[0.92em] text-brand-blue-700">{children}</code>
    ),
    highlight: ({ children }) => (
      <mark className="bg-[rgba(0,240,255,0.18)] px-1 py-0.5 text-ink-900">{children}</mark>
    ),
    link: ({ value, children }) => {
      const target = value?.openInNewTab ? "_blank" : undefined;
      return (
        <a
          href={value?.href}
          target={target}
          rel={target ? `noopener noreferrer ${value?.rel ?? ""}`.trim() : value?.rel}
          className="font-medium text-brand-blue underline decoration-brand-blue/30 underline-offset-2 transition-colors hover:text-brand-blue-700 hover:decoration-brand-blue"
        >
          {children}
        </a>
      );
    },
    internalLink: ({ value, children }) => {
      const ref = value?.reference;
      const slug = ref?.slug?.current;
      const type = ref?._type;
      const path = (() => {
        switch (type) {
          case "blogPost": return slug ? `/blog/${slug}` : "/blog";
          case "glossaryTerm": return slug ? `/glossary/${slug}` : "/glossary";
          case "tradeLane": return slug ? `/lanes/${slug}` : "/lanes";
          case "industry": return slug ? `/industries/${slug}` : "/industries";
          case "useCase": return slug ? `/use-cases/${slug}` : "/use-cases";
          case "comparison": return slug ? `/vs/${slug}` : "/vs";
          case "caseStudy": return slug ? `/customers/${slug}` : "/customers";
          default: return "/";
        }
      })();
      return (
        <Link href={path} className="font-medium text-brand-blue underline decoration-brand-blue/30 underline-offset-2 hover:text-brand-blue-700">
          {children}
        </Link>
      );
    },
  },
  types: {
    image: ({ value }) => {
      if (!value?.asset) return null;
      const url = urlFor(value).width(1280).fit("max").auto("format").url();
      return (
        <figure className="my-9 overflow-hidden rounded-2xl border border-ink-100">
          <Image
            src={url}
            alt={value.alt || ""}
            width={1280}
            height={720}
            sizes="(min-width: 768px) 720px, 100vw"
            className="h-auto w-full"
          />
          {value.caption && (
            <figcaption className="font-body bg-ink-25 px-4 py-3 text-center text-[12.5px] text-ink-500">
              {value.caption}
            </figcaption>
          )}
        </figure>
      );
    },
    callout: ({ value }) => {
      const tone = (value?.tone as "info" | "tip" | "warning" | "premium") || "info";
      if (tone === "premium") {
        return (
          <aside
            className="relative my-7 overflow-hidden rounded-2xl border border-white/10 px-6 py-5 text-white"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full opacity-50"
              style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
            />
            <div className="font-display relative text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#00F0FF" }}>
              Pulse Coach
            </div>
            {value.title && <div className="font-display relative mt-1 text-[16px] font-semibold">{value.title}</div>}
            {value.body && <p className="font-body relative mt-2 text-[14px] leading-[1.6] text-ink-150">{value.body}</p>}
          </aside>
        );
      }
      const palette = {
        info: { bg: "bg-blue-50", border: "border-blue-200", title: "text-brand-blue-700", body: "text-ink-700" },
        tip: { bg: "bg-emerald-50", border: "border-emerald-200", title: "text-emerald-700", body: "text-ink-700" },
        warning: { bg: "bg-amber-50", border: "border-amber-200", title: "text-amber-700", body: "text-ink-700" },
      }[tone] || { bg: "bg-blue-50", border: "border-blue-200", title: "text-brand-blue-700", body: "text-ink-700" };
      return (
        <aside className={`my-7 rounded-2xl border ${palette.border} ${palette.bg} px-5 py-4`}>
          {value.title && (
            <div className={`font-display text-[11px] font-bold uppercase tracking-[0.08em] ${palette.title}`}>
              {value.title}
            </div>
          )}
          {value.body && <p className={`font-body mt-1.5 text-[14px] leading-[1.6] ${palette.body}`}>{value.body}</p>}
        </aside>
      );
    },
    codeBlock: ({ value }) => (
      <div className="my-7 overflow-hidden rounded-xl border border-dark-3 bg-dark-0">
        {value?.filename && (
          <div className="font-mono border-b border-dark-3 bg-dark-1 px-4 py-2 text-[12px] text-ink-200">
            {value.filename}
          </div>
        )}
        <pre className="font-mono overflow-x-auto p-5 text-[13px] leading-relaxed text-ink-150">
          <code>{value?.code}</code>
        </pre>
      </div>
    ),
    embed: ({ value }) => {
      // Loom / YouTube — stuff URL into an iframe with sane defaults.
      const url = value?.url || "";
      const youtubeId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
      const embedUrl = youtubeId
        ? `https://www.youtube.com/embed/${youtubeId}`
        : url.includes("loom.com/share/")
          ? url.replace("/share/", "/embed/")
          : url;
      return (
        <figure className="my-9 overflow-hidden rounded-2xl border border-ink-100 shadow-md">
          <div className="relative aspect-video bg-dark-0">
            <iframe src={embedUrl} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen" allowFullScreen />
          </div>
          {value.caption && (
            <figcaption className="font-body bg-ink-25 px-4 py-3 text-center text-[12.5px] text-ink-500">{value.caption}</figcaption>
          )}
        </figure>
      );
    },
  },
};

export function ProseRenderer({ value }: { value: any }) {
  if (!value) return null;
  return <PortableText value={value} components={components} />;
}
