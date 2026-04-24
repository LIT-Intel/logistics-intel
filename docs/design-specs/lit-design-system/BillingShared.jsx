// BillingShared.jsx — shared primitives for Billing page
'use strict';

const bBtnPrimary = {
  display:'inline-flex', alignItems:'center', gap:6,
  background:'linear-gradient(180deg,#3B82F6,#2563EB)',
  border:'1px solid #2563EB', borderRadius:10,
  padding:'9px 16px', fontSize:13, fontWeight:600,
  fontFamily:'Space Grotesk,sans-serif', color:'#fff',
  cursor:'pointer', boxShadow:'0 2px 6px rgba(59,130,246,0.28), inset 0 1px 0 rgba(255,255,255,0.18)',
  transition:'all 160ms cubic-bezier(0.16,1,0.3,1)',
  whiteSpace:'nowrap',
};
const bBtnGhost = {
  display:'inline-flex', alignItems:'center', gap:6,
  background:'#FFFFFF', border:'1px solid #E5E7EB', borderRadius:10,
  padding:'8px 14px', fontSize:13, fontWeight:600,
  fontFamily:'Space Grotesk,sans-serif', color:'#334155',
  cursor:'pointer', transition:'all 160ms',
  whiteSpace:'nowrap',
};
const bBtnDark = {
  display:'inline-flex', alignItems:'center', gap:6,
  background:'#0F172A', border:'1px solid #0F172A', borderRadius:10,
  padding:'9px 16px', fontSize:13, fontWeight:600,
  fontFamily:'Space Grotesk,sans-serif', color:'#fff',
  cursor:'pointer', boxShadow:'0 2px 8px rgba(15,23,42,0.2)',
  whiteSpace:'nowrap',
};
const bBtnLink = {
  display:'inline-flex', alignItems:'center', gap:5,
  background:'transparent', border:'none', padding:0,
  fontSize:12.5, fontWeight:600, fontFamily:'Space Grotesk,sans-serif',
  color:'#2563EB', cursor:'pointer',
};

/* Premium card — soft border, subtle gradient top, lift on hover */
function BCard({ children, style, hoverable, padding }) {
  return (
    <div style={{
      background:'linear-gradient(180deg,#FFFFFF 0%, #FAFBFF 100%)',
      border:'1px solid #E5E7EB',
      borderRadius:14,
      boxShadow:'0 1px 2px rgba(15,23,42,0.04), 0 4px 14px rgba(15,23,42,0.03)',
      padding: padding ?? 22,
      transition: hoverable ? 'all 200ms cubic-bezier(0.16,1,0.3,1)' : 'none',
      ...(style||{})
    }}>{children}</div>
  );
}

/* Section title */
function BSectionTitle({ overline, title, subtitle, right }) {
  return (
    <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:16,marginBottom:14,flexWrap:'wrap'}}>
      <div>
        {overline && <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:700,color:'#2563EB',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:6}}>{overline}</div>}
        <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:20,fontWeight:700,color:'#0F172A',letterSpacing:'-0.02em'}}>{title}</div>
        {subtitle && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#64748b',marginTop:4,lineHeight:1.5,maxWidth:640}}>{subtitle}</div>}
      </div>
      {right && <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>{right}</div>}
    </div>
  );
}

/* Badge */
function BBadge({ tone='slate', children, dot, icon, size='md' }) {
  const map = {
    slate:   { bg:'#F1F5F9', color:'#475569', border:'#E2E8F0', dot:'#94a3b8' },
    blue:    { bg:'#EFF6FF', color:'#1d4ed8', border:'#BFDBFE', dot:'#3b82f6' },
    green:   { bg:'#ECFDF5', color:'#047857', border:'#A7F3D0', dot:'#10b981' },
    amber:   { bg:'#FFFBEB', color:'#B45309', border:'#FDE68A', dot:'#f59e0b' },
    red:     { bg:'#FEF2F2', color:'#b91c1c', border:'#FECACA', dot:'#ef4444' },
    violet:  { bg:'#F5F3FF', color:'#6d28d9', border:'#DDD6FE', dot:'#8b5cf6' },
    cyan:    { bg:'#ECFEFF', color:'#0e7490', border:'#A5F3FC', dot:'#06b6d4' },
    dark:    { bg:'#0F172A', color:'#E2E8F0', border:'#1e293b', dot:'#60a5fa' },
  };
  const s = map[tone] || map.slate;
  const pad = size==='sm' ? '2px 7px' : '3px 9px';
  const fs = size==='sm' ? 10.5 : 11;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:fs,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',padding:pad,borderRadius:9999,background:s.bg,color:s.color,border:`1px solid ${s.border}`,letterSpacing:'0.01em',whiteSpace:'nowrap'}}>
      {dot && <span style={{width:6,height:6,borderRadius:'50%',background:s.dot,flexShrink:0,boxShadow:`0 0 6px ${s.dot}55`}}/>}
      {icon && <i data-lucide={icon} style={{width:11,height:11}}></i>}
      {children}
    </span>
  );
}

/* Usage meter */
function BMeter({ label, used, limit, resetDate, icon, unit='', nearLimitPct=80 }) {
  const unlimited = limit === Infinity || limit === null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used/limit)*100));
  const near = pct >= nearLimitPct && pct < 100;
  const over = pct >= 100;
  const color = over ? '#ef4444' : near ? '#f59e0b' : '#3b82f6';
  const bgGrad = over
    ? 'linear-gradient(90deg,#ef4444,#f87171)'
    : near
      ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
      : 'linear-gradient(90deg,#3b82f6,#06b6d4)';
  return (
    <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'16px 18px',transition:'all 200ms',position:'relative',overflow:'hidden'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='#BFDBFE';e.currentTarget.style.boxShadow='0 4px 12px rgba(59,130,246,0.08)';}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='#E5E7EB';e.currentTarget.style.boxShadow='none';}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <div style={{width:28,height:28,borderRadius:8,background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <i data-lucide={icon} style={{width:13,height:13,color:'#475569'}}></i>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,color:'#0F172A'}}>{label}</div>
        </div>
        {(near||over) && <BBadge tone={over?'red':'amber'} dot size="sm">{over?'At limit':'Near limit'}</BBadge>}
      </div>
      <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:8}}>
        <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:22,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em'}}>{used.toLocaleString()}{unit}</div>
        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#94a3b8'}}>/ {unlimited ? '∞' : `${limit.toLocaleString()}${unit}`}</div>
        {!unlimited && <div style={{marginLeft:'auto',fontFamily:'JetBrains Mono,monospace',fontSize:11.5,fontWeight:600,color:color}}>{pct}%</div>}
      </div>
      <div style={{height:6,background:'#F1F5F9',borderRadius:99,overflow:'hidden'}}>
        <div style={{width:`${unlimited?100:Math.min(100,pct)}%`,height:'100%',background:unlimited?'linear-gradient(90deg,#8b5cf6,#3b82f6)':bgGrad,borderRadius:99,transition:'width 400ms cubic-bezier(0.16,1,0.3,1)'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10,fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#64748b'}}>
        <span>{unlimited ? 'Unlimited on this plan' : resetDate ? `Resets ${resetDate}` : 'No reset scheduled'}</span>
        {(near||over) && <button style={bBtnLink}>Upgrade plan →</button>}
      </div>
    </div>
  );
}

/* Status dot pill for the hero */
function StatusPill({ status }) {
  const map = {
    active:   { tone:'green',  label:'Active',        icon:'check-circle' },
    trial:    { tone:'cyan',   label:'Trial',         icon:'sparkles' },
    free:     { tone:'slate',  label:'Free plan',     icon:'circle' },
    pastdue:  { tone:'red',    label:'Past due',      icon:'alert-triangle' },
    canceled: { tone:'slate',  label:'Canceled',      icon:'x-circle' },
    enterprise:{ tone:'violet', label:'Enterprise',   icon:'building-2' },
  };
  const c = map[status] || map.active;
  return <BBadge tone={c.tone} icon={c.icon} dot>{c.label}</BBadge>;
}

Object.assign(window, {
  bBtnPrimary, bBtnGhost, bBtnDark, bBtnLink,
  BCard, BSectionTitle, BBadge, BMeter, StatusPill,
});
