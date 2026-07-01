import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, CheckCircle2, Download, Play } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PulseExplorerHero } from "@/components/sections/pulse-explorer/PulseExplorerHero";
import { OpportunityScoring } from "@/components/sections/pulse-explorer/OpportunityScoring";
import { NLSearchSection } from "@/components/sections/pulse-explorer/NLSearchSection";
import { CoachSection } from "@/components/sections/pulse-explorer/CoachSection";
import { FeatureShowcase } from "@/components/sections/pulse-explorer/FeatureShowcase";
import { CapabilityBand } from "@/components/sections/pulse-explorer/CapabilityBand";
import { PulseFinalCta } from "@/components/sections/pulse-explorer/PulseFinalCta";
import { CalInlineEmbed } from "@/components/sections/pulse-explorer/CalInlineEmbed";
import { PulseVideoButton } from "@/components/sections/pulse-explorer/PulseVideoButton";
import { buildMetadata, siteUrl } from "@/lib/seo";

const PAGE_TITLE = "Pulse Explorer | Freight Prospecting Software for Brokers, Forwarders, and 3PLs";
const PAGE_DESCRIPTION =
  "Discover Pulse Explorer by Logistics Intel, a freight prospecting tool that helps brokers, forwarders, and 3PLs find active shippers, analyze trade lanes, enrich contacts, and build targeted lead lists.";
const DEMO_URL = "#book-demo";
const DIRECT_DEMO_URL = "https://cal.com/logisticintel/15min";
const PLAYBOOK_URL = "/freight-leads";
const VIDEO_URL = "https://www.youtube.com/watch?v=a9FhnCW89wY";
const VIDEO_THUMBNAIL_URL = "https://i.ytimg.com/vi/a9FhnCW89wY/maxresdefault.jpg";

const LEARNING_BULLETS = [
  "Search active shippers by company name, region, city, state, or ZIP code",
  "Analyze company shipment activity, TEU volume, and trade lanes",
  "View opportunities on the map, heat map, and list view",
  "Find and enrich logistics and supply chain contacts",
  "Save custom prospecting views to your Library",
  "Use the AI Assistant to generate insights and reports",
  "Download or email reports to your team",
];

const INTERNAL_LINKS = [
  { href: "/features", label: "freight prospecting software features" },
  { href: "/products", label: "freight revenue intelligence platform" },
  { href: "/best/best-freight-prospecting-tools", label: "best freight prospecting tools" },
  { href: "/resources", label: "freight sales playbooks" },
  { href: "/glossary", label: "freight and logistics glossary" },
  { href: "/pricing", label: "Logistics Intel pricing" },
];

const FAQS = [
  {
    question: "What is Pulse Explorer?",
    answer:
      "Pulse Explorer is Logistics Intel's freight prospecting software for brokers, freight forwarders, 3PLs, and logistics sales teams. It helps teams find active shippers, analyze shipment activity, enrich contacts, map opportunities, and create targeted lead lists.",
  },
  {
    question: "How does Pulse Explorer help with freight prospecting?",
    answer:
      "Pulse Explorer combines shipment intelligence, company intelligence, map-based search, contact enrichment, saved views, and AI-generated insights so sales teams can identify high-fit shipper accounts faster.",
  },
  {
    question: "Who is Pulse Explorer built for?",
    answer:
      "Pulse Explorer is built for freight brokers, freight forwarders, 3PLs, carriers, and logistics sales teams that need better shipper data, cleaner lead lists, and faster account research.",
  },
  {
    question: "Does Pulse Explorer include shipper leads?",
    answer:
      "Pulse Explorer helps users discover active shipper accounts and company-level freight signals. Teams can search by company, region, city, state, ZIP code, trade lane, and shipment activity to build targeted prospect lists.",
  },
  {
    question: "Can I watch a Pulse Explorer demo?",
    answer:
      "Yes. You can watch the Pulse Explorer tutorial video on this page or schedule a 15-minute demo with the Logistics Intel team.",
  },
  {
    question: "Can Pulse Explorer generate reports?",
    answer:
      "Pulse Explorer can generate branded freight intelligence reports using account data, shipment signals, lane insights, contact information, and AI-assisted summaries.",
  },
];

export const metadata: Metadata = buildMetadata({
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  path: "/company-intelligence",
  eyebrow: "Pulse Explorer",
});

const SOFTWARE_APPLICATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Pulse Explorer",
  description: PAGE_DESCRIPTION,
  url: siteUrl("/company-intelligence"),
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  brand: {
    "@type": "Brand",
    name: "Logistics Intel",
  },
  offers: {
    "@type": "Offer",
    url: siteUrl("/pricing"),
    priceCurrency: "USD",
  },
};

const VIDEO_OBJECT_JSONLD = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: "Pulse Explorer Tutorial",
  description:
    "See how Logistics Intel helps freight teams search active shippers, analyze trade lanes, enrich contacts, save views, and generate freight intelligence reports from one workspace.",
  thumbnailUrl: [VIDEO_THUMBNAIL_URL],
  embedUrl: "https://www.youtube.com/embed/a9FhnCW89wY",
  contentUrl: VIDEO_URL,
  publisher: {
    "@type": "Organization",
    name: "Logistics Intel",
    logo: {
      "@type": "ImageObject",
      url: siteUrl("/icon-512.png"),
    },
  },
};

const FAQ_PAGE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function CompanyIntelligencePage() {
  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION_JSONLD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(VIDEO_OBJECT_JSONLD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_PAGE_JSONLD) }}
      />
      <div className="lit-page">
        <PulseExplorerHero />
        <VideoTutorialSection />
        <LeadMagnetCtaSection />
        <DemoSchedulerSection />
        <LearningSection />
        <OpportunityScoring />
        <NLSearchSection />
        <CoachSection />
        <FeatureShowcase />
        <CapabilityBand />
        <InternalLinksSection />
        <PulseFaqSection />
        <PulseFinalCta />
      </div>
    </PageShell>
  );
}

function VideoTutorialSection() {
  return (
    <section className="section" style={{ paddingTop: 46, paddingBottom: 58 }}>
      <div className="mx-auto px-8" style={{ maxWidth: 1120 }}>
        <div className="section-title" style={{ marginBottom: 28 }}>
          <div className="eyebrow">Product tutorial</div>
          <h2 className="display-lg">Watch the Pulse Explorer Tutorial</h2>
          <p className="lead" style={{ maxWidth: 760 }}>
            See how Logistics Intel helps freight teams search active shippers,
            analyze trade lanes, enrich contacts, save views, and generate freight
            intelligence reports from one workspace.
          </p>
        </div>

        <div
          className="card-glossy"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
            alignItems: "center",
            padding: 24,
          }}
        >
          <PulseVideoButton
            style={{
              position: "relative",
              minHeight: 280,
              border: "1px solid rgba(15,23,42,0.08)",
              borderRadius: 14,
              overflow: "hidden",
              cursor: "pointer",
              background: `linear-gradient(180deg, rgba(2,6,23,0.1), rgba(2,6,23,0.72)), url(${VIDEO_THUMBNAIL_URL}) center / cover`,
              boxShadow: "0 28px 70px rgba(15,23,42,0.16)",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(135deg,#2563eb,#06b6d4)",
                  color: "#fff",
                  boxShadow: "0 24px 58px rgba(37,99,235,0.34)",
                }}
              >
                <Play size={28} fill="currentColor" />
              </span>
            </span>
            <span
              style={{
                position: "absolute",
                left: 18,
                bottom: 18,
                padding: "9px 12px",
                borderRadius: 999,
                background: "rgba(2,6,23,0.78)",
                color: "#fff",
                fontFamily: "var(--font-display)",
                fontSize: 13,
                fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              Watch 5-Minute Demo
            </span>
          </PulseVideoButton>

          <div style={{ padding: "4px 6px" }}>
            <div className="eyebrow">Freight prospecting demo</div>
            <h3
              style={{
                marginTop: 10,
                marginBottom: 12,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(28px, 4vw, 42px)",
                lineHeight: 1.05,
                color: "var(--ink-900, #0b1220)",
              }}
            >
              See the shipper search workflow before you book time.
            </h3>
            <p className="lead" style={{ marginBottom: 22 }}>
              Open the YouTube tutorial when you want a quick walkthrough, or
              use the calendar below to schedule a live Pulse Explorer demo.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href={DEMO_URL}
                className="btn btn-primary btn-lg"
                style={{ textDecoration: "none" }}
              >
                Book a Pulse Explorer Demo
                <ArrowRight size={16} />
              </a>
              <Link
                href={PLAYBOOK_URL}
                className="btn btn-secondary btn-lg"
                style={{ textDecoration: "none" }}
              >
                Download the Free Freight Prospecting Playbook
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LeadMagnetCtaSection() {
  return (
    <section className="section" style={{ paddingTop: 18, paddingBottom: 52 }}>
      <div className="mx-auto px-8" style={{ maxWidth: 1120 }}>
        <div
          style={{
            borderRadius: 18,
            padding: "32px clamp(22px, 4vw, 42px)",
            background: "linear-gradient(135deg, #020617 0%, #07172f 58%, #0e7490 130%)",
            color: "#fff",
            boxShadow: "0 34px 90px rgba(2,6,23,0.18)",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 22,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "#67e8f9",
                marginBottom: 10,
              }}
            >
              Free freight prospecting resource
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(28px, 4vw, 44px)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              Download the Free Freight Prospecting Playbook
            </h2>
            <p style={{ maxWidth: 700, margin: "12px 0 0", color: "rgba(255,255,255,0.72)", lineHeight: 1.65 }}>
              See how modern freight teams find active shippers, prioritize the
              right accounts, and turn shipment signals into targeted outreach.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link
              href={PLAYBOOK_URL}
              className="btn btn-primary btn-lg"
              style={{ textDecoration: "none", background: "#fff", color: "#0f172a" }}
            >
              <Download size={16} />
              Download Playbook
            </Link>
            <a
              href={DEMO_URL}
              className="btn btn-secondary btn-lg"
              style={{ textDecoration: "none", color: "#fff", borderColor: "rgba(255,255,255,0.24)", background: "rgba(255,255,255,0.08)" }}
            >
              <Calendar size={16} />
              Book 15 Minutes
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoSchedulerSection() {
  return (
    <section id="book-demo" className="section" style={{ paddingTop: 44, paddingBottom: 70 }}>
      <div className="mx-auto px-8" style={{ maxWidth: 1120 }}>
        <div className="section-title" style={{ marginBottom: 28 }}>
          <div className="eyebrow">Book a live demo</div>
          <h2 className="display-lg">Pick a 15-minute Pulse Explorer slot.</h2>
          <p className="lead" style={{ maxWidth: 720 }}>
            Choose a time that works for you. The calendar below uses the configured
            Logistics Intel 15-minute Cal.com event.
          </p>
        </div>
        <div
          className="card-glossy"
          style={{
            padding: 12,
            minHeight: 760,
            overflow: "hidden",
            borderRadius: 18,
          }}
        >
          <CalInlineEmbed />
        </div>
        <p style={{ margin: "12px 0 0", textAlign: "center", color: "rgba(15,23,42,0.58)", fontSize: 13 }}>
          Calendar not loading?{" "}
          <a href={DIRECT_DEMO_URL} target="_blank" rel="noreferrer" style={{ color: "var(--brand-blue-700, #2563eb)", fontWeight: 700 }}>
            Open the 15-minute scheduler directly.
          </a>
        </p>
      </div>
    </section>
  );
}

function LearningSection() {
  return (
    <section className="section" style={{ paddingTop: 42, paddingBottom: 62 }}>
      <div className="mx-auto px-8" style={{ maxWidth: 1120 }}>
        <div className="section-title" style={{ marginBottom: 28 }}>
          <div className="eyebrow">Demo agenda</div>
          <h2 className="display-lg">What You'll Learn in the Pulse Explorer Demo</h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 14,
          }}
        >
          {LEARNING_BULLETS.map((item) => (
            <div
              key={item}
              className="card-glossy"
              style={{ display: "flex", gap: 10, padding: 18, alignItems: "flex-start" }}
            >
              <CheckCircle2 size={18} color="#10b981" style={{ marginTop: 2, flex: "0 0 auto" }} />
              <p style={{ margin: 0, color: "rgba(15,23,42,0.74)", lineHeight: 1.55 }}>
                {item}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InternalLinksSection() {
  return (
    <section className="section" style={{ paddingTop: 44, paddingBottom: 58 }}>
      <div className="mx-auto px-8" style={{ maxWidth: 980 }}>
        <div className="card-glossy" style={{ padding: 28 }}>
          <div className="eyebrow">Explore more Logistics Intel resources</div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 16,
            }}
          >
            {INTERNAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  border: "1px solid rgba(37,99,235,0.16)",
                  borderRadius: 999,
                  padding: "9px 12px",
                  color: "var(--brand-blue-700, #2563eb)",
                  background: "rgba(37,99,235,0.06)",
                  textDecoration: "none",
                  fontFamily: "var(--font-display)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {link.label}
              </Link>
            ))}
            <a
              href={DEMO_URL}
              style={{
                border: "1px solid rgba(6,182,212,0.26)",
                borderRadius: 999,
                padding: "9px 12px",
                color: "#0e7490",
                background: "rgba(6,182,212,0.08)",
                textDecoration: "none",
                fontFamily: "var(--font-display)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              book a Pulse Explorer demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function PulseFaqSection() {
  return (
    <section className="section" style={{ paddingTop: 46, paddingBottom: 70 }}>
      <div className="mx-auto px-8" style={{ maxWidth: 980 }}>
        <div className="section-title" style={{ marginBottom: 24 }}>
          <div className="eyebrow">Pulse Explorer FAQ</div>
          <h2 className="display-lg">Freight prospecting questions, answered.</h2>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {FAQS.map((faq) => (
            <details key={faq.question} className="card-glossy" style={{ padding: 20 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--ink-900, #0b1220)",
                }}
              >
                {faq.question}
              </summary>
              <p style={{ margin: "12px 0 0", color: "rgba(15,23,42,0.68)", lineHeight: 1.65 }}>
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
