import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LIT — Market intelligence & revenue execution, in one platform",
    template: "%s · LIT",
  },
  description:
    "LIT combines company intelligence, trade data, CRM, Pulse search, and outbound execution into one platform built for modern growth teams.",
  keywords: [
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
  authors: [{ name: "Logistic Intel" }],
  creator: "Logistic Intel, Inc.",
  publisher: "Logistic Intel, Inc.",
  applicationName: "LIT",
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "LIT — Logistic Intel",
    url: SITE_URL,
    title: "LIT — Market intelligence & revenue execution, in one platform",
    description:
      "Find the companies, contacts, shipments, and market signals your competitors miss. LIT is the unified intelligence + execution platform for modern revenue teams.",
    images: [
      { url: "/api/og", width: 1200, height: 630, alt: "LIT — Logistic Intel" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@logisticintel",
    creator: "@logisticintel",
    title: "LIT — Market intelligence & revenue execution",
    description:
      "Find the companies, contacts, shipments, and market signals your competitors miss.",
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
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
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
  themeColor: "#020617",
  colorScheme: "light" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Organization schema — once at the root, applies site-wide. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Logistic Intel",
              url: SITE_URL,
              logo: `${SITE_URL}/lit-icon-master.svg`,
              sameAs: [
                "https://twitter.com/logisticintel",
                "https://www.linkedin.com/company/logisticintel",
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
              name: "LIT — Logistic Intel",
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
      <body className="lit-page">{children}</body>
    </html>
  );
}
