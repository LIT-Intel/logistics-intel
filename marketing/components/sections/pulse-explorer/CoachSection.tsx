import { Sparkles, Eye, ListChecks, PenLine, ShieldCheck, type LucideIcon } from "lucide-react";

const VULNERABLE = [
  ["Detroit Diesel", 90],
  ["Seattle Auto Group", 84],
  ["Miami Motors Intl", 81],
] as const;

const VALUES: Array<[LucideIcon, string, string]> = [
  [Eye, "Sees your view", "Filters, selection & zoom as context"],
  [ListChecks, "Cites real accounts", "Every answer links back to the map"],
  [PenLine, "Drafts the next move", "Outreach angles for top-scored accounts"],
  [ShieldCheck, "Stays on your data", "No hallucinated companies"],
];

export function CoachSection() {
  return (
    <section
      className="section"
      style={{
        background: "linear-gradient(180deg, #020617, #081225)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(900px 400px at 20% 0%, rgba(0,240,255,0.12), transparent 60%), radial-gradient(700px 360px at 90% 100%, rgba(139,92,246,0.12), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="mx-auto px-4 sm:px-8"
        style={{ maxWidth: 1240, position: "relative" }}
      >
        <div
          className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14"
        >
          {/* Coach panel */}
          <div
            className="card-glossy on-dark"
            style={{
              padding: 16,
              border: "1px solid rgba(0,240,255,0.2)",
              boxShadow: "0 40px 90px -30px rgba(0,240,255,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "4px 6px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "rgba(0,240,255,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(0,240,255,0.3)",
                }}
              >
                <Sparkles size={15} color="#00F0FF" />
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "#f8fafc",
                    fontSize: 14,
                  }}
                >
                  Pulse Coach
                </div>
                <div style={{ fontSize: 10.5, color: "#5b7398" }}>
                  Grounded in 5,041 accounts · current map view
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "14px 6px 6px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "78%",
                  background: "linear-gradient(180deg,#3b82f6,#2563eb)",
                  color: "#fff",
                  padding: "10px 13px",
                  borderRadius: "12px 12px 4px 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Which accounts here look most vulnerable to switching carriers?
              </div>
              <div
                style={{
                  alignSelf: "flex-start",
                  maxWidth: "88%",
                  background: "#0f1f38",
                  border: "1px solid #1c3458",
                  color: "#cbd5e1",
                  padding: "12px 14px",
                  borderRadius: "12px 12px 12px 4px",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <span style={{ color: "#f1f5f9", fontWeight: 600 }}>7 accounts</span>{" "}
                in view score Vulnerable. Top signals: stale carrier data &gt; 180d
                and single-carrier dependence.
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {VULNERABLE.map(([n, s]) => (
                    <div
                      key={n}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "#0a1730",
                        borderRadius: 7,
                        padding: "7px 10px",
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          background: "#f59e0b",
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#e2e8f0",
                          flex: 1,
                        }}
                      >
                        {n}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          color: "#f59e0b",
                        }}
                      >
                        {s}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {[
                  "Summarize consolidation opportunities",
                  "Draft outreach for top 5",
                ].map((s) => (
                  <span
                    key={s}
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 11,
                      color: "#9fb4d4",
                      background: "#0a1730",
                      border: "1px solid #16294a",
                      borderRadius: 9999,
                      padding: "6px 11px",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Copy + value props */}
          <div>
            <div
              className="lit-pill"
              style={{
                background: "rgba(0,240,255,0.08)",
                border: "1px solid rgba(0,240,255,0.25)",
                color: "#00F0FF",
              }}
            >
              <span
                className="dot"
                style={{
                  background: "#00F0FF",
                  boxShadow: "0 0 8px #00F0FF",
                }}
              />
              Pulse Coach AI
            </div>
            <h2
              className="display-lg"
              style={{ color: "#f8fafc", marginTop: 14 }}
            >
              An analyst that already read your map.
            </h2>
            <p className="lead" style={{ color: "#cbd5e1", marginTop: 16 }}>
              Pulse Coach is grounded in exactly what you&apos;re looking at —
              the current filters, selection, and zoom. Ask about consolidation
              plays, vulnerable incumbents, or trade-lane patterns and get
              answers tied to real accounts on screen.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginTop: 26,
              }}
            >
              {VALUES.map(([Icon, t, b]) => (
                <div
                  key={t}
                  style={{
                    background: "rgba(15,31,56,0.5)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <Icon size={18} color="#00F0FF" />
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: 14,
                      color: "#f8fafc",
                      marginTop: 10,
                    }}
                  >
                    {t}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#94a3b8",
                      marginTop: 3,
                      lineHeight: 1.5,
                    }}
                  >
                    {b}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
