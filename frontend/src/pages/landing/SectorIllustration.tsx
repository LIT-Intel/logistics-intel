import React from "react";
import { motion } from "framer-motion";
import type { Sector } from "./sectors";

// SectorIllustration — animated SVG hero per sector. All five share the
// same canvas size + accent variable so they slot into the hero block
// uniformly. Animations are CSS/transform driven (cheap on mobile).

interface Props {
  sector: Sector;
}

const VIEWBOX = "0 0 360 240";

export function SectorIllustration({ sector }: Props) {
  return (
    <svg
      viewBox={VIEWBOX}
      role="img"
      aria-label={`${sector.eyebrow} illustration`}
      className="h-auto w-full max-w-[420px]"
      style={{ ["--accent" as any]: sector.accent }}
    >
      <defs>
        <linearGradient id={`bg-${sector.id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={sector.accentSoft} />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="360" height="240" rx="20" fill={`url(#bg-${sector.id})`} />
      {sector.illustration === "stack" ? <ContainerStack accent={sector.accent} /> : null}
      {sector.illustration === "broker" ? <BrokerNetwork accent={sector.accent} /> : null}
      {sector.illustration === "customs" ? <CustomsFlow accent={sector.accent} /> : null}
      {sector.illustration === "nvocc" ? <NvoccPipeline accent={sector.accent} /> : null}
      {sector.illustration === "dashboard" ? <DashboardRise accent={sector.accent} /> : null}
    </svg>
  );
}

// 1) Stack of cargo containers, with a top container animating in from the
// right via framer-motion's path drawing.
function ContainerStack({ accent }: { accent: string }) {
  const cargoColors = ["#0F172A", accent, "#64748B", accent, "#0F172A"];
  return (
    <g>
      {/* ground */}
      <rect x="40" y="190" width="280" height="6" rx="3" fill="#0F172A" opacity="0.18" />
      {/* lower row */}
      {cargoColors.slice(0, 4).map((c, i) => (
        <motion.rect
          key={`b-${i}`}
          x={56 + i * 60} y="148" width="52" height="36" rx="3" fill={c}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.5, ease: "easeOut" }}
        />
      ))}
      {/* upper row */}
      {cargoColors.slice(0, 3).map((c, i) => (
        <motion.rect
          key={`t-${i}`}
          x={86 + i * 60} y="106" width="52" height="36" rx="3" fill={c} opacity={0.92}
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 0.92, y: 0 }}
          transition={{ delay: 0.15 + 0.06 * i, duration: 0.5, ease: "easeOut" }}
        />
      ))}
      {/* top container slides in */}
      <motion.rect
        x="146" y="64" width="52" height="36" rx="3" fill={accent}
        initial={{ x: 320, opacity: 0 }} animate={{ x: 146, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.7, ease: "easeOut" }}
      />
      {/* crane */}
      <line x1="172" y1="40" x2="172" y2="64" stroke="#0F172A" strokeWidth="3" />
      <line x1="160" y1="40" x2="184" y2="40" stroke="#0F172A" strokeWidth="3" />
    </g>
  );
}

// 2) Broker connector lines pulsing between trucks/people glyphs.
function BrokerNetwork({ accent }: { accent: string }) {
  const nodes = [
    { x: 70, y: 80, label: "S" },
    { x: 70, y: 170, label: "S" },
    { x: 290, y: 80, label: "C" },
    { x: 290, y: 170, label: "C" },
  ];
  return (
    <g>
      {/* center hub */}
      <circle cx="180" cy="125" r="34" fill={accent} />
      <text x="180" y="131" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace" fontWeight="700" fontSize="14">YOU</text>
      {nodes.map((n, i) => (
        <g key={i}>
          <motion.line
            x1={n.x} y1={n.y} x2="180" y2="125"
            stroke={accent} strokeWidth="2" strokeDasharray="6 4"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.1 * i, duration: 0.7, ease: "easeOut" }}
          />
          <circle cx={n.x} cy={n.y} r="20" fill="#fff" stroke="#0F172A" strokeWidth="1.5" />
          <text x={n.x} y={n.y + 5} textAnchor="middle" fill="#0F172A" fontFamily="ui-monospace, monospace" fontWeight="700" fontSize="13">
            {n.label}
          </text>
          {/* pulse */}
          <motion.circle
            cx="180" cy="125" r="34" fill="none" stroke={accent} strokeWidth="2"
            initial={{ opacity: 0.5, r: 34 }} animate={{ opacity: 0, r: 70 }}
            transition={{ delay: 0.4 + i * 0.18, duration: 1.6, repeat: Infinity, repeatDelay: 1.2 }}
          />
        </g>
      ))}
    </g>
  );
}

// 3) Customs flow — document → stamp → checkmark.
function CustomsFlow({ accent }: { accent: string }) {
  return (
    <g>
      {/* document */}
      <motion.g initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
        <rect x="40" y="60" width="100" height="120" rx="6" fill="#fff" stroke="#0F172A" strokeWidth="1.5" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="52" y1={80 + i * 18} x2="128" y2={80 + i * 18} stroke="#CBD5E1" strokeWidth="2" />
        ))}
      </motion.g>
      {/* arrow */}
      <motion.path
        d="M 150 120 L 200 120" stroke={accent} strokeWidth="3" markerEnd="url(#arrow-end)" fill="none"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.4, duration: 0.6 }}
      />
      <defs>
        <marker id="arrow-end" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
        </marker>
      </defs>
      {/* stamp */}
      <motion.g initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: -15 }} transition={{ delay: 0.7, duration: 0.4, type: "spring" }}>
        <circle cx="245" cy="110" r="42" fill="none" stroke={accent} strokeWidth="3" />
        <circle cx="245" cy="110" r="34" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="3 2" />
        <text x="245" y="106" textAnchor="middle" fill={accent} fontFamily="ui-monospace, monospace" fontWeight="800" fontSize="11">CLEARED</text>
        <text x="245" y="120" textAnchor="middle" fill={accent} fontFamily="ui-monospace, monospace" fontSize="9">HS · ORIGIN</text>
      </motion.g>
      {/* check */}
      <motion.path
        d="M 280 175 l 10 10 l 22 -22"
        stroke="#16A34A" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.4 }}
      />
    </g>
  );
}

// 4) NVOCC pipeline — ship → port → truck.
function NvoccPipeline({ accent }: { accent: string }) {
  return (
    <g>
      {/* ocean */}
      <rect x="0" y="170" width="360" height="50" fill={accent} opacity="0.18" />
      {/* ship */}
      <motion.g initial={{ x: -60 }} animate={{ x: 0 }} transition={{ duration: 0.7 }}>
        <rect x="40" y="140" width="80" height="20" rx="3" fill="#0F172A" />
        <rect x="58" y="120" width="14" height="20" fill={accent} />
        <rect x="76" y="116" width="14" height="24" fill={accent} />
        <rect x="94" y="124" width="14" height="16" fill={accent} />
        <polygon points="40,160 30,170 130,170 120,160" fill="#0F172A" />
      </motion.g>
      {/* arrow 1 */}
      <motion.line
        x1="135" y1="148" x2="170" y2="148" stroke={accent} strokeWidth="3"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.4 }}
      />
      {/* port (crane outline) */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.3 }}>
        <line x1="190" y1="100" x2="190" y2="170" stroke="#0F172A" strokeWidth="3" />
        <line x1="190" y1="100" x2="220" y2="100" stroke="#0F172A" strokeWidth="3" />
        <line x1="220" y1="100" x2="220" y2="120" stroke="#0F172A" strokeWidth="2" />
        <rect x="210" y="120" width="20" height="14" fill={accent} />
      </motion.g>
      {/* arrow 2 */}
      <motion.line
        x1="240" y1="148" x2="270" y2="148" stroke={accent} strokeWidth="3"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.0, duration: 0.4 }}
      />
      {/* truck */}
      <motion.g initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.1, duration: 0.5 }}>
        <rect x="280" y="130" width="50" height="30" rx="3" fill="#0F172A" />
        <rect x="280" y="120" width="22" height="14" fill={accent} />
        <circle cx="290" cy="166" r="6" fill="#0F172A" />
        <circle cx="320" cy="166" r="6" fill="#0F172A" />
      </motion.g>
    </g>
  );
}

// 5) Dashboard bars rising — analytics-feel.
function DashboardRise({ accent }: { accent: string }) {
  const bars = [38, 62, 50, 88, 72, 110];
  return (
    <g>
      {/* card frame */}
      <rect x="40" y="40" width="280" height="160" rx="12" fill="#fff" stroke="#0F172A" strokeWidth="1.5" />
      {/* axis */}
      <line x1="60" y1="170" x2="300" y2="170" stroke="#CBD5E1" strokeWidth="1.5" />
      {bars.map((h, i) => (
        <motion.rect
          key={i}
          x={70 + i * 38}
          width="24"
          rx="3"
          fill={i === bars.length - 1 ? accent : "#0F172A"}
          opacity={i === bars.length - 1 ? 1 : 0.85}
          initial={{ y: 170, height: 0 }}
          animate={{ y: 170 - h, height: h }}
          transition={{ delay: 0.05 * i, duration: 0.6, ease: "easeOut" }}
        />
      ))}
      {/* line trend */}
      <motion.path
        d="M 82 132 Q 132 110 170 120 T 270 60"
        fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.9, ease: "easeOut" }}
      />
      <motion.circle cx="270" cy="60" r="5" fill={accent}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.5, duration: 0.3 }} />
    </g>
  );
}
