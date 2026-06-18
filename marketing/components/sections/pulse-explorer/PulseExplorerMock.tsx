"use client";

import {
  Sparkles,
  Search,
  Filter,
  Bookmark,
  Layers,
  BarChart3,
  BookOpen,
  ScanLine,
  Lasso,
} from "lucide-react";
import { PulseMapCanvas, type MapMode } from "./PulseMapCanvas";
import { OPP } from "./data";

const STATS: Array<[string, string]> = [
  ["78,412", "SHIPPER ACCOUNTS"],
  ["$8.18T", "ANNUAL SALES"],
  ["771.1K", "TEU · 12M"],
  ["17", "METRO CLUSTERS"],
];

const RAIL: Array<{ icon: typeof Filter; key: string }> = [
  { icon: Filter, key: "filter" },
  { icon: Bookmark, key: "bookmark" },
  { icon: Layers, key: "layers" },
  { icon: BarChart3, key: "stats" },
  { icon: Sparkles, key: "ai" },
  { icon: BookOpen, key: "book" },
];

const TOOLS: Array<{ icon: typeof ScanLine; label: string }> = [
  { icon: ScanLine, label: "Select in view" },
  { icon: Lasso, label: "Lasso" },
  { icon: Bookmark, label: "Save view" },
];

/**
 * The framed Pulse Explorer V2 app mock used as the hero centerpiece.
 * Dark chrome (top bar / stats strip / rail) sits around a real Leaflet
 * map so the marketing surface matches what the product actually looks
 * like in the live app.
 */
export function PulseExplorerMock({
  mode = "bubble",
  onMode,
}: {
  mode?: MapMode;
  onMode?: (m: MapMode) => void;
}) {
  return (
    <div
      style={{
        background: "var(--dark-0, #020617)",
        borderRadius: 18,
        padding: "10px 10px 0",
        boxShadow:
          "0 40px 100px -20px rgba(15,23,42,0.35), 0 20px 40px -10px rgba(15,23,42,0.2), 0 0 0 1px rgba(15,23,42,0.9)",
        overflow: "hidden",
      }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 p-1.5 pb-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} />
        <span
          className="ml-2.5 flex-1 truncate"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "#64748b",
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 6,
            padding: "5px 10px",
          }}
        >
          app.logisticintel.com/company-intelligence
        </span>
      </div>

      <div
        style={{
          borderRadius: "12px 12px 0 0",
          overflow: "hidden",
          background: "#020617",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 16px",
            background: "#040c1c",
            borderBottom: "1px solid #0f2038",
            flexWrap: "wrap",
          }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <Sparkles size={16} color="#00F0FF" />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                color: "#f8fafc",
                fontSize: 14,
              }}
            >
              Pulse Explorer
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: "#00F0FF",
                background: "rgba(0,240,255,0.12)",
                border: "1px solid rgba(0,240,255,0.3)",
                padding: "1px 5px",
                borderRadius: 4,
              }}
            >
              V2
            </span>
          </div>
          <div
            className="hidden flex-1 items-center sm:flex"
            style={{
              gap: 8,
              background: "#0a1730",
              border: "1px solid #16294a",
              borderRadius: 9,
              padding: "8px 12px",
              minWidth: 0,
            }}
          >
            <Search size={13} color="#64748b" />
            <span
              className="truncate"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12.5,
                color: "#cbd5e1",
              }}
            >
              Automotive companies in the west coast and southeast
            </span>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 1.5,
                height: 13,
                background: "#00F0FF",
                animation: "pulseDot 1s steps(2) infinite",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              background: "#0a1730",
              border: "1px solid #16294a",
              borderRadius: 8,
              padding: 3,
              gap: 2,
            }}
          >
            {(
              [
                ["bubble", "Map"],
                ["heat", "Heat"],
                ["region", "Region"],
              ] as const
            ).map(([m, l]) => {
              const active = mode === m;
              const clickable = m !== "region";
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => clickable && onMode?.(m as MapMode)}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 11px",
                    borderRadius: 6,
                    border: "none",
                    cursor: clickable ? "pointer" : "default",
                    background: active ? "rgba(0,240,255,0.14)" : "transparent",
                    color: active ? "#00F0FF" : "#94a3b8",
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
            padding: "11px 18px",
            background: "#04101f",
            borderBottom: "1px solid #0f2038",
            flexWrap: "wrap",
          }}
        >
          {STATS.map(([v, l]) => (
            <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#f8fafc",
                }}
              >
                {v}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 9.5,
                  letterSpacing: "0.1em",
                  color: "#5b7398",
                }}
              >
                {l}
              </span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-display)",
              fontSize: 10,
              color: "#64748b",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: "#10b981",
                boxShadow: "0 0 6px #10b981",
              }}
            />
            LIVE
          </span>
        </div>

        {/* Body: rail + map */}
        <div style={{ display: "flex", height: 440, position: "relative" }}>
          <div
            style={{
              width: 46,
              background: "#04101f",
              borderRight: "1px solid #0f2038",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "12px 0",
            }}
          >
            {RAIL.map((item, i) => {
              const Icon = item.icon;
              const active = i === 4;
              return (
                <div
                  key={item.key}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: active ? "rgba(0,240,255,0.12)" : "transparent",
                    borderLeft: active
                      ? "2px solid #00F0FF"
                      : "2px solid transparent",
                  }}
                >
                  <Icon size={15} color={active ? "#00F0FF" : "#5b7398"} />
                </div>
              );
            })}
          </div>
          <div
            style={{
              flex: 1,
              position: "relative",
              background: "#e8e6dd",
              overflow: "hidden",
            }}
          >
            <PulseMapCanvas mode={mode} height={440} />
            {/* Top-right view tools */}
            <div
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                display: "flex",
                flexDirection: "column",
                gap: 7,
                zIndex: 600,
                pointerEvents: "none",
              }}
            >
              {TOOLS.map((t) => {
                const Icon = t.icon;
                return (
                  <div
                    key={t.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      background: "rgba(255,255,255,0.95)",
                      border: "1px solid rgba(15,23,42,0.12)",
                      borderRadius: 8,
                      padding: "7px 11px",
                      fontFamily: "var(--font-display)",
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: "var(--ink-700, #1e293b)",
                      boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                    }}
                  >
                    <Icon size={13} color="#3b82f6" />
                    {t.label}
                  </div>
                );
              })}
            </div>
            {/* Opportunity legend */}
            <div
              style={{
                position: "absolute",
                left: 14,
                bottom: 14,
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                maxWidth: 360,
                zIndex: 600,
                pointerEvents: "none",
              }}
            >
              {Object.values(OPP).map((o) => (
                <span
                  key={o.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(255,255,255,0.95)",
                    border: `1px solid ${o.color}66`,
                    borderRadius: 9999,
                    padding: "5px 11px",
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#1e293b",
                    boxShadow: "0 2px 8px rgba(15,23,42,0.1)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: o.color,
                    }}
                  />
                  {o.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
