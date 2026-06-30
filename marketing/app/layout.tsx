import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { Space_Grotesk, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import RefBoot from "@/components/RefBoot";
import TrackPageView from "@/components/analytics/TrackPageView.client";
import AttributionBoot from "@/components/analytics/AttributionBoot.client";
import LinkedInInsightTag from "@/components/analytics/LinkedInInsightTag.client";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";

// Self-hosted fonts via next/font/google. Removes fonts.googleapis.com
// from the critical render path, eliminates FOUT/FOIT, and lets Next
// inline the @font-face declarations with display: swap. CSS variables
// are consumed by tailwind.config.ts (font-display / font-body / font-mono)
// and by recipe classes in app/globals.css.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-space-grotesk",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Logistics Intel — Freight Prospecting Software for Brokers, Forwarders, and 3PLs",
    template: "%s · Logistics Intel",
  },
  description:
    "Logistics Intel helps freight brokers, forwarders, and 3PLs find active shippers, analyze trade lanes, enrich contacts, and turn shipment intelligence into revenue.",
  keywords: [
    "freight prospecting software",
    "freight broker leads",
    "shipper lead generation",
    "freight forwarding sales software",
    "logistics CRM",
    "supply chain intelligence",
    "shipment intelligence",
    "trade lane intelligence",
    "3PL sales tools",
    "importer database",
    "trade intelligence",
    "shipper data",
    "BOL data",
    "import export data",
    "sales intelligence",
    "freight forwarder CRM",
    "Pulse AI",
    "ImportYeti alternative",
    "ZoomInfo alternative",
    "Apollo alternative",
  ],
  authors: [{ name: "Logistics Intel" }],
  creator: "Logistics Intel, Inc.",
  publisher: "Logistics Intel, Inc.",
  applicationName: "Logistics Intel",
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Logistics Intel",
    url: SITE_URL,
    title: "Logistics Intel — Freight Prospecting Software for Logistics Sales Teams",
    description:
      "Find active shippers, logistics contacts, shipment activity, trade lanes, and freight sales signals in one revenue intelligence platform.",
    images: [
      { url: "/api/og", width: 1200, height: 630, alt: "Logistics Intel" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Logistics Intel — Freight Prospecting Software",
    description:
      "Find active shippers, logistics contacts, shipment activity, and trade lane signals.",
    images: ["/api/og"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  alternates: { canonical: SITE_URL },
  // Search-engine ownership verification. Values come from
  // Google Search Console and Bing Webmaster Tools respectively.
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION and
  // NEXT_PUBLIC_BING_SITE_VERIFICATION in Vercel env when registering
  // the property. Both are public, safe to expose at build time.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const viewport = {
  themeColor: "#00E5FF",
  colorScheme: "light" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Organization schema — once at the root, applies site-wide. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Logistics Intel",
              alternateName: "LIT",
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
              sameAs: [
                "https://www.linkedin.com/company/logistic-intel",
                "https://www.youtube.com/@logisticsintel",
                "https://github.com/lit-intel",
              ],
              contactPoint: [
                {
                  "@type": "ContactPoint",
                  contactType: "sales",
                  email: "support@logisticintel.com",
                  availableLanguage: ["English"],
                },
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Logistics Intel",
              alternateName: "LIT",
              url: SITE_URL,
              potentialAction: {
                "@type": "SearchAction",
                target: `${SITE_URL}/search?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
      </head>
      <body className="lit-page">
        {/* Affiliate ref capture — writes ?ref= to a cookie scoped to
            .logisticintel.com so app.logisticintel.com reads the same
            value when the visitor signs up later. */}
        <RefBoot />
        {/* First-party attribution capture — writes utm + referrer +
            click-ids from the landing URL into lit_first_touch /
            lit_last_touch cookies + sessionStorage so later form
            submits attach the original click attribution, not the
            (often clean) URL at submit time. */}
        <AttributionBoot />
        {/* Plausible Analytics — tagged-events build so we can fire
            window.plausible(name, { props }) from lib/events.ts. */}
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <Script
            strategy="afterInteractive"
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.tagged-events.js"
          />
        )}
        {/* page_view + engagement signals (time_on_page_30s,
            scroll_depth_75) + outbound_click. Suspense boundary required
            because TrackPageView uses useSearchParams(). */}
        <Suspense fallback={null}>
          <TrackPageView />
        </Suspense>
        {children}
        {/* LinkedIn Insight Tag — primary paid B2B channel. Conditional
            on NEXT_PUBLIC_LINKEDIN_PARTNER_ID; renders nothing if unset.
            Placed at the bottom of <body> per LinkedIn's recommendation. */}
        <LinkedInInsightTag />
      </body>
    </html>
  );
}
