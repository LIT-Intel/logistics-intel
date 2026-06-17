import { Braces, Globe2, Zap, Sparkles } from "lucide-react";

const CHIPS = [
  { l: "Industry", v: "Automotive", c: "#3b82f6" },
  { l: "Region", v: "West Coast", c: "#06b6d4" },
  { l: "Region", v: "Southeast", c: "#06b6d4" },
];

const ROWS = [
  { scope: "REGION", name: "West Coast", n: "1,284", sales: "$612B" },
  { scope: "STATE", name: "California", n: "742", sales: "$391B" },
  { scope: "STATE", name: "Georgia", n: "318", sales: "$104B" },
  { scope: "COUNTRY", name: "United States", n: "5,041", sales: "$8.18T" },
];

const BENEFITS: Array<[typeof Braces, string]> = [
  [Braces, "Parses industry, geography, lane, and signal in one query"],
  [Globe2, "Resolves to region → state → country roll-ups automatically"],
  [Zap, "No filters, no boolean — just type and re-plot"],
];

export function NLSearchSection() {
  return (
    <section className="section">
      <div className="mx-auto px-8" style={{ maxWidth: 1240 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.05fr)",
            gap: 56,
            alignItems: "center",
          }}
          className="md:grid-cols-2"
        >
          <div>
            <div className="eyebrow" style={{ color: "var(--brand-blue)" }}>
              Natural-language search
            </div>
            <h2 className="display-lg" style={{ marginTop: 12 }}>
              Ask in plain English. Watch the map answer.
            </h2>
            <p className="lead" style={{ marginTop: 16 }}>
              Type how you think —{" "}
              <span
                style={{
                  color: "var(--ink-900, #0b1220)",
                  fontWeight: 600,
                }}
              >
                &ldquo;automotive companies in the west coast and southeast&rdquo;
              </span>{" "}
              — and Pulse parses intent, resolves it to regions, states, and
              countries, and re-plots the whole map instantly.
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginTop: 24,
              }}
            >
              {BENEFITS.map(([Icon, t]) => (
                <div
                  key={t}
                  style={{
                    display: "flex",
                    gap: 11,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: "var(--blue-tint)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={15} color="var(--brand-blue)" />
                  </div>
                  <span style={{ fontSize: 14, color: "var(--ink-700, #1e293b)" }}>
                    {t}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="card-glossy"
            style={{
              padding: 18,
              background: "linear-gradient(180deg,#040c1c,#081225)",
              border: "1px solid #16294a",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                background: "#0a1730",
                border: "1px solid #1c3458",
                borderRadius: 10,
                padding: "11px 13px",
              }}
            >
              <Sparkles size={15} color="#00F0FF" />
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                  color: "#e2e8f0",
                }}
              >
                automotive companies in the west coast and southeast
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 7,
                marginTop: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 9.5,
                  letterSpacing: "0.12em",
                  color: "#5b7398",
                }}
              >
                PARSED AS
              </span>
              {CHIPS.map((ch) => (
                <span
                  key={ch.l + ch.v}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: `${ch.c}1f`,
                    border: `1px solid ${ch.c}55`,
                    color: "#cfe8ff",
                    borderRadius: 7,
                    padding: "4px 9px",
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: ch.c,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {ch.l}
                  </span>
                  {ch.v}
                </span>
              ))}
            </div>

            <div
              style={{
                marginTop: 14,
                background: "#04101f",
                border: "1px solid #16294a",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  padding: "8px 14px",
                  borderBottom: "1px solid #16294a",
                  fontFamily: "var(--font-display)",
                  fontSize: 9.5,
                  letterSpacing: "0.1em",
                  color: "#5b7398",
                }}
              >
                <span>SCOPE · NAME</span>
                <span style={{ textAlign: "right" }}>ACCOUNTS</span>
                <span style={{ textAlign: "right", width: 78 }}>ANN. SALES</span>
              </div>
              {ROWS.map((r) => (
                <div
                  key={r.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    padding: "11px 14px",
                    borderBottom: "1px solid #0f2038",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8.5,
                        fontWeight: 700,
                        color: "#00F0FF",
                        background: "rgba(0,240,255,0.1)",
                        border: "1px solid rgba(0,240,255,0.25)",
                        padding: "1px 5px",
                        borderRadius: 4,
                      }}
                    >
                      {r.scope}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#f1f5f9",
                      }}
                    >
                      {r.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                      color: "#cbd5e1",
                      textAlign: "right",
                    }}
                  >
                    {r.n}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                      color: "#00F0FF",
                      textAlign: "right",
                      width: 78,
                    }}
                  >
                    {r.sales}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
