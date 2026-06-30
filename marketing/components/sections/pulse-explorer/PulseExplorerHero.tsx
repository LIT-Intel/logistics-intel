"use client";

import { useState } from "react";
import { ArrowRight, Calendar, Mail, Phone, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { PulseExplorerMock } from "./PulseExplorerMock";
import { PulseVideoButton } from "./PulseVideoButton";
import type { MapMode } from "./PulseMapCanvas";

const DEMO_URL = "https://cal.com/logisticintel/30min";

const KPIS: Array<[string, string]> = [
  ["78K+", "Shipper accounts mapped"],
  ["4", "Opportunity scores per account"],
  ["78K", "Plotted in under a second"],
  ["100%", "Mobile-first responsive"],
];

/**
 * Pulse Explorer V2 hero. State for the bubble/heat toggle lives here so
 * users can flip the map directly from the mock chrome above. A
 * floating Ford QuickCard sits inside the frame (never outside — the
 * page wrapper clips on negative offsets) to teach what an account row
 * looks like when surfaced from the map.
 */
export function PulseExplorerHero() {
  const [mode, setMode] = useState<MapMode>("bubble");

  return (
    <section style={{ position: "relative", paddingTop: 64, paddingBottom: 56 }}>
      <div
        className="mx-auto px-8"
        style={{ maxWidth: 1240, position: "relative" }}
      >
        <div
          style={{
            maxWidth: 920,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <div
            className="lit-pill"
            style={{
              borderColor: "rgba(59,130,246,0.4)",
              margin: "0 auto",
            }}
          >
            <span
              className="dot"
              style={{
                background: "#3b82f6",
                boxShadow: "0 0 8px #3b82f6",
              }}
            />
            New · Pulse Explorer V2 — map-first sales intelligence
          </div>
          <h1 className="display-xl" style={{ marginTop: 22 }}>
            Pulse Explorer: Freight Prospecting Software Built for{" "}
            <span className="grad-text-cyan">Logistics Sales Teams</span>
          </h1>
          <p
            className="lead"
            style={{
              marginTop: 20,
              maxWidth: 700,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Find active shippers, analyze trade lanes, enrich decision-makers,
            and build targeted lead lists from one interactive freight intelligence workspace.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 30,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Button variant="primary" size="lg" href={DEMO_URL}>
              <Calendar size={16} />
              Book a Pulse Explorer Demo
            </Button>
            <Button variant="secondary" size="lg" href={APP_SIGNUP_URL}>
              Start Free
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>

        {/* Framed app mock + floating QuickCard */}
        <div
          style={{
            position: "relative",
            marginTop: 48,
            maxWidth: 1120,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-6% -2% -10%",
              background:
                "radial-gradient(900px 420px at 50% 0%, rgba(0,240,255,0.16), transparent 65%)",
              pointerEvents: "none",
              filter: "blur(4px)",
            }}
          />
          <div
            aria-label="Pulse Explorer freight prospecting software map interface by Logistics Intel"
            style={{ position: "relative" }}
          >
            <PulseExplorerMock mode={mode} onMode={setMode} />
            <PulseVideoButton
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                zIndex: 1300,
                transform: "translate(-50%, -50%)",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                minHeight: 48,
                padding: "0 18px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.28)",
                background: "rgba(2,6,23,0.82)",
                color: "#fff",
                boxShadow: "0 20px 48px rgba(2,6,23,0.32)",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                whiteSpace: "nowrap",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(135deg,#2563eb,#06b6d4)",
                }}
              >
                <Play size={14} fill="currentColor" />
              </span>
              Watch the Demo
            </PulseVideoButton>
          </div>
          {/* QuickCard — kept INSIDE the frame bounds (right:18, bottom:24)
              per handoff Jun-17 fix; never use negative offsets while the
              .lit-page wrapper has overflow: clip. Hidden on mobile —
              would otherwise cover most of the map at <640px viewports. */}
          <div
            className="hidden sm:block"
            style={{
              position: "absolute",
              right: 18,
              bottom: 24,
              width: 244,
              zIndex: 1200,
              background: "#fff",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 40px 80px rgba(15,23,42,0.14)",
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 7,
                  background: "linear-gradient(135deg,#3b82f6,#06b6d4)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                F
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  Ford
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "rgba(15,23,42,0.55)",
                  }}
                >
                  Dearborn, MI · Motor Vehicles
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 18,
                  color: "var(--brand-blue-700)",
                }}
              >
                97
              </span>
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(15,23,42,0.05)",
                paddingTop: 9,
                fontSize: 11,
                color: "rgba(15,23,42,0.6)",
                lineHeight: 1.55,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Mail size={12} color="#10b981" />
                <span style={{ fontFamily: "var(--font-mono)", color: "#1e293b" }}>
                  logistics@ford.com
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <Phone size={12} color="#10b981" />
                <span style={{ fontFamily: "var(--font-mono)", color: "#1e293b" }}>
                  +1 313 322 3000
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-display)",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 5,
                    background: "rgba(16,185,129,0.12)",
                    color: "#15803d",
                  }}
                >
                  DCS
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stat row */}
        <div
          style={{
            display: "flex",
            gap: 44,
            justifyContent: "center",
            marginTop: 64,
            flexWrap: "wrap",
          }}
        >
          {KPIS.map(([k, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 30,
                  color: "var(--ink-900, #0b1220)",
                  letterSpacing: "-0.01em",
                }}
              >
                {k}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "rgba(15,23,42,0.5)",
                  fontFamily: "var(--font-display)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                {l}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
