// Design tokens ported from docs/design-specs/lit-design-system/affiliate/tokens.jsx
// Light premium, high-trust financial SaaS feel.

export const T = {
  // Surface
  bgApp:        '#F7F8FA',
  bgCanvas:     '#FFFFFF',
  bgSubtle:     '#F8FAFC',
  bgSunken:     '#F1F5F9',

  // Lines
  border:       '#E5E7EB',
  borderStrong: '#CBD5E1',
  borderSoft:   '#EEF2F7',

  // Text
  ink:          '#0F172A',
  inkMuted:     '#475569',
  inkSoft:      '#64748b',
  inkFaint:     '#94a3b8',
  inkFaintest:  '#CBD5E1',

  // Brand
  brand:        '#3b82f6',
  brandDeep:    '#1d4ed8',
  brandSoft:    '#EFF6FF',
  brandBorder:  '#BFDBFE',

  // Status
  green: '#15803d', greenBg: '#F0FDF4', greenBorder: '#BBF7D0',
  amber: '#b45309', amberBg: '#FFFBEB', amberBorder: '#FDE68A',
  red:   '#b91c1c', redBg:   '#FEF2F2', redBorder:   '#FECACA',
  violet:'#7c3aed', violetBg:'#F5F3FF', violetBorder:'#DDD6FE',
  teal:  '#0f766e', tealBg:  '#F0FDFA', tealBorder:  '#99F6E4',

  // Type
  ffDisplay: 'Space Grotesk, system-ui, sans-serif',
  ffBody:    'DM Sans, system-ui, sans-serif',
  ffMono:    'JetBrains Mono, monospace',

  // Radius
  r4: 4, r6: 6, r7: 7, r8: 8, r10: 10, r12: 12, r14: 14, r16: 16,

  // Shadows
  shadowSm: '0 1px 2px rgba(15,23,42,0.04)',
  shadowMd: '0 2px 8px rgba(15,23,42,0.06)',
  shadowLg: '0 10px 30px rgba(15,23,42,0.09), 0 2px 6px rgba(15,23,42,0.04)',
};

export const Btn = {
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'linear-gradient(180deg,#3B82F6,#2563EB)',
    color: '#fff', border: 'none', borderRadius: 8,
    padding: '9px 16px', fontSize: 13, fontWeight: 600,
    fontFamily: T.ffDisplay, cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(59,130,246,0.3)',
  },
  ghost: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#FFFFFF', color: T.inkMuted,
    border: `1px solid ${T.border}`, borderRadius: 8,
    padding: '8px 14px', fontSize: 13, fontWeight: 600,
    fontFamily: T.ffDisplay, cursor: 'pointer',
  },
  quiet: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: 'transparent', color: T.inkSoft,
    border: 'none', borderRadius: 6,
    padding: '6px 10px', fontSize: 12.5, fontWeight: 600,
    fontFamily: T.ffDisplay, cursor: 'pointer',
  },
};
