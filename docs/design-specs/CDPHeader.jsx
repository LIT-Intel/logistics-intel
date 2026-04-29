// CDPHeader.jsx — Compact company profile header (light, premium)
'use strict';

function CDPLogo({ name, domain, size = 40 }) {
  const [err, setErr] = React.useState(false);
  const initial = (name || '?')[0].toUpperCase();
  const palette = ['#3B82F6','#6366F1','#8B5CF6','#0EA5E9','#10B981','#F59E0B','#EF4444','#14B8A6'];
  const color = palette[(name||'').charCodeAt(0) % palette.length];
  if (!domain || err) {
    return (
      <div style={{width:size,height:size,borderRadius:8,background:`linear-gradient(135deg, ${color}, ${color}cc)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.42,fontWeight:700,color:'#fff',fontFamily:'Space Grotesk,sans-serif',flexShrink:0,boxShadow:'0 1px 3px rgba(15,23,42,0.1), inset 0 0 0 1px rgba(255,255,255,0.1)'}}>
        {initial}
      </div>
    );
  }
  return (
    <img src={`https://logo.clearbit.com/${domain}`} onError={()=>setErr(true)} alt={name}
      style={{width:size,height:size,borderRadius:8,objectFit:'contain',background:'#fff',border:'1px solid #E5E7EB',padding:4,flexShrink:0}}/>
  );
}

function HeaderChip({ icon, children, accent }) {
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:500,color:accent?'#1d4ed8':'#475569',fontFamily:'DM Sans,sans-serif',background:accent?'#EFF6FF':'#F8FAFC',border:`1px solid ${accent?'#DBEAFE':'#E2E8F0'}`,borderRadius:6,padding:'3px 8px',whiteSpace:'nowrap'}}>
      {icon && <i data-lucide={icon} style={{width:11,height:11}}></i>}
      {children}
    </span>
  );
}

function HeaderIconBtn({ icon, label, onClick, title }) {
  return (
    <button onClick={onClick} title={title||label} style={{width:32,height:32,borderRadius:7,background:'#FFFFFF',border:'1px solid #E2E8F0',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#475569',transition:'all 150ms'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.background='#F8FAFC';}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='#E2E8F0';e.currentTarget.style.background='#FFFFFF';}}>
      <i data-lucide={icon} style={{width:14,height:14}}></i>
    </button>
  );
}

function CDPHeader({ company, onBack, starred, onToggleStar, panelOpen, onTogglePanel }) {
  const domain = company.domain || (company.company_name||'').toLowerCase().replace(/[^a-z0-9]/g,'') + '.com';
  return (
    <div style={{background:'#FFFFFF',borderBottom:'1px solid #E5E7EB',flexShrink:0}}>
      {/* Breadcrumb row */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 24px 0',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,fontFamily:'DM Sans,sans-serif',color:'#64748B'}}>
          <button onClick={onBack} style={{display:'inline-flex',alignItems:'center',gap:4,background:'none',border:'none',color:'#64748B',cursor:'pointer',fontSize:12,fontFamily:'inherit',padding:0}}>
            <i data-lucide="arrow-left" style={{width:13,height:13}}></i>
            Command Center
          </button>
          <span style={{color:'#CBD5E1'}}>/</span>
          <span style={{color:'#0F172A',fontWeight:600}}>{company.company_name}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace'}}>
          <span>ID · {company.company_id}</span>
          <span style={{color:'#E2E8F0'}}>·</span>
          <span>Updated 2 hrs ago</span>
        </div>
      </div>

      {/* Identity row */}
      <div style={{padding:'14px 24px 12px',display:'flex',alignItems:'flex-start',gap:14}}>
        <CDPLogo name={company.company_name} domain={domain} size={44} />
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
            <h1 style={{fontFamily:'Space Grotesk,sans-serif',fontSize:22,fontWeight:700,color:'#0F172A',letterSpacing:'-0.02em',lineHeight:1.15,margin:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}} title={company.company_name}>{company.company_name}</h1>
            <button onClick={onToggleStar} style={{background:'none',border:'none',cursor:'pointer',padding:2,color:starred?'#F59E0B':'#CBD5E1',display:'flex'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={starred?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
            <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,fontWeight:600,color:'#15803D',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:4,padding:'2px 7px',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:'#22C55E'}}></span>
              In CRM
            </span>
            <span style={{fontSize:10,fontWeight:600,color:'#1d4ed8',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:4,padding:'2px 7px',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>Public</span>
          </div>
          <div style={{fontSize:12,color:'#475569',fontFamily:'DM Sans,sans-serif',marginBottom:8,lineHeight:1.5}}>
            US logistics importer · Electronics & consumer goods · Trailing 12m: <strong style={{color:'#0F172A',fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>{(company.shipments_12m||0).toLocaleString()}</strong> shipments / <strong style={{color:'#0F172A',fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>{company.teu||'—'}</strong> TEU
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <HeaderChip icon="map-pin">{company.location || 'San Bernardino, CA, US'}</HeaderChip>
            <HeaderChip icon="globe">{domain}</HeaderChip>
            <HeaderChip icon="building-2">Importer · Public</HeaderChip>
            <HeaderChip icon="trending-up" accent>Primary lane: VN → US</HeaderChip>
          </div>
        </div>

        {/* Action cluster */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <HeaderIconBtn icon="external-link" title="Open website" />
          <HeaderIconBtn icon="more-horizontal" title="More" />
          <HeaderIconBtn icon="download" title="Export" />
          <button style={{display:'inline-flex',alignItems:'center',gap:6,background:'#FFFFFF',border:'1px solid #E2E8F0',borderRadius:8,padding:'7px 12px',fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer'}}>
            <i data-lucide="folder-plus" style={{width:13,height:13}}></i>
            Add to List
          </button>
          <button style={{display:'inline-flex',alignItems:'center',gap:6,background:'linear-gradient(180deg,#3B82F6,#2563EB)',border:'none',borderRadius:8,padding:'7px 14px',fontSize:12,fontWeight:600,color:'#fff',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',boxShadow:'0 1px 3px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.18)'}}>
            <i data-lucide="send" style={{width:13,height:13}}></i>
            Start Outreach
          </button>
          <div style={{width:1,height:20,background:'#E2E8F0',margin:'0 2px'}}></div>
          <HeaderIconBtn icon={panelOpen?'panel-right-close':'panel-right-open'} title="Toggle details" onClick={onTogglePanel} />
        </div>
      </div>

      {/* KPI strip — compact, single row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',borderTop:'1px solid #F1F5F9',background:'#FAFBFC'}}>
        {[
          { label:'SHIPMENTS 12M',  value:(company.shipments_12m||0).toLocaleString(), trend:'+12%', up:true },
          { label:'TEU 12M',        value:company.teu || '—',                          trend:'+8%',  up:true },
          { label:'EST. SPEND',     value:company.est_spend || '$4.2M',                trend:'+5%',  up:true },
          { label:'TRADE LANES',    value:'8',                                          trend:'+2',   up:true },
          { label:'CONTACTS',       value:'12',                                         trend:'4 verified', up:null },
          { label:'LAST SHIPMENT',  value:'3 days ago',                                 trend:'Mar 11, 2026', up:null },
        ].map((k,i)=>(
          <div key={k.label} style={{padding:'10px 16px',borderRight:i<5?'1px solid #F1F5F9':'none'}}>
            <div style={{fontSize:9,fontWeight:600,letterSpacing:'0.08em',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{k.label}</div>
            <div style={{display:'flex',alignItems:'baseline',gap:6,marginTop:3}}>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em',whiteSpace:'nowrap'}}>{k.value}</span>
              {k.trend && (
                <span style={{fontSize:10,fontWeight:600,color:k.up===true?'#15803D':k.up===false?'#B91C1C':'#94A3B8',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>
                  {k.up===true && '↑ '}{k.up===false && '↓ '}{k.trend}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { CDPHeader, CDPLogo });
