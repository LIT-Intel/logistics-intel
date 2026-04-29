// CDPDetailsPanel.jsx — Right-side account intelligence panel
'use strict';

function PanelRow({ icon, label, children, accent }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'88px 1fr',alignItems:'center',gap:8,padding:'7px 14px',minHeight:30}}>
      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#64748B',fontFamily:'DM Sans,sans-serif'}}>
        {icon && <i data-lucide={icon} style={{width:11,height:11,color:'#94A3B8'}}></i>}
        {label}
      </div>
      <div style={{fontSize:12,color:accent?'#1d4ed8':'#0F172A',fontFamily:'DM Sans,sans-serif',fontWeight:accent?600:500,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{children}</div>
    </div>
  );
}

function PanelSectionHeader({ children, count, action }) {
  return (
    <div style={{padding:'10px 14px 6px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>{children}</span>
        {count !== undefined && <span style={{fontSize:10,fontWeight:600,color:'#64748B',background:'#F1F5F9',borderRadius:9999,padding:'1px 6px',fontFamily:'JetBrains Mono,monospace'}}>{count}</span>}
      </div>
      {action && <button style={{background:'none',border:'none',color:'#3b82f6',fontSize:10,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',padding:0}}>{action}</button>}
    </div>
  );
}

function Pill({ children, color = 'slate' }) {
  const palette = {
    slate:  { bg:'#F1F5F9', fg:'#475569', bd:'#E2E8F0' },
    blue:   { bg:'#EFF6FF', fg:'#1d4ed8', bd:'#BFDBFE' },
    green:  { bg:'#F0FDF4', fg:'#15803D', bd:'#BBF7D0' },
    purple: { bg:'#F5F3FF', fg:'#6D28D9', bd:'#DDD6FE' },
    amber:  { bg:'#FFFBEB', fg:'#B45309', bd:'#FED7AA' },
  };
  const c = palette[color] || palette.slate;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,color:c.fg,background:c.bg,border:`1px solid ${c.bd}`,borderRadius:4,padding:'2px 6px',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>{children}</span>
  );
}

function CDPDetailsPanel({ company }) {
  const domain = company.domain || (company.company_name||'').toLowerCase().replace(/[^a-z0-9]/g,'') + '.com';
  const [openSec, setOpenSec] = React.useState({ account:true, firm:true, intel:true });
  const tog = k => setOpenSec(s => ({...s,[k]:!s[k]}));

  const Sec = ({ id, title, children }) => (
    <div style={{borderBottom:'1px solid #F1F5F9'}}>
      <button onClick={()=>tog(id)} style={{width:'100%',background:'#FAFBFC',border:'none',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>{title}</span>
        <i data-lucide={openSec[id]?'chevron-up':'chevron-down'} style={{width:13,height:13,color:'#64748B'}}></i>
      </button>
      {openSec[id] && <div style={{padding:'4px 0 8px'}}>{children}</div>}
    </div>
  );

  return (
    <aside style={{width:300,flexShrink:0,background:'#FFFFFF',borderLeft:'1px solid #E5E7EB',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <Sec id="account" title="Account Details">
          <PanelRow icon="user" label="Owner">
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
              <span style={{width:18,height:18,borderRadius:'50%',background:'linear-gradient(135deg,#3B82F6,#6366F1)',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:700,fontFamily:'Space Grotesk,sans-serif'}}>VR</span>
              Valesco Raymond
            </span>
          </PanelRow>
          <PanelRow icon="clock" label="Last activity">2 hours ago</PanelRow>
          <PanelRow icon="briefcase" label="CRM stage"><Pill color="blue">Active</Pill></PanelRow>
          <PanelRow icon="target" label="Imports to"><Pill color="slate">🇺🇸 United States</Pill></PanelRow>
          <PanelRow icon="layers" label="Coverage">
            <span style={{display:'inline-flex',gap:4}}>
              <Pill color="green">BOL</Pill>
              <Pill color="blue">AMS</Pill>
              <Pill color="purple">Customs</Pill>
            </span>
          </PanelRow>
        </Sec>

        <Sec id="lists" title="Lists & Campaigns">
          <div style={{padding:'4px 14px 8px'}}>
            <PanelSectionHeader>Lists</PanelSectionHeader>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,padding:'2px 0'}}>
              <Pill color="blue">FCL ISC 2026</Pill>
              <Pill color="blue">VN→US Top 250</Pill>
              <Pill color="slate">+5 more</Pill>
            </div>
            <PanelSectionHeader>Campaigns</PanelSectionHeader>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,padding:'2px 0'}}>
              <Pill color="amber">Q2 Outbound — VN</Pill>
              <Pill color="slate">+1 more</Pill>
            </div>
          </div>
        </Sec>

        <Sec id="firm" title="Firmographics">
          <PanelRow icon="globe" label="Website"><a href="#" style={{color:'#3b82f6',textDecoration:'none'}}>{domain}</a></PanelRow>
          <PanelRow icon="phone" label="Phone"><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11}}>+1 (909) 555-0142</span></PanelRow>
          <PanelRow icon="map-pin" label="HQ">San Bernardino, CA</PanelRow>
          <PanelRow icon="building-2" label="Industry">Computer Hardware</PanelRow>
          <PanelRow icon="users" label="Headcount"><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11}}>57.2K</span></PanelRow>
          <PanelRow icon="dollar-sign" label="Revenue"><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11}}>$53.7B</span></PanelRow>
          <PanelRow icon="calendar" label="Founded"><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11}}>1939</span></PanelRow>
        </Sec>

        <Sec id="intel" title="Trade Intelligence">
          <PanelRow icon="trending-up" label="Top lane" accent>VN → US</PanelRow>
          <PanelRow icon="ship" label="Top carrier">Maersk</PanelRow>
          <PanelRow icon="package" label="Top mode">Ocean FCL</PanelRow>
          <PanelRow icon="truck" label="Last shipment"><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11}}>Mar 11, 2026</span></PanelRow>
          <PanelRow icon="bar-chart-2" label="Volume signal">
            <span style={{display:'inline-flex',alignItems:'center',gap:4}}>
              <Pill color="green">↑ 12%</Pill>
              <span style={{fontSize:10,color:'#94A3B8'}}>YoY</span>
            </span>
          </PanelRow>
        </Sec>

        <div style={{padding:'12px 14px'}}>
          <button style={{width:'100%',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,background:'#F8FAFC',border:'1px dashed #CBD5E1',borderRadius:8,padding:'8px 12px',fontSize:11,fontWeight:600,color:'#475569',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer'}}>
            <i data-lucide="refresh-cw" style={{width:11,height:11}}></i>
            Refresh enrichment
          </button>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { CDPDetailsPanel });
