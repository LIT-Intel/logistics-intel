// AdminShared.jsx — Light UI primitives matching Settings/Dashboard style
'use strict';

const aBtnPrimary = { display:'inline-flex',alignItems:'center',gap:6,background:'linear-gradient(180deg,#3B82F6,#2563EB)',border:'none',borderRadius:8,padding:'8px 14px',fontSize:13,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#fff',cursor:'pointer',boxShadow:'0 1px 4px rgba(59,130,246,0.3)' };
const aBtnGhost   = { display:'inline-flex',alignItems:'center',gap:6,background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:8,padding:'7px 12px',fontSize:12.5,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#374151',cursor:'pointer' };
const aBtnDanger  = { display:'inline-flex',alignItems:'center',gap:6,background:'#FFFFFF',border:'1px solid #FECACA',borderRadius:8,padding:'7px 12px',fontSize:12.5,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#b91c1c',cursor:'pointer' };
const aBtnWarn    = { display:'inline-flex',alignItems:'center',gap:6,background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:8,padding:'7px 12px',fontSize:12.5,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#B45309',cursor:'pointer' };
const aBtnDark    = { display:'inline-flex',alignItems:'center',gap:6,background:'#0F172A',border:'1px solid #0F172A',borderRadius:8,padding:'8px 14px',fontSize:13,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#fff',cursor:'pointer' };

function APanel({ title, subtitle, right, children, dense, danger, scroll, pad }) {
  return (
    <div style={{background:'#fff', border: danger?'1px solid #FECACA':'1px solid #E5E7EB', borderRadius:12, boxShadow:'0 1px 3px rgba(15,23,42,0.04)', overflow:'hidden', display:'flex',flexDirection:'column', minHeight:0}}>
      {(title || right) && (
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'14px 18px',borderBottom:'1px solid #F1F5F9',flexWrap:'wrap'}}>
          <div style={{minWidth:0}}>
            {title && <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#0F172A',letterSpacing:'-0.005em',display:'flex',alignItems:'center',gap:8}}>{title}</div>}
            {subtitle && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',marginTop:3}}>{subtitle}</div>}
          </div>
          {right && <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>{right}</div>}
        </div>
      )}
      <div style={{padding: pad!=null?pad:(dense?'14px 18px':'18px'), flex:1, minHeight:0, overflow: scroll?'auto':'visible'}}>{children}</div>
    </div>
  );
}

function APill({ tone='slate', children, dot, icon, mono }) {
  const map = {
    slate:  { bg:'#F1F5F9', color:'#475569', border:'#E2E8F0', dot:'#94a3b8' },
    blue:   { bg:'#EFF6FF', color:'#1d4ed8', border:'#BFDBFE', dot:'#3b82f6' },
    cyan:   { bg:'#ECFEFF', color:'#0e7490', border:'#A5F3FC', dot:'#06b6d4' },
    green:  { bg:'#F0FDF4', color:'#15803d', border:'#BBF7D0', dot:'#22c55e' },
    amber:  { bg:'#FFFBEB', color:'#B45309', border:'#FDE68A', dot:'#f59e0b' },
    red:    { bg:'#FEF2F2', color:'#b91c1c', border:'#FECACA', dot:'#ef4444' },
    violet: { bg:'#F5F3FF', color:'#6d28d9', border:'#DDD6FE', dot:'#8b5cf6' },
  };
  const s = map[tone] || map.slate;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,fontFamily: mono?'JetBrains Mono,monospace':'Space Grotesk,sans-serif',padding:'3px 9px',borderRadius:9999,background:s.bg,color:s.color,border:`1px solid ${s.border}`,letterSpacing:'0.01em',whiteSpace:'nowrap',lineHeight:1.3}}>
      {dot && <span style={{width:6,height:6,borderRadius:'50%',background:s.dot,flexShrink:0}}/>}
      {icon && <i data-lucide={icon} style={{width:11,height:11}}></i>}
      {children}
    </span>
  );
}

function AKPI({ label, value, sub, trend, tone, unit, icon }) {
  const toneColor = {blue:'#3B82F6', cyan:'#06B6D4', green:'#22C55E', amber:'#F59E0B', red:'#EF4444', violet:'#8B5CF6', slate:'#0F172A'}[tone] || '#0F172A';
  const toneBg    = {blue:'#EFF6FF', cyan:'#ECFEFF', green:'#F0FDF4', amber:'#FFFBEB', red:'#FEF2F2', violet:'#F5F3FF', slate:'#F1F5F9'}[tone] || '#F1F5F9';
  const trendColor = !trend ? '#64748b' : (trend.startsWith('+')?'#15803d':trend.startsWith('-')?(trend.includes('ms')||trend.includes('%')&&!trend.includes('err')?'#15803d':'#b91c1c'):'#64748b');
  return (
    <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'16px 18px',minWidth:0,display:'flex',flexDirection:'column',gap:6,boxShadow:'0 1px 3px rgba(15,23,42,0.04)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:7}}>
          {icon && <div style={{width:22,height:22,borderRadius:6,background:toneBg,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <i data-lucide={icon} style={{width:12,height:12,color:toneColor}}></i>
          </div>}
          <span style={{fontFamily:'Space Grotesk,sans-serif',fontSize:11,fontWeight:600,color:'#64748b',letterSpacing:'0.04em',textTransform:'uppercase'}}>{label}</span>
        </div>
        {trend && <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,fontWeight:600,color:trendColor}}>{trend}</span>}
      </div>
      <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:26,fontWeight:700,color:'#0F172A',letterSpacing:'-0.02em',lineHeight:1.05}}>
        {value}{unit && <span style={{fontSize:13,fontWeight:600,color:'#94a3b8',marginLeft:4}}>{unit}</span>}
      </div>
      {sub && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#94a3b8'}}>{sub}</div>}
    </div>
  );
}

function ARow({ children, hover=true, onClick }) {
  const [h, setH] = React.useState(false);
  return (
    <div onMouseEnter={()=>hover&&setH(true)} onMouseLeave={()=>setH(false)} onClick={onClick}
      style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:'1px solid #F1F5F9',background:h?'#F8FAFC':'transparent',cursor:onClick?'pointer':'default',transition:'background 140ms'}}>
      {children}
    </div>
  );
}

function ASpark({ data, w=90, h=28, stroke='#3B82F6', fill='rgba(59,130,246,0.1)' }) {
  if (!data?.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v,i)=>[i*step, h - ((v-min)/span)*(h-4) - 2]);
  const d = 'M ' + pts.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ');
  const area = d + ` L ${w.toFixed(1)},${h} L 0,${h} Z`;
  return (
    <svg width={w} height={h} style={{display:'block'}}>
      <path d={area} fill={fill}/>
      <path d={d} stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ABar({ value, max, tone='blue', height=6, showLabel }) {
  const pct = Math.max(0, Math.min(100, (value/max)*100));
  const color = {blue:'#3B82F6', cyan:'#06B6D4', green:'#22C55E', amber:'#F59E0B', red:'#EF4444'}[tone] || '#3B82F6';
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,width:'100%'}}>
      <div style={{flex:1,height,background:'#F1F5F9',borderRadius:999,overflow:'hidden'}}>
        <div style={{width:`${pct}%`,height:'100%',background:color,transition:'width 220ms'}}/>
      </div>
      {showLabel && <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#64748b',minWidth:38,textAlign:'right'}}>{pct.toFixed(0)}%</div>}
    </div>
  );
}

function ADot({ tone='green', live, size=8 }) {
  const color = {green:'#22C55E', amber:'#F59E0B', red:'#EF4444', slate:'#94A3B8', blue:'#3B82F6', cyan:'#06B6D4'}[tone] || '#22C55E';
  return (
    <span style={{position:'relative',display:'inline-flex',width:size,height:size,flexShrink:0}}>
      {live && <span style={{position:'absolute',inset:0,borderRadius:'50%',background:color,opacity:0.4,animation:'aPulse 1.8s ease-out infinite'}}/>}
      <span style={{position:'relative',width:size,height:size,borderRadius:'50%',background:color}}/>
    </span>
  );
}

function AInput({ icon='search', value, onChange, placeholder, style, ...rest }) {
  return (
    <div style={{position:'relative',display:'flex',alignItems:'center',...style}}>
      {icon && <i data-lucide={icon} style={{position:'absolute',left:10,width:13,height:13,color:'#94a3b8',pointerEvents:'none'}}></i>}
      <input value={value} onChange={onChange} placeholder={placeholder} {...rest}
        style={{width:'100%',background:'#F8FAFC',border:'1.5px solid #E5E7EB',borderRadius:8,padding: icon?'7px 12px 7px 30px':'7px 12px',fontSize:12.5,fontFamily:'DM Sans,sans-serif',color:'#0F172A',outline:'none',transition:'all 160ms'}}
        onFocus={e=>{e.target.style.borderColor='#3b82f6';e.target.style.boxShadow='0 0 0 3px rgba(59,130,246,0.1)';e.target.style.background='#fff';}}
        onBlur={e=>{e.target.style.borderColor='#E5E7EB';e.target.style.boxShadow='none';e.target.style.background='#F8FAFC';}}/>
    </div>
  );
}

function ASelect({ value, onChange, options, style }) {
  return (
    <div style={{position:'relative',...style}}>
      <select value={value} onChange={onChange}
        style={{appearance:'none',background:'#F8FAFC',border:'1.5px solid #E5E7EB',borderRadius:8,padding:'7px 30px 7px 12px',fontSize:12.5,fontFamily:'DM Sans,sans-serif',color:'#0F172A',outline:'none',cursor:'pointer',width:'100%'}}>
        {options.map(o => typeof o==='string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <i data-lucide="chevron-down" style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',width:12,height:12,color:'#94a3b8',pointerEvents:'none'}}></i>
    </div>
  );
}

function AToggle({ checked, onChange, disabled }) {
  return (
    <div onClick={()=>!disabled && onChange(!checked)}
      style={{width:34,height:20,borderRadius:10,background:checked?'#3b82f6':'#CBD5E1',position:'relative',cursor:disabled?'not-allowed':'pointer',flexShrink:0,transition:'all 160ms',opacity:disabled?0.4:1}}>
      <div style={{position:'absolute',top:2,left:checked?16:2,width:16,height:16,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 2px rgba(0,0,0,0.2)',transition:'all 160ms'}}/>
    </div>
  );
}

function AHead({ cols }) {
  return (
    <div className="ak-head" style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:'1px solid #E5E7EB',background:'#FAFBFC'}}>
      {cols.map((c,i)=>(
        <div key={i} style={{flex: c.flex ?? 1, width: c.w, minWidth: c.w, textAlign: c.align||'left', fontFamily:'Space Grotesk,sans-serif',fontSize:10,fontWeight:700,color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase'}}>{c.label}</div>
      ))}
    </div>
  );
}

function AEmpty({ icon='inbox', title, sub }) {
  return (
    <div style={{padding:'32px 20px',textAlign:'center'}}>
      <div style={{width:40,height:40,margin:'0 auto 10px',borderRadius:10,background:'#F8FAFC',border:'1px solid #E5E7EB',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <i data-lucide={icon} style={{width:18,height:18,color:'#94a3b8'}}></i>
      </div>
      <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{title}</div>
      {sub && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:3}}>{sub}</div>}
    </div>
  );
}

function AIconBtn({ icon, onClick, tone='slate', title, disabled }) {
  const colors = {slate:'#64748b', red:'#ef4444', amber:'#f59e0b', green:'#22c55e', cyan:'#06b6d4', blue:'#3b82f6'};
  const [h,setH] = React.useState(false);
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{width:28,height:28,display:'inline-flex',alignItems:'center',justifyContent:'center',background:h?'#F1F5F9':'transparent',border:'1px solid',borderColor:h?'#E5E7EB':'transparent',borderRadius:6,cursor:disabled?'not-allowed':'pointer',color:colors[tone],opacity:disabled?0.3:1,transition:'all 120ms'}}>
      <i data-lucide={icon} style={{width:14,height:14}}></i>
    </button>
  );
}

Object.assign(window, {
  APanel, APill, AKPI, ARow, ASpark, ABar, ADot, AInput, ASelect, AToggle, AHead, AEmpty, AIconBtn,
  aBtnPrimary, aBtnGhost, aBtnDanger, aBtnWarn, aBtnDark,
});
