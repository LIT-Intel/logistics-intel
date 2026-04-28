// tokens.jsx — shared design tokens for the affiliate system
// Light premium, high-trust financial SaaS feel.
'use strict';

const T = {
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
  green:        '#15803d', greenBg:'#F0FDF4', greenBorder:'#BBF7D0',
  amber:        '#b45309', amberBg:'#FFFBEB', amberBorder:'#FDE68A',
  red:          '#b91c1c', redBg:'#FEF2F2',   redBorder:'#FECACA',
  violet:       '#7c3aed', violetBg:'#F5F3FF', violetBorder:'#DDD6FE',
  teal:         '#0f766e', tealBg:'#F0FDFA',  tealBorder:'#99F6E4',

  // Type
  ffDisplay:    'Space Grotesk, system-ui, sans-serif',
  ffBody:       'DM Sans, system-ui, sans-serif',
  ffMono:       'JetBrains Mono, monospace',

  // Radius
  r4:4, r6:6, r7:7, r8:8, r10:10, r12:12, r14:14, r16:16,

  // Shadows
  shadowSm: '0 1px 2px rgba(15,23,42,0.04)',
  shadowMd: '0 2px 8px rgba(15,23,42,0.06)',
  shadowLg: '0 10px 30px rgba(15,23,42,0.09), 0 2px 6px rgba(15,23,42,0.04)',
};

const Btn = {
  primary: { display:'inline-flex', alignItems:'center', gap:6, background:'linear-gradient(180deg,#3B82F6,#2563EB)', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:600, fontFamily:T.ffDisplay, cursor:'pointer', boxShadow:'0 1px 4px rgba(59,130,246,0.3)' },
  ghost:   { display:'inline-flex', alignItems:'center', gap:6, background:'#FFFFFF', color:T.inkMuted, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 14px', fontSize:13, fontWeight:600, fontFamily:T.ffDisplay, cursor:'pointer' },
  quiet:   { display:'inline-flex', alignItems:'center', gap:5, background:'transparent', color:T.inkSoft, border:'none', borderRadius:6, padding:'6px 10px', fontSize:12.5, fontWeight:600, fontFamily:T.ffDisplay, cursor:'pointer' },
};

function Badge({ tone='neutral', children, dot }) {
  const map = {
    neutral: { bg:T.bgSunken,     color:T.inkSoft, border:T.border },
    brand:   { bg:T.brandSoft,    color:T.brand,   border:T.brandBorder },
    success: { bg:T.greenBg,      color:T.green,   border:T.greenBorder },
    warn:    { bg:T.amberBg,      color:T.amber,   border:T.amberBorder },
    danger:  { bg:T.redBg,        color:T.red,     border:T.redBorder },
    violet:  { bg:T.violetBg,     color:T.violet,  border:T.violetBorder },
    teal:    { bg:T.tealBg,       color:T.teal,    border:T.tealBorder },
  };
  const s = map[tone] || map.neutral;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,fontFamily:T.ffDisplay,padding:'3px 9px',borderRadius:9999,background:s.bg,color:s.color,border:`1px solid ${s.border}`,whiteSpace:'nowrap'}}>
      {dot && <span style={{width:5,height:5,borderRadius:'50%',background:s.color}}/>}
      {children}
    </span>
  );
}

function Card({ children, style, padded=true }) {
  return <div style={{background:T.bgCanvas,border:`1px solid ${T.border}`,borderRadius:T.r12,boxShadow:T.shadowSm,padding:padded?20:0,...style}}>{children}</div>;
}

function StatCell({ label, value, delta, tone }) {
  return (
    <div>
      <div style={{fontSize:10.5,fontWeight:600,letterSpacing:'0.07em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay,marginBottom:5}}>{label}</div>
      <div style={{display:'flex',alignItems:'baseline',gap:8}}>
        <div style={{fontFamily:T.ffMono,fontSize:22,fontWeight:600,color:T.brandDeep}}>{value}</div>
        {delta && <span style={{fontSize:11,fontFamily:T.ffDisplay,fontWeight:600,color: tone==='down' ? T.red : T.green}}>{delta}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ icon, label, subtitle, right }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
      {icon && <div style={{width:26,height:26,borderRadius:7,background:T.brandSoft,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <i data-lucide={icon} style={{width:13,height:13,color:T.brand}}/>
      </div>}
      <div style={{flex:1}}>
        <div style={{fontFamily:T.ffDisplay,fontSize:14,fontWeight:700,color:T.ink,letterSpacing:'-0.01em'}}>{label}</div>
        {subtitle && <div style={{fontSize:12,color:T.inkSoft,marginTop:1}}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

Object.assign(window, { T, Btn, Badge, Card, StatCell, SectionHeader });
