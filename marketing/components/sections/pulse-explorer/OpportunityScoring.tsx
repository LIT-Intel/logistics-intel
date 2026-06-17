import { Layers, AlertTriangle, TrendingUp, Shield, type LucideIcon } from "lucide-react";
import { OPP, type OppCategory } from "./data";

const CARDS: Array<{ key: OppCategory; icon: LucideIcon; body: string }> = [
  {
    key: "consolidation",
    icon: Layers,
    body: "Multiple BOLs, fragmented carriers — ripe to consolidate under one forwarder.",
  },
  {
    key: "vulnerable",
    icon: AlertTriangle,
    body: "Service gaps and stale carrier data signal an incumbent ready to be displaced.",
  },
  {
    key: "velocity",
    icon: TrendingUp,
    body: "Fast-rising TEU and new lanes — high-growth accounts worth pursuing now.",
  },
  {
    key: "defend",
    icon: Shield,
    body: "Existing relationships showing churn risk — protect the revenue you already hold.",
  },
];

export function OpportunityScoring() {
  return (
    <section
      className="section"
      style={{
        background:
          "linear-gradient(180deg, transparent, #f1f5f9 50%, transparent)",
      }}
    >
      <div className="mx-auto px-8" style={{ maxWidth: 1240 }}>
        <div className="section-title" style={{ marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Opportunity scoring
          </div>
          <h2 className="display-lg" style={{ marginBottom: 14 }}>
            Every account scored the moment it hits the map.
          </h2>
          <p className="lead" style={{ maxWidth: 640, margin: "0 auto" }}>
            Pulse grades all 78K+ shippers across four plays — so reps open the
            map already knowing who to call, and why.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {CARDS.map((c) => {
            const o = OPP[c.key];
            const Icon = c.icon;
            return (
              <div
                key={c.key}
                className="card-glossy"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  padding: 28,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 120,
                    height: 120,
                    background: `radial-gradient(circle, ${o.color}1f, transparent 70%)`,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 11,
                      background: o.tint,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px solid ${o.color}40`,
                    }}
                  >
                    <Icon size={19} color={o.color} />
                  </div>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: o.color,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      background: o.color,
                    }}
                  />
                  {o.label}
                </span>
                <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6 }}>
                  {c.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
