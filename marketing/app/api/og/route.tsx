import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * Dynamic OG image generator. Every page that doesn't ship its own
 * social-share image falls back to /api/og?title=...&eyebrow=...
 *
 * Renders the LIT brand surface — slate gradient, cyan icon, white
 * wordmark — with the page title in Space Grotesk so the social share
 * still feels like the product.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") || "Market intelligence & revenue execution").slice(0, 120);
  const eyebrow = (searchParams.get("eyebrow") || "Logistic Intel").slice(0, 60);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)",
          padding: "72px 80px",
          fontFamily: "system-ui",
          position: "relative",
        }}
      >
        {/* Cyan radial glow */}
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)",
          }}
        />
        {/* Brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#020617",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
            }}
          >
            <svg viewBox="0 0 24 24" width={42} height={42} fill="none">
              <path d="M4 4v16h7.8" stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.35 4h9.65" stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M10.35 10h4.2" stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M15.85 10v9.9" stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M10.35 19.9h5.5" stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: "#fff",
            }}
          >
            LIT
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#00F0FF",
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              color: "#f8fafc",
              lineHeight: 1.05,
              maxWidth: "85%",
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#94a3b8",
            fontSize: 18,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "#00F0FF",
              boxShadow: "0 0 8px rgba(0,240,255,0.6)",
            }}
          />
          logisticintel.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
