import {
  Map,
  Target,
  Sparkles,
  Search,
  FileText,
  Lasso,
  Smartphone,
  Database,
  type LucideIcon,
} from "lucide-react";

type Feature = {
  icon: LucideIcon;
  tag: string;
  title: string;
  body: string;
  color: string;
  big?: boolean;
};

const FEATURES: Feature[] = [
  {
    icon: Map,
    tag: "Map-first",
    title: "Sales intelligence on a live map",
    body: "78K+ shipper accounts plotted as bubble clusters and heat — pan, zoom, and read demand at a glance.",
    color: "#00F0FF",
    big: true,
  },
  {
    icon: Target,
    tag: "Scoring",
    title: "Opportunity scoring",
    body: "Consolidation, Vulnerable, High-velocity, and Defend chips grade every account automatically.",
    color: "#8b5cf6",
    big: true,
  },
  {
    icon: Sparkles,
    tag: "AI",
    title: "Pulse Coach AI",
    body: "Chat grounded in your current map view — answers cite real accounts on screen.",
    color: "#06b6d4",
    big: true,
  },
  {
    icon: Search,
    tag: "Search",
    title: "Natural-language search",
    body: "“Automotive companies in west coast and southeast” — type intent, re-plot instantly.",
    color: "#3b82f6",
  },
  {
    icon: FileText,
    tag: "Reports",
    title: "Branded PDF reports",
    body: "Generate a polished account report and download it, or email it via Resend in one click.",
    color: "#f59e0b",
  },
  {
    icon: Lasso,
    tag: "Selection",
    title: "Lasso, select-in-view & saved views",
    body: "Drag a rectangle or lasso a cluster, then save filters, selection, and zoom as a reusable view.",
    color: "#10b981",
  },
  {
    icon: Smartphone,
    tag: "Responsive",
    title: "Mobile-first responsive",
    body: "The full map and panels collapse into bottom-sheets — work accounts from your phone.",
    color: "#6366f1",
  },
  {
    icon: Database,
    tag: "CRM",
    title: "Command Center contacts merged in",
    body: "Saved DCS consignee email and phone surface right inside the account QuickCard.",
    color: "#ef4444",
  },
];

export function FeatureShowcase() {
  return (
    <section className="section">
      <div className="mx-auto px-8" style={{ maxWidth: 1240 }}>
        <div className="section-title" style={{ marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Everything in Pulse Explorer
          </div>
          <h2 className="display-lg" style={{ marginBottom: 14 }}>
            Eight upgrades, one map.
          </h2>
          <p className="lead" style={{ maxWidth: 640, margin: "0 auto" }}>
            The V2 release turns company intelligence into a map-first
            workspace your whole team can work from.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 18,
          }}
        >
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="card-glossy"
                style={{
                  padding: 28,
                  position: "relative",
                  overflow: "hidden",
                  gridColumn: f.big ? undefined : undefined,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 140,
                    height: 140,
                    background: `radial-gradient(circle, ${f.color}1c, transparent 70%)`,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      background: `${f.color}1f`,
                      border: `1px solid ${f.color}40`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={21} color={f.color} />
                  </div>
                  <span
                    className="eyebrow"
                    style={{ fontSize: 11, color: f.color }}
                  >
                    {f.tag}
                  </span>
                </div>
                <h3 className="display-sm" style={{ fontSize: 19 }}>
                  {f.title}
                </h3>
                <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>
                  {f.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
