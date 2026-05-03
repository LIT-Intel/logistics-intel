import type { Config } from "tailwindcss";

/**
 * Marketing site Tailwind config — mirrors the brand tokens defined in
 * the LIT app (Profile-page Pulse Coach pattern, slate-950 + cyan #00F0FF
 * accent) so the marketing surface and the in-app surface read as one
 * consistent brand voice.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./sanity/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "DM Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      colors: {
        brand: {
          cyan: "#00F0FF",
          "cyan-dim": "#00c8d4",
          blue: "#3b82f6",
          "blue-600": "#2563eb",
          "blue-700": "#1d4ed8",
          violet: "#8b5cf6",
          indigo: "#6366f1",
        },
        ink: {
          0: "#ffffff",
          25: "#fbfcfe",
          50: "#f6f8fc",
          75: "#eef2f9",
          100: "#e5ebf5",
          150: "#cfd7e6",
          200: "#94a3b8",
          500: "#475569",
          700: "#1e293b",
          900: "#0b1220",
          950: "#040815",
        },
        dark: {
          0: "#020617",
          1: "#081225",
          2: "#0f172a",
          3: "#1e293b",
        },
      },
      boxShadow: {
        xs: "0 1px 2px rgba(15,23,42,0.04)",
        sm: "0 2px 6px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.06)",
        md: "0 8px 24px rgba(15,23,42,0.06), 0 2px 6px rgba(15,23,42,0.04)",
        lg: "0 20px 48px rgba(15,23,42,0.10), 0 4px 12px rgba(15,23,42,0.06)",
        xl: "0 40px 80px rgba(15,23,42,0.14), 0 8px 24px rgba(15,23,42,0.08)",
        "glow-cyan": "0 0 24px rgba(0,240,255,0.35)",
        "glow-blue": "0 10px 40px rgba(59,130,246,0.28)",
      },
      borderRadius: {
        xs: "6px",
        sm: "8px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "24px",
      },
      keyframes: {
        "lit-mount-burst": {
          "0%": { boxShadow: "0 0 0 0 rgba(0,240,255,0.7), 0 4px 14px rgba(0,240,255,0.18)" },
          "100%": { boxShadow: "0 0 0 26px rgba(0,240,255,0), 0 4px 14px rgba(0,240,255,0.18)" },
        },
        "lit-breathe": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0,240,255,0.15), 0 4px 14px rgba(0,240,255,0.18)" },
          "50%": { boxShadow: "0 0 0 4px rgba(0,240,255,0.10), 0 4px 18px rgba(0,240,255,0.32)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.3)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        caret: {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" },
        },
      },
      animation: {
        "lit-alive": "lit-mount-burst 800ms ease-out 1, lit-breathe 4s ease-in-out 800ms infinite",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
        float: "float 4s ease-in-out infinite",
        caret: "caret 1s steps(2) infinite",
      },
      maxWidth: {
        container: "1240px",
        "container-narrow": "960px",
      },
    },
  },
  plugins: [],
};

export default config;
