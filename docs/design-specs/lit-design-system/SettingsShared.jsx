// SettingsShared.jsx — Shared primitives for Settings page
'use strict';

const sBtnPrimary = { display:'flex',alignItems:'center',gap:6,background:'linear-gradient(180deg,#3B82F6,#2563EB)',border:'none',borderRadius:8,padding:'8px 14px',fontSize:13,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#fff',cursor:'pointer',boxShadow:'0 1px 4px rgba(59,130,246,0.3)' };
const sBtnGhost = { display:'flex',alignItems:'center',gap:6,background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:8,padding:'7px 12px',fontSize:13,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#374151',cursor:'pointer' };
const sBtnDanger = { display:'flex',alignItems:'center',gap:6,background:'#FFFFFF',border:'1px solid #FECACA',borderRadius:8,padding:'7px 12px',fontSize:13,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#b91c1c',cursor:'pointer' };
const sBtnDark = { display:'flex',alignItems:'center',gap:6,background:'#0F172A',border:'1px solid #0F172A',borderRadius:8,padding:'8px 14px',fontSize:13,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#fff',cursor:'pointer' };

function SCard({ title, subtitle, right, children, dense, danger }) {
  return (
    <div style={{background:'#fff', border: danger?'1px solid #FECACA':'1px solid #E5E7EB', borderRadius:12, boxShadow:'0 1px 3px rgba(15,23,42,0.04)', overflow:'hidden'}}>
      {(title || right) && (
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,padding:'16px 20px 14px',borderBottom:'1px solid #F1F5F9'}}>
          <div>
            {title && <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em'}}>{title}</div>}
            {subtitle && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',marginTop:3,lineHeight:1.45,maxWidth:560}}>{subtitle}</div>}
          </div>
          {right && <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>{right}</div>}
        </div>
      )}
      <div style={{padding: dense?'14px 20px':'18px 20px'}}>{children}</div>
    </div>
  );
}

function SField({ label, hint, children, required, span }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6, gridColumn: span?`span ${span}`:'auto'}}>
      {label && (
        <label style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:600,color:'#334155',letterSpacing:'0.01em'}}>
          {label}{required && <span style={{color:'#dc2626',marginLeft:3}}>*</span>}
        </label>
      )}
      {children}
      {hint && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#94a3b8'}}>{hint}</div>}
    </div>
  );
}

const sInputStyle = {
  width:'100%', background:'#F8FAFC', border:'1.5px solid #E5E7EB', borderRadius:8,
  padding:'9px 12px', fontSize:13, fontFamily:'DM Sans,sans-serif', color:'#0F172A', outline:'none', transition:'all 160ms'
};

function SInput(props) {
  return (
    <input {...props} style={{...sInputStyle, ...(props.style||{})}}
      onFocus={e=>{e.target.style.borderColor='#3b82f6';e.target.style.boxShadow='0 0 0 3px rgba(59,130,246,0.1)';e.target.style.background='#fff'; props.onFocus&&props.onFocus(e);}}
      onBlur={e=>{e.target.style.borderColor='#E5E7EB';e.target.style.boxShadow='none';e.target.style.background='#F8FAFC'; props.onBlur&&props.onBlur(e);}} />
  );
}

function STextarea(props) {
  return (
    <textarea {...props} style={{...sInputStyle, resize:'vertical', lineHeight:1.5, ...(props.style||{})}}
      onFocus={e=>{e.target.style.borderColor='#3b82f6';e.target.style.boxShadow='0 0 0 3px rgba(59,130,246,0.1)';e.target.style.background='#fff'; props.onFocus&&props.onFocus(e);}}
      onBlur={e=>{e.target.style.borderColor='#E5E7EB';e.target.style.boxShadow='none';e.target.style.background='#F8FAFC'; props.onBlur&&props.onBlur(e);}} />
  );
}

function SSelect({ value, onChange, options, ...rest }) {
  return (
    <div style={{position:'relative'}}>
      <select value={value} onChange={onChange} {...rest}
        style={{...sInputStyle, appearance:'none', paddingRight:32, cursor:'pointer'}}>
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <i data-lucide="chevron-down" style={{position:'absolute',right:11,top:'50%',transform:'translateY(-50%)',width:13,height:13,color:'#94a3b8',pointerEvents:'none'}}></i>
    </div>
  );
}

function SToggle({ checked, onChange, label, sub }) {
  return (
    <div onClick={()=>onChange(!checked)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 12px',borderRadius:8,cursor:'pointer',background:checked?'#F0F9FF':'#F8FAFC',border:`1px solid ${checked?'#BAE6FD':'#E5E7EB'}`,transition:'all 160ms'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{label}</div>
        {sub && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:2}}>{sub}</div>}
      </div>
      <div style={{width:34,height:20,borderRadius:10,background:checked?'#3b82f6':'#CBD5E1',position:'relative',flexShrink:0,transition:'all 160ms'}}>
        <div style={{position:'absolute',top:2,left:checked?16:2,width:16,height:16,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 2px rgba(0,0,0,0.2)',transition:'all 160ms'}}/>
      </div>
    </div>
  );
}

function SBadge({ tone='slate', children, dot, icon }) {
  const map = {
    slate:  { bg:'#F1F5F9', color:'#475569', border:'#E2E8F0', dot:'#94a3b8' },
    blue:   { bg:'#EFF6FF', color:'#1d4ed8', border:'#BFDBFE', dot:'#3b82f6' },
    green:  { bg:'#F0FDF4', color:'#15803d', border:'#BBF7D0', dot:'#22c55e' },
    amber:  { bg:'#FFFBEB', color:'#B45309', border:'#FDE68A', dot:'#f59e0b' },
    red:    { bg:'#FEF2F2', color:'#b91c1c', border:'#FECACA', dot:'#ef4444' },
    violet: { bg:'#F5F3FF', color:'#6d28d9', border:'#DDD6FE', dot:'#8b5cf6' },
    cyan:   { bg:'#ECFEFF', color:'#0e7490', border:'#A5F3FC', dot:'#06b6d4' },
  };
  const s = map[tone] || map.slate;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',padding:'3px 9px',borderRadius:9999,background:s.bg,color:s.color,border:`1px solid ${s.border}`,letterSpacing:'0.01em',whiteSpace:'nowrap'}}>
      {dot && <span style={{width:6,height:6,borderRadius:'50%',background:s.dot,flexShrink:0}}/>}
      {icon && <i data-lucide={icon} style={{width:11,height:11}}></i>}
      {children}
    </span>
  );
}

function SLockOverlay({ plan, need, children, onUpgrade }) {
  return (
    <div style={{position:'relative'}}>
      {children}
      <div style={{position:'absolute',inset:0,background:'rgba(248,250,252,0.88)',backdropFilter:'blur(2px)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,borderRadius:12,border:'1px dashed #CBD5E1',padding:20,textAlign:'center'}}>
        <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(180deg,#EFF6FF,#DBEAFE)',border:'1px solid #BFDBFE',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <i data-lucide="lock" style={{width:16,height:16,color:'#2563EB'}}></i>
        </div>
        <div>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:700,color:'#0F172A'}}>Requires {need}</div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:2}}>You're on the {plan} plan. Upgrade to unlock this module.</div>
        </div>
        <button onClick={onUpgrade} style={sBtnPrimary}><i data-lucide="arrow-up-circle" style={{width:13,height:13}}></i> Upgrade plan</button>
      </div>
    </div>
  );
}

Object.assign(window, { SCard, SField, SInput, STextarea, SSelect, SToggle, SBadge, SLockOverlay, sBtnPrimary, sBtnGhost, sBtnDanger, sBtnDark, sInputStyle });
