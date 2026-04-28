import React from 'react';
import { T } from './tokens';

const TONE_MAP = {
  neutral: { bg: T.bgSunken,  color: T.inkSoft, border: T.border },
  brand:   { bg: T.brandSoft, color: T.brand,   border: T.brandBorder },
  success: { bg: T.greenBg,   color: T.green,   border: T.greenBorder },
  warn:    { bg: T.amberBg,   color: T.amber,   border: T.amberBorder },
  danger:  { bg: T.redBg,     color: T.red,     border: T.redBorder },
  violet:  { bg: T.violetBg,  color: T.violet,  border: T.violetBorder },
  teal:    { bg: T.tealBg,    color: T.teal,    border: T.tealBorder },
};

export function Badge({ tone = 'neutral', children, dot }) {
  const s = TONE_MAP[tone] || TONE_MAP.neutral;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 600, fontFamily: T.ffDisplay,
        padding: '3px 9px', borderRadius: 9999,
        background: s.bg, color: s.color,
        border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          style={{
            width: 5, height: 5, borderRadius: '50%', background: s.color,
          }}
        />
      )}
      {children}
    </span>
  );
}

export function Card({ children, style, padded = true }) {
  return (
    <div
      style={{
        background: T.bgCanvas,
        border: `1px solid ${T.border}`,
        borderRadius: T.r12,
        boxShadow: T.shadowSm,
        padding: padded ? 20 : 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatCell({ label, value, delta, tone }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          color: T.inkFaint, fontFamily: T.ffDisplay, marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div
          style={{
            fontFamily: T.ffMono, fontSize: 22, fontWeight: 600,
            color: T.brandDeep,
          }}
        >
          {value}
        </div>
        {delta && (
          <span
            style={{
              fontSize: 11, fontFamily: T.ffDisplay, fontWeight: 600,
              color: tone === 'down' ? T.red : T.green,
            }}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

export function SectionHeader({ icon: Icon, label, subtitle, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      {Icon && (
        <div
          style={{
            width: 26, height: 26, borderRadius: 7,
            background: T.brandSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon size={13} color={T.brand} />
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: T.ffDisplay, fontSize: 14, fontWeight: 700,
            color: T.ink, letterSpacing: '-0.01em',
          }}
        >
          {label}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}
